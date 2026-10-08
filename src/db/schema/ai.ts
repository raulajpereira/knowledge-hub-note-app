// Assistente IA: each person's own provider key (encrypted at rest) and their
// conversations. Owner-only under Row Level Security (migration 0036).
import { sql } from 'drizzle-orm';
import { boolean, check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants, users } from './identity';

const ts = (name: string) => timestamp(name, { withTimezone: true });
const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const ownerId = () =>
  uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

export const aiSettings = pgTable(
  'ai_settings',
  {
    ownerId: ownerId().primaryKey(),
    tenantId: tenantId(),
    provider: text('provider').notNull(),
    model: text('model').notNull().default(''),
    /** encryptSecret(api key) — never sent back to the browser */
    keyCt: text('key_ct').notNull(),
    /** last 4 characters, to show which key is set */
    keyHint: text('key_hint').notNull().default(''),
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [check('ai_settings_len', sql`char_length(${t.model}) <= 200 and char_length(${t.provider}) <= 40`)],
);

export type AiSource = { type: string; id: string; title: string };

export const aiChats = pgTable(
  'ai_chats',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: tenantId(),
    ownerId: ownerId(),
    title: text('title').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('ai_chats_owner_idx').on(t.tenantId, t.ownerId, t.updatedAt),
    check('ai_chats_title_len', sql`char_length(${t.title}) between 1 and 200`),
  ],
);

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    tenantId: tenantId(),
    ownerId: ownerId(),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => aiChats.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    sources: jsonb('sources').$type<AiSource[]>().notNull().default([]),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('ai_messages_chat_idx').on(t.chatId, t.createdAt),
    check('ai_messages_role_chk', sql`${t.role} in ('user','assistant')`),
    check('ai_messages_len', sql`char_length(${t.content}) <= 200000`),
  ],
);
