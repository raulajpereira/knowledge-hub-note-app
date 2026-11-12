// "Orçamentos" (Management): each person's matrix (SF modules × profiles, days
// Greenfield / Brownfield), their Excel model (the P&L file, kept as is) with
// its cell mapping, and their budgets (client as free text, the modules
// chosen, the lines made from the matrix and edited).
import { sql } from 'drizzle-orm';
import {
  check,
  customType,
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
import type { Line, Mapping, Matrix } from '@/lib/budget';

const ts = (name: string) => timestamp(name, { withTimezone: true });
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const budgetSettings = pgTable(
  'budget_settings',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    matrix: jsonb('matrix').$type<Matrix>().notNull(),
    /** the Excel model as uploaded (never changed: each budget fills a copy) */
    template: bytea('template'),
    templateName: text('template_name').notNull().default(''),
    templateSize: integer('template_size').notNull().default(0),
    templateAt: ts('template_at'),
    mapping: jsonb('mapping').$type<Mapping>(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('budget_settings_len', sql`char_length(${t.templateName}) <= 200 and ${t.templateSize} <= 5242880`),
  ],
);

export const budgets = pgTable(
  'budgets',
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
    /** ORC-2026-001: the person's own sequence per year */
    ref: text('ref').notNull(),
    client: text('client').notNull(),
    scenario: text('scenario', { enum: ['gf', 'bf'] }).notNull(),
    modules: jsonb('modules').$type<string[]>().notNull(),
    lines: jsonb('lines').$type<Line[]>().notNull(),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('budgets_owner_idx').on(t.tenantId, t.ownerId, t.createdAt),
    uniqueIndex('budgets_ref_uq').on(t.ownerId, t.ref),
    check('budgets_scenario_chk', sql`${t.scenario} in ('gf','bf')`),
    check('budgets_len', sql`char_length(${t.client}) between 1 and 200 and char_length(${t.ref}) <= 40`),
  ],
);
