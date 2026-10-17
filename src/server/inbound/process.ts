import 'server-only';
import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { simpleParser } from 'mailparser';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { localParts } from '@/lib/notify';
import { redis } from '@/lib/redis';
import { allow } from '@/server/auth/rateLimit';
import type { AuthContext } from '@/server/auth/session';
import { addNoteImage, createNote, updateNote } from '@/server/content/notes';
import { createTask, updateTask } from '@/server/content/tasks';
import { asUser } from '@/server/content/tenant';
import { getEntitlements } from '@/server/licensing/entitlements';
import { addNotification } from '@/server/notify/service';
import { authVerdict, findToken, senderAllowed, textToDoc, type HeaderLine } from './parse';

// "Email para a app": one message from the inbound mailbox becomes a note or
// a task of the person whose token is in its address. The mailbox itself is
// behind MailboxSource (IMAP in production, a fake in the tests).

export const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;
export const PER_DAY = 50;
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE = /^image\/(png|jpe?g|gif|webp)$/i;
const MAX_TEXT = 200_000;

export type InboundResult =
  | { status: 'created'; kind: 'note' | 'task'; id: string; userId: string }
  | {
      status: 'unknown' | 'disabled' | 'sender' | 'spoof' | 'rate' | 'module' | 'tenant' | 'duplicate';
    };

/** One message of the mailbox; `id` is whatever the source needs to remove it (the IMAP UID). */
export type InboundMessage = { id: string | number; size?: number; raw: Buffer };

export interface MailboxSource {
  /** unread messages, oldest first */
  messages(): AsyncIterable<InboundMessage>;
  /** handled (created or discarded): mark seen and remove from the mailbox */
  remove(id: string | number): Promise<void>;
}

type Owner = {
  user_id: string;
  tenant_id: string;
  enabled: boolean;
  target: 'note' | 'task';
  folder_id: string | null;
  task_type: 'tech' | 'mgmt';
  senders: string[];
  email: string;
  lang: 'pt' | 'en';
};

const LIST_NOTE = { pt: 'Anexos não importados', en: 'Attachments not imported' } as const;
const NO_SUBJECT = { pt: '(sem assunto)', en: '(no subject)' } as const;
const FROM = { pt: 'De', en: 'From' } as const;

/** Turns one raw message into a note or task (or discards it, saying why). */
export async function processMessage(raw: Buffer, base: string, now = new Date()): Promise<InboundResult> {
  const m = await simpleParser(raw, { skipImageLinks: true, skipTextToHtml: true });
  const lines = m.headerLines as HeaderLine[];
  const token = findToken(lines, base);
  if (!token) return { status: 'unknown' };
  const [o] = await db().execute<Owner>(sql`select * from kh_inbound_resolve(${token})`);
  if (!o) return { status: 'unknown' };
  if (!o.enabled) return { status: 'disabled' };
  const from = m.from?.value[0];
  if (!senderAllowed(from?.address ?? '', o.senders, o.email)) return { status: 'sender' };
  if (authVerdict(lines) === 'fail') return { status: 'spoof' };

  const [t] = await db()
    .select({ status: tenants.status, deletedAt: tenants.deletedAt })
    .from(tenants)
    .where(eq(tenants.id, o.tenant_id));
  if (!t || t.deletedAt || !['trial', 'active', 'past_due'].includes(t.status)) return { status: 'tenant' };
  const { modules } = await getEntitlements(o.tenant_id);
  if (!modules.includes(o.target === 'note' ? 'notes' : 'tasks')) return { status: 'module' };

  // the same message twice (a retry after a crash, two workers): handled once
  const msgKey = createHash('sha256')
    .update(m.messageId || raw)
    .digest('hex')
    .slice(0, 32);
  const claim = `kh:inbound:msg:${o.user_id}:${msgKey}`;
  if ((await redis().set(claim, '1', 'EX', 14 * 86_400, 'NX')) !== 'OK') return { status: 'duplicate' };
  if (!(await allow(`inbound:${o.user_id}:${localParts(now, 'UTC').day}`, PER_DAY, 2 * 86_400)))
    return { status: 'rate' };
  try {
    return await create(m, o, msgKey);
  } catch (e) {
    // not handled after all: the next run may try again
    await redis()
      .del(claim)
      .catch(() => {});
    throw e;
  }
}

