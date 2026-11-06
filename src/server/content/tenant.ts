import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { withTenant } from '@/db/tenant';
import { DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { env } from '@/lib/env';
import { s3 } from '@/lib/storage';
import type { AuthContext } from '@/server/auth/session';

type RawTx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0];

// Work that must only happen once the transaction has committed (deleting
// stored files: if the transaction rolled back, the rows would point at files
// already gone).
const afterCommitQueues = new WeakMap<object, Array<() => Promise<unknown>>>();

function scoped<T>(
  ctx: {
    tenantId: string;
    userId: string;
    share?: boolean;
    workspaceId?: string | null;
    wsScope?: boolean;
  },
  fn: (tx: RawTx) => Promise<T>,
): Promise<T> {
  const queue: Array<() => Promise<unknown>> = [];
  return withTenant(db(), ctx, (tx) => {
    afterCommitQueues.set(tx, queue);
    return fn(tx);
  }).then(async (r) => {
    for (const f of queue) await f().catch(() => {});
    return r;
  });
}

/** Runs `fn` in a transaction scoped by RLS to the caller's tenant and user. */
export function asUser<T>(auth: AuthContext, fn: (tx: RawTx) => Promise<T>) {
  return scoped(
    { tenantId: auth.tenant.id, userId: auth.user.id, workspaceId: auth.workspaceId, wsScope: auth.wsScope },
    fn,
  );
}

/**
 * Like asUser, with the share scope on: the caller also reaches the notes,
 * tasks and artifacts of the shared folders they belong to (read or edit, by
 * RLS). Only for single-item reads/writes and explicit shared-folder lists.
 */
export function asSharer<T>(auth: AuthContext, fn: (tx: RawTx) => Promise<T>) {
  return scoped(
    {
      tenantId: auth.tenant.id,
      userId: auth.user.id,
      share: true,
      workspaceId: auth.workspaceId,
      wsScope: auth.wsScope,
    },
    fn,
  );
}

/**
 * Like asUser but across all the person's workspaces (Ambientes): for moving
 * an item between workspaces and for the counts of the workspace menu.
 */
export function asUserAllWorkspaces<T>(auth: AuthContext, fn: (tx: RawTx) => Promise<T>) {
  return scoped({ tenantId: auth.tenant.id, userId: auth.user.id, workspaceId: auth.workspaceId }, fn);
}

/**
 * Runs `fn` inside `tx` across all the person's workspaces (the RLS scope of
 * migration 0053 off, then back as it was): plan limits and quotas count
 * everything the person has, not only the active workspace.
 */
export async function allWorkspaces<T>(tx: RawTx, fn: () => Promise<T>): Promise<T> {
  const [r] = (await tx.execute(
    sql`select current_setting('app.ws_strict', true) as v, set_config('app.ws_strict', '', true)`,
  )) as unknown as Array<{ v: string | null }>;
  try {
    return await fn();
  } finally {
    await tx.execute(sql`select set_config('app.ws_strict', ${r?.v ?? ''}, true)`);
  }
}

export type Tx = Parameters<Parameters<typeof asUser>[1]>[0];

/**
 * Serialises "count, then create" for one plan limit of one client: two
 * requests at once can't both see room for one more (held until commit).
 */
export async function lockLimit(tx: Tx, tenantId: string, resource: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`kh-limit:${resource}:${tenantId}`}))`);
}

/** Runs `f` once the transaction of `tx` has committed (at once outside asUser/asSharer). */
export function afterCommit(tx: Tx, f: () => Promise<unknown>) {
  const q = afterCommitQueues.get(tx);
  if (q) q.push(f);
  else void f().catch(() => {});
}

/** Deletes stored files after commit (anything left is removed by the daily storage sweep). */
export function removeFilesAfterCommit(tx: Tx, keys: string[]) {
  if (!keys.length) return;
  afterCommit(tx, async () => {
    for (let i = 0; i < keys.length; i += 1000)
      await s3()
        .send(
          new DeleteObjectsCommand({
            Bucket: env().S3_BUCKET,
            Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
          }),
        )
        .catch(() => {});
  });
}
