// Drains the search queue (search_jobs, filled by triggers on every change):
// one job at a time, OCR before embeddings (recognised text feeds the item's
// vectors). Each item is read and written as its owner under RLS, exactly as
// the app would. Unchanged chunks (same hash, same model) are skipped, so a
// title edit on a long email embeds one chunk, not twenty.
import { and, eq, gte, sql } from 'drizzle-orm';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { db, withTenant } from '@/db/client';
import {
  driveFiles,
  emailAttachments,
  embeddings,
  meetingAttachments,
  noteAttachments,
  ocrTexts,
} from '@/db/schema';
import { env } from '@/lib/env';
import { s3 } from '@/lib/storage';
import { chunkHash, chunkText } from '@/lib/search/text';
import { embedSelect, kindOf } from '@/server/search/sources';
import { embed, modelId } from './embedder';
import { isPdf, ocrImage, ocrPdf } from './ocr';

type Job = {
  item_type: string;
  item_id: string;
  tenant_id: string;
  owner_id: string | null;
  force: boolean;
  due_at: Date | string;
  attempts: number;
};

/** chunks embedded per model call (small: one vCPU, bounded memory) */
const BATCH = 4;
const MAX_ATTEMPTS = 3;

const as = <T>(j: Job, fn: (tx: Parameters<Parameters<typeof withTenant>[2]>[0]) => Promise<T>) =>
  withTenant(db(), { tenantId: j.tenant_id, userId: j.owner_id ?? '' }, fn);

async function claim(kind: 'embed' | 'ocr', limit: number): Promise<Job[]> {
  return (await db().execute(sql`select * from kh_search_claim(${kind}, ${limit})`)) as unknown as Job[];
}

const dueOf = (j: Job) => (j.due_at instanceof Date ? j.due_at.toISOString() : String(j.due_at));

async function done(kind: string, j: Job) {
  await db().execute(
    sql`select kh_search_done(${kind}, ${j.item_type}, ${j.item_id}::uuid, ${dueOf(j)}::timestamptz)`,
  );
}

/** Returns true when the job was dropped (no more retries). */
async function failed(kind: string, j: Job, err: unknown): Promise<boolean> {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  // a broken or unsupported file stays broken: no retries
  const permanent =
    /InvalidPDF|PasswordException|unsupported image format|Input buffer contains unsupported/i.test(msg);
  const [r] = (await db().execute(
    sql`select kh_search_failed(${kind}, ${j.item_type}, ${j.item_id}::uuid, ${msg}, ${permanent ? 1 : MAX_ATTEMPTS}) as dropped`,
  )) as unknown as Array<{ dropped: boolean }>;
  return !!r?.dropped;
}

// ── embeddings ──────────────────────────────────────────────────────────────

