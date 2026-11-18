// "Helpdesk" (SAP): a helpdesk page's tickets, read by the browser extension
// with the person's own login there (the app never has it) and kept here:
// the page linked (helpdesk_sources: address, column mapping, interval), the
// tickets as last read (helpdesk_items) and what changed between reads
// (helpdesk_changes: the "modificações" shown in the popup and the bell).
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants, users } from './identity';
import { tickets } from './tickets';
import type { HdMapping } from '@/lib/helpdesk';

const ts = (name: string) => timestamp(name, { withTimezone: true });
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

export type HdSnapshot = { headers: string[]; rows: string[][]; links: (string | null)[][]; at: string };

export const helpdeskSources = pgTable(
  'helpdesk_sources',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    name: text('name').notNull(),
    /** the page read by the extension (its address, as linked) */
    url: text('url').notNull(),
    intervalMin: integer('interval_min').notNull().default(15),
    onMissing: text('on_missing', { enum: ['notify', 'nothing'] })
      .notNull()
      .default('notify'),
    mapping: jsonb('mapping').$type<HdMapping>().notNull().default({}),
    /** the last read as sent (for the mapping screen and the first import) */
    snapshot: jsonb('snapshot').$type<HdSnapshot>(),
    /** false until the first import is confirmed: the extension only reads active ones */
    active: boolean('active').notNull().default(false),
    paused: boolean('paused').notNull().default(false),
    syncRequestedAt: ts('sync_requested_at'),
    lastSyncAt: ts('last_sync_at'),
    /** 'session' (the helpdesk asks to sign in again) | 'no_table' | null */
    lastError: text('last_error'),
    lastErrorAt: ts('last_error_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('helpdesk_sources_url_uq').on(t.ownerId, t.url),
    check(
      'helpdesk_sources_chk',
      sql`char_length(${t.name}) between 1 and 120 and char_length(${t.url}) between 1 and 2000 and ${t.intervalMin} in (5,15,30,60) and ${t.onMissing} in ('notify','nothing')`,
    ),
  ],
);

export const helpdeskItems = pgTable(
  'helpdesk_items',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => helpdeskSources.id, { onDelete: 'cascade' }),
    number: text('number').notNull(),
    summary: text('summary').notNull(),
    parent: text('parent').notNull().default(''),
    assignee: text('assignee').notNull().default(''),
    status: text('status').notNull().default(''),
    priority: text('priority').notNull().default(''),
    type: text('type').notNull().default(''),
    client: text('client').notNull().default(''),
    reportedBy: text('reported_by').notNull().default(''),
    reportedAt: text('reported_at').notNull().default(''),
    commentBy: text('comment_by').notNull().default(''),
    commentAt: text('comment_at').notNull().default(''),
    url: text('url').notNull().default(''),
    /** every column as read (header → text) */
    cells: jsonb('cells').$type<Record<string, string>>().notNull().default({}),
    /** still on the page at the last read */
    inList: boolean('in_list').notNull().default(true),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    goneAt: ts('gone_at'),
    /** the ticket made from it in Tickets ("Criar ticket") */
    ticketId: uuid('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('helpdesk_items_number_uq').on(t.sourceId, t.number),
    index('helpdesk_items_owner_idx').on(t.tenantId, t.ownerId),
  ],
);

export const HD_CHANGE_KINDS = ['new', 'field', 'comment', 'gone', 'back'] as const;

export const helpdeskChanges = pgTable(
  'helpdesk_changes',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => helpdeskSources.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => helpdeskItems.id, { onDelete: 'cascade' }),
    number: text('number').notNull(),
    summary: text('summary').notNull().default(''),
    kind: text('kind', { enum: HD_CHANGE_KINDS }).notNull(),
    field: text('field').notNull().default(''),
    fromValue: text('from_value').notNull().default(''),
    toValue: text('to_value').notNull().default(''),
    /** the read it came from (one popup / notification per read) */
    syncAt: ts('sync_at').notNull(),
    seenAt: ts('seen_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('helpdesk_changes_owner_idx').on(t.ownerId, t.createdAt),
    index('helpdesk_changes_item_idx').on(t.itemId, t.createdAt),
    check('helpdesk_changes_kind_chk', sql`${t.kind} in ('new','field','comment','gone','back')`),
  ],
);
