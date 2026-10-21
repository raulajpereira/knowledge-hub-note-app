// SAP and Management data (DATA_MODEL.md §5). Unlike personal content these
// tables are shared by the whole tenant (a team works on the same clients,
// systems and transports): RLS checks the tenant only (migration 0015+).
// Per-user bits (favourites, usage) live in their own tables, owned by the user.
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
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { mgProjects } from './mg';
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
    /** landscape / track the system belongs to (map lanes), e.g. "S/4 Core" */
    track: text('track').notNull().default(''),
    /** where its transports go next (empty: the next role of the same landscape) */
    nextId: uuid('next_id').references((): AnyPgColumn => sapSystems.id, { onDelete: 'set null' }),
    createdBy: userRef('created_by'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('sap_systems_tenant_idx').on(t.tenantId),
    check('sap_systems_env_chk', sql`${t.env} in ('DEV','QAS','PRD','SBX','OTH')`),
    check(
      'sap_systems_track_chk',
      sql`char_length(${t.track}) <= 60 and (${t.nextId} is null or ${t.nextId} <> ${t.id})`,
    ),
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

/**
 * Transport requests (prototype `trs`). The route DEV → QAS → PRD is derived
 * from the client's landscape; released/QAS/PRD/junk are the dates of each step.
 * project_id: a Management project (mg_projects).
 */
export const sapTransports = pgTable(
  'sap_transports',
  {
    id: id(),
    tenantId: tenantId(),
    trkorr: text('trkorr').notNull().default(''),
    description: text('description').notNull().default(''),
    clientId: uuid('client_id').references(() => mgClients.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => mgProjects.id, { onDelete: 'set null' }),
    systemId: uuid('system_id').references(() => sapSystems.id, { onDelete: 'set null' }),
    type: text('type').notNull().default('W'),
    owner: text('owner').notNull().default(''),
    notes: text('notes').notNull().default(''),
    releasedAt: ts('released_at'),
    qasAt: ts('qas_at'),
    prdAt: ts('prd_at'),
    junkAt: ts('junk_at'),
    createdBy: userRef('created_by'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('sap_transports_tenant_idx').on(t.tenantId),
    check('sap_transports_type_chk', sql`${t.type} in ('W','C')`),
    check(
      'sap_transports_len',
      sql`char_length(${t.trkorr}) <= 20 and char_length(${t.description}) <= 500 and char_length(${t.owner}) <= 40 and char_length(${t.notes}) <= 20000`,
    ),
  ],
);

/** Code Library SAP (ZNotes.dc.html isCodelib): an ABAP object with its tree of nodes. */
export const sapObjects = pgTable(
  'sap_objects',
  {
    id: id(),
    tenantId: tenantId(),
    type: text('type').notNull(),
    name: text('name').notNull().default(''),
    description: text('description').notNull().default(''),
    /** "Implementado @": where / at which client the object was built (≤ 40). */
    implementedAt: text('implemented_at').notNull().default(''),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    nodes: jsonb('nodes')
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdBy: userRef('created_by'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('sap_objects_tenant_idx').on(t.tenantId, t.type),
    check(
      'sap_objects_type_chk',
      sql`${t.type} in ('PROG','FUGR','FUNC','CLAS','INTF','TABL','STRU','DTEL','DOMA','SNIP')`,
    ),
    check('sap_objects_impl_len', sql`char_length(${t.implementedAt}) <= 40`),
    check(
      'sap_objects_len',
      sql`char_length(${t.name}) <= 120 and char_length(${t.description}) <= 500 and cardinality(${t.tags}) <= 30 and pg_column_size(${t.nodes}) <= 2000000`,
    ),
  ],
);

/** Funcional SAP (SapFunctional.dc.html): processes, tests, migration objects and cutover plans. */
export const sapFnRecords = pgTable(
  'sap_fn_records',
  {
    id: id(),
    tenantId: tenantId(),
    page: text('page').notNull(),
    title: text('title').notNull().default(''),
    code: text('code').notNull().default(''),
    st: text('st').notNull(),
    f: jsonb('f')
      .notNull()
      .default(sql`'{}'::jsonb`),
    rows: jsonb('rows')
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdBy: userRef('created_by'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    index('sap_fn_records_tenant_idx').on(t.tenantId, t.page),
    check('sap_fn_records_page_chk', sql`${t.page} in ('fn_proc','fn_test','fn_mig','fn_cut')`),
    check(
      'sap_fn_records_len',
      sql`char_length(${t.title}) <= 300 and char_length(${t.code}) <= 120 and pg_column_size(${t.f}) + pg_column_size(${t.rows}) <= 2000000`,
    ),
  ],
);

/**
 * Notas SAP (OSS notes): one per number per tenant (migration 0044), with the
 * status in each system of the landscape (sap_note_systems) and the related
 * transports (sap_note_transports). Shared by the tenant (D40).
 */
export const sapNotes = pgTable(
  'sap_notes',
  {
    id: id(),
    tenantId: tenantId(),
    number: integer('number').notNull(),
    version: integer('version').notNull().default(1),
    title: text('title').notNull().default(''),
    component: text('component').notNull().default(''),
    category: text('category').notNull().default(''),
    priority: text('priority').notNull().default(''),
    releasedOn: date('released_on'),
    /** software components and releases / SPs it applies to: [{ swc, rel, sp }] */
    validity: jsonb('validity')
      .notNull()
      .default(sql`'[]'::jsonb`),
    impl: text('impl')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** prerequisite notes, by number (they may not be in the library yet) */
    prereqs: integer('prereqs')
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    projectId: uuid('project_id').references(() => mgProjects.id, { onDelete: 'set null' }),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    body: jsonb('body'),
    createdBy: userRef('created_by'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    uniqueIndex('sap_notes_number_uq').on(t.tenantId, t.number),
    check(
      'sap_notes_number_chk',
      sql`${t.number} between 1 and 99999999 and ${t.version} between 1 and 9999`,
    ),
    check(
      'sap_notes_category_chk',
      sql`${t.category} in ('','fix','consult','legal','perf','security','doc','other')`,
    ),
    check('sap_notes_priority_chk', sql`${t.priority} in ('','hot','high','medium','low','info')`),
    check('sap_notes_impl_chk', sql`${t.impl} <@ ARRAY['snote','manual','sp']::text[]`),
    check(
      'sap_notes_len',
      sql`char_length(${t.title}) <= 300 and char_length(${t.component}) <= 40 and cardinality(${t.tags}) <= 30 and cardinality(${t.prereqs}) <= 50 and pg_column_size(${t.validity}) <= 20000 and coalesce(pg_column_size(${t.body}), 0) <= 1000000`,
    ),
  ],
);

export const sapNoteSystems = pgTable(
  'sap_note_systems',
  {
    tenantId: tenantId(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => sapNotes.id, { onDelete: 'cascade' }),
    systemId: uuid('system_id')
      .notNull()
      .references(() => sapSystems.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('new'),
    implOn: date('impl_on'),
    transportId: uuid('transport_id').references(() => sapTransports.id, { onDelete: 'set null' }),
    updatedBy: userRef('updated_by'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'sap_note_systems_pk', columns: [t.noteId, t.systemId] }),
    index('sap_note_systems_system_idx').on(t.systemId),
    check('sap_note_systems_status_chk', sql`${t.status} in ('new','nrel','todo','done','obs')`),
  ],
);

export const sapNoteTransports = pgTable(
  'sap_note_transports',
  {
    tenantId: tenantId(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => sapNotes.id, { onDelete: 'cascade' }),
    transportId: uuid('transport_id')
      .notNull()
      .references(() => sapTransports.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ name: 'sap_note_transports_pk', columns: [t.noteId, t.transportId] }),
    index('sap_note_transports_tr_idx').on(t.transportId),
  ],
);

/** Funcional › Testes: evidence files (screenshots…) of one step (row id) of a test case. */
export const sapFnEvidence = pgTable(
  'sap_fn_evidence',
  {
    id: id(),
    tenantId: tenantId(),
    recordId: uuid('record_id')
      .notNull()
      .references(() => sapFnRecords.id, { onDelete: 'cascade' }),
    rowId: text('row_id').notNull(),
    storageKey: text('storage_key').notNull(),
    name: text('name').notNull().default(''),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    createdBy: userRef('created_by'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('sap_fn_evidence_record_idx').on(t.recordId, t.rowId),
    check(
      'sap_fn_evidence_len',
      sql`char_length(${t.rowId}) between 1 and 16 and char_length(${t.name}) <= 200 and ${t.size} between 1 and 10485760`,
    ),
  ],
);
