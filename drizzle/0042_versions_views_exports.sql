-- Note version history, saved views ("Vistas guardadas") and data exports
-- ("Exportar os meus dados"). Written by hand, idempotent.
CREATE TABLE IF NOT EXISTS "note_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"owner_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"note_id" uuid NOT NULL REFERENCES "public"."notes"("id") ON DELETE cascade,
	"author_id" uuid REFERENCES "public"."users"("id") ON DELETE set null,
	"title" text DEFAULT '' NOT NULL,
	"content" jsonb NOT NULL,
	"content_text" text DEFAULT '' NOT NULL,
	"chars" integer DEFAULT 0 NOT NULL,
	"reason" text DEFAULT 'auto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_versions_reason_chk" CHECK ("note_versions"."reason" in ('auto','restore')),
	CONSTRAINT "note_versions_len" CHECK (char_length("note_versions"."title") <= 300 and char_length("note_versions"."content_text") <= 200000)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "note_versions_note_idx" ON "note_versions" USING btree ("note_id","created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saved_views" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"owner_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_views_kind_chk" CHECK ("saved_views"."kind" in ('notes','tasks')),
	CONSTRAINT "saved_views_len" CHECK (char_length("saved_views"."name") between 1 and 60 and pg_column_size("saved_views"."filter") <= 8000)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "saved_views_owner_idx" ON "saved_views" USING btree ("tenant_id","owner_id","position");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_exports" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"owner_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"status" text DEFAULT 'pending' NOT NULL,
	"storage_key" text,
	"size" bigint,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "data_exports_status_chk" CHECK ("data_exports"."status" in ('pending','running','ready','failed','expired')),
	CONSTRAINT "data_exports_error_len" CHECK (char_length("data_exports"."error") <= 500)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_exports_owner_idx" ON "data_exports" USING btree ("tenant_id","owner_id","created_at");--> statement-breakpoint
ALTER TABLE "note_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "saved_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "data_exports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "note_versions", "saved_views", "data_exports" TO kh_app;--> statement-breakpoint
-- owner_id of a version is the note's owner (the history belongs to the note);
-- author_id is who was editing. Members of a shared folder read the history of
-- the notes they can see, and those with "edit" add versions (save/restore)
-- and trim the oldest ones. Members may be of another tenant: a version
-- carries the note's tenant, checked against the note itself.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'note_versions' AND policyname = 'note_versions_owner') THEN
    CREATE POLICY "note_versions_owner" ON "note_versions" FOR ALL TO kh_app
      USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
      WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());
  END IF;
  DROP POLICY IF EXISTS "note_versions_shared_read" ON "note_versions";
    CREATE POLICY "note_versions_shared_read" ON "note_versions" FOR SELECT TO kh_app
      USING (EXISTS (SELECT 1 FROM notes n WHERE n.id = note_id AND n.tenant_id = note_versions.tenant_id));
  DROP POLICY IF EXISTS "note_versions_shared_add" ON "note_versions";
    CREATE POLICY "note_versions_shared_add" ON "note_versions" FOR INSERT TO kh_app
      WITH CHECK (author_id = kh_user_id() AND EXISTS (
        SELECT 1 FROM notes n WHERE n.id = note_id AND n.owner_id = note_versions.owner_id
          AND n.tenant_id = note_versions.tenant_id
          AND kh_share_perm('notes', n.shared_folder_id, n.folder_id) = 'edit'));
  DROP POLICY IF EXISTS "note_versions_shared_trim" ON "note_versions";
    CREATE POLICY "note_versions_shared_trim" ON "note_versions" FOR DELETE TO kh_app
      USING (EXISTS (
        SELECT 1 FROM notes n WHERE n.id = note_id AND n.tenant_id = note_versions.tenant_id
          AND kh_share_perm('notes', n.shared_folder_id, n.folder_id) = 'edit'));
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saved_views' AND policyname = 'saved_views_owner') THEN
    CREATE POLICY "saved_views_owner" ON "saved_views" FOR ALL TO kh_app
      USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
      WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'data_exports' AND policyname = 'data_exports_owner') THEN
    CREATE POLICY "data_exports_owner" ON "data_exports" FOR ALL TO kh_app
      USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
      WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());
  END IF;
END $$;--> statement-breakpoint
-- Note images stay while an old version still shows them (restoring it brings
-- them back); they go with the note when it is purged from the Trash.
CREATE OR REPLACE FUNCTION kh_prune_note_attachments() RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH gone AS (
    DELETE FROM note_attachments a
     WHERE a.created_at < now() - interval '1 day'
       AND NOT EXISTS (
         SELECT 1 FROM notes n
          WHERE n.id = a.note_id AND position(a.id::text in n.content::text) > 0)
       AND NOT EXISTS (
         SELECT 1 FROM note_versions v
          WHERE v.note_id = a.note_id AND position(a.id::text in v.content::text) > 0)
    RETURNING 1)
  SELECT count(*)::integer FROM gone
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_prune_note_attachments() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_prune_note_attachments() TO kh_app;
--> statement-breakpoint
-- Daily cleanup of data exports, across people (the worker has no user scope):
-- ready ones past their expiry become "expired" and give back their file key
-- (deleted from the bucket by the job); ones stuck pending/running for a day
-- (worker restarted mid-way) are marked failed.
CREATE OR REPLACE FUNCTION kh_expire_exports(p_now timestamptz)
RETURNS TABLE (id uuid, storage_key text)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH due AS (
    SELECT e.id, e.storage_key, e.status FROM data_exports e
     WHERE (e.status = 'ready' AND e.expires_at < p_now)
        OR (e.status IN ('pending', 'running') AND e.created_at < p_now - interval '1 day')
     FOR UPDATE),
  upd AS (
    UPDATE data_exports d
       SET status = CASE WHEN due.status = 'ready' THEN 'expired' ELSE 'failed' END,
           storage_key = NULL,
           error = CASE WHEN due.status = 'ready' THEN d.error ELSE 'interrupted' END,
           finished_at = coalesce(d.finished_at, p_now)
      FROM due WHERE d.id = due.id
    RETURNING d.id)
  SELECT due.id, due.storage_key FROM due JOIN upd ON upd.id = due.id
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_expire_exports(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_expire_exports(timestamptz) TO kh_app;
