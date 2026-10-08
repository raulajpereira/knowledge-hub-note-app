// Sharing (DATA_MODEL.md §6). Public links are read-only views of one note or
// artifact. Shared folders give other KnowledgeHub users (any tenant) access
// to the notes/tasks/artifacts in them; the content policies only widen to
// members when a request enables the "share scope" (see migration 0022).
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext, tenants, users } from './identity';
import { folders } from './content';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const SHARE_KINDS = ['notes', 'tasks', 'artifacts', 'files'] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

/** A read-only public link to a note or an artifact (token ≥ 128 bits, stored hashed). */
export const publicLinks = pgTable(
  'public_links',
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
    itemType: text('item_type', { enum: ['note', 'artifact', 'file'] }).notNull(),
    itemId: uuid('item_id').notNull(),
    /** sha256(token), hex: the lookup key */
    tokenHash: text('token_hash').notNull().unique(),
    /** the token encrypted with the app key, so the owner can copy the link again */
    tokenCt: text('token_ct').notNull(),
    passwordHash: text('password_hash'),
    expiresOn: date('expires_on'),
    views: integer('views').notNull().default(0),
    createdAt: ts('created_at').notNull().defaultNow(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [
    uniqueIndex('public_links_item_active')
      .on(t.ownerId, t.itemType, t.itemId)
      .where(sql`${t.revokedAt} is null`),
    check('public_links_type_chk', sql`${t.itemType} in ('note','artifact','file')`),
  ],
);

/**
 * A shared folder. `folder_id` is set when an existing folder (notes or
 * artifacts) is shared: its items are shared too. Items can also be put
 * straight in the shared folder (`shared_folder_id` on the item).
 */
export const sharedFolders = pgTable(
  'shared_folders',
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
    kind: text('kind', { enum: SHARE_KINDS }).notNull(),
    name: text('name').notNull(),
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'cascade' }),
    paused: boolean('paused').notNull().default(false),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('shared_folders_owner_idx').on(t.ownerId, t.kind),
    uniqueIndex('shared_folders_folder_uq').on(t.folderId),
    check('shared_folders_kind_chk', sql`${t.kind} in ('notes','tasks','artifacts','files')`),
    check('shared_folders_name_len', sql`char_length(${t.name}) between 1 and 80`),
  ],
);

/** A person with access to a shared folder; `user_id` stays null until the invited email has an account. */
export const shareMembers = pgTable(
  'share_members',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuid_generate_v7()`),
    folderId: uuid('folder_id')
      .notNull()
      .references(() => sharedFolders.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    email: citext('email').notNull(),
    perm: text('perm', { enum: ['read', 'edit'] })
      .notNull()
      .default('read'),
    status: text('status', { enum: ['invited', 'active'] })
      .notNull()
      .default('active'),
    paused: boolean('paused').notNull().default(false),
    invitedAt: ts('invited_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('share_members_folder_email').on(t.folderId, t.email),
    index('share_members_user_idx').on(t.userId),
    index('share_members_email_idx').on(t.email),
    check('share_members_perm_chk', sql`${t.perm} in ('read','edit')`),
    check('share_members_status_chk', sql`${t.status} in ('invited','active')`),
  ],
);

/** "Pessoas com Acesso": a person paused across all of an owner's folders. */
export const sharePeople = pgTable(
  'share_people',
  {
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: citext('email').notNull(),
    paused: boolean('paused').notNull().default(true),
  },
  (t) => [uniqueIndex('share_people_pk').on(t.ownerId, t.email)],
);
