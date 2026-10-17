import 'server-only';
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { dataExports } from '@/db/schema';
import { env } from '@/lib/env';
import { QUEUES, queue } from '@/lib/queue';
import { s3 } from '@/lib/storage';
import { ApiError } from '@/server/errors';
import { audit } from '@/server/audit';
import type { AuthContext } from '@/server/auth/session';
import { afterCommit, asUser, lockLimit } from '@/server/content/tenant';

// "Exportar os meus dados" (Conta e Dados): the request, its status and the
// download. The ZIP itself is built by the worker (server/jobs/export.ts).
// One export at a time per person, at most 3 a day; the file is kept 7 days
// and only its owner can download it, signed in (streamed from the bucket).

export const EXPORTS_PER_DAY = 3;

export type ExportStatus = 'pending' | 'running' | 'ready' | 'failed' | 'expired';
export type ExportInfo = {
  id: string;
  status: ExportStatus;
  size: number | null;
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string | null;
};

const toInfo = (r: typeof dataExports.$inferSelect, now = Date.now()): ExportInfo => ({
  id: r.id,
  // past its 7 days it reads as expired at once (the daily job removes the file)
  status: r.status === 'ready' && r.expiresAt && r.expiresAt.getTime() <= now ? 'expired' : r.status,
  size: r.size,
  createdAt: r.createdAt.toISOString(),
  finishedAt: r.finishedAt?.toISOString() ?? null,
  expiresAt: r.expiresAt?.toISOString() ?? null,
});

/** The caller's latest exports (newest first) and how many more they may ask for today. */
export async function listExports(auth: AuthContext) {
  return asUser(auth, async (tx) => {
    const rows = await tx.select().from(dataExports).orderBy(desc(dataExports.createdAt)).limit(5);
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(dataExports)
      .where(gt(dataExports.createdAt, new Date(Date.now() - 86_400_000)))) as [{ n: number }];
    return { exports: rows.map((r) => toInfo(r)), left: Math.max(0, EXPORTS_PER_DAY - n) };
  });
}

/**
 * Asks for a new export: refused while one is being prepared, or after 3 in
 * the last 24 hours. The job is queued once the row is committed.
 */
export async function requestExport(
  auth: AuthContext,
  opts: { enqueue?: boolean } = {},
): Promise<ExportInfo> {
  const row = await asUser(auth, async (tx) => {
    await lockLimit(tx, auth.tenant.id, `export:${auth.user.id}`);
    const [busy] = await tx
      .select({ id: dataExports.id })
      .from(dataExports)
      .where(inArray(dataExports.status, ['pending', 'running']))
      .limit(1);
    if (busy) throw new ApiError(409, 'export_in_progress');
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(dataExports)
      .where(gt(dataExports.createdAt, new Date(Date.now() - 86_400_000)))) as [{ n: number }];
    if (n >= EXPORTS_PER_DAY) throw new ApiError(429, 'rate_limited', undefined, { max: EXPORTS_PER_DAY });
    const [r] = await tx
      .insert(dataExports)
      .values({ tenantId: auth.tenant.id, ownerId: auth.user.id })
      .returning();
    if (opts.enqueue !== false)
      afterCommit(tx, () =>
        queue(QUEUES.export).add(
          'export',
          { exportId: r!.id, tenantId: auth.tenant.id, userId: auth.user.id },
          { jobId: r!.id, attempts: 1, removeOnComplete: 100, removeOnFail: 200 },
        ),
      );
    return r!;
  });
  await audit({ action: 'account.exported', actorUserId: auth.user.id, tenantId: auth.tenant.id });
  return toInfo(row);
}

/** The ZIP of a ready export of the caller's, as a stream from the bucket. */
export async function openExport(auth: AuthContext, id: string) {
  const [r] = await asUser(auth, (tx) =>
    tx
      .select()
      .from(dataExports)
      .where(and(eq(dataExports.id, id), eq(dataExports.status, 'ready'))),
  );
  if (!r || !r.storageKey || !r.expiresAt || r.expiresAt.getTime() <= Date.now())
    throw new ApiError(404, 'not_found');
  const obj = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: r.storageKey }));
  if (!obj.Body) throw new ApiError(404, 'not_found');
  return {
    stream: obj.Body.transformToWebStream(),
    size: obj.ContentLength ?? r.size ?? 0,
    name: `knowledgehub-${r.createdAt.toISOString().slice(0, 10)}.zip`,
  };
}
