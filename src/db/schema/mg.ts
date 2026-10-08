// Management (Management.dc.html): teams, people, projects, allocations,
// timesheets and staffing requests. Shared by the tenant like the SAP data
// (D40): RLS checks the tenant only (migration 0020). Clients live in
// mg_clients (sap.ts). Ids are made by the client (the screen keeps the
// prototype's single data set and sends the changes as a batch).
import { sql } from 'drizzle-orm';
import {
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './identity';
import { mgClients } from './sap';

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const ts = (name: string) => timestamp(name, { withTimezone: true });
const stamps = () => ({
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

/** Areas and seniority levels of the tenant (Definições › Management). */
export const mgSettings = pgTable('mg_settings', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
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
    email: text('email').notNull().default(''),
    av: text('av').notNull(),
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
    ...stamps(),
  },
  (t) => [index('mg_projects_tenant_idx').on(t.tenantId)],
);

export const mgAllocs = pgTable(
  'mg_allocs',
  {
    id: uuid('id').primaryKey(),
    tenantId: tenantId(),
    personId: uuid('person_id')
      .notNull()
      .references(() => mgPeople.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => mgProjects.id, { onDelete: 'cascade' }),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    hours: doublePrecision('hours').notNull(),
    /** overrides and the "Nova Alocação" plan (start, hours/day, days, weekday mask) */
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
