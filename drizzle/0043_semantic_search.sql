-- Semantic search (embeddings, pgvector) and OCR of images / scanned PDFs.
--
-- pgvector: the Postgres image is pgvector/pgvector:pg16 (docs/DEPLOY.md). In
-- Docker the migration runs as the superuser created by the image, so it can
-- create the extension; where it already exists (local installs created it as
-- superuser) IF NOT EXISTS skips the permission check.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint

-- Moving the data volume from postgres:16-alpine (musl) to the Debian-based
-- pgvector image changes how text sorts under the database's locale (musl
-- compares bytes, glibc applies language rules), so btree indexes on text
-- built under musl would be out of order. Musl databases carry no collation
-- version and glibc reports one: in exactly that case, rebuild every index of
-- the app's tables once (small database; runs inside this migration).
DO $$
DECLARE
  r record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_database d
    WHERE d.datname = current_database() AND d.datlocprovider = 'c'
      AND d.datcollversion IS NULL
      AND pg_database_collation_actual_version(d.oid) IS NOT NULL
      AND d.datcollate NOT IN ('C', 'POSIX', 'C.UTF-8', 'C.utf8')
  ) THEN
    FOR r IN
      SELECT i.indexrelid::regclass AS idx FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public', 'drizzle')
    LOOP
      EXECUTE format('REINDEX INDEX %s', r.idx);
    END LOOP;
    RAISE NOTICE 'collation changed (musl -> glibc): indexes rebuilt';
  END IF;
END $$;--> statement-breakpoint

