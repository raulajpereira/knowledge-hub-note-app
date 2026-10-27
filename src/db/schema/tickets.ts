// Tickets (SAP › Tickets, migration 0048): support tickets kept by a person —
// the number they type (unique per owner, any case), a one-line description,
// the notes (a rich document like a note's), the parent ticket (typed by
// hand), client and responsible (a Management record or just a name),
// priority, a type from the owner's own list, status, dates, a history of
// comments and changes, and attachments that live only in the ticket (they
// count toward the uploader's storage). In folders, shareable like Notes.
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
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '@/lib/tickets';
import { tenants, users } from './identity';
import { folders } from './content';
import { sharedFolders } from './share';
import { mgClients } from './sap';
import { mgPeople } from './mg';

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

/** The owner's list of ticket types ("Tipo"); in a shared folder the owner's list applies. */
export const ticketTypes = pgTable(
  'ticket_types',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    name: text('name').notNull(),
    sort: integer('sort').notNull().default(0),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ticket_types_name_uq').on(t.ownerId, sql`lower(${t.name})`),
    check('ticket_types_len', sql`char_length(${t.name}) between 1 and 60`),
  ],
);

export const tickets = pgTable(
  'tickets',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    sharedFolderId: uuid('shared_folder_id').references(() => sharedFolders.id, { onDelete: 'set null' }),
    /** "Nº Ticket" as typed (e.g. INC0012345) */
    number: text('number').notNull(),
    /** "Descrição": the one-line summary shown in the table */
    summary: text('summary').notNull(),
    /** "Notas": TipTap document (images in ticket_attachments, inline); notes_text is its plain text */
    notesDoc: jsonb('notes_doc'),
    notesText: text('notes_text').notNull().default(''),
    parentNumber: text('parent_number').notNull().default(''),
    parentSummary: text('parent_summary').notNull().default(''),
    /** a Management client when picked (same tenant), and always its name (or the name typed) */
    clientId: uuid('client_id').references(() => mgClients.id, { onDelete: 'set null' }),
    clientName: text('client_name').notNull().default(''),
    priority: text('priority', { enum: TICKET_PRIORITIES }).notNull().default('medium'),
    typeId: uuid('type_id').references(() => ticketTypes.id, { onDelete: 'set null' }),
    status: text('status', { enum: TICKET_STATUSES }).notNull().default('open'),
    responsibleId: uuid('responsible_id').references(() => mgPeople.id, { onDelete: 'set null' }),
    responsibleName: text('responsible_name').notNull().default(''),
    openedAt: ts('opened_at').notNull().defaultNow(),
    dueOn: date('due_on', { mode: 'string' }),
    /** set when it becomes Resolvido/Fechado, cleared when reopened (editable) */
    resolvedAt: ts('resolved_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    // one number per owner, any case — also while in the Trash (restore it instead)
    uniqueIndex('tickets_number_uq').on(t.ownerId, sql`lower(${t.number})`),
    index('tickets_owner_idx').on(t.tenantId, t.ownerId, t.status),
    index('tickets_folder_idx').on(t.folderId),
    check(
      'tickets_status_chk',
      sql`${t.status} in ('open','progress','pending_customer','pending_vendor','on_hold','awaiting_info','resolved','closed','cancelled')`,
    ),
    check('tickets_priority_chk', sql`${t.priority} in ('very_low','low','medium','high','very_high')`),
    check(
      'tickets_len',
      sql`char_length(${t.number}) between 1 and 40 and char_length(${t.summary}) between 1 and 300 and char_length(${t.parentNumber}) <= 40 and char_length(${t.parentSummary}) <= 300 and char_length(${t.clientName}) <= 120 and char_length(${t.responsibleName}) <= 120 and char_length(${t.notesText}) <= 200000 and coalesce(pg_column_size(${t.notesDoc}), 0) <= 1000000`,
    ),
  ],
);

/** Histórico: comments (work log) and the automatic log of status / priority / responsible changes. */
export const TICKET_EVENT_KINDS = ['created', 'comment', 'status', 'priority', 'responsible'] as const;
export const ticketEvents = pgTable(
  'ticket_events',
  {
    id: id(),
    /** the author's tenant and user (a member of a shared folder writes their own rows) */
    tenantId: tenantId(),
    ownerId: ownerId(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: TICKET_EVENT_KINDS }).notNull(),
    fromValue: text('from_value').notNull().default(''),
    toValue: text('to_value').notNull().default(''),
    body: text('body').notNull().default(''),
    /** the author's name when it was written (people of other tenants can't be looked up) */
    authorName: text('author_name').notNull().default(''),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('ticket_events_ticket_idx').on(t.ticketId, t.createdAt),
    check(
      'ticket_events_kind_chk',
      sql`${t.kind} in ('created','comment','status','priority','responsible')`,
    ),
    check(
      'ticket_events_len',
      sql`char_length(${t.body}) <= 20000 and char_length(${t.fromValue}) <= 200 and char_length(${t.toValue}) <= 200 and char_length(${t.authorName}) <= 120`,
    ),
  ],
);

/**
 * Anexos (and, `inline`, the images inside the notes): stored only with the
 * ticket — not in Ficheiros — but counted in the uploader's storage space.
 */
export const ticketAttachments = pgTable(
  'ticket_attachments',
  {
    id: id(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mime: text('mime').notNull().default('application/octet-stream'),
    size: bigint('size', { mode: 'number' }).notNull(),
    storageKey: text('storage_key').notNull(),
    inline: boolean('inline').notNull().default(false),
    authorName: text('author_name').notNull().default(''),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('ticket_attachments_ticket_idx').on(t.ticketId),
    index('ticket_attachments_owner_idx').on(t.ownerId),
    check(
      'ticket_attachments_len',
      sql`char_length(${t.name}) between 1 and 255 and char_length(${t.mime}) <= 200 and ${t.size} >= 0 and char_length(${t.authorName}) <= 120`,
    ),
  ],
);