export async function embedItem(j: Job): Promise<{ chunks: number; embedded: number }> {
  const k = kindOf(j.item_type);
  if (!k) return { chunks: 0, embedded: 0 };
  const model = modelId();
  // 1. read the text and what is stored (short transaction)
  const state = await as(j, async (tx) => {
    const [row] = (await tx
      .select({ text: embedSelect(k), alive: sql<boolean>`${k.alive}` })
      .from(k.table as typeof driveFiles)
      .where(eq(k.id, j.item_id))) as Array<{ text: string | null; alive: boolean }>;
    const have = await tx
      .select({ chunk: embeddings.chunkNo, hash: embeddings.contentHash })
      .from(embeddings)
      .where(and(eq(embeddings.itemType, j.item_type), eq(embeddings.itemId, j.item_id)));
    return { row, have: new Map(have.map((h) => [h.chunk, h.hash])) };
  });
  if (!state.row) {
    // gone (the delete trigger normally cleaned up already)
    await as(j, (tx) =>
      tx
        .delete(embeddings)
        .where(and(eq(embeddings.itemType, j.item_type), eq(embeddings.itemId, j.item_id))),
    );
    return { chunks: 0, embedded: 0 };
  }
  // in the Trash: vectors are kept (restoring needs no work; the purge deletes them)
  if (!state.row.alive) return { chunks: state.have.size, embedded: 0 };

  const chunks = chunkText(state.row.text ?? '');
  const hashes = chunks.map((c) => chunkHash(c, model));
  const todo = chunks
    .map((c, i) => ({ i, c, h: hashes[i]! }))
    .filter((x) => j.force || state.have.get(x.i) !== x.h);

  // 2. embed outside any transaction
  const vectors: Array<{ i: number; h: string; v: number[] }> = [];
  for (let b = 0; b < todo.length; b += BATCH) {
    const part = todo.slice(b, b + BATCH);
    const vs = await embed(
      part.map((x) => x.c),
      'passage',
    );
    part.forEach((x, n) => vectors.push({ i: x.i, h: x.h, v: vs[n]! }));
  }

  // 3. write: changed chunks, and drop chunks past the new end
  await as(j, async (tx) => {
    if (vectors.length)
      await tx
        .insert(embeddings)
        .values(
          vectors.map((x) => ({
            tenantId: j.tenant_id,
            ownerId: j.owner_id,
            itemType: j.item_type,
            itemId: j.item_id,
            chunkNo: x.i,
            contentHash: x.h,
            model,
            embedding: x.v,
          })),
        )
        .onConflictDoUpdate({
          target: [embeddings.itemType, embeddings.itemId, embeddings.chunkNo],
          set: {
            contentHash: sql`excluded.content_hash`,
            model: sql`excluded.model`,
            embedding: sql`excluded.embedding`,
            updatedAt: sql`now()`,
          },
        });
    await tx
      .delete(embeddings)
      .where(
        and(
          eq(embeddings.itemType, j.item_type),
          eq(embeddings.itemId, j.item_id),
          gte(embeddings.chunkNo, chunks.length),
        ),
      );
  });
  return { chunks: chunks.length, embedded: vectors.length };
}

// ── OCR ─────────────────────────────────────────────────────────────────────

type Src = { key: string; name: string; mime: string; size: number; parentType: string; parentId: string };

async function source(j: Job): Promise<Src | null> {
  return as(j, async (tx) => {
    switch (j.item_type) {
      case 'note_att': {
        const [r] = await tx.select().from(noteAttachments).where(eq(noteAttachments.id, j.item_id));
        return (
          r && {
            key: r.storageKey,
            name: '',
            mime: r.mime,
            size: r.size,
            parentType: 'note',
            parentId: r.noteId,
          }
        );
      }
      case 'meeting_att': {
        const [r] = await tx.select().from(meetingAttachments).where(eq(meetingAttachments.id, j.item_id));
        return (
          r && {
            key: r.storageKey,
            name: '',
            mime: r.mime,
            size: r.size,
            parentType: 'meeting',
            parentId: r.meetingId,
          }
        );
      }
      case 'email_att': {
        const [r] = await tx.select().from(emailAttachments).where(eq(emailAttachments.id, j.item_id));
        return (
          r && {
            key: r.storageKey,
            name: r.name,
            mime: r.mime,
            size: r.size,
            parentType: 'email',
            parentId: r.emailId,
          }
        );
      }
      case 'file': {
        const [r] = await tx.select().from(driveFiles).where(eq(driveFiles.id, j.item_id));
        return (
          r && {
            key: r.storageKey,
            name: r.name,
            mime: r.mime,
            size: r.size,
            parentType: 'file',
            parentId: r.id,
          }
        );
      }
    }
    return null;
  }).then((r) => r ?? null);
}

async function saveOcr(
  j: Job,
  s: Src,
  v: { status: 'done' | 'skipped' | 'failed'; text?: string; pages?: number; error?: string },
) {
  const row = {
    tenantId: j.tenant_id,
    ownerId: j.owner_id!,
    srcType: j.item_type,
    srcId: j.item_id,
    parentType: s.parentType,
    parentId: s.parentId,
    status: v.status,
    text: (v.text ?? '').slice(0, 200_000),
    pages: v.pages ?? 0,
    error: (v.error ?? '').slice(0, 500),
  };
  await as(j, (tx) =>
    tx
      .insert(ocrTexts)
      .values(row)
      .onConflictDoUpdate({
        target: [ocrTexts.srcType, ocrTexts.srcId],
        set: {
          status: row.status,
          text: row.text,
          pages: row.pages,
          error: row.error,
          updatedAt: sql`now()`,
        },
      }),
  );
}

