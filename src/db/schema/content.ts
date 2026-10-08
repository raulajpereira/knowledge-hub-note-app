// Tenant content (DATA_MODEL.md §4). Every table carries tenant_id and is
// protected by Row Level Security (migration 0005): the app role only sees
// rows of the tenant/user set by withTenant(). Personal content also has an
// owner; shared folders widen notes/tasks/artifacts to their members (0022).
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { mgProjects } from './mg';
import { sharedFolders } from './share';
import { tenants, users } from './identity';

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuid_generate_v7()`);
const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const ownerId = () =>
  uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const folders = pgTable(
  'folders',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    kind: text('kind', {
      enum: ['notes', 'tasks', 'artifacts', 'passwords', 'emails', 'api', 'files'],
    }).notNull(),
    name: text('name').notNull(),
    color: text('color').notNull(),
    parentId: uuid('parent_id'),
    sort: integer('sort').notNull().default(0),
    createdAt: ts('created_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('folders_owner_kind_idx').on(t.tenantId, t.ownerId, t.kind),
    check(
      'folders_kind_chk',
      sql`${t.kind} in ('notes','tasks','artifacts','passwords','emails','api','files')`,
    ),
    check('folders_name_len', sql`char_length(${t.name}) between 1 and 80`),
  ],
);

export const notes = pgTable(
  'notes',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    sharedFolderId: uuid('shared_folder_id').references(() => sharedFolders.id, { onDelete: 'set null' }),
    title: text('title').notNull().default(''),
    // TipTap JSON document; content_text is derived on the server (search, summary).
    content: jsonb('content').notNull().default({ type: 'doc', content: [] }),
    contentText: text('content_text').notNull().default(''),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    favorite: boolean('favorite').notNull().default(false),
    meta: jsonb('meta').notNull().default({}),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('notes_owner_idx').on(t.tenantId, t.ownerId, t.updatedAt),
    index('notes_folder_idx').on(t.folderId),
    check('notes_title_len', sql`char_length(${t.title}) <= 300`),
  ],
);

export const noteAttachments = pgTable(
  'note_attachments',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('note_attachments_note_idx').on(t.noteId),
    check('note_attachments_mime_chk', sql`${t.mime} in ('image/png','image/jpeg','image/webp','image/gif')`),
  ],
);

/** Links between items ("Ligações" in the inspector): undirected, stored once with a < b. */
export const itemLinks = pgTable(
  'item_links',
  {
    tenantId: tenantId(),
    ownerId: ownerId(),
    aType: text('a_type').notNull(),
    aId: uuid('a_id').notNull(),
    bType: text('b_type').notNull(),
    bId: uuid('b_id').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.aType, t.aId, t.bType, t.bId] }),
    index('item_links_b_idx').on(t.tenantId, t.bType, t.bId),
    check('item_links_types_chk', sql`${t.aType} ~ '^[a-z_]{2,20}$' and ${t.bType} ~ '^[a-z_]{2,20}$'`),
  ],
);

export const TASK_TYPES = ['tech', 'mgmt'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export const TASK_REPEATS = ['none', 'daily', 'weekly', 'monthly'] as const;

/** Tasks (prototype isTasks). project_id: a Management project (mg_projects). */
export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    title: text('title').notNull().default(''),
    type: text('type', { enum: TASK_TYPES }).notNull().default('tech'),
    priority: text('priority', { enum: TASK_PRIORITIES }).notNull().default('medium'),
    // A day, not an instant (prototype date picker): no time-zone surprises.
    dueOn: date('due_on'),
    repeat: text('repeat', { enum: TASK_REPEATS }).notNull().default('none'),
    sharedFolderId: uuid('shared_folder_id').references(() => sharedFolders.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => mgProjects.id, { onDelete: 'set null' }),
    notes: text('notes').notNull().default(''),
    pinned: boolean('pinned').notNull().default(false),
    doneAt: ts('done_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('tasks_owner_idx').on(t.tenantId, t.ownerId, t.createdAt),
    index('tasks_due_idx').on(t.tenantId, t.ownerId, t.dueOn),
    check('tasks_title_len', sql`char_length(${t.title}) <= 300`),
    check('tasks_notes_len', sql`char_length(${t.notes}) <= 20000`),
    check('tasks_type_chk', sql`${t.type} in ('tech','mgmt')`),
    check('tasks_priority_chk', sql`${t.priority} in ('low','medium','high')`),
    check('tasks_repeat_chk', sql`${t.repeat} in ('none','daily','weekly','monthly')`),
  ],
);

export const taskSubtasks = pgTable(
  'task_subtasks',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    done: boolean('done').notNull().default(false),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    index('task_subtasks_task_idx').on(t.taskId, t.sort),
    check('task_subtasks_title_len', sql`char_length(${t.title}) <= 300`),
  ],
);

export const VOICE_KINDS = ['mic', 'pc'] as const;

/**
 * Voice notes (prototype isVoice): the audio lives in the private bucket,
 * levels is the 72-bar waveform captured while recording, the transcript is
 * written by hand (no automatic transcription in this release).
 */
export const voiceNotes = pgTable(
  'voice_notes',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    title: text('title').notNull().default(''),
    kind: text('kind', { enum: VOICE_KINDS }).notNull().default('mic'),
    storageKey: text('storage_key').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    durationMs: integer('duration_ms').notNull(),
    levels: jsonb('levels').$type<number[]>().notNull().default([]),
    transcript: text('transcript').notNull().default(''),
    notes: text('notes').notNull().default(''),
    pinned: boolean('pinned').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('voice_notes_owner_idx').on(t.tenantId, t.ownerId, t.createdAt),
    check('voice_notes_kind_chk', sql`${t.kind} in ('mic','pc')`),
    check(
      'voice_notes_mime_chk',
      sql`${t.mime} in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav')`,
    ),
    check('voice_notes_title_len', sql`char_length(${t.title}) <= 300`),
    check(
      'voice_notes_text_len',
      sql`char_length(${t.transcript}) <= 100000 and char_length(${t.notes}) <= 20000`,
    ),
  ],
);

