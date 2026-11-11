// "Registo de Tempos": the person's time entries — what they worked on
// (a ticket / project task or free text, a client, an optional project) and
// for how long. One running entry at most per person (ended_at null). The
// duration kept is rounded up to 15 minutes; it can also feed the person's
// Management timesheet (ts_applied: what was added there, to undo it).
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

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const TIME_REF_KINDS = ['ticket', 'issue'] as const;

export const timeEntries = pgTable(
  'time_entries',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** the ticket / project task picked from the app, or none (free text in ref_label) */
    refKind: text('ref_kind', { enum: TIME_REF_KINDS }),
    refId: uuid('ref_id'),
    refLabel: text('ref_label').notNull().default(''),
    clientId: uuid('client_id'),
    clientLabel: text('client_label').notNull().default(''),
    projectId: uuid('project_id'),
    projectLabel: text('project_label').notNull().default(''),
    description: text('description').notNull().default(''),
    startedAt: ts('started_at').notNull(),
    endedAt: ts('ended_at'),
    /** rounded up to 15 minutes (at least 15) once ended */
    minutes: integer('minutes'),
    inTimesheet: boolean('in_timesheet').notNull().default(true),
    /** { tsId, project, day, hours } added to the Management timesheet, or { skip: reason } */
    tsApplied: jsonb('ts_applied'),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('time_entries_owner_idx').on(t.tenantId, t.ownerId, t.startedAt),
    uniqueIndex('time_entries_running_uq')
      .on(t.ownerId)
      .where(sql`${t.endedAt} is null and ${t.deletedAt} is null`),
    check('time_entries_ref_chk', sql`${t.refKind} is null or ${t.refKind} in ('ticket','issue')`),
    check(
      'time_entries_len',
      sql`char_length(${t.refLabel}) <= 200 and char_length(${t.clientLabel}) <= 200 and char_length(${t.projectLabel}) <= 200 and char_length(${t.description}) <= 4000`,
    ),
    check('time_entries_range_chk', sql`${t.endedAt} is null or ${t.endedAt} >= ${t.startedAt}`),
  ],
);