async function download(key: string, max: number): Promise<Buffer> {
  const obj = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
  if ((obj.ContentLength ?? 0) > max) throw new Error('too big');
  const bytes = await obj.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export async function ocrItem(j: Job): Promise<{ status: string; chars: number } | null> {
  const s = await source(j);
  if (!s || !j.owner_id) return null;
  const max = env().OCR_MAX_MB * 1024 * 1024;
  if (s.size > max) {
    await saveOcr(j, s, { status: 'skipped', error: 'too big' });
    return { status: 'skipped', chars: 0 };
  }
  const buf = await download(s.key, max);
  const r = isPdf(s.name, s.mime, buf) ? await ocrPdf(buf) : { text: await ocrImage(buf), pages: 1 };
  await saveOcr(j, s, { status: r.text ? 'done' : 'skipped', text: r.text, pages: r.pages });
  return { status: r.text ? 'done' : 'skipped', chars: r.text.length };
}

// ── loop ────────────────────────────────────────────────────────────────────

/** One round: at most one OCR job and a few embedding jobs. Returns jobs handled. */
export async function indexTick(): Promise<number> {
  const e = env();
  let n = 0;
  if (e.OCR) {
    for (const j of await claim('ocr', 1)) {
      n++;
      const t0 = Date.now();
      try {
        const r = await ocrItem(j);
        await done('ocr', j);
        if (r)
          console.log(
            `[search] ocr ${j.item_type} ${j.item_id}: ${r.status}, ${r.chars} chars, ${Date.now() - t0} ms`,
          );
      } catch (err) {
        const dropped = await failed('ocr', j, err);
        console.error(
          `[search] ocr ${j.item_type} ${j.item_id} failed${dropped ? ' (giving up)' : ''}:`,
          String(err),
        );
        if (dropped) {
          const s = await source(j).catch(() => null);
          if (s && j.owner_id) await saveOcr(j, s, { status: 'failed', error: String(err) }).catch(() => {});
        }
      }
    }
  }
  if (e.SEMANTIC_SEARCH) {
    for (const j of await claim('embed', 4)) {
      n++;
      try {
        await embedItem(j);
        await done('embed', j);
      } catch (err) {
        const dropped = await failed('embed', j, err);
        console.error(
          `[search] embed ${j.item_type} ${j.item_id} failed${dropped ? ' (giving up)' : ''}:`,
          String(err),
        );
      }
    }
  }
  return n;
}

/** Queues what has no vectors / OCR yet (resumable; at worker start). */
export async function backfill(): Promise<number> {
  const e = env();
  if (!e.SEMANTIC_SEARCH && !e.OCR) return 0;
  const [r] = (await db().execute(
    sql`select kh_search_backfill(${e.SEMANTIC_SEARCH ? modelId() : null}, ${e.OCR}) as n`,
  )) as unknown as Array<{ n: number }>;
  return r?.n ?? 0;
}

/** Runs the queue until stopped: busy → next round at once, idle → every 5 s. */
export function startIndexer(): () => Promise<void> {
  let running = true;
  let wake: (() => void) | null = null;
  const loop = (async () => {
    while (running) {
      let n = 0;
      try {
        n = await indexTick();
      } catch (err) {
        console.error('[search] indexer round failed:', err);
        n = 0;
      }
      if (!running) break;
      await new Promise<void>((res) => {
        const t = setTimeout(res, n ? 50 : 5_000);
        wake = () => {
          clearTimeout(t);
          res();
        };
      });
      wake = null;
    }
  })();
  return async () => {
    running = false;
    (wake as (() => void) | null)?.();
    await loop;
  };
}
