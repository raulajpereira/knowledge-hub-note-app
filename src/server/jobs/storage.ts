import { sql } from 'drizzle-orm';
import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { db } from '@/db/client';
import { env } from '@/lib/env';
import { s3 } from '@/lib/storage';

// Files nobody points to any more (a person deleted from a pack, a note or an
// email removed for good…) are removed from the bucket. Only objects older
// than a day: an upload in progress may not have its row yet.

const DAY = 86_400_000;

export async function sweepStorage(now = new Date()) {
  const rows = await db().execute<{ k: string }>(sql`select kh_storage_keys() as k`);
  const keep = new Set(rows.map((r) => r.k));
  const bucket = env().S3_BUCKET;
  let removed = 0;
  for (const prefix of ['tenants/', 'users/'])
    for (let token: string | undefined; ;) {
      const page = await s3().send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
      );
      const gone = (page.Contents ?? [])
        .filter((o) => o.Key && !keep.has(o.Key) && (o.LastModified?.getTime() ?? 0) < now.getTime() - DAY)
        .map((o) => ({ Key: o.Key! }));
      if (gone.length) {
        await s3().send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: gone } }));
        removed += gone.length;
      }
      if (!page.IsTruncated) break;
      token = page.NextContinuationToken;
    }
  return { removed };
}
