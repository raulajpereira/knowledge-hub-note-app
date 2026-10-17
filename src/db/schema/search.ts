// Semantic search and OCR (migration 0043): vectors of each item's text
// (pgvector, 384 dims), text recognised in images / scanned PDFs, and the work
// queue the worker drains. Reading a vector or an OCR text mirrors its source
// item under RLS (kh_search_visible); the queue is filled by triggers.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { tenants, users } from './identity';

const ts = (name: string) => timestamp(name, { withTimezone: true });
const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });

export const EMBED_DIMS = 384;

export const embeddings = pgTable(
  'embeddings',
  {
    tenantId: tenantId(),
    /** the item's owner; NULL for the tenant-wide SAP code library and transports */
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    itemType: text('item_type').notNull(),
    itemId: uuid('item_id').notNull(),
    chunkNo: integer('chunk_no').notNull(),
    contentHash: text('content_hash').notNull(),
    model: text('model').notNull(),
    embedding: vector('embedding', { dimensions: EMBED_DIMS }).notNull(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'embeddings_pk', columns: [t.itemType, t.itemId, t.chunkNo] }),
    index('embeddings_owner_idx').on(t.tenantId, t.ownerId, t.itemType),
    index('embeddings_hnsw_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);

export const ocrTexts = pgTable(
  'ocr_texts',
  {
    tenantId: tenantId(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** note_att | meeting_att | email_att | file */
    srcType: text('src_type').notNull(),
    srcId: uuid('src_id').notNull(),
    /** note | meeting | email | file — the item the text belongs to */
    parentType: text('parent_type').notNull(),
    parentId: uuid('parent_id').notNull(),
    /** done | skipped (too big, no text) | failed */
    status: text('status').notNull(),
    text: text('text').notNull().default(''),
    pages: integer('pages').notNull().default(0),
    error: text('error').notNull().default(''),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'ocr_texts_pk', columns: [t.srcType, t.srcId] }),
    index('ocr_texts_parent_idx').on(t.parentType, t.parentId),
    check('ocr_texts_status_chk', sql`${t.status} in ('done','skipped','failed')`),
  ],
);

export const searchJobs = pgTable(
  'search_jobs',
  {
    /** embed | ocr */
    kind: text('kind').notNull(),
    itemType: text('item_type').notNull(),
    itemId: uuid('item_id').notNull(),
    tenantId: tenantId(),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    /** 0 = a change (debounced), 1 = backfill / reindex */
    priority: smallint('priority').notNull().default(0),
    /** embed again even if the text did not change ("Reindexar") */
    force: boolean('force').notNull().default(false),
    dueAt: ts('due_at').notNull().defaultNow(),
    lockedUntil: ts('locked_until'),
    attempts: smallint('attempts').notNull().default(0),
    lastError: text('last_error').notNull().default(''),
  },
  (t) => [
    primaryKey({ name: 'search_jobs_pk', columns: [t.kind, t.itemType, t.itemId] }),
    index('search_jobs_due_idx').on(t.kind, t.priority, t.dueAt),
    index('search_jobs_owner_idx').on(t.tenantId, t.ownerId),
  ],
);
