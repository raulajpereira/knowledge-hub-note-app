import 'server-only';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { emailAttachments, emails, folders } from '@/db/schema';
import { env } from '@/lib/env';
import { randomToken } from '@/lib/crypto';
import { s3 } from '@/lib/storage';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { asUser, type Tx } from './tenant';
import { parseEmailFile } from './emailParse';
import { createTask, updateTask } from './tasks';

// Emails (prototype isMail): imported .msg / .eml files, folders, star / pin,
// notes, "create task" and the Trash. Bodies are parsed and sanitized here.

export const MAX_EMAIL_FILE = 25 * 1024 * 1024;
const MAX_ATTACHMENTS = 50;

export type EmailSummary = {
  id: string;
  folderId: string | null;
  subject: string;
  fromName: string;
  fromEmail: string;
  snippet: string;
  sentAt: string | null;
  createdAt: string;
  starred: boolean;
  pinned: boolean;
  attachments: number;
};
export type EmailFull = EmailSummary & {
  to: string;
  cc: string;
  text: string;
  html: string;
  notes: string;
  fileName: string;
  files: Array<{ id: string; name: string; size: number }>;
};

const put = (key: string, body: Uint8Array, type: string) =>
  s3().send(new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, Body: body, ContentType: type }));
const del = (key: string) =>
  s3()
    .send(new DeleteObjectCommand({ Bucket: env().S3_BUCKET, Key: key }))
    .catch(() => {});

const sumCols = {
  id: emails.id,
  folderId: emails.folderId,
  subject: emails.subject,
  fromName: emails.fromName,
  fromEmail: emails.fromEmail,
  snippet: sql<string>`left(regexp_replace(case when ${emails.bodyText} <> '' then left(${emails.bodyText}, 600) else regexp_replace(left(${emails.bodyHtml}, 4000), '<[^>]*>', ' ', 'g') end, '\\s+', ' ', 'g'), 160)`,
  sentAt: emails.sentAt,
  createdAt: emails.createdAt,
  starred: emails.starred,
  pinned: emails.pinned,
  attachments: sql<number>`(select count(*)::int from email_attachments a where a.email_id = "emails"."id")`,
};
type SumRow = Omit<EmailSummary, 'sentAt' | 'createdAt'> & { sentAt: Date | null; createdAt: Date };
const toSummary = (r: SumRow): EmailSummary => ({
  ...r,
  snippet: r.snippet.replace(/&nbsp;/g, ' ').trim(),
  sentAt: r.sentAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
});

export async function listEmails(auth: AuthContext): Promise<EmailSummary[]> {
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select(sumCols)
      .from(emails)
      .where(isNull(emails.deletedAt))
      .orderBy(desc(emails.pinned), sql`${emails.sentAt} desc nulls last`, desc(emails.createdAt))
      .limit(2000);
    return rows.map(toSummary);
  });
}

async function loadEmail(tx: Tx, id: string): Promise<EmailFull> {
  const [r] = await tx
    .select({
      ...sumCols,
      to: emails.toAddr,
      cc: emails.cc,
      text: emails.bodyText,
      html: emails.bodyHtml,
      notes: emails.notes,
      fileName: emails.fileName,
    })
    .from(emails)
    .where(and(eq(emails.id, id), isNull(emails.deletedAt)));
  if (!r) throw new ApiError(404, 'not_found');
  const files = await tx
    .select({ id: emailAttachments.id, name: emailAttachments.name, size: emailAttachments.size })
    .from(emailAttachments)
    .where(eq(emailAttachments.emailId, id))
    .orderBy(asc(emailAttachments.name));
  const { to, cc, text, html, notes, fileName, ...sum } = r;
  return { ...toSummary(sum), to, cc, text, html, notes, fileName, files };
}

export async function getEmail(auth: AuthContext, id: string): Promise<EmailFull> {
  return asUser(auth, (tx) => loadEmail(tx, id));
}

async function checkFolder(tx: Tx, folderId: string | null | undefined) {
  if (!folderId) return null;
  const [f] = await tx
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.kind, 'emails'), isNull(folders.deletedAt)));
  if (!f) throw new ApiError(404, 'folder_not_found');
  return f.id;
}

/** Imports one .msg / .eml: parse, store the original and the attachments, then the row. */
export async function importEmail(
  auth: AuthContext,
  input: { fileName: string; data: Uint8Array; folderId?: string | null },
): Promise<EmailSummary> {
  if (input.data.length > MAX_EMAIL_FILE)
    throw new ApiError(413, 'file_too_large', undefined, { max: MAX_EMAIL_FILE });
  let p: Awaited<ReturnType<typeof parseEmailFile>>;
  try {
    p = await parseEmailFile(input.data);
  } catch {
    throw new ApiError(422, 'unreadable_email');
  }
  if (!p.subject && !p.fromEmail && !p.text && !p.html) throw new ApiError(422, 'unreadable_email');
  const base = `tenants/${auth.tenant.id}/emails/${randomToken(12)}`;
  const keys: string[] = [];
  try {
    return await asUser(auth, async (tx) => {
      const folderId = await checkFolder(tx, input.folderId);
      const fileKey = `${base}/original`;
      await put(fileKey, input.data, 'application/octet-stream');
      keys.push(fileKey);
      const [row] = await tx
        .insert(emails)
        .values({
          tenantId: auth.tenant.id,
          ownerId: auth.user.id,
          folderId,
          subject: p.subject || input.fileName.replace(/\.(msg|eml)$/i, '').slice(0, 1000),
          fromName: p.fromName,
          fromEmail: p.fromEmail,
          toAddr: p.to,
          cc: p.cc,
          sentAt: p.date,
          bodyText: p.text,
          bodyHtml: p.html,
          fileKey,
          fileName: input.fileName.slice(0, 300),
          fileSize: input.data.length,
        })
        .returning({ id: emails.id });
      for (const a of p.attachments.slice(0, MAX_ATTACHMENTS)) {
        const key = `${base}/${randomToken(10)}`;
        await put(key, a.data, 'application/octet-stream');
        keys.push(key);
        await tx.insert(emailAttachments).values({
          tenantId: auth.tenant.id,
          ownerId: auth.user.id,
          emailId: row!.id,
          name: a.name.slice(0, 300),
          mime: a.mime.slice(0, 120),
          size: a.data.length,
          storageKey: key,
        });
      }
      const [s] = await tx.select(sumCols).from(emails).where(eq(emails.id, row!.id));
      return toSummary(s!);
    });
  } catch (e) {
    for (const k of keys) await del(k);
    throw e;
  }
}

