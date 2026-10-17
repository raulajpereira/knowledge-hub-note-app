import 'server-only';
import { and, eq, ilike, sql } from 'drizzle-orm';
import { ocrTexts } from '@/db/schema';
import { env } from '@/lib/env';
import type { AuthContext } from '@/server/auth/session';
import { asSharer, asUser } from '@/server/content/tenant';
import { embedHealth } from './embedClient';

// Definições › Assistente IA › Pesquisa semântica: what is indexed, what is
// waiting, and the worker's endpoint state. Counts are the caller's own items
// (plus the tenant-wide SAP library), as RLS shows them.

export type IndexStatus = {
  semantic: boolean;
  ocr: boolean;
  service: 'up' | 'loading' | 'down' | 'off';
  indexed: number;
  pending: number;
  ocrDone: number;
  ocrPending: number;
  ocrFailed: number;
};

export async function indexStatus(auth: AuthContext): Promise<IndexStatus> {
  const e = env();
  const [counts, health] = await Promise.all([
    asUser(auth, async (tx) => {
      const [r] = (await tx.execute(sql`
        select
          (select count(*)::int from (select distinct item_type, item_id from embeddings
             where tenant_id = kh_tenant_id() and (owner_id = kh_user_id() or owner_id is null)) x) as indexed,
          (select count(*)::int from search_jobs where kind = 'embed') as pending,
          (select count(*)::int from search_jobs where kind = 'ocr') as ocr_pending,
          (select count(*)::int from ocr_texts where owner_id = kh_user_id() and status = 'done') as ocr_done,
          (select count(*)::int from ocr_texts where owner_id = kh_user_id() and status = 'failed') as ocr_failed
      `)) as unknown as Array<Record<string, number>>;
      return r!;
    }),
    embedHealth(),
  ]);
  return {
    semantic: e.SEMANTIC_SEARCH,
    ocr: e.OCR,
    service: !e.SEMANTIC_SEARCH ? 'off' : !health.up ? 'down' : health.loaded ? 'up' : 'loading',
    indexed: counts.indexed ?? 0,
    pending: counts.pending ?? 0,
    ocrDone: counts.ocr_done ?? 0,
    ocrPending: counts.ocr_pending ?? 0,
    ocrFailed: counts.ocr_failed ?? 0,
  };
}

/** Queues every item of the caller again (vectors remade even if unchanged). */
export async function reindex(auth: AuthContext): Promise<number> {
  return asUser(auth, async (tx) => {
    const [r] = (await tx.execute(sql`select kh_search_reindex() as n`)) as unknown as Array<{ n: number }>;
    return r?.n ?? 0;
  });
}

/** Text recognised in a file of Ficheiros (its own or a shared folder's, by RLS), or null. */
export async function fileOcrText(
  auth: AuthContext,
  fileId: string,
): Promise<{ status: string; text: string; pages: number } | null> {
  return asSharer(auth, async (tx) => {
    const [r] = await tx
      .select({ status: ocrTexts.status, text: ocrTexts.text, pages: ocrTexts.pages })
      .from(ocrTexts)
      .where(and(eq(ocrTexts.srcType, 'file'), eq(ocrTexts.srcId, fileId)));
    return r ?? null;
  });
}

/** Files whose recognised text contains `q` (the Ficheiros search box also finds text inside images/PDFs). */
export async function fileIdsByText(auth: AuthContext, q: string): Promise<string[]> {
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return asSharer(auth, async (tx) => {
    const rows = await tx
      .select({ id: ocrTexts.srcId })
      .from(ocrTexts)
      .where(and(eq(ocrTexts.srcType, 'file'), eq(ocrTexts.status, 'done'), ilike(ocrTexts.text, like)))
      .limit(500);
    return rows.map((r) => r.id);
  });
}