/**
 * Password vault (SECURITY.md §4, D9 — zero-knowledge): the server keeps only
 * what the browser sends — Argon2id salt/params, the DEK wrapped by the master
 * password and by the recovery key, the recovery key's fingerprint and
 * AES-256-GCM ciphertext. Never the master password, the DEK or plaintext.
 */
export const vaultKeys = pgTable('vault_keys', {
  ownerId: uuid('owner_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  tenantId: tenantId(),
  kdfSalt: text('kdf_salt').notNull(),
  kdfParams: jsonb('kdf_params').$type<{ alg: 'argon2id'; m: number; t: number; p: number }>().notNull(),
  dekWrappedMp: text('dek_wrapped_mp').notNull(),
  dekWrappedRk: text('dek_wrapped_rk'),
  rkFingerprint: text('rk_fingerprint'),
  rkCreatedAt: ts('rk_created_at'),
  // Encrypted vault metadata (folder names) — same DEK, opaque to the server.
  metaCt: text('meta_ct'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const vaultItems = pgTable(
  'vault_items',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    /** base64(iv ‖ AES-256-GCM ciphertext) of the item JSON. */
    ciphertext: text('ciphertext').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('vault_items_owner_idx').on(t.tenantId, t.ownerId),
    check('vault_items_ct_len', sql`char_length(${t.ciphertext}) <= 90000`),
  ],
);

/**
 * Imported emails (.msg / .eml, prototype isMail). Parsed on the server; the
 * HTML body is sanitized before it is stored and is only ever shown inside a
 * sandboxed iframe. The original file and the attachments live in the private
 * bucket and are streamed to their owner as downloads.
 */
export const emails = pgTable(
  'emails',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    subject: text('subject').notNull().default(''),
    fromName: text('from_name').notNull().default(''),
    fromEmail: text('from_email').notNull().default(''),
    toAddr: text('to_addr').notNull().default(''),
    cc: text('cc').notNull().default(''),
    sentAt: ts('sent_at'),
    bodyText: text('body_text').notNull().default(''),
    bodyHtml: text('body_html').notNull().default(''),
    notes: text('notes').notNull().default(''),
    starred: boolean('starred').notNull().default(false),
    pinned: boolean('pinned').notNull().default(false),
    fileKey: text('file_key').notNull(),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('emails_owner_idx').on(t.tenantId, t.ownerId, t.sentAt),
    check(
      'emails_len',
      sql`char_length(${t.subject}) <= 1000 and char_length(${t.fromName}) <= 300 and char_length(${t.fromEmail}) <= 320 and char_length(${t.toAddr}) <= 20000 and char_length(${t.cc}) <= 20000 and char_length(${t.notes}) <= 20000 and char_length(${t.fileName}) <= 300`,
    ),
    check(
      'emails_body_len',
      sql`char_length(${t.bodyText}) <= 1000000 and char_length(${t.bodyHtml}) <= 8000000`,
    ),
  ],
);

export const emailAttachments = pgTable(
  'email_attachments',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    emailId: uuid('email_id')
      .notNull()
      .references(() => emails.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    storageKey: text('storage_key').notNull(),
  },
  (t) => [
    index('email_attachments_email_idx').on(t.emailId),
    check('email_attachments_name_len', sql`char_length(${t.name}) <= 300`),
  ],
);

/** Ficheiros: files kept in object storage, in (flat) folders or shared folders. */
export const driveFiles = pgTable(
  'drive_files',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    sharedFolderId: uuid('shared_folder_id').references(() => sharedFolders.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    /** type declared at upload (shown only; previews use the type from the name) */
    mime: text('mime').notNull().default('application/octet-stream'),
    size: bigint('size', { mode: 'number' }).notNull(),
    storageKey: text('storage_key').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('drive_files_owner_idx').on(t.tenantId, t.ownerId),
    index('drive_files_folder_idx').on(t.folderId),
    check(
      'drive_files_len',
      sql`char_length(${t.name}) between 1 and 255 and char_length(${t.mime}) <= 200 and ${t.size} >= 0`,
    ),
  ],
);

/** Meeting minutes ("Atas de Reunião"): when, subject, who, and the minutes. */
export type MeetingItem = { t: string; done: boolean };
export const meetings = pgTable(
  'meetings',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    title: text('title').notNull(),
    heldOn: date('held_on', { mode: 'string' }).notNull(),
    /** 'HH:MM' or '' */
    startTime: text('start_time').notNull().default(''),
    endTime: text('end_time').notNull().default(''),
    /** free names (people may be outside the app) */
    participants: text('participants')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** temas discutidos */
    topics: text('topics').notNull().default(''),
    /** pontos a rever / coisas a fazer */
    review: jsonb('review').$type<MeetingItem[]>().notNull().default([]),
    todos: jsonb('todos').$type<MeetingItem[]>().notNull().default([]),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('meetings_owner_idx').on(t.tenantId, t.ownerId, t.heldOn),
    check(
      'meetings_len',
      sql`char_length(${t.title}) between 1 and 300 and char_length(${t.topics}) <= 100000 and cardinality(${t.participants}) <= 100 and pg_column_size(${t.review}) <= 200000 and pg_column_size(${t.todos}) <= 200000`,
    ),
    check(
      'meetings_time_chk',
      sql`${t.startTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^$' and ${t.endTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^$'`,
    ),
  ],
);

/** Project issues ("Tarefas de Projeto", prototype isIssues): table + Kanban by status. */
export const ISSUE_STATUSES = ['open', 'progress', 'waiting', 'done'] as const;
export const ISSUE_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export const issues = pgTable(
  'issues',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    title: text('title').notNull(),
    status: text('status', { enum: ISSUE_STATUSES }).notNull().default('open'),
    priority: text('priority', { enum: ISSUE_PRIORITIES }).notNull().default('medium'),
    // a Management project, as for tasks
    projectId: uuid('project_id').references(() => mgProjects.id, { onDelete: 'set null' }),
    dueOn: date('due_on'),
    waiting: text('waiting').notNull().default(''),
    description: text('description').notNull().default(''),
    notes: text('notes').notNull().default(''),
    doneAt: ts('done_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('issues_owner_idx').on(t.tenantId, t.ownerId, t.status),
    check('issues_status_chk', sql`${t.status} in ('open','progress','waiting','done')`),
    check('issues_priority_chk', sql`${t.priority} in ('low','medium','high','critical')`),
    check(
      'issues_len',
      sql`char_length(${t.title}) between 1 and 300 and char_length(${t.waiting}) <= 300 and char_length(${t.description}) <= 20000 and char_length(${t.notes}) <= 20000`,
    ),
  ],
);

/**
 * Artifacts (prototype isArtifacts): HTML pages kept with every saved
 * version. The HTML is user content: it only ever runs in a sandboxed,
 * opaque-origin frame (or a response with `CSP: sandbox`), never in the app's origin.
 */
export const artifacts = pgTable(
  'artifacts',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    sharedFolderId: uuid('shared_folder_id').references(() => sharedFolders.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    pinned: boolean('pinned').notNull().default(false),
    html: text('html').notNull().default(''),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('artifacts_owner_idx').on(t.tenantId, t.ownerId, t.updatedAt),
    check(
      'artifacts_len',
      sql`char_length(${t.title}) between 1 and 300 and char_length(${t.description}) <= 2000 and char_length(${t.html}) <= 2000000 and cardinality(${t.tags}) <= 30`,
    ),
  ],
);

export const artifactVersions = pgTable(
  'artifact_versions',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    artifactId: uuid('artifact_id')
      .notNull()
      .references(() => artifacts.id, { onDelete: 'cascade' }),
    html: text('html').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('artifact_versions_idx').on(t.artifactId, t.createdAt),
    check('artifact_versions_len', sql`char_length(${t.html}) <= 2000000`),
  ],
);

