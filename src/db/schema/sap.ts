// SAP and Management data (DATA_MODEL.md §5). Unlike personal content these
// tables are shared by the whole tenant (a team works on the same clients,
// systems and transports): RLS checks the tenant only (migration 0015+).
// Per-user bits (favourites, usage) live in their own tables, owned by the user.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
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
const userRef = (name: string) => uuid(name).references(() => users.id, { onDelete: 'set null' });
const ts = (name: string) => timestamp(name, { withTimezone: true });

/** Clients (Management › Clientes); referenced by systems, transports and projects. */
export const mgClients = pgTable(
  'mg_clients',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('external'),
    sector: text('sector').notNull().default(''),
    contact: text('contact').notNull().default(''),
    email: text('email').notNull().default(''),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('mg_clients_tenant_idx').on(t.tenantId),
    check('mg_clients_len', sql`char_length(${t.name}) between 1 and 200`),
  ],
);

export const sapSystems = pgTable(
  'sap_systems',
  {
    id: id(),
    tenantId: tenantId(),
    clientId: uuid('client_id').references(() => mgClients.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    sid: text('sid').notNull().default(''),
    env: text('env').notNull().default('DEV'),
    type: text('type').notNull().default(''),
    host: text('host').notNull().default(''),
    inst: text('inst').notNull().default('00'),
    mandt: text('mandt').notNull().default('100'),
    router: text('router').notNull().default(''),
    lang: text('lang').notNull().default('PT'),
    sapUser: text('sap_user').notNull().default(''),
    fiori: text('fiori').notNull().default(''),
    notes: text('notes').notNull().default(''),
    createdBy: userRef('created_by'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('sap_systems_tenant_idx').on(t.tenantId),
    check('sap_systems_env_chk', sql`${t.env} in ('DEV','QAS','PRD')`),
    check(
      'sap_systems_len',
      sql`char_length(${t.name}) between 1 and 200 and char_length(${t.sid}) <= 8 and char_length(${t.host}) <= 255 and char_length(${t.router}) <= 500 and char_length(${t.fiori}) <= 2000 and char_length(${t.notes}) <= 20000`,
    ),
  ],
);

/** A user's favourite systems (Início › Acesso Rápido SAP). */
export const sapSystemFavs = pgTable(
  'sap_system_favs',
  {
    tenantId: tenantId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    systemId: uuid('system_id')
      .notNull()
      .references(() => sapSystems.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.systemId] })],
);

/** Transaction library (prototype `tx`), seeded with the prototype catalogue per tenant. */
export const sapTcodes = pgTable(
  'sap_tcodes',
  {
    id: id(),
    tenantId: tenantId(),
    code: text('code').notNull().default(''),
    description: text('description').notNull().default(''),
    module: text('module').notNull().default('BC'),
    program: text('program').notNull().default(''),
    type: text('type').notNull().default('dialog'),
    params: text('params').notNull().default(''),
    notes: text('notes').notNull().default(''),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at'),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('sap_tcodes_tenant_idx').on(t.tenantId),
    check('sap_tcodes_type_chk', sql`${t.type} in ('dialog','report','param','variant','oo','area')`),
    check(
      'sap_tcodes_len',
      sql`char_length(${t.code}) <= 40 and char_length(${t.description}) <= 300 and char_length(${t.program}) <= 60 and char_length(${t.params}) <= 1000 and char_length(${t.notes}) <= 20000`,
    ),
  ],
);

/** Per user: favourite transactions and how often each was picked in the TCodes popup. */
export const sapTcodeUsage = pgTable(
  'sap_tcode_usage',
  {
    tenantId: tenantId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tcodeId: uuid('tcode_id')
      .notNull()
      .references(() => sapTcodes.id, { onDelete: 'cascade' }),
    fav: boolean('fav').notNull().default(false),
    uses: integer('uses').notNull().default(0),
    lastUsed: ts('last_used'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tcodeId] })],
);
