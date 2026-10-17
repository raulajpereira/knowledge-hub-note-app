import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { strToU8, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import {
  aiChats,
  aiMessages,
  apiEnvs,
  apiRequests,
  artifacts,
  artifactVersions,
  dataExports,
  driveFiles,
  emails,
  folders,
  issues,
  meetingAttachments,
  meetings,
  mgProjects,
  noteAttachments,
  notes,
  sapFnRecords,
  sapObjects,
  sapSystems,
  sapTransports,
  savedViews,
  snippets,
  tasks,
  taskSubtasks,
  users,
  userTemplates,
  voiceNotes,
  whiteboardImages,
  whiteboards,
  type KvRow,
} from '@/db/schema';
import { db } from '@/db/client';
import { env } from '@/lib/env';
import { s3 } from '@/lib/storage';
import { docToMarkdown } from '@/lib/docMarkdown';
import { whiteboardSvg } from '@/lib/whiteboardSvg';
import type { WbEl } from '@/lib/whiteboard';
import { FILE_SRC, MEETING_FILE_SRC } from '@/server/content/doc';
import { listTags } from '@/server/content/notes';
import { asSharer, asUser } from '@/server/content/tenant';
import { renderMail } from '@/server/mail/templates';
import { sendMail } from '@/server/mail/send';
import { getPrefs } from '@/server/prefs';
import type { AuthContext } from '@/server/auth/session';

// "Exportar os meus dados" (worker job): a ZIP of everything the person owns,
// streamed straight into a multipart upload under exports/ — files are read
// from the bucket chunk by chunk and rows are read page by page, so a large
// account never sits in memory. Runs as the person under RLS (asUser): only
// their own rows; items of shared folders that belong to others are not
// theirs to export. Left out on purpose: the password vault (end-to-end
// encrypted), API Playground credentials and environment values, and any
// secret the server keeps (AI provider keys, share-link tokens).

export const EXPORT_DAYS = 7;
const PART = 8 * 1024 * 1024;
const PAGE = 100;
/** fflate writes no ZIP64: a single file must stay under 4 GiB */
const MAX_ENTRY = 4 * 1024 ** 3 - 64 * 1024 ** 2;
const REDACTED = '[REDACTED]';
/** header/param names whose values are credentials */
const SECRET_KEY =
  /auth|token|secret|password|passwd|pwd|api[-_]?key|apikey|cookie|session|signature|credential/i;

export const exportKey = (tenantId: string, userId: string, id: string) =>
  `exports/${tenantId}/${userId}/${id}.zip`;

// ── Streaming upload ───────────────────────────────────────────────────────
class S3Upload {
  private parts: Array<{ ETag: string; PartNumber: number }> = [];
  private buf: Uint8Array[] = [];
  private bufLen = 0;
  private uploadId: string | null = null;
  size = 0;
  constructor(private key: string) {}

  push(chunk: Uint8Array) {
    this.buf.push(chunk);
    this.bufLen += chunk.length;
    this.size += chunk.length;
  }

  private async sendPart(body: Uint8Array) {
    if (!this.uploadId) {
      const r = await s3().send(
        new CreateMultipartUploadCommand({
          Bucket: env().S3_BUCKET,
          Key: this.key,
          ContentType: 'application/zip',
        }),
      );
      this.uploadId = r.UploadId!;
    }
    const n = this.parts.length + 1;
    const r = await s3().send(
      new UploadPartCommand({
        Bucket: env().S3_BUCKET,
        Key: this.key,
        UploadId: this.uploadId,
        PartNumber: n,
        Body: body,
        ContentLength: body.length,
      }),
    );
    this.parts.push({ ETag: r.ETag!, PartNumber: n });
  }

  private take(): Uint8Array {
    const out = new Uint8Array(this.bufLen);
    let o = 0;
    for (const c of this.buf) {
      out.set(c, o);
      o += c.length;
    }
    this.buf = [];
    this.bufLen = 0;
    return out;
  }

  /** Uploads what is buffered once it fills a part (S3: ≥ 5 MiB except the last). */
  async drain() {
    if (this.bufLen >= PART) await this.sendPart(this.take());
  }

  async finish() {
    if (this.bufLen || !this.parts.length) await this.sendPart(this.take());
    await s3().send(
      new CompleteMultipartUploadCommand({
        Bucket: env().S3_BUCKET,
        Key: this.key,
        UploadId: this.uploadId!,
        MultipartUpload: { Parts: this.parts },
      }),
    );
  }

  async abort() {
    if (this.uploadId)
      await s3()
        .send(
          new AbortMultipartUploadCommand({
            Bucket: env().S3_BUCKET,
            Key: this.key,
            UploadId: this.uploadId,
          }),
        )
        .catch(() => {});
  }
}

/** A ZIP being written into an S3Upload, with unique, safe paths. */
class ZipOut {
  private zip: Zip;
  private err: Error | null = null;
  private used = new Set<string>();
  files = 0;
  skipped: string[] = [];
  constructor(private up: S3Upload) {
    this.zip = new Zip((err, chunk) => {
      if (err) this.err = err;
      else up.push(chunk);
    });
  }

  private async drain() {
    if (this.err) throw this.err;
    await this.up.drain();
  }

  /** `dir/base.ext`, made unique within the archive ("name (2).ext"). */
  path(dir: string, base: string, ext = '') {
    const b = safeName(base) || 'untitled';
    let p = `${dir}/${b}${ext}`;
    for (let i = 2; this.used.has(p.toLowerCase()); i++) p = `${dir}/${b} (${i})${ext}`;
    this.used.add(p.toLowerCase());
    return p;
  }

  async text(path: string, text: string) {
    const f = new ZipDeflate(path, { level: 6 });
    this.zip.add(f);
    f.push(strToU8(text), true);
    this.files++;
    await this.drain();
  }

  async json(path: string, data: unknown) {
    await this.text(path, `${JSON.stringify(data, null, 2)}\n`);
  }

  /** A stored file, read from the bucket chunk by chunk (already-compressed types are stored as-is). */
  async object(path: string, key: string, opts: { compress?: boolean; size?: number } = {}) {
    if ((opts.size ?? 0) > MAX_ENTRY) {
      this.skipped.push(`${path} (too large for the ZIP)`);
      return;
    }
    let body: AsyncIterable<Uint8Array>;
    try {
      const r = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }));
      body = r.Body as unknown as AsyncIterable<Uint8Array>;
    } catch {
      this.skipped.push(`${path} (file missing in storage)`);
      return;
    }
    const f = opts.compress ? new ZipDeflate(path, { level: 6 }) : new ZipPassThrough(path);
    this.zip.add(f);
    for await (const chunk of body) {
      f.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as ArrayBuffer));
      await this.drain();
    }
    f.push(new Uint8Array(0), true);
    this.files++;
    await this.drain();
  }

  async end() {
    this.zip.end();
    if (this.err) throw this.err;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
export function safeName(s: string) {
  return s
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80)
    .trim();
}
const day = (d: Date | string | null | undefined) =>
  d ? (typeof d === 'string' ? d : d.toISOString()).slice(0, 10) : '';
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r;]/.test(s) || /^[=+\-@]/.test(s)
    ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"`
    : s;
};
export const toCsv = (head: string[], rows: unknown[][]) =>
  `﻿${[head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
const IMG_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const AUDIO_EXT: Record<string, string> = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
};
const fm = (o: Record<string, unknown>) =>
  `---\n${Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n')}\n---\n\n`;

/** Header / query rows of a saved request with credential-looking values hidden. */
export function redactKv(rows: KvRow[]): KvRow[] {
  return rows.map((r) => (SECRET_KEY.test(r.k) ? { ...r, v: r.v ? REDACTED : '' } : r));
}

/** Keyset pages of `id`-ordered rows (each page its own RLS transaction). */
async function* pages<T extends { id: string }>(load: (after: string | null) => Promise<T[]>, size = PAGE) {
  let after: string | null = null;
  for (;;) {
    const rows = await load(after);
    if (!rows.length) return;
    yield rows;
    if (rows.length < size) return;
    after = rows.at(-1)!.id;
  }
}
const afterId = (col: AnyPgColumn, after: string | null) => (after ? gt(col, after) : undefined);

// ── The archive ────────────────────────────────────────────────────────────
type Lang = 'pt' | 'en';

async function folderNames(auth: AuthContext) {
  const rows = await asUser(auth, (tx) =>
    tx
      .select({ id: folders.id, name: folders.name, kind: folders.kind, parentId: folders.parentId })
      .from(folders)
      .where(isNull(folders.deletedAt)),
  );
  return { rows, name: new Map(rows.map((f) => [f.id, f.name])) };
}

async function writeNotes(z: ZipOut, auth: AuthContext, fname: Map<string, string>, noBook: string) {
  const me = auth.user.id;
  const referenced = new Map<string, string>(); // attachment id → path in the archive
  let n = 0;
  for await (const rows of pages((after) =>
    asUser(auth, (tx) =>
      tx
        .select()
        .from(notes)
        .where(and(isNull(notes.deletedAt), eq(notes.ownerId, me), afterId(notes.id, after)))
        .orderBy(asc(notes.id))
        .limit(PAGE),
    ),
  )) {
    // images in my notes (also those a member of a shared folder added to them)
    const atts = await asSharer(auth, (tx) =>
      tx
        .select({ id: noteAttachments.id, mime: noteAttachments.mime })
        .from(noteAttachments)
        .where(
          inArray(
            noteAttachments.noteId,
            rows.map((r) => r.id),
          ),
        ),
    );
    const ext = new Map(atts.map((a) => [a.id, IMG_EXT[a.mime] ?? '']));
    for (const r of rows) {
      const book = (r.folderId && fname.get(r.folderId)) || noBook;
      const path = z.path(`notes/${safeName(book) || noBook}`, r.title || 'Sem título', '.md');
      const md = docToMarkdown(r.content, {
        image: (src) => {
          const id = FILE_SRC.exec(src)?.[1];
          if (!id || !ext.has(id)) return null;
          const p = `assets/${id}${ext.get(id)}`;
          referenced.set(id, `notes/${p}`);
          return `../${p}`;
        },
      });
      await z.text(
        path,
        fm({
          title: r.title,
          id: r.id,
          notebook: r.folderId ? (fname.get(r.folderId) ?? null) : null,
          tags: r.tags,
          favorite: r.favorite,
          created: r.createdAt.toISOString(),
          updated: r.updatedAt.toISOString(),
        }) +
          (r.title ? `# ${r.title}\n\n` : '') +
          md,
      );
      n++;
    }
  }
  // the images, only those a note shows
  const ids = [...referenced.keys()];
  for (let i = 0; i < ids.length; i += PAGE) {
    const rows = await asSharer(auth, (tx) =>
      tx
        .select({ id: noteAttachments.id, key: noteAttachments.storageKey, size: noteAttachments.size })
        .from(noteAttachments)
        .innerJoin(notes, and(eq(notes.id, noteAttachments.noteId), eq(notes.ownerId, me)))
        .where(inArray(noteAttachments.id, ids.slice(i, i + PAGE))),
    );
    for (const a of rows) await z.object(referenced.get(a.id)!, a.key, { size: a.size });
  }
  return n;
}

async function writeTasks(z: ZipOut, auth: AuthContext) {
  const me = auth.user.id;
  const all: Array<Record<string, unknown>> = [];
  for await (const rows of pages((after) =>
    asUser(auth, (tx) =>
      tx
        .select({
          id: tasks.id,
          title: tasks.title,
          type: tasks.type,
          priority: tasks.priority,
          dueOn: tasks.dueOn,
          repeat: tasks.repeat,
          project: mgProjects.name,
          notes: tasks.notes,
          pinned: tasks.pinned,
          doneAt: tasks.doneAt,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
        })
        .from(tasks)
        .leftJoin(mgProjects, eq(mgProjects.id, tasks.projectId))
        .where(and(isNull(tasks.deletedAt), eq(tasks.ownerId, me), afterId(tasks.id, after)))
        .orderBy(asc(tasks.id))
        .limit(PAGE),
    ),
  )) {
    const subs = await asSharer(auth, (tx) =>
      tx
        .select({ taskId: taskSubtasks.taskId, title: taskSubtasks.title, done: taskSubtasks.done })
        .from(taskSubtasks)
        .where(
          inArray(
            taskSubtasks.taskId,
            rows.map((r) => r.id),
          ),
        )
        .orderBy(asc(taskSubtasks.sort), asc(taskSubtasks.id)),
    );
    for (const r of rows)
      all.push({
        ...r,
        doneAt: iso(r.doneAt),
        createdAt: iso(r.createdAt),
        updatedAt: iso(r.updatedAt),
        subtasks: subs.filter((s) => s.taskId === r.id).map(({ title, done }) => ({ title, done })),
      });
  }
  if (!all.length) return 0;
  await z.json('tasks/tasks.json', all);
  await z.text(
    'tasks/tasks.csv',
    toCsv(
      [
        'id',
        'title',
        'type',
        'priority',
        'due_on',
        'repeat',
        'project',
        'done_at',
        'created_at',
        'pinned',
        'subtasks_done',
        'subtasks_total',
        'notes',
      ],
      all.map((t) => {
        const s = t.subtasks as Array<{ done: boolean }>;
        return [
          t.id,
          t.title,
          t.type,
          t.priority,
          t.dueOn,
          t.repeat,
          t.project,
          t.doneAt,
          t.createdAt,
          t.pinned,
          s.filter((x) => x.done).length,
          s.length,
          t.notes,
        ];
      }),
    ),
  );
  return all.length;
}

async function writeMeetings(z: ZipOut, auth: AuthContext, fname: Map<string, string>, lang: Lang) {
  const L =
    lang === 'pt'
      ? { who: 'Participantes', topics: 'Temas discutidos', review: 'Pontos a rever', todo: 'A fazer' }
      : { who: 'Participants', topics: 'Topics discussed', review: 'Points to review', todo: 'To do' };
  const referenced = new Set<string>();
  let n = 0;
  for await (const rows of pages((after) =>
    asUser(auth, (tx) =>
      tx
        .select()
        .from(meetings)
        .where(and(isNull(meetings.deletedAt), afterId(meetings.id, after)))
        .orderBy(asc(meetings.id))
        .limit(PAGE),
    ),
  )) {
    for (const m of rows) {
      const dir = `meetings${m.folderId && fname.get(m.folderId) ? `/${safeName(fname.get(m.folderId)!)}` : ''}`;
      const topics = m.topicsDoc
        ? docToMarkdown(m.topicsDoc, {
            image: (src) => {
              const id = MEETING_FILE_SRC.exec(src)?.[1];
              if (!id) return null;
              referenced.add(id);
              return `${'../'.repeat(dir.split('/').length - 1)}assets/${id}`;
            },
          })
        : `${m.topics}\n`;
      const items = (xs: Array<{ t: string; done: boolean }>) =>
        xs.map((x) => `- [${x.done ? 'x' : ' '}] ${x.t}`).join('\n');
      const body = [
        `# ${m.title}`,
        `${m.heldOn}${m.startTime ? ` · ${m.startTime}${m.endTime ? `–${m.endTime}` : ''}` : ''}`,
        m.participants.length ? `**${L.who}:** ${m.participants.join(', ')}` : '',
        `## ${L.topics}\n\n${topics.trim()}`,
        m.review.length ? `## ${L.review}\n\n${items(m.review)}` : '',
        m.todos.length ? `## ${L.todo}\n\n${items(m.todos)}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      await z.text(
        z.path(dir, `${m.heldOn} ${m.title}`, '.md'),
        fm({ title: m.title, id: m.id, date: m.heldOn, participants: m.participants }) + body + '\n',
      );
      n++;
    }
  }
  const ids = [...referenced];
  for (let i = 0; i < ids.length; i += PAGE) {
    const rows = await asUser(auth, (tx) =>
      tx
        .select({
          id: meetingAttachments.id,
          key: meetingAttachments.storageKey,
          mime: meetingAttachments.mime,
          size: meetingAttachments.size,
        })
        .from(meetingAttachments)
        .where(inArray(meetingAttachments.id, ids.slice(i, i + PAGE))),
    );
    // no extension in the link (the id is the name): keep it that way
    for (const a of rows) await z.object(`meetings/assets/${a.id}`, a.key, { size: a.size });
  }
  return n;
}

async function writeVoice(z: ZipOut, auth: AuthContext) {
  let n = 0;
  for await (const rows of pages((after) =>
    asUser(auth, (tx) =>
      tx
        .select()
        .from(voiceNotes)
        .where(and(isNull(voiceNotes.deletedAt), afterId(voiceNotes.id, after)))
        .orderBy(asc(voiceNotes.id))
        .limit(PAGE),
    ),
  )) {
    for (const v of rows) {
      const base = `${day(v.createdAt)} ${v.title || 'voice'}`;
      const audio = z.path('voice', base, AUDIO_EXT[v.mime] ?? '');
      const stem = audio.slice(0, audio.length - (AUDIO_EXT[v.mime] ?? '').length);
      await z.object(audio, v.storageKey, { size: v.size });
      await z.text(
        `${stem}.txt`,
        [
          v.title,
          `${v.createdAt.toISOString()} · ${Math.round(v.durationMs / 1000)} s`,
          '',
          v.transcript,
          v.notes ? `\n---\n${v.notes}` : '',
        ].join('\n'),
      );
      n++;
    }
  }
  return n;
}

async function writeArtifacts(z: ZipOut, auth: AuthContext, fname: Map<string, string>) {
  const me = auth.user.id;
  let n = 0;
  for await (const rows of pages((after) =>
    asUser(auth, (tx) =>
      tx
        .select({
          id: artifacts.id,
          title: artifacts.title,
          description: artifacts.description,
          tags: artifacts.tags,
          folderId: artifacts.folderId,
          createdAt: artifacts.createdAt,
          updatedAt: artifacts.updatedAt,
        })
        .from(artifacts)
        .where(and(isNull(artifacts.deletedAt), eq(artifacts.ownerId, me), afterId(artifacts.id, after)))
        .orderBy(asc(artifacts.id))
        .limit(PAGE),
    ),
  )) {
    for (const a of rows) {
      const dir = z.path('artifacts', a.title);
      // one artifact at a time: an artifact holds up to 50 versions of 2 MB
      const html = await asUser(auth, (tx) =>
        tx.select({ html: artifacts.html }).from(artifacts).where(eq(artifacts.id, a.id)),
      );
      await z.text(`${dir}/index.html`, html[0]?.html ?? '');
      const vs = await asSharer(auth, (tx) =>
        tx
          .select({ id: artifactVersions.id, createdAt: artifactVersions.createdAt })
          .from(artifactVersions)
          .where(eq(artifactVersions.artifactId, a.id))
          .orderBy(asc(artifactVersions.createdAt)),
      );
      for (const [i, v] of vs.entries()) {
        const [h] = await asSharer(auth, (tx) =>
          tx
            .select({ html: artifactVersions.html })
            .from(artifactVersions)
            .where(eq(artifactVersions.id, v.id)),
        );
        await z.text(
          `${dir}/versions/${String(i + 1).padStart(2, '0')} ${v.createdAt.toISOString().replace(/[:]/g, '-')}.html`,
          h?.html ?? '',
        );
      }
      await z.json(`${dir}/artifact.json`, {
        ...a,
        folder: a.folderId ? (fname.get(a.folderId) ?? null) : null,
        versions: vs.length,
      });
      n++;
    }
  }
  return n;
}

async function writeSnippets(z: ZipOut, auth: AuthContext) {
  let n = 0;
  for await (const rows of pages((after) =>
    asUser(auth, (tx) =>
      tx
        .select()
        .from(snippets)
        .where(and(isNull(snippets.deletedAt), afterId(snippets.id, after)))
        .orderBy(asc(snippets.id))
        .limit(PAGE),
    ),
  )) {
    for (const s of rows) {
      const dir = z.path('devlib', s.title);
      const names = new Set<string>();
      for (const f of s.files) {
        let name = safeName(f.name) || 'file.txt';
        for (let i = 2; names.has(name.toLowerCase()); i++) name = `${i}-${safeName(f.name) || 'file.txt'}`;
        names.add(name.toLowerCase());
        await z.text(`${dir}/${name}`, f.code);
      }
      await z.json(`${dir}/snippet.json`, {
        id: s.id,
        title: s.title,
        type: s.type,
        tags: s.tags,
        favorite: s.fav,
        description: s.description,
        files: s.files.map((f) => ({ name: f.name, lang: f.lang })),
        createdAt: iso(s.createdAt),
        updatedAt: iso(s.updatedAt),
      });
      n++;
    }
  }
  return n;
}

async function writeDrive(z: ZipOut, auth: AuthContext, fname: Map<string, string>) {
  const me = auth.user.id;
  let n = 0;
  for await (const rows of pages((after) =>
    asUser(auth, (tx) =>
      tx
        .select()
        .from(driveFiles)
        .where(and(isNull(driveFiles.deletedAt), eq(driveFiles.ownerId, me), afterId(driveFiles.id, after)))
        .orderBy(asc(driveFiles.id))
        .limit(PAGE),
    ),
  )) {
    for (const f of rows) {
      const dir = `files${f.folderId && fname.get(f.folderId) ? `/${safeName(fname.get(f.folderId)!)}` : ''}`;
      const dot = f.name.lastIndexOf('.');
      const [base, ext] = dot > 0 ? [f.name.slice(0, dot), f.name.slice(dot)] : [f.name, ''];
      await z.object(z.path(dir, base, safeName(ext) ? ext.replace(/[^\w.-]/g, '') : ''), f.storageKey, {
        size: f.size,
        compress: /^text\/|json|xml|csv/.test(f.mime),
      });
      n++;
    }
  }
  return n;
}

async function writeEmails(z: ZipOut, auth: AuthContext, fname: Map<string, string>) {
  const meta: Array<Record<string, unknown>> = [];
  for await (const rows of pages((after) =>
    asUser(auth, (tx) =>
      tx
        .select({
          id: emails.id,
          folderId: emails.folderId,
          subject: emails.subject,
          fromName: emails.fromName,
          fromEmail: emails.fromEmail,
          toAddr: emails.toAddr,
          cc: emails.cc,
          sentAt: emails.sentAt,
          notes: emails.notes,
          starred: emails.starred,
          fileKey: emails.fileKey,
          fileName: emails.fileName,
          fileSize: emails.fileSize,
          createdAt: emails.createdAt,
        })
        .from(emails)
        .where(and(isNull(emails.deletedAt), afterId(emails.id, after)))
        .orderBy(asc(emails.id))
        .limit(PAGE),
    ),
  )) {
    for (const e of rows) {
      const dir = `emails${e.folderId && fname.get(e.folderId) ? `/${safeName(fname.get(e.folderId)!)}` : ''}`;
      const ext = /\.msg$/i.test(e.fileName) ? '.msg' : '.eml';
      const path = z.path(dir, `${day(e.sentAt ?? e.createdAt)} ${e.subject || e.fileName}`, ext);
      await z.object(path, e.fileKey, { size: e.fileSize, compress: true });
      const { fileKey: _k, folderId, ...m } = e;
      void _k;
      meta.push({
        ...m,
        folder: folderId ? (fname.get(folderId) ?? null) : null,
        sentAt: iso(m.sentAt),
        createdAt: iso(m.createdAt),
        file: path,
      });
    }
  }
  if (meta.length) await z.json('emails/emails.json', meta);
  return meta.length;
}

async function writeIssues(z: ZipOut, auth: AuthContext) {
  const rows = await asUser(auth, (tx) =>
    tx
      .select({
        id: issues.id,
        title: issues.title,
        status: issues.status,
        priority: issues.priority,
        project: mgProjects.name,
        dueOn: issues.dueOn,
        waiting: issues.waiting,
        description: issues.description,
        notes: issues.notes,
        doneAt: issues.doneAt,
        createdAt: issues.createdAt,
        updatedAt: issues.updatedAt,
      })
      .from(issues)
      .leftJoin(mgProjects, eq(mgProjects.id, issues.projectId))
      .where(isNull(issues.deletedAt))
      .orderBy(asc(issues.createdAt)),
  );
  if (!rows.length) return 0;
  const out = rows.map((r) => ({
    ...r,
    doneAt: iso(r.doneAt),
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  }));
  await z.json('issues/issues.json', out);
  await z.text(
    'issues/issues.csv',
    toCsv(
      [
        'id',
        'title',
        'status',
        'priority',
        'project',
        'due_on',
        'waiting',
        'done_at',
        'created_at',
        'description',
      ],
      out.map((r) => [
        r.id,
        r.title,
        r.status,
        r.priority,
        r.project,
        r.dueOn,
        r.waiting,
        r.doneAt,
        r.createdAt,
        r.description,
      ]),
    ),
  );
  return rows.length;
}

/** API Playground: folders, requests and environments, never a credential or a variable's value. */
export async function apiCollections(auth: AuthContext) {
  return asUser(auth, async (tx) => {
    const fs = await tx
      .select({ id: folders.id, name: folders.name, parentId: folders.parentId, sort: folders.sort })
      .from(folders)
      .where(and(eq(folders.kind, 'api'), isNull(folders.deletedAt)))
      .orderBy(asc(folders.sort));
    const rs = await tx
      .select({
        id: apiRequests.id,
        folderId: apiRequests.folderId,
        title: apiRequests.title,
        method: apiRequests.method,
        url: apiRequests.url,
        params: apiRequests.params,
        headers: apiRequests.headers,
        bodyType: apiRequests.bodyType,
        body: apiRequests.body,
        authType: apiRequests.authType,
        createdAt: apiRequests.createdAt,
        updatedAt: apiRequests.updatedAt,
      })
      .from(apiRequests)
      .where(isNull(apiRequests.deletedAt))
      .orderBy(asc(apiRequests.createdAt));
    const es = await tx
      .select({ id: apiEnvs.id, folderId: apiEnvs.folderId, name: apiEnvs.name })
      .from(apiEnvs)
      .orderBy(asc(apiEnvs.sort));
    return {
      note: 'Credentials (auth) and environment variable values are not exported.',
      folders: fs,
      requests: rs.map((r) => ({
        ...r,
        params: redactKv(r.params),
        headers: redactKv(r.headers),
        auth: { type: r.authType, credentials: r.authType === 'none' ? null : REDACTED },
        authType: undefined,
        createdAt: iso(r.createdAt),
        updatedAt: iso(r.updatedAt),
      })),
      environments: es.map((e) => ({ ...e, variables: REDACTED })),
    };
  });
}

async function writeWhiteboards(z: ZipOut, auth: AuthContext) {
  let n = 0;
  for await (const rows of pages(
    (after) =>
      asUser(auth, (tx) =>
        tx
          .select()
          .from(whiteboards)
          .where(and(isNull(whiteboards.deletedAt), afterId(whiteboards.id, after)))
          .orderBy(asc(whiteboards.id))
          .limit(20),
      ),
    20,
  )) {
    for (const b of rows) {
      const imgs = await asUser(auth, (tx) =>
        tx
          .select({
            id: whiteboardImages.id,
            key: whiteboardImages.storageKey,
            mime: whiteboardImages.mime,
            size: whiteboardImages.size,
          })
          .from(whiteboardImages)
          .where(eq(whiteboardImages.boardId, b.id)),
      );
      const ext = new Map(imgs.map((i) => [i.id, IMG_EXT[i.mime] ?? '']));
      const json = z.path('whiteboards', b.name || 'whiteboard', '.json');
      const stem = json.slice(0, -5);
      await z.json(json, {
        id: b.id,
        name: b.name,
        createdAt: iso(b.createdAt),
        updatedAt: iso(b.updatedAt),
        doc: b.doc,
      });
      await z.text(
        `${stem}.svg`,
        whiteboardSvg((b.doc.els ?? []) as WbEl[], (f) => `assets/${f}${ext.get(f) ?? ''}`),
      );
      const used = new Set(((b.doc.els ?? []) as WbEl[]).flatMap((e) => (e.t === 'image' ? [e.file] : [])));
      for (const i of imgs)
        if (used.has(i.id))
          await z.object(`whiteboards/assets/${i.id}${ext.get(i.id)}`, i.key, { size: i.size });
      n++;
    }
  }
  return n;
}

/** SAP items are shared by the whole client; the export holds the ones the person created. */
async function writeSap(z: ZipOut, auth: AuthContext) {
  const me = auth.user.id;
  const strip = <T extends Record<string, unknown>>(rows: T[]) =>
    rows.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])),
    );
  const [sys, trs, objs, fns] = await asUser(auth, async (tx) => [
    await tx
      .select()
      .from(sapSystems)
      .where(and(isNull(sapSystems.deletedAt), eq(sapSystems.createdBy, me))),
    await tx
      .select()
      .from(sapTransports)
      .where(and(isNull(sapTransports.deletedAt), eq(sapTransports.createdBy, me))),
    await tx
      .select()
      .from(sapObjects)
      .where(and(isNull(sapObjects.deletedAt), eq(sapObjects.createdBy, me))),
    await tx
      .select()
      .from(sapFnRecords)
      .where(and(isNull(sapFnRecords.deletedAt), eq(sapFnRecords.createdBy, me))),
  ]);
  let n = 0;
  for (const [name, rows] of [
    ['systems', sys],
    ['transports', trs],
    ['code-objects', objs],
    ['functional', fns],
  ] as const) {
    if (!rows.length) continue;
    await z.json(`sap/${name}.json`, strip(rows as Array<Record<string, unknown>>));
    n += rows.length;
  }
  return n;
}

function readme(lang: Lang, counts: Record<string, number>, skipped: string[], at: Date) {
  const list = Object.entries(counts)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join('\n');
  const pt = `KnowledgeHub — exportação dos seus dados
Gerada em ${at.toISOString()}

Conteúdo
  account.json          a sua conta (perfil, preferências, sessões ativas)
  notes/<caderno>/      notas em Markdown, com etiquetas e datas no cabeçalho (front-matter);
  notes/assets/         as imagens das notas (ligações relativas)
  tasks/                tarefas em CSV e JSON (com subtarefas)
  meetings/             registos de reunião em Markdown (imagens em meetings/assets/)
  voice/                notas de voz: o áudio e a transcrição (.txt)
  artifacts/            artefactos: index.html (atual) e versions/ (versões guardadas)
  devlib/               Code Library: os ficheiros de cada snippet + snippet.json
  files/<pasta>/        Ficheiros: os originais, nas suas pastas
  emails/               emails importados (.eml / .msg originais) + emails.json
  issues/               tarefas de projeto em CSV e JSON
  api/collections.json  API Playground: pastas, pedidos e ambientes — SEM credenciais
                        (autenticação, cabeçalhos/parâmetros sensíveis e valores das variáveis
                        aparecem como [REDACTED])
  whiteboards/          quadros em JSON e SVG (imagens em whiteboards/assets/)
  sap/                  itens SAP criados por si (sistemas, transportes, objetos, funcional)
  tags.json             as etiquetas das notas, views.json as vistas guardadas,
  templates.json        os seus modelos, ai/chats.json as conversas com o Assistente IA

Não incluído
  - O cofre de palavras-passe: está cifrado de ponta a ponta e o servidor não o consegue ler.
  - Itens no Lixo (reponha-os primeiro se os quiser exportar).
  - Itens de pastas partilhadas que pertencem a outras pessoas.
  - Segredos: chaves de API, credenciais, tokens de ligações públicas.

Itens exportados
${list}
${skipped.length ? `\nFicheiros não incluídos\n${skipped.map((s) => `  - ${s}`).join('\n')}\n` : ''}`;
  const en = `KnowledgeHub — export of your data
Created ${at.toISOString()}

Contents
  account.json          your account (profile, preferences, active sessions)
  notes/<notebook>/     notes in Markdown, with tags and dates in the front-matter;
  notes/assets/         the notes' images (relative links)
  tasks/                tasks as CSV and JSON (with subtasks)
  meetings/             meeting records in Markdown (images in meetings/assets/)
  voice/                voice notes: the audio and the transcript (.txt)
  artifacts/            artifacts: index.html (current) and versions/ (saved versions)
  devlib/               Code Library: each snippet's files + snippet.json
  files/<folder>/       Files: the originals, in their folders
  emails/               imported emails (original .eml / .msg) + emails.json
  issues/               project issues as CSV and JSON
  api/collections.json  API Playground: folders, requests and environments — WITHOUT credentials
                        (auth, sensitive headers/params and variable values show as [REDACTED])
  whiteboards/          boards as JSON and SVG (images in whiteboards/assets/)
  sap/                  SAP items you created (systems, transports, objects, functional)
  tags.json             your note tags, views.json your saved views,
  templates.json        your templates, ai/chats.json your AI Assistant chats

Not included
  - The password vault: it is end-to-end encrypted and the server cannot read it.
  - Items in the Trash (restore them first to export them).
  - Items in shared folders that belong to other people.
  - Secrets: API keys, credentials, public link tokens.

Exported items
${list}
${skipped.length ? `\nFiles not included\n${skipped.map((s) => `  - ${s}`).join('\n')}\n` : ''}`;
  return (
    lang === 'pt' ? `${pt}\n\n${'='.repeat(60)}\n\n${en}` : `${en}\n\n${'='.repeat(60)}\n\n${pt}`
  ).replace(/\n/g, '\r\n');
}

/** Writes the whole archive for one person; returns what was exported. */
export async function buildExport(auth: AuthContext, key: string, modules: ReadonlySet<string>) {
  const up = new S3Upload(key);
  const z = new ZipOut(up);
  try {
    const [u] = await db().select().from(users).where(eq(users.id, auth.user.id)).limit(1);
    const lang: Lang = u?.lang === 'en' ? 'en' : 'pt';
    const at = new Date();
    const { rows: fs, name } = await folderNames(auth);
    const counts: Record<string, number> = {};
    await z.json('account.json', {
      exportedAt: at.toISOString(),
      format: 'knowledgehub-export/2',
      user: u && {
        id: u.id,
        name: u.name,
        email: u.email,
        lang: u.lang,
        createdAt: u.createdAt,
        emailVerifiedAt: u.emailVerifiedAt,
        twoFactor: Boolean(u.totpEnabledAt),
      },
      prefs: await getPrefs(auth.user.id),
      folders: fs.map((f) => ({ id: f.id, kind: f.kind, name: f.name, parentId: f.parentId })),
    });
    const has = (m: string) => modules.has(m);
    if (has('notes')) {
      counts.notes = await writeNotes(z, auth, name, lang === 'pt' ? 'Sem caderno' : 'No notebook');
      await z.json('tags.json', await listTags(auth));
    }
    if (has('tasks')) counts.tasks = await writeTasks(z, auth);
    if (has('meetings')) counts.meetings = await writeMeetings(z, auth, name, lang);
    if (has('voice')) counts.voice = await writeVoice(z, auth);
    if (has('artifacts')) counts.artifacts = await writeArtifacts(z, auth, name);
    if (has('devlib')) counts.snippets = await writeSnippets(z, auth);
    if (has('files')) counts.files = await writeDrive(z, auth, name);
    if (has('emails')) counts.emails = await writeEmails(z, auth, name);
    if (has('issues')) counts.issues = await writeIssues(z, auth);
    if (has('api')) {
      const api = await apiCollections(auth);
      counts.apiRequests = api.requests.length;
      if (api.requests.length || api.folders.length) await z.json('api/collections.json', api);
    }
    if (has('whiteboard')) counts.whiteboards = await writeWhiteboards(z, auth);
    counts.sap = await writeSap(z, auth);
    const extra = await asUser(auth, async (tx) => ({
      views: await tx.select().from(savedViews).orderBy(asc(savedViews.position)),
      templates: await tx.select().from(userTemplates).orderBy(asc(userTemplates.createdAt)),
      chats: await tx.select().from(aiChats).orderBy(asc(aiChats.createdAt)),
    }));
    if (extra.views.length)
      await z.json(
        'views.json',
        extra.views.map((v) => ({ name: v.name, kind: v.kind, filter: v.filter, position: v.position })),
      );
    if (extra.templates.length)
      await z.json(
        'templates.json',
        extra.templates.map((t) => ({
          kind: t.kind,
          name: t.name,
          body: t.body,
          createdAt: iso(t.createdAt),
        })),
      );
    if (extra.chats.length) {
      const out = [];
      for (const c of extra.chats) {
        const msgs = await asUser(auth, (tx) =>
          tx
            .select({ role: aiMessages.role, content: aiMessages.content, createdAt: aiMessages.createdAt })
            .from(aiMessages)
            .where(eq(aiMessages.chatId, c.id))
            .orderBy(asc(aiMessages.createdAt)),
        );
        out.push({
          title: c.title,
          createdAt: iso(c.createdAt),
          messages: msgs.map((m) => ({ ...m, createdAt: iso(m.createdAt) })),
        });
      }
      await z.json('ai/chats.json', out);
      counts.aiChats = out.length;
    }
    for (const k of Object.keys(counts)) if (!counts[k]) delete counts[k];
    await z.text('README.txt', readme(lang, counts, z.skipped, at));
    await z.end();
    await up.finish();
    return { size: up.size, counts, skipped: z.skipped };
  } catch (e) {
    await up.abort();
    throw e;
  }
}

/** The worker's job: builds the export, marks it ready (or failed) and tells the person. */
export async function runExport(job: { exportId: string; tenantId: string; userId: string }) {
  const auth = { user: { id: job.userId }, tenant: { id: job.tenantId } } as AuthContext;
  const [row] = await asUser(auth, (tx) =>
    tx
      .update(dataExports)
      .set({ status: 'running', startedAt: new Date() })
      .where(and(eq(dataExports.id, job.exportId), inArray(dataExports.status, ['pending', 'running'])))
      .returning(),
  );
  if (!row) return { skipped: true };
  const key = exportKey(job.tenantId, job.userId, job.exportId);
  try {
    const { getEntitlements } = await import('@/server/licensing/entitlements');
    const { modules } = await getEntitlements(job.tenantId);
    const r = await buildExport(auth, key, new Set(modules));
    const expiresAt = new Date(Date.now() + EXPORT_DAYS * 86_400_000);
    await asUser(auth, (tx) =>
      tx
        .update(dataExports)
        .set({ status: 'ready', storageKey: key, size: r.size, finishedAt: new Date(), expiresAt })
        .where(eq(dataExports.id, job.exportId)),
    );
    const [u] = await db()
      .select({ email: users.email, lang: users.lang, name: users.name })
      .from(users)
      .where(eq(users.id, job.userId))
      .limit(1);
    if (u)
      await sendMail(
        renderMail('exportReady', u.lang, u.email, `${env().APP_URL.replace(/\/$/, '')}/app?account=export`, {
          name: u.name,
          days: String(EXPORT_DAYS),
        }),
      ).catch(() => {});
    return { ready: true, size: r.size, counts: r.counts };
  } catch (e) {
    console.error('[export] failed', job.exportId, e);
    await asUser(auth, (tx) =>
      tx
        .update(dataExports)
        .set({ status: 'failed', error: String(e).slice(0, 500), finishedAt: new Date() })
        .where(eq(dataExports.id, job.exportId)),
    );
    throw e;
  }
}

/**
 * Daily: exports past their 7 days lose their file (status "expired"), and an
 * export stuck "running" for a day (worker restarted mid-way) is marked failed.
 */
export async function expireExports(now = new Date()) {
  const rows = await db().execute<{ id: string; storage_key: string | null }>(
    sql`select * from kh_expire_exports(${now.toISOString()}::timestamptz)`,
  );
  const keys = [...rows].map((r) => r.storage_key).filter((k): k is string => !!k);
  for (let i = 0; i < keys.length; i += 1000)
    await s3()
      .send(
        new DeleteObjectsCommand({
          Bucket: env().S3_BUCKET,
          Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
        }),
      )
      .catch(() => {});
  return { expired: keys.length };
}