/** Code Library snippets (DevLibrary.dc.html): several files each, related snippets both ways. */
export type SnippetFile = { id: string; name: string; lang: string; code: string };
export const snippets = pgTable(
  'snippets',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    title: text('title').notNull(),
    type: text('type').notNull().default('snippet'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    fav: boolean('fav').notNull().default(false),
    description: text('description').notNull().default(''),
    files: jsonb('files').$type<SnippetFile[]>().notNull(),
    related: uuid('related')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('snippets_owner_idx').on(t.tenantId, t.ownerId),
    check(
      'snippets_len',
      sql`char_length(${t.title}) between 1 and 300 and char_length(${t.description}) <= 20000 and cardinality(${t.tags}) <= 30 and cardinality(${t.related}) <= 100 and pg_column_size(${t.files}) <= 2000000`,
    ),
  ],
);

/**
 * API Playground (prototype isApi). Credentials (auth) and environment
 * variables are encrypted at rest with the server key (SECURITY.md §7).
 * Requests are sent by the server proxy with SSRF protection.
 */
export type KvRow = { k: string; v: string; on: boolean };
export const apiRequests = pgTable(
  'api_requests',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    method: text('method').notNull().default('GET'),
    url: text('url').notNull().default(''),
    params: jsonb('params').$type<KvRow[]>().notNull().default([]),
    headers: jsonb('headers').$type<KvRow[]>().notNull().default([]),
    bodyType: text('body_type').notNull().default('none'),
    body: text('body').notNull().default(''),
    authType: text('auth_type').notNull().default('none'),
    /** encryptSecret(JSON {token, user, pass}) */
    authCt: text('auth_ct'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('api_requests_owner_idx').on(t.tenantId, t.ownerId),
    check('api_requests_method_chk', sql`${t.method} in ('GET','POST','PUT','PATCH','DELETE')`),
    check('api_requests_body_chk', sql`${t.bodyType} in ('none','json','form','xml','text')`),
    check('api_requests_auth_chk', sql`${t.authType} in ('none','basic','bearer')`),
    check(
      'api_requests_len',
      sql`char_length(${t.title}) between 1 and 300 and char_length(${t.url}) <= 8000 and char_length(${t.body}) <= 1000000 and pg_column_size(${t.params}) <= 200000 and pg_column_size(${t.headers}) <= 200000`,
    ),
  ],
);

