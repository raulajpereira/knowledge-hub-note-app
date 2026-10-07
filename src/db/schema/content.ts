// Tenant content (DATA_MODEL.md §4). Every table carries tenant_id and is
// protected by Row Level Security (migration 0005): the app role only sees
// rows of the tenant/user set by withTenant(). Personal content also has an
// owner; shared folders (Phase 9) will widen the policies via share_members.
import { sql } from 'drizzle-orm';
import {
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
  uuid,
} from 'drizzle-orm/pg-core';
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
    kind: text('kind', { enum: ['notes', 'tasks', 'artifacts', 'passwords', 'emails', 'api'] }).notNull(),
    name: text('name').notNull(),
    color: text('color').notNull(),
    parentId: uuid('parent_id'),
    sort: integer('sort').notNull().default(0),
    createdAt: ts('created_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('folders_owner_kind_idx').on(t.tenantId, t.ownerId, t.kind),
    check('folders_kind_chk', sql`${t.kind} in ('notes','tasks','artifacts','passwords','emails','api')`),
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

/** Tasks (prototype isTasks). project_id points at mg_projects once Management lands (Phase 8). */
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
    projectId: uuid('project_id'),
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
    // mg_projects once Management lands (Phase 8), as for tasks
    projectId: uuid('project_id'),
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
