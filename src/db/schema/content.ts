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