export async function updateEmail(
  auth: AuthContext,
  id: string,
  patch: Partial<{ folderId: string | null; starred: boolean; pinned: boolean; notes: string }>,
): Promise<EmailFull> {
  return asUser(auth, async (tx) => {
    if (patch.folderId !== undefined) patch.folderId = await checkFolder(tx, patch.folderId);
    const r = await tx
      .update(emails)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(emails.id, id), isNull(emails.deletedAt)))
      .returning({ id: emails.id });
    if (!r.length) throw new ApiError(404, 'not_found');
    return loadEmail(tx, id);
  });
}

export async function trashEmail(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(emails)
      .set({ deletedAt: new Date() })
      .where(and(eq(emails.id, id), isNull(emails.deletedAt)))
      .returning({ id: emails.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

/** Permanently removes emails (Trash purge) with their stored files. */
export async function purgeEmailsTx(tx: Tx, ids: string[]) {
  if (!ids.length) return;
  const atts = await tx
    .delete(emailAttachments)
    .where(inArray(emailAttachments.emailId, ids))
    .returning({ key: emailAttachments.storageKey });
  const gone = await tx.delete(emails).where(inArray(emails.id, ids)).returning({ key: emails.fileKey });
  for (const k of [...atts, ...gone]) await del(k.key);
}

/** "Criar tarefa": a task titled with the subject, the sender and date in its notes. */
export async function emailToTask(auth: AuthContext, id: string, lang: 'pt' | 'en') {
  const m = await getEmail(auth, id);
  const who = m.fromName && m.fromEmail ? `${m.fromName} <${m.fromEmail}>` : m.fromName || m.fromEmail;
  const when = m.sentAt
    ? new Date(m.sentAt).toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT', { timeZone: 'Europe/Lisbon' })
    : '';
  const t = await createTask(auth, { title: (m.subject || 'Email').slice(0, 300) });
  const r = await updateTask(auth, t.id, { notes: `Email: ${[who, when].filter(Boolean).join(' · ')}` });
  return r.task;
}

async function readObject(key: string) {
  const obj = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
  return obj.Body?.transformToByteArray();
}

export async function readEmailOriginal(auth: AuthContext, id: string) {
  const row = await asUser(auth, async (tx) => {
    const [r] = await tx
      .select({ key: emails.fileKey, name: emails.fileName })
      .from(emails)
      .where(and(eq(emails.id, id), isNull(emails.deletedAt)));
    return r;
  });
  if (!row) return null;
  const body = await readObject(row.key);
  return body ? { body, name: row.name } : null;
}

export async function readEmailAttachment(auth: AuthContext, id: string, attId: string) {
  const row = await asUser(auth, async (tx) => {
    const [r] = await tx
      .select({ key: emailAttachments.storageKey, name: emailAttachments.name })
      .from(emailAttachments)
      .innerJoin(emails, eq(emails.id, emailAttachments.emailId))
      .where(and(eq(emailAttachments.id, attId), eq(emails.id, id), isNull(emails.deletedAt)));
    return r;
  });
  if (!row) return null;
  const body = await readObject(row.key);
  return body ? { body, name: row.name } : null;
}

// ── Folders (flat, prototype mFolders) ─────────────────────────────────────
export async function listEmailFolders(auth: AuthContext) {
  return asUser(auth, (tx) =>
    tx
      .select({ id: folders.id, name: folders.name })
      .from(folders)
      .where(and(eq(folders.kind, 'emails'), isNull(folders.deletedAt)))
      .orderBy(asc(folders.sort), asc(folders.createdAt)),
  );
}

export async function createEmailFolder(auth: AuthContext, name: string) {
  return asUser(auth, async (tx) => {
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(folders)
      .where(eq(folders.kind, 'emails'))) as [{ n: number }];
    if (n >= 200) throw new ApiError(400, 'too_many_folders');
    const [f] = await tx
      .insert(folders)
      .values({ tenantId: auth.tenant.id, ownerId: auth.user.id, kind: 'emails', name, color: '', sort: n })
      .returning({ id: folders.id, name: folders.name });
    return f!;
  });
}

/** Removing a folder keeps its emails (they go back to "Todos"), as in the prototype. */
export async function deleteEmailFolder(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .delete(folders)
      .where(and(eq(folders.id, id), eq(folders.kind, 'emails')))
      .returning({ id: folders.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}