export const apiEnvs = pgTable(
  'api_envs',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    /** the folder whose requests use it; null: the global ones (requests without a folder) */
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** encryptSecret(JSON KvRow[]) */
    varsCt: text('vars_ct').notNull(),
    sort: integer('sort').notNull().default(0),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('api_envs_owner_idx').on(t.tenantId, t.ownerId),
    index('api_envs_folder_idx').on(t.folderId),
    check('api_envs_name_len', sql`char_length(${t.name}) between 1 and 40`),
  ],
);

// ── Whiteboard (Whiteboard.dc.html) ─────────────────────────────────────────
/** Board document: the prototype's element list (see src/lib/whiteboard.ts). */
export type WhiteboardDoc = { els: unknown[] };

export const whiteboards = pgTable(
  'whiteboards',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    name: text('name').notNull(),
    doc: jsonb('doc').$type<WhiteboardDoc>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('whiteboards_owner_idx').on(t.tenantId, t.ownerId),
    check('whiteboards_len', sql`char_length(${t.name}) <= 200 and pg_column_size(${t.doc}) <= 3000000`),
  ],
);

/** Images placed on a board: stored in the private bucket, streamed back to the owner. */
export const whiteboardImages = pgTable(
  'whiteboard_images',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => whiteboards.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('whiteboard_images_board_idx').on(t.boardId),
    check(
      'whiteboard_images_mime_chk',
      sql`${t.mime} in ('image/png','image/jpeg','image/webp','image/gif')`,
    ),
  ],
);

/** SAP News "Guardadas para mais tarde": a snapshot of the article (sanitised HTML), per user. */
export const newsSaved = pgTable(
  'news_saved',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    link: text('link').notNull(),
    item: jsonb('item').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('news_saved_owner_idx').on(t.ownerId, t.createdAt),
    uniqueIndex('news_saved_owner_link_uq').on(t.ownerId, t.link),
    check('news_saved_len', sql`char_length(${t.link}) <= 2000 and pg_column_size(${t.item}) <= 400000`),
  ],
);
