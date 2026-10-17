import 'server-only';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { sapFnEvidence, sapFnRecords } from '@/db/schema';
import { env } from '@/lib/env';
import { randomToken } from '@/lib/crypto';
import { s3 } from '@/lib/storage';
import type { FnRow } from '@/lib/functional';
import { ApiError } from '@/server/errors';
import { sniffImage } from '@/server/assets';
import type { AuthContext } from '@/server/auth/session';
import { asUser, lockLimit, removeFilesAfterCommit } from './tenant';

// Test evidence (Funcional › Testes): screenshots and small files attached to
// one step (row id) of a test case. Shared by the tenant like the record (D40),
// kept in the private bucket and streamed back by /sap/functional/evidence/:id.
// Removed with the record when it is purged from the Trash; the evidence of a
// step that was deleted is pruned a day later (kh_prune_fn_evidence) and its
// file goes with the storage sweep.

export const EVIDENCE_MAX = 10 * 1024 * 1024;
/** Per step, per test case and per tenant (count, bytes). */
export const EVIDENCE_LIMITS = { perStep: 20, recordBytes: 200 * 1024 * 1024, tenantBytes: 5 * 1024 ** 3 };

/** Files other than images, by extension: shown as a download, never inline. */
const OTHER: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  log: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  eml: 'message/rfc822',
  msg: 'application/vnd.ms-outlook',
};
export const isImage = (mime: string) => mime.startsWith('image/');

export type Evidence = {
  id: string;
  rowId: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
};
const cols = {
  id: sapFnEvidence.id,
  rowId: sapFnEvidence.rowId,
  name: sapFnEvidence.name,
  mime: sapFnEvidence.mime,
  size: sapFnEvidence.size,
  createdAt: sapFnEvidence.createdAt,
};
const toEv = (r: Omit<Evidence, 'createdAt'> & { createdAt: Date }): Evidence => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
});

/** Name kept for the download: no paths or control characters. */
export const cleanName = (n: string) =>
  n
    .replace(/^.*[\\/]/, '')
    .replace(/[\u0000-\u001f\u007f"]/g, '')
    .trim()
    .slice(0, 200);

/** Content type: images by their bytes (PNG, JPEG, WebP, GIF), other files by extension. */
export function evidenceType(name: string, data: Uint8Array): string | null {
  const gif = data.length >= 6 && String.fromCharCode(...data.subarray(0, 4)) === 'GIF8';
  const img = sniffImage(data) ?? (gif ? 'image/gif' : null);
  if (img) return img;
  const ext = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase();
  return (ext && OTHER[ext]) || null;
}

/** The evidence of the test cases given (all of them for a report). */
export async function listEvidence(
  auth: AuthContext,
  recordIds: string[],
): Promise<Record<string, Evidence[]>> {
  if (!recordIds.length) return {};
  return asUser(auth, async (tx) => {
    const rs = await tx
      .select({ ...cols, recordId: sapFnEvidence.recordId })
      .from(sapFnEvidence)
      .innerJoin(sapFnRecords, eq(sapFnRecords.id, sapFnEvidence.recordId))
      .where(and(inArray(sapFnEvidence.recordId, recordIds), isNull(sapFnRecords.deletedAt)))
      .orderBy(asc(sapFnEvidence.createdAt));
    const out: Record<string, Evidence[]> = {};
    for (const { recordId, ...r } of rs) (out[recordId] ??= []).push(toEv(r));
    return out;
  });
}

export async function addEvidence(
  auth: AuthContext,
  recordId: string,
  rowId: string,
  name0: string,
  data: Uint8Array,
): Promise<Evidence> {
  if (!data.length) throw new ApiError(400, 'invalid_input', 'empty file');
  if (data.length > EVIDENCE_MAX) throw new ApiError(413, 'file_too_large', undefined, { max: EVIDENCE_MAX });
  const mime = evidenceType(name0, data);
  if (!mime) throw new ApiError(415, 'unsupported_file');
  const ext = mime.split('/')[1]!.replace('jpeg', 'jpg');
  const name = cleanName(name0) || `evidence.${isImage(mime) ? ext : 'bin'}`;
  return asUser(auth, async (tx) => {
    const [rec] = await tx
      .select({ rows: sapFnRecords.rows })
      .from(sapFnRecords)
      .where(
        and(eq(sapFnRecords.id, recordId), eq(sapFnRecords.page, 'fn_test'), isNull(sapFnRecords.deletedAt)),
      );
    if (!rec) throw new ApiError(404, 'not_found');
    if (!(rec.rows as FnRow[]).some((r) => r.id === rowId)) throw new ApiError(404, 'row_not_found');
    // count, then add: one upload at a time per tenant so two can't both pass a limit
    await lockLimit(tx, auth.tenant.id, 'fn_evidence');
    const [u] = (await tx
      .select({
        step: sql<number>`count(*) filter (where ${sapFnEvidence.recordId} = ${recordId} and ${sapFnEvidence.rowId} = ${rowId})::int`,
        rec: sql<number>`coalesce(sum(${sapFnEvidence.size}) filter (where ${sapFnEvidence.recordId} = ${recordId}), 0)::bigint`,
        all: sql<number>`coalesce(sum(${sapFnEvidence.size}), 0)::bigint`,
      })
      .from(sapFnEvidence)) as [{ step: number; rec: number; all: number }];
    if (u.step >= EVIDENCE_LIMITS.perStep)
      throw new ApiError(403, 'limit_reached', undefined, {
        resource: 'evidence',
        max: EVIDENCE_LIMITS.perStep,
      });
    if (Number(u.rec) + data.length > EVIDENCE_LIMITS.recordBytes)
      throw new ApiError(403, 'limit_reached', undefined, {
        resource: 'evidence_storage',
        max: EVIDENCE_LIMITS.recordBytes,
      });
    if (Number(u.all) + data.length > EVIDENCE_LIMITS.tenantBytes)
      throw new ApiError(403, 'limit_reached', undefined, {
        resource: 'evidence_storage',
        max: EVIDENCE_LIMITS.tenantBytes,
      });
    const key = `tenants/${auth.tenant.id}/fn-evidence/${recordId}/${randomToken(12)}`;
    await s3().send(
      new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, Body: data, ContentType: mime }),
    );
    const [r] = await tx
      .insert(sapFnEvidence)
      .values({
        tenantId: auth.tenant.id,
        recordId,
        rowId,
        storageKey: key,
        name,
        mime,
        size: data.length,
        createdBy: auth.user.id,
      })
      .returning(cols);
    return toEv(r!);
  });
}

export async function readEvidence(auth: AuthContext, id: string) {
  const row = await asUser(auth, async (tx) => {
    const [e] = await tx
      .select({ key: sapFnEvidence.storageKey, mime: sapFnEvidence.mime, name: sapFnEvidence.name })
      .from(sapFnEvidence)
      .innerJoin(sapFnRecords, eq(sapFnRecords.id, sapFnEvidence.recordId))
      .where(and(eq(sapFnEvidence.id, id), isNull(sapFnRecords.deletedAt)));
    return e;
  });
  if (!row) return null;
  const obj = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: row.key }));
  const body = await obj.Body?.transformToByteArray();
  return body ? { body, mime: row.mime, name: row.name } : null;
}

export async function deleteEvidence(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const [e] = await tx
      .delete(sapFnEvidence)
      .where(eq(sapFnEvidence.id, id))
      .returning({ key: sapFnEvidence.storageKey });
    if (!e) throw new ApiError(404, 'not_found');
    removeFilesAfterCommit(tx, [e.key]);
  });
}
