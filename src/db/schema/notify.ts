// Notification centre (the header bell) and per-person notification settings,
// including "Email para a app" (inbound email). Owner-only under Row Level
// Security (migration 0041); the worker reaches them per person (asUser) or
// through the SECURITY DEFINER functions of that migration.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants, users } from './identity';
import { folders } from './content';

export const NOTIFY_KINDS = [
  'task_due',
  'task_overdue',
  'task_reminder',
  'issue_due',
  'issue_overdue',
  'meeting',
  'share_invite',
  'share_accepted',
  'inbound_note',
  'inbound_task',
] as const;

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: NOTIFY_KINDS }).notNull(),
    /** what a click opens: task | issue | meeting | note | share */
    itemType: text('item_type').notNull().default(''),
    itemId: uuid('item_id'),
    title: text('title').notNull(),
    /** extra facts for the text (due day, start time, who…) */
    meta: jsonb('meta').notNull().default({}),
    /** one notification per user and key: restarts and concurrent workers never duplicate */
    dedupeKey: text('dedupe_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('notifications_dedupe').on(t.userId, t.dedupeKey),
    index('notifications_user_idx').on(t.userId, t.createdAt),
    index('notifications_unread_idx')
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
    check('notifications_len', sql`char_length(${t.title}) <= 300 and char_length(${t.dedupeKey}) <= 200`),
  ],
);

/** One row per person: notification preferences (validated by src/lib/notify.ts) and inbound email. */
export const notifySettings = pgTable(
  'notify_settings',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    prefs: jsonb('prefs').notNull().default({}),
    /** the browser's IANA time zone (days, reminder and summary times) */
    tz: text('tz').notNull().default('Europe/Lisbon'),
    /** the last local day the daily summary went out */
    summarySentOn: date('summary_sent_on', { mode: 'string' }),
    /** the secret part of <local>+<token>@<domain> */
    inboundToken: text('inbound_token'),
    inboundEnabled: boolean('inbound_enabled').notNull().default(false),
    inboundTarget: text('inbound_target', { enum: ['note', 'task'] })
      .notNull()
      .default('note'),
    inboundFolderId: uuid('inbound_folder_id').references(() => folders.id, { onDelete: 'set null' }),
    inboundTaskType: text('inbound_task_type', { enum: ['tech', 'mgmt'] })
      .notNull()
      .default('tech'),
    /** accepted senders (empty = the account email only) */
    inboundSenders: text('inbound_senders')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('notify_settings_token').on(t.inboundToken),
    check('notify_settings_target_chk', sql`${t.inboundTarget} in ('note','task')`),
    check('notify_settings_type_chk', sql`${t.inboundTaskType} in ('tech','mgmt')`),
    check(
      'notify_settings_len',
      sql`char_length(${t.tz}) <= 64 and cardinality(${t.inboundSenders}) <= 20 and pg_column_size(${t.prefs}) <= 4096`,
    ),
  ],
);
