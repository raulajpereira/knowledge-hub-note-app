// Management (Management.dc.html): teams, people, projects, allocations,
// timesheets and staffing requests. Each manager's own (migration 0050): RLS
// checks tenant + owner, like notes. Clients live in mg_clients (sap.ts) and
// stay shared by the tenant. Ids are made by the client (the screen keeps the
// prototype's single data set and sends the changes as a batch; allocations
// v2 are loaded by date range — mg_bookings, mg_booking_days, mg_absences).
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants, users } from './identity';
import { mgClients } from './sap';

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const ownerId = () =>
  uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });
const ts = (name: string) => timestamp(name, { withTimezone: true });
const stamps = () => ({
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** Areas and seniority levels of a manager (Definições › Management). */
export const mgSettings = pgTable('mg_settings', {
  ownerId: uuid('owner_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  tenantId: tenantId(),
  data: jsonb('data')
    .notNull()
    .default(sql`'{}'::jsonb`),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const mgTeams = pgTable(
  'mg_teams',
  {
    id: uuid('id').primaryKey(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    name: text('name').notNull(),
    areas: text('areas')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    description: text('description').notNull().default(''),
    color: text('color').notNull(),
    target: integer('target'),
    leadId: uuid('lead_id'),
    ...stamps(),
  },
  (t) => [index('mg_teams_tenant_idx').on(t.tenantId)],
);

export const mgPeople = pgTable(
  'mg_people',
  {
    id: uuid('id').primaryKey(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    teamId: uuid('team_id').references(() => mgTeams.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    area: text('area').notNull(),
    role: text('role').notNull().default(''),
    level: integer('level').notNull(),
    cost: doublePrecision('cost').notNull().default(0),
    rate: doublePrecision('rate').notNull().default(0),
    cap: doublePrecision('cap').notNull().default(40),
    loc: text('loc').notNull().default(''),
    status: text('status', { enum: ['Ativo', 'Inativo', 'Suspenso'] })
      .notNull()
      .default('Ativo'),
    statusNote: text('status_note').notNull().default(''),
    /** hiring date 'YYYY-MM-DD' or '' */
    hired: text('hired').notNull().default(''),
    expYears: doublePrecision('exp_years'),
    /** [{ area, years }] — optional breakdown of exp_years */
    expSplit: jsonb('exp_split')
      .notNull()
      .default(sql`'[]'::jsonb`),
    email: text('email').notNull().default(''),
    phone: text('phone').notNull().default(''),
    av: text('av').notNull(),
    /** the person's photo in object storage (set only through /mg/people/:id/photo) */
    photoKey: text('photo_key'),
    skills: jsonb('skills')
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...stamps(),
  },
  (t) => [index('mg_people_tenant_idx').on(t.tenantId)],
);

export const mgProjects = pgTable(
  'mg_projects',
  {
    id: uuid('id').primaryKey(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    teamId: uuid('team_id').references(() => mgTeams.id, { onDelete: 'set null' }),
    code: text('code').notNull().default(''),
    name: text('name').notNull(),
    clientId: uuid('client_id').references(() => mgClients.id, { onDelete: 'set null' }),
    budget: doublePrecision('budget').notNull().default(0),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    color: text('color').notNull(),
    status: text('status').notNull(),
    managerId: uuid('manager_id').references(() => mgPeople.id, { onDelete: 'set null' }),
    phases: jsonb('phases')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** SAP modules of the project ('FI', 'MM', … or the tenant's own names), in the order picked */
    modules: text('modules')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...stamps(),
  },
  (t) => [index('mg_projects_tenant_idx').on(t.tenantId)],
);

export const mgAllocs = pgTable(
  'mg_allocs',
  {
    id: uuid('id').primaryKey(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    personId: uuid('person_id')
      .notNull()
      .references(() => mgPeople.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => mgProjects.id, { onDelete: 'cascade' }),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    hours: doublePrecision('hours').notNull(),
    /** overrides and the "Nova Alocação" plan (start, hours/day, days, weekday mask) —
     *  v1 data, converted to mg_bookings by migration 0050 and kept for rollback (no longer written) */
    extra: jsonb('extra')
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...stamps(),
  },
  (t) => [index('mg_allocs_tenant_idx').on(t.tenantId), index('mg_allocs_person_idx').on(t.personId)],
);

export const mgTimesheets = pgTable(
  'mg_timesheets',
  {
    id: uuid('id').primaryKey(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    personId: uuid('person_id')
      .notNull()
      .references(() => mgPeople.id, { onDelete: 'cascade' }),
    week: date('week').notNull(),
    status: text('status').notNull(),
    rows: jsonb('rows')
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...stamps(),
  },
  (t) => [
    index('mg_timesheets_tenant_idx').on(t.tenantId),
    uniqueIndex('mg_timesheets_person_week_uq').on(t.personId, t.week),
  ],
);

export const mgRequests = pgTable(
  'mg_requests',
  {
    id: uuid('id').primaryKey(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    teamId: uuid('team_id').references(() => mgTeams.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => mgProjects.id, { onDelete: 'cascade' }),
    skills: jsonb('skills').notNull(),
    hours: doublePrecision('hours'),
    maxCost: doublePrecision('max_cost'),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    status: text('status').notNull(),
    assignedId: uuid('assigned_id').references(() => mgPeople.id, { onDelete: 'set null' }),
    note: text('note').notNull().default(''),
    ...stamps(),
  },
  (t) => [index('mg_requests_tenant_idx').on(t.tenantId)],
);

/** Alocações v2: a range and an effort rule; no person = a role "Por atribuir". */
export const mgBookings = pgTable(
  'mg_bookings',
  {
    id: uuid('id').primaryKey(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    personId: uuid('person_id').references(() => mgPeople.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => mgProjects.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default(''),
    status: text('status', { enum: ['confirmed', 'tentative'] })
      .notNull()
      .default('confirmed'),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    mode: text('mode', { enum: ['hpd', 'hpw', 'pct', 'fte', 'total'] })
      .notNull()
      .default('hpd'),
    value: doublePrecision('value').notNull(),
    /** worked weekdays, bit 0 = Monday */
    mask: smallint('mask').notNull().default(31),
    /** also on national holidays */
    hol: boolean('hol').notNull().default(false),
    note: text('note').notNull().default(''),
    /** skills a placeholder asks for: [{ k, l }] */
    need: jsonb('need')
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: ts('created_at').notNull().defaultNow(),
    /** the version for optimistic concurrency (milliseconds, always increasing) */
    updatedAt: ts('updated_at')
      .notNull()
      .default(sql`date_trunc('milliseconds', now())`),
  },
  (t) => [
    index('mg_bookings_range_idx').on(t.tenantId, t.ownerId, t.toDate, t.fromDate),
    index('mg_bookings_person_idx').on(t.personId),
    index('mg_bookings_project_idx').on(t.projectId),
  ],
);

/** Hours typed by hand on one day of a booking (they win over its rule). */
export const mgBookingDays = pgTable(
  'mg_booking_days',
  {
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => mgBookings.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    hours: doublePrecision('hours').notNull(),
  },
  (t) => [primaryKey({ name: 'mg_booking_days_pk', columns: [t.bookingId, t.day] })],
);

/** Vacation, sickness, training… marked by the manager (no approval). */
export const mgAbsences = pgTable(
  'mg_absences',
  {
    id: uuid('id').primaryKey(),
    tenantId: tenantId(),
    ownerId: ownerId(),
    personId: uuid('person_id')
      .notNull()
      .references(() => mgPeople.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['ferias', 'doenca', 'formacao', 'outra'] })
      .notNull()
      .default('ferias'),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    /** hours off a day; null = the whole day */
    hours: doublePrecision('hours'),
    note: text('note').notNull().default(''),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .default(sql`date_trunc('milliseconds', now())`),
  },
  (t) => [
    index('mg_absences_range_idx').on(t.tenantId, t.ownerId, t.toDate, t.fromDate),
    index('mg_absences_person_idx').on(t.personId),
  ],
);
