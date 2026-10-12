import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { meetingAttachments, meetings, type MeetingItem } from '@/db/schema';
import { env } from '@/lib/env';
import { randomToken } from '@/lib/crypto';
import { s3 } from '@/lib/storage';
import { ApiError } from '@/server/errors';
import { sniffImage } from '@/server/assets';
import { safeFetchBytes } from '@/server/net/safeFetch';
import type { AuthContext } from '@/server/auth/session';
import { asUser } from './tenant';
import { checkKindFolder, listKindFolders, type KindFolder } from './kindFolders';
import { docText, validateDoc, type PMNode } from './doc';

// Meeting records ("Registos Reuniões"): date and time, subject, participants
// by name (they may be outside the app), and the minutes — topics discussed,
// points to review and things to do. In flat folders; shown on the Calendar by date.
// The topics are a rich document like a note's (topicsDoc, images included);
// `topics` keeps its plain text for search, the AI and templates. Records
// written before that only have the text: the page turns it into a document.

export type Meeting = {
  id: string;
  folderId: string | null;
  title: string;
  heldOn: string;
  startTime: string;
  endTime: string;
  participants: string[];
  topics: string;
  review: MeetingItem[];
  todos: MeetingItem[];
  createdAt: string;
  updatedAt: string;
};
/** One record with its topics document (null: only the plain text so far). */
export type MeetingFull = Meeting & { topicsDoc: PMNode | null };

const cols = {
  id: meetings.id,
  folderId: meetings.folderId,
  title: meetings.title,
  heldOn: meetings.heldOn,
  startTime: meetings.startTime,
  endTime: meetings.endTime,
  participants: meetings.participants,
  topics: meetings.topics,
  review: meetings.review,
  todos: meetings.todos,
  createdAt: meetings.createdAt,
  updatedAt: meetings.updatedAt,
};
type Row = Omit<Meeting, 'createdAt' | 'updatedAt'> & { createdAt: Date; updatedAt: Date };
const toMeeting = (r: Row): Meeting => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export async function listMeetings(
  auth: AuthContext,
): Promise<{ meetings: Meeting[]; folders: KindFolder[] }> {
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select(cols)
      .from(meetings)
      .where(isNull(meetings.deletedAt))
      .orderBy(desc(meetings.heldOn), desc(meetings.startTime), desc(meetings.createdAt))
      .limit(5000);
    return { meetings: rows.map(toMeeting), folders: await listKindFolders(tx, 'meetings') };
  });
}

export async function getMeeting(auth: AuthContext, id: string): Promise<MeetingFull> {
  return asUser(auth, async (tx) => {
    const [r] = await tx
      .select({ ...cols, topicsDoc: meetings.topicsDoc })
      .from(meetings)
      .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)));
    if (!r) throw new ApiError(404, 'not_found');
    const { topicsDoc, ...rest } = r;
    return { ...toMeeting(rest), topicsDoc: (topicsDoc as PMNode | null) ?? null };
  });
}

export async function createMeeting(
  auth: AuthContext,
  input: {
    title: string;
    heldOn: string;
    startTime?: string;
    endTime?: string;
    folderId?: string | null;
    participants?: string[];
    topics?: string;
    review?: MeetingItem[];
    todos?: MeetingItem[];
  },
): Promise<Meeting> {
  return asUser(auth, async (tx) => {
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(meetings)
      .where(isNull(meetings.deletedAt))) as [{ n: number }];
    if (n >= 5000) throw new ApiError(400, 'too_many_items');
    const [r] = await tx
      .insert(meetings)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        folderId: await checkKindFolder(tx, 'meetings', input.folderId),
        title: input.title,
        heldOn: input.heldOn,
        startTime: input.startTime ?? '',
        endTime: input.endTime ?? '',
        participants: input.participants ?? [],
        topics: input.topics ?? '',
        review: input.review ?? [],
        todos: input.todos ?? [],
      })
      .returning(cols);
    return toMeeting(r!);
  });
}

