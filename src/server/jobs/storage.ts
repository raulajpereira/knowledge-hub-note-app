import { sql } from 'drizzle-orm';
import {
  AbortMultipartUploadCommand,
  DeleteObjectsCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { db } from '@/db/client';
import { env } from '@/lib/env';
import { s3 } from '@/lib/storage';

// Files nobody points to any more (a person deleted from a pack, a note or an
// email removed for good…) are removed from the bucket. Only objects older
// than a day: an upload in progress may not have its row yet.

const DAY = 86_400_000;

/**
 * Safety brake: never delete when the database knows of no file at all (an
 * empty or wrong database pointed at the real bucket, a restore in progress…)
 * or when more than a quarter of the files would go at once. Deletes nothing
 * and says so; STORAGE_SWEEP_DRY_RUN=true only reports (first runs after a move).
 */
export function sweepVerdict(kept: number, listed: number, candidates: number, dryRun: boolean) {
  if (dryRun) return 'dry_run';
  if (candidates === 0) return 'ok';
  if (kept === 0) return 'blocked_no_keys';
  if (candidates > 50 && candidates > listed * 0.25) return 'blocked_too_many';
  return 'ok';
}

export async function sweepStorage(now = new Date()) {
  const rows = await db().execute<{ k: string }>(sql`select kh_storage_keys() as k`);
  const keep = new Set(rows.map((r) => r.k));
  const bucket = env().S3_BUCKET;
  // list first, decide, then delete
  const candidates: string[] = [];
  let listed = 0;
  for (const prefix of ['tenants/', 'users/'])
    for (let token: string | undefined; ;) {
      const page = await s3().send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
      );
      listed += page.Contents?.length ?? 0;
      for (const o of page.Contents ?? [])
        if (o.Key && !keep.has(o.Key) && (o.LastModified?.getTime() ?? 0) < now.getTime() - DAY)
          candidates.push(o.Key);
      if (!page.IsTruncated) break;
      token = page.NextContinuationToken;
    }
  const verdict = sweepVerdict(keep.size, listed, candidates.length, env().STORAGE_SWEEP_DRY_RUN);
  let removed = 0;
  if (verdict === 'ok')
    for (let i = 0; i < candidates.length; i += 1000) {
      const batch = candidates.slice(i, i + 1000).map((Key) => ({ Key }));
      await s3().send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch, Quiet: true } }));
      removed += batch.length;
    }
  else if (verdict !== 'dry_run' || candidates.length)
    console.warn(
      '[storage] sweep',
      verdict,
      JSON.stringify({ kept: keep.size, listed, candidates: candidates.length }),
    );
  // chunked uploads (Ficheiros) left unfinished for more than a day
  let aborted = 0;
  for (let km: string | undefined, um: string | undefined; ;) {
    const page = await s3().send(
      new ListMultipartUploadsCommand({
        Bucket: bucket,
        Prefix: 'tenants/',
        KeyMarker: km,
        UploadIdMarker: um,
      }),
    );
    for (const u of page.Uploads ?? [])
      if (u.Key && u.UploadId && (u.Initiated?.getTime() ?? 0) < now.getTime() - DAY) {
        await s3()
          .send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: u.Key, UploadId: u.UploadId }))
          .catch(() => {});
        aborted++;
      }
    if (!page.IsTruncated) break;
    km = page.NextKeyMarker;
    um = page.NextUploadIdMarker;
  }
  return { verdict, listed, candidates: candidates.length, removed, aborted };
}