-- ── embeddings ──────────────────────────────────────────────────────────────
-- One row per chunk of an item's text. owner_id is the item's owner (NULL for
-- the tenant-wide SAP code library and transports). content_hash skips chunks
-- that did not change; model marks which model made the vector.
CREATE TABLE IF NOT EXISTS "embeddings" (
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid,
	"item_type" text NOT NULL,
	"item_id" uuid NOT NULL,
	"chunk_no" integer NOT NULL,
	"content_hash" text NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(384) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "embeddings_pk" PRIMARY KEY ("item_type", "item_id", "chunk_no"),
	CONSTRAINT "embeddings_type_chk" CHECK ("item_type" in ('note','meeting','task','issue','voice','artifact','email','snippet','code','transport','file')),
	CONSTRAINT "embeddings_chunk_chk" CHECK ("chunk_no" between 0 and 999)
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embeddings_owner_idx" ON "embeddings" USING btree ("tenant_id", "owner_id", "item_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embeddings_hnsw_idx" ON "embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint

-- ── OCR results ─────────────────────────────────────────────────────────────
-- Text recognised in an image or scanned PDF, keyed by where the file comes
-- from (src_type/src_id); parent_* is the item whose search/embedding it joins.
CREATE TABLE IF NOT EXISTS "ocr_texts" (
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"src_type" text NOT NULL,
	"src_id" uuid NOT NULL,
	"parent_type" text NOT NULL,
	"parent_id" uuid NOT NULL,
	"status" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"pages" integer DEFAULT 0 NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ocr_texts_pk" PRIMARY KEY ("src_type", "src_id"),
	CONSTRAINT "ocr_texts_src_chk" CHECK ("src_type" in ('note_att','meeting_att','email_att','file')),
	CONSTRAINT "ocr_texts_parent_chk" CHECK ("parent_type" in ('note','meeting','email','file')),
	CONSTRAINT "ocr_texts_status_chk" CHECK ("status" in ('done','skipped','failed')),
	CONSTRAINT "ocr_texts_len" CHECK (char_length("text") <= 200000 and char_length("error") <= 500)
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ocr_texts" ADD CONSTRAINT "ocr_texts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ocr_texts" ADD CONSTRAINT "ocr_texts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ocr_texts_parent_idx" ON "ocr_texts" USING btree ("parent_type", "parent_id");--> statement-breakpoint

-- ── work queue (embeddings + OCR) ───────────────────────────────────────────
-- Filled by triggers on the source tables (so every way an item changes is
-- covered) and drained by the worker, one job at a time. due_at debounces
-- edits (30 s after the last change); priority 1 = backfill / reindex.
CREATE TABLE IF NOT EXISTS "search_jobs" (
	"kind" text NOT NULL,
	"item_type" text NOT NULL,
	"item_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid,
	"priority" smallint DEFAULT 0 NOT NULL,
	"force" boolean DEFAULT false NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text DEFAULT '' NOT NULL,
	CONSTRAINT "search_jobs_pk" PRIMARY KEY ("kind", "item_type", "item_id"),
	CONSTRAINT "search_jobs_kind_chk" CHECK ("kind" in ('embed','ocr'))
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "search_jobs" ADD CONSTRAINT "search_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "search_jobs" ADD CONSTRAINT "search_jobs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_jobs_due_idx" ON "search_jobs" USING btree ("kind", "priority", "due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_jobs_owner_idx" ON "search_jobs" USING btree ("tenant_id", "owner_id");--> statement-breakpoint

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Reading mirrors the source item exactly: a vector (or OCR text) is visible
-- when its item is — EXISTS on the source table runs under that table's own
-- policies (owner, tenant-wide SAP library, shared folders when the request
-- turned the share scope on). Writing: the owner (the worker runs as the item's
-- owner), or anyone of the tenant for the tenant-wide items.
CREATE OR REPLACE FUNCTION kh_search_visible(p_type text, p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT CASE p_type
    WHEN 'note' THEN EXISTS (SELECT 1 FROM notes x WHERE x.id = p_id)
    WHEN 'meeting' THEN EXISTS (SELECT 1 FROM meetings x WHERE x.id = p_id)
    WHEN 'task' THEN EXISTS (SELECT 1 FROM tasks x WHERE x.id = p_id)
    WHEN 'issue' THEN EXISTS (SELECT 1 FROM issues x WHERE x.id = p_id)
    WHEN 'voice' THEN EXISTS (SELECT 1 FROM voice_notes x WHERE x.id = p_id)
    WHEN 'artifact' THEN EXISTS (SELECT 1 FROM artifacts x WHERE x.id = p_id)
    WHEN 'email' THEN EXISTS (SELECT 1 FROM emails x WHERE x.id = p_id)
    WHEN 'snippet' THEN EXISTS (SELECT 1 FROM snippets x WHERE x.id = p_id)
    WHEN 'code' THEN EXISTS (SELECT 1 FROM sap_objects x WHERE x.id = p_id)
    WHEN 'transport' THEN EXISTS (SELECT 1 FROM sap_transports x WHERE x.id = p_id)
    WHEN 'file' THEN EXISTS (SELECT 1 FROM drive_files x WHERE x.id = p_id)
    ELSE false END
$$;--> statement-breakpoint
ALTER TABLE "embeddings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ocr_texts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "search_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "embeddings_read" ON "embeddings";--> statement-breakpoint
CREATE POLICY "embeddings_read" ON "embeddings" FOR SELECT TO kh_app
  USING (kh_search_visible(item_type, item_id));--> statement-breakpoint
DROP POLICY IF EXISTS "embeddings_write" ON "embeddings";--> statement-breakpoint
CREATE POLICY "embeddings_write" ON "embeddings" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND (owner_id = kh_user_id() OR (owner_id IS NULL AND item_type IN ('code','transport'))))
  WITH CHECK (tenant_id = kh_tenant_id() AND (owner_id = kh_user_id() OR (owner_id IS NULL AND item_type IN ('code','transport'))));--> statement-breakpoint
DROP POLICY IF EXISTS "ocr_texts_read" ON "ocr_texts";--> statement-breakpoint
CREATE POLICY "ocr_texts_read" ON "ocr_texts" FOR SELECT TO kh_app
  USING (kh_search_visible(parent_type, parent_id));--> statement-breakpoint
DROP POLICY IF EXISTS "ocr_texts_owner" ON "ocr_texts";--> statement-breakpoint
CREATE POLICY "ocr_texts_owner" ON "ocr_texts" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint
-- the queue itself is only read for the status line (own jobs); the worker
-- claims and finishes jobs through the SECURITY DEFINER functions below
DROP POLICY IF EXISTS "search_jobs_owner" ON "search_jobs";--> statement-breakpoint
CREATE POLICY "search_jobs_owner" ON "search_jobs" FOR SELECT TO kh_app
  USING (tenant_id = kh_tenant_id() AND (owner_id = kh_user_id() OR owner_id IS NULL));--> statement-breakpoint

-- ── triggers: enqueue on change, clean up on hard delete ────────────────────
-- (SECURITY DEFINER: a shared-folder member editing someone else's note must
-- still enqueue it, under the note owner's id.)
CREATE OR REPLACE FUNCTION kh_search_item_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t text := TG_ARGV[0];
  own uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM embeddings WHERE item_type = t AND item_id = OLD.id;
    DELETE FROM search_jobs WHERE item_type = t AND item_id = OLD.id;
    IF t = 'file' THEN
      DELETE FROM ocr_texts WHERE src_type = 'file' AND src_id = OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  own := CASE WHEN t IN ('code','transport') THEN NULL ELSE (to_jsonb(NEW) ->> 'owner_id')::uuid END;
  IF TG_OP = 'UPDATE' AND (to_jsonb(OLD) ->> 'owner_id') IS DISTINCT FROM (to_jsonb(NEW) ->> 'owner_id') THEN
    -- moved to another owner: the old owner's vectors go, the new owner's are made
    DELETE FROM embeddings WHERE item_type = t AND item_id = NEW.id;
  END IF;
  INSERT INTO search_jobs (kind, item_type, item_id, tenant_id, owner_id, due_at)
    VALUES ('embed', t, NEW.id, NEW.tenant_id, own, now() + interval '30 seconds')
    ON CONFLICT (kind, item_type, item_id) DO UPDATE
      SET due_at = excluded.due_at, owner_id = excluded.owner_id, tenant_id = excluded.tenant_id,
          priority = 0, attempts = 0, last_error = '';
  RETURN NEW;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_search_item_changed() FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('notes','note'), ('meetings','meeting'), ('tasks','task'), ('issues','issue'),
    ('voice_notes','voice'), ('artifacts','artifact'), ('emails','email'), ('snippets','snippet'),
    ('sap_objects','code'), ('sap_transports','transport'), ('drive_files','file')) AS v(tbl, typ)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', r.tbl || '_search', r.tbl);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION kh_search_item_changed(%L)',
      r.tbl || '_search', r.tbl, r.typ);
  END LOOP;
END $$;--> statement-breakpoint

-- Is this attachment / file one OCR can read (images, PDFs)?
CREATE OR REPLACE FUNCTION kh_ocr_candidate(p_name text, p_mime text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(p_mime, '') ~* '^(image/(png|jpe?g|webp|gif|bmp|tiff)|application/pdf)$'
      OR coalesce(p_name, '') ~* '\.(png|jpe?g|webp|gif|bmp|tiff?|pdf)$'
$$;--> statement-breakpoint
-- New attachment / file → OCR job; removed → its text goes and the parent is re-embedded.
CREATE OR REPLACE FUNCTION kh_ocr_src_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  st text := TG_ARGV[0];
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM ocr_texts WHERE src_type = st AND src_id = OLD.id;
    DELETE FROM search_jobs WHERE kind = 'ocr' AND item_type = st AND item_id = OLD.id;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND (to_jsonb(OLD) ->> 'storage_key') IS NOT DISTINCT FROM (to_jsonb(NEW) ->> 'storage_key') THEN
    RETURN NEW;
  END IF;
  IF kh_ocr_candidate(to_jsonb(NEW) ->> 'name', to_jsonb(NEW) ->> 'mime') THEN
    INSERT INTO search_jobs (kind, item_type, item_id, tenant_id, owner_id, due_at)
      VALUES ('ocr', st, NEW.id, NEW.tenant_id, NEW.owner_id, now())
      ON CONFLICT (kind, item_type, item_id) DO UPDATE
        SET due_at = now(), owner_id = excluded.owner_id, attempts = 0, last_error = '';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_ocr_src_changed() FROM PUBLIC;--> statement-breakpoint
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('note_attachments','note_att'), ('meeting_attachments','meeting_att'),
    ('email_attachments','email_att'), ('drive_files','file')) AS v(tbl, typ)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', r.tbl || '_ocr', r.tbl);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION kh_ocr_src_changed(%L)',
      r.tbl || '_ocr', r.tbl, r.typ);
  END LOOP;
END $$;--> statement-breakpoint
-- Recognised text changed → the parent item is embedded again (with the text).
CREATE OR REPLACE FUNCTION kh_ocr_text_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  own uuid;
  ten uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  EXECUTE format('SELECT tenant_id, owner_id FROM %I WHERE id = $1',
    CASE r.parent_type WHEN 'note' THEN 'notes' WHEN 'meeting' THEN 'meetings'
                       WHEN 'email' THEN 'emails' ELSE 'drive_files' END)
    INTO ten, own USING r.parent_id;
  IF ten IS NOT NULL THEN
    INSERT INTO search_jobs (kind, item_type, item_id, tenant_id, owner_id, due_at)
      VALUES ('embed', r.parent_type, r.parent_id, ten, own, now() + interval '5 seconds')
      ON CONFLICT (kind, item_type, item_id) DO UPDATE SET due_at = excluded.due_at, attempts = 0;
  END IF;
  RETURN r;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_ocr_text_changed() FROM PUBLIC;--> statement-breakpoint
DROP TRIGGER IF EXISTS "ocr_texts_changed" ON "ocr_texts";--> statement-breakpoint
CREATE TRIGGER "ocr_texts_changed" AFTER INSERT OR UPDATE OF "text" OR DELETE ON "ocr_texts"
  FOR EACH ROW EXECUTE FUNCTION kh_ocr_text_changed();--> statement-breakpoint

-- ── worker side (no RLS context: claims across tenants) ─────────────────────
-- Claims up to p_limit due jobs of a kind for 10 minutes (another worker skips them).
CREATE OR REPLACE FUNCTION kh_search_claim(p_kind text, p_limit int)
RETURNS TABLE (item_type text, item_id uuid, tenant_id uuid, owner_id uuid, force boolean, due_at timestamptz, attempts smallint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE search_jobs j SET locked_until = now() + interval '10 minutes', attempts = j.attempts + 1
  WHERE (j.kind, j.item_type, j.item_id) IN (
    SELECT s.kind, s.item_type, s.item_id FROM search_jobs s
    WHERE s.kind = p_kind AND s.due_at <= now() AND (s.locked_until IS NULL OR s.locked_until < now())
    ORDER BY s.priority, s.due_at
    LIMIT greatest(1, least(p_limit, 50))
    FOR UPDATE SKIP LOCKED)
  RETURNING j.item_type, j.item_id, j.tenant_id, j.owner_id, j.force, j.due_at, j.attempts
$$;--> statement-breakpoint
-- Done: the job goes, unless the item changed again meanwhile (newer due_at → stays queued).
CREATE OR REPLACE FUNCTION kh_search_done(p_kind text, p_type text, p_id uuid, p_due timestamptz) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM search_jobs WHERE kind = p_kind AND item_type = p_type AND item_id = p_id AND due_at = p_due;
  UPDATE search_jobs SET locked_until = NULL, attempts = 0
    WHERE kind = p_kind AND item_type = p_type AND item_id = p_id;
$$;--> statement-breakpoint
-- Failed: retried later (1, 4, 9 min…); after p_max attempts the job is dropped.
CREATE OR REPLACE FUNCTION kh_search_failed(p_kind text, p_type text, p_id uuid, p_error text, p_max int) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n int;
BEGIN
  SELECT attempts INTO n FROM search_jobs WHERE kind = p_kind AND item_type = p_type AND item_id = p_id;
  IF n IS NULL THEN RETURN true; END IF;
  IF n >= p_max THEN
    DELETE FROM search_jobs WHERE kind = p_kind AND item_type = p_type AND item_id = p_id;
    RETURN true;
  END IF;
  UPDATE search_jobs SET locked_until = NULL, last_error = left(coalesce(p_error, ''), 500),
         due_at = now() + make_interval(mins => n * n)
    WHERE kind = p_kind AND item_type = p_type AND item_id = p_id;
  RETURN false;
END $$;--> statement-breakpoint
-- Backfill (worker start; resumable: only what has no vectors from this model /
-- no OCR result yet, at low priority; p_model NULL = no embeddings). Returns how
-- many jobs were added.
CREATE OR REPLACE FUNCTION kh_search_backfill(p_model text, p_ocr boolean) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  n int := 0;
  k int;
BEGIN
  IF p_model IS NOT NULL THEN
    FOR r IN SELECT * FROM (VALUES
      ('notes','note',true), ('meetings','meeting',true), ('tasks','task',true), ('issues','issue',true),
      ('voice_notes','voice',true), ('artifacts','artifact',true), ('emails','email',true),
      ('snippets','snippet',true), ('sap_objects','code',false), ('sap_transports','transport',false),
      ('drive_files','file',true)) AS v(tbl, typ, owned)
    LOOP
      EXECUTE format(
        'INSERT INTO search_jobs (kind, item_type, item_id, tenant_id, owner_id, priority)
         SELECT ''embed'', %L, s.id, s.tenant_id, %s, 1 FROM %I s
         WHERE s.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM embeddings e WHERE e.item_type = %L AND e.item_id = s.id AND e.model = $1)
         ON CONFLICT DO NOTHING',
        r.typ, CASE WHEN r.owned THEN 's.owner_id' ELSE 'NULL' END, r.tbl, r.typ)
        USING p_model;
      GET DIAGNOSTICS k = ROW_COUNT;
      n := n + k;
    END LOOP;
  END IF;
  IF p_ocr THEN
    FOR r IN SELECT * FROM (VALUES
      ('note_attachments','note_att'), ('meeting_attachments','meeting_att'),
      ('email_attachments','email_att'), ('drive_files','file')) AS v(tbl, typ)
    LOOP
      EXECUTE format(
        'INSERT INTO search_jobs (kind, item_type, item_id, tenant_id, owner_id, priority)
         SELECT ''ocr'', %L, s.id, s.tenant_id, s.owner_id, 1 FROM %I s
         WHERE kh_ocr_candidate(to_jsonb(s) ->> ''name'', to_jsonb(s) ->> ''mime'')
           AND NOT EXISTS (SELECT 1 FROM ocr_texts o WHERE o.src_type = %L AND o.src_id = s.id)
         ON CONFLICT DO NOTHING',
        r.typ, r.tbl, r.typ);
      GET DIAGNOSTICS k = ROW_COUNT;
      n := n + k;
    END LOOP;
  END IF;
  RETURN n;
END $$;--> statement-breakpoint
-- "Reindexar" (Definições › Assistente IA): every item of the caller again, ignoring hashes.
CREATE OR REPLACE FUNCTION kh_search_reindex() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  n int := 0;
  k int;
  me uuid := kh_user_id();
  ten uuid := kh_tenant_id();
BEGIN
  IF me IS NULL OR ten IS NULL THEN RETURN 0; END IF;
  FOR r IN SELECT * FROM (VALUES
    ('notes','note'), ('meetings','meeting'), ('tasks','task'), ('issues','issue'),
    ('voice_notes','voice'), ('artifacts','artifact'), ('emails','email'),
    ('snippets','snippet'), ('drive_files','file')) AS v(tbl, typ)
  LOOP
    EXECUTE format(
      'INSERT INTO search_jobs (kind, item_type, item_id, tenant_id, owner_id, priority, force)
       SELECT ''embed'', %L, s.id, s.tenant_id, s.owner_id, 1, true FROM %I s
       WHERE s.tenant_id = $1 AND s.owner_id = $2 AND s.deleted_at IS NULL
       ON CONFLICT (kind, item_type, item_id) DO UPDATE SET force = true, attempts = 0',
      r.typ, r.tbl) USING ten, me;
    GET DIAGNOSTICS k = ROW_COUNT;
    n := n + k;
  END LOOP;
  RETURN n;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_search_claim(text, int), kh_search_done(text, text, uuid, timestamptz),
  kh_search_failed(text, text, uuid, text, int), kh_search_backfill(text, boolean), kh_search_reindex() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_search_visible(text, uuid), kh_ocr_candidate(text, text),
  kh_search_claim(text, int), kh_search_done(text, text, uuid, timestamptz),
  kh_search_failed(text, text, uuid, text, int), kh_search_backfill(text, boolean), kh_search_reindex() TO kh_app;
