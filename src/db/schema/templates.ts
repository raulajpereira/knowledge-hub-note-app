// Modelos: the templates each person saves (meeting records, Functional
// records, project phases). Owner-only under Row Level Security (migration 0037).
import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants, users } from './identity';

export const userTemplates = pgTable(
  'user_templates',
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
    /** meeting | fn_proc | fn_test | fn_mig | fn_cut | project */
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    /** checked against src/lib/templates.ts (tplBodySchema) */
    body: jsonb('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('user_templates_owner_idx').on(t.tenantId, t.ownerId, t.kind),
    check(
      'user_templates_kind_chk',
      sql`${t.kind} in ('meeting','fn_proc','fn_test','fn_mig','fn_cut','project')`,
    ),
    check('user_templates_name_len', sql`char_length(${t.name}) between 1 and 120`),
    check('user_templates_body_size', sql`pg_column_size(${t.body}) <= 1048576`),
  ],
);