export type MeetingPatch = Partial<
  Pick<
    Meeting,
    'folderId' | 'title' | 'heldOn' | 'startTime' | 'endTime' | 'participants' | 'topics' | 'review' | 'todos'
  >
> & {
  /** the topics document (validated; `topics` becomes its plain text) */
  topicsDoc?: unknown;
};

export async function updateMeeting(auth: AuthContext, id: string, patch: MeetingPatch): Promise<Meeting> {
  const { topicsDoc, ...rest } = patch;
  const set: Omit<MeetingPatch, 'topicsDoc'> & { topicsDoc?: PMNode | null; updatedAt: Date } = {
    ...rest,
    updatedAt: new Date(),
  };
  if (topicsDoc !== undefined) {
    const d = validateDoc(topicsDoc, { images: 'meetings' });
    set.topicsDoc = d;
    set.topics = docText(d).slice(0, 100_000);
  } else if (patch.topics !== undefined) {
    // only text (AI from a voice note, older clients): the page builds the document from it
    set.topicsDoc = null;
  }
  return asUser(auth, async (tx) => {
    if (patch.folderId !== undefined) set.folderId = await checkKindFolder(tx, 'meetings', patch.folderId);
    const [r] = await tx
      .update(meetings)
      .set(set)
      .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)))
      .returning(cols);
    if (!r) throw new ApiError(404, 'not_found');
    return toMeeting(r);
  });
}

export async function trashMeeting(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(meetings)
      .set({ deletedAt: new Date() })
      .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)))
      .returning({ id: meetings.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

// ── Images in the topics ───────────────────────────────────────────────────
// As in notes: stored in the private bucket, streamed back by
// /meetings/files/:id; the document keeps `/api/v1/meetings/files/<id>`.
// Images no longer in the document are pruned a day later (kh_prune_meeting_attachments).
const MAX_IMAGE = 5 * 1024 * 1024;

export async function addMeetingImage(
  auth: AuthContext,
  meetingId: string,
  data: Uint8Array,
): Promise<string> {
  if (data.length > MAX_IMAGE) throw new ApiError(413, 'file_too_large', undefined, { max: MAX_IMAGE });
  const gif = data.length >= 6 && String.fromCharCode(...data.subarray(0, 4)) === 'GIF8';
  const mime = sniffImage(data) ?? (gif ? 'image/gif' : null);
  if (!mime) throw new ApiError(415, 'unsupported_image');
  return asUser(auth, async (tx) => {
    const [m] = await tx
      .select({ id: meetings.id })
      .from(meetings)
      .where(and(eq(meetings.id, meetingId), isNull(meetings.deletedAt)));
    if (!m) throw new ApiError(404, 'not_found');
    const key = `tenants/${auth.tenant.id}/meetings/${meetingId}/${randomToken(12)}`;
    await s3().send(
      new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, Body: data, ContentType: mime }),
    );
    const [a] = await tx
      .insert(meetingAttachments)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        meetingId,
        storageKey: key,
        mime,
        size: data.length,
      })
      .returning({ id: meetingAttachments.id });
    return a!.id;
  });
}

/** "Imagem a partir de link" and images in pasted HTML: fetched by the server (SSRF-guarded). */
export async function importMeetingImage(auth: AuthContext, meetingId: string, url: string): Promise<string> {
  let data: Uint8Array;
  try {
    data = new Uint8Array((await safeFetchBytes(url, { maxBytes: MAX_IMAGE, timeoutMs: 8000 })).body);
  } catch {
    throw new ApiError(422, 'image_fetch_failed');
  }
  return addMeetingImage(auth, meetingId, data);
}

export async function readMeetingFile(auth: AuthContext, id: string) {
  const row = await asUser(auth, async (tx) => {
    const [a] = await tx.select().from(meetingAttachments).where(eq(meetingAttachments.id, id));
    return a;
  });
  if (!row) return null;
  const obj = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: row.storageKey }));
  const body = await obj.Body?.transformToByteArray();
  return body ? { body, mime: row.mime } : null;
}