async function create(
  m: Awaited<ReturnType<typeof simpleParser>>,
  o: Owner,
  msgKey: string,
): Promise<InboundResult> {
  const from = m.from?.value[0];

  const lang = o.lang === 'en' ? 'en' : 'pt';
  const auth = {
    user: { id: o.user_id, email: o.email, lang, name: '' },
    tenant: { id: o.tenant_id },
  } as AuthContext;
  const title = (m.subject?.trim() || NO_SUBJECT[lang]).slice(0, 300);
  // mailparser gives the text part, or the HTML converted to text when there is none
  const text = (m.text ?? '').slice(0, MAX_TEXT);
  const sender = from?.name && from.address ? `${from.name} <${from.address}>` : (from?.address ?? '');
  const images = m.attachments
    .filter((a) => IMAGE.test(a.contentType) && a.size <= MAX_IMAGE_BYTES)
    .slice(0, MAX_IMAGES);
  const others = m.attachments.filter((a) => !images.includes(a) && !(a.related && a.cid));
  const listed = others.length
    ? `${LIST_NOTE[lang]}: ${others.map((a) => a.filename || a.contentType).join(', ')}`
    : '';

  let id: string;
  if (o.target === 'note') {
    const note = await createNote(auth, { folderId: o.folder_id, title }).catch(
      async (e: { code?: string }) => {
        // the chosen notebook was deleted: no notebook
        if (e?.code === 'folder_not_found') return createNote(auth, { title });
        throw e;
      },
    );
    id = note.id;
    const imgs = [];
    for (const a of images) {
      const fileId = await addNoteImage(auth, id, new Uint8Array(a.content)).catch(() => null);
      if (fileId)
        imgs.push({ type: 'image', attrs: { src: `/api/v1/files/${fileId}`, alt: a.filename ?? '' } });
    }
    const head = `${FROM[lang]}: ${sender}${m.date ? ` · ${m.date.toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}`;
    const doc = textToDoc(`${head}\n\n${text}${listed ? `\n\n${listed}` : ''}`, imgs);
    await updateNote(auth, id, { content: doc });
  } else {
    const task = await createTask(auth, { title, type: o.task_type });
    id = task.id;
    const notes = `${FROM[lang]}: ${sender}\n\n${text}${listed ? `\n\n${listed}` : ''}`.slice(0, 20_000);
    await updateTask(auth, id, { notes });
  }
  await asUser(auth, (tx) =>
    addNotification(
      tx,
      { tenantId: o.tenant_id, userId: o.user_id },
      {
        kind: o.target === 'note' ? 'inbound_note' : 'inbound_task',
        itemType: o.target,
        itemId: id,
        title,
        meta: { from: (from?.address ?? '').slice(0, 200) },
        key: `inbound:${msgKey}`,
      },
    ),
  );
  return { status: 'created', kind: o.target, id, userId: o.user_id };
}

/**
 * Handles every unread message of the mailbox. A message is removed once
 * handled or discarded (unknown token, sender not allowed, spoofed, over the
 * daily limit…); one that fails for another reason (database down) stays for
 * the next run, up to 3 attempts.
 */
export async function pollMailbox(source: MailboxSource, base: string, now = new Date()) {
  const out: Record<string, number> = {};
  for await (const msg of source.messages()) {
    let status: string;
    try {
      if ((msg.size ?? msg.raw.length) > MAX_MESSAGE_BYTES) status = 'too_large';
      else status = (await processMessage(msg.raw, base, now)).status;
    } catch (e) {
      const k = `kh:inbound:fail:${createHash('sha256').update(msg.raw).digest('hex').slice(0, 32)}`;
      const n = await redis()
        .incr(k)
        .catch(() => 1);
      await redis()
        .expire(k, 7 * 86_400)
        .catch(() => {});
      console.error('[inbound] message failed', n, e);
      if (n < 3) {
        out.retry = (out.retry ?? 0) + 1;
        continue;
      }
      status = 'error';
    }
    out[status] = (out[status] ?? 0) + 1;
    await source.remove(msg.id);
  }
  return out;
}
