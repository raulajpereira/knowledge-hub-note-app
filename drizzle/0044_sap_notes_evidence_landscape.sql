-- SAP batch C: Notas SAP (new module `sapnotes`), test evidence per step
-- (Funcional › Testes), the landscape map (role + track + transport target on
-- systems) and nothing for the cutover dependencies (they live in the rows
-- of the cutover record, validated by the service). Idempotent: safe to run again.

-- ── Systems: role, landscape/track, transport target ─────────────────────────
ALTER TABLE "sap_systems" ADD COLUMN IF NOT EXISTS "track" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sap_systems" ADD COLUMN IF NOT EXISTS "next_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sap_systems" ADD CONSTRAINT "sap_systems_next_id_sap_systems_id_fk" FOREIGN KEY ("next_id") REFERENCES "public"."sap_systems"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
-- role: DEV / QAS / PRD plus sandbox and other
ALTER TABLE "sap_systems" DROP CONSTRAINT IF EXISTS "sap_systems_env_chk";--> statement-breakpoint
ALTER TABLE "sap_systems" ADD CONSTRAINT "sap_systems_env_chk" CHECK ("sap_systems"."env" in ('DEV','QAS','PRD','SBX','OTH'));--> statement-breakpoint
ALTER TABLE "sap_systems" DROP CONSTRAINT IF EXISTS "sap_systems_track_chk";--> statement-breakpoint
ALTER TABLE "sap_systems" ADD CONSTRAINT "sap_systems_track_chk" CHECK (char_length("sap_systems"."track") <= 60 and ("sap_systems"."next_id" is null or "sap_systems"."next_id" <> "sap_systems"."id"));--> statement-breakpoint

-- ── Notas SAP ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "sap_notes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"component" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT '' NOT NULL,
	"released_on" date,
	"validity" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"impl" text[] DEFAULT '{}'::text[] NOT NULL,
	"prereqs" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"project_id" uuid,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"body" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "sap_notes_number_chk" CHECK ("sap_notes"."number" between 1 and 99999999 and "sap_notes"."version" between 1 and 9999),
	CONSTRAINT "sap_notes_category_chk" CHECK ("sap_notes"."category" in ('','fix','consult','legal','perf','security','doc','other')),
	CONSTRAINT "sap_notes_priority_chk" CHECK ("sap_notes"."priority" in ('','hot','high','medium','low','info')),
	CONSTRAINT "sap_notes_impl_chk" CHECK ("sap_notes"."impl" <@ ARRAY['snote','manual','sp']::text[]),
	CONSTRAINT "sap_notes_len" CHECK (char_length("sap_notes"."title") <= 300 and char_length("sap_notes"."component") <= 40 and cardinality("sap_notes"."tags") <= 30 and cardinality("sap_notes"."prereqs") <= 50 and pg_column_size("sap_notes"."validity") <= 20000 and coalesce(pg_column_size("sap_notes"."body"), 0) <= 1000000)
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sap_notes" ADD CONSTRAINT "sap_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sap_notes" ADD CONSTRAINT "sap_notes_project_id_mg_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."mg_projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sap_notes" ADD CONSTRAINT "sap_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
-- one note number per tenant (also while it is in the Trash: restore it instead)
CREATE UNIQUE INDEX IF NOT EXISTS "sap_notes_number_uq" ON "sap_notes" USING btree ("tenant_id","number");--> statement-breakpoint

-- status of a note in each system of the landscape
CREATE TABLE IF NOT EXISTS "sap_note_systems" (
	"tenant_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"system_id" uuid NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"impl_on" date,
	"transport_id" uuid,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sap_note_systems_pk" PRIMARY KEY("note_id","system_id"),
	CONSTRAINT "sap_note_systems_status_chk" CHECK ("sap_note_systems"."status" in ('new','nrel','todo','done','obs'))
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sap_note_systems" ADD CONSTRAINT "sap_note_systems_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sap_note_systems" ADD CONSTRAINT "sap_note_systems_note_id_sap_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."sap_notes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sap_note_systems" ADD CONSTRAINT "sap_note_systems_system_id_sap_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."sap_systems"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sap_note_systems" ADD CONSTRAINT "sap_note_systems_transport_id_sap_transports_id_fk" FOREIGN KEY ("transport_id") REFERENCES "public"."sap_transports"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sap_note_systems" ADD CONSTRAINT "sap_note_systems_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sap_note_systems_system_idx" ON "sap_note_systems" USING btree ("system_id");--> statement-breakpoint

-- transports related to a note
CREATE TABLE IF NOT EXISTS "sap_note_transports" (
	"tenant_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"transport_id" uuid NOT NULL,
	CONSTRAINT "sap_note_transports_pk" PRIMARY KEY("note_id","transport_id")
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sap_note_transports" ADD CONSTRAINT "sap_note_transports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sap_note_transports" ADD CONSTRAINT "sap_note_transports_note_id_sap_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."sap_notes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sap_note_transports" ADD CONSTRAINT "sap_note_transports_transport_id_sap_transports_id_fk" FOREIGN KEY ("transport_id") REFERENCES "public"."sap_transports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sap_note_transports_tr_idx" ON "sap_note_transports" USING btree ("transport_id");--> statement-breakpoint

-- ── Test evidence (Funcional › Testes): files per step ───────────────────────
CREATE TABLE IF NOT EXISTS "sap_fn_evidence" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"record_id" uuid NOT NULL,
	"row_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sap_fn_evidence_len" CHECK (char_length("sap_fn_evidence"."row_id") between 1 and 16 and char_length("sap_fn_evidence"."name") <= 200 and "sap_fn_evidence"."size" between 1 and 10485760)
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sap_fn_evidence" ADD CONSTRAINT "sap_fn_evidence_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sap_fn_evidence" ADD CONSTRAINT "sap_fn_evidence_record_id_sap_fn_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."sap_fn_records"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sap_fn_evidence" ADD CONSTRAINT "sap_fn_evidence_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sap_fn_evidence_record_idx" ON "sap_fn_evidence" USING btree ("record_id","row_id");--> statement-breakpoint

-- ── RLS: tenant-shared, like the other SAP data (D40) ─────────────────────────
ALTER TABLE "sap_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sap_note_systems" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sap_note_transports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sap_fn_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sap_notes' AND policyname = 'sap_notes_tenant') THEN
    CREATE POLICY "sap_notes_tenant" ON "sap_notes" FOR ALL TO kh_app
      USING (tenant_id = kh_tenant_id()) WITH CHECK (tenant_id = kh_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sap_note_systems' AND policyname = 'sap_note_systems_tenant') THEN
    CREATE POLICY "sap_note_systems_tenant" ON "sap_note_systems" FOR ALL TO kh_app
      USING (tenant_id = kh_tenant_id()) WITH CHECK (tenant_id = kh_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sap_note_transports' AND policyname = 'sap_note_transports_tenant') THEN
    CREATE POLICY "sap_note_transports_tenant" ON "sap_note_transports" FOR ALL TO kh_app
      USING (tenant_id = kh_tenant_id()) WITH CHECK (tenant_id = kh_tenant_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sap_fn_evidence' AND policyname = 'sap_fn_evidence_tenant') THEN
    CREATE POLICY "sap_fn_evidence_tenant" ON "sap_fn_evidence" FOR ALL TO kh_app
      USING (tenant_id = kh_tenant_id()) WITH CHECK (tenant_id = kh_tenant_id());
  END IF;
END $$;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "sap_notes", "sap_note_systems", "sap_note_transports", "sap_fn_evidence" TO kh_app;--> statement-breakpoint

-- ── Storage: the sweep keeps test evidence; evidence of removed steps is pruned ──
CREATE OR REPLACE FUNCTION kh_storage_keys() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT storage_key FROM note_attachments
  UNION ALL SELECT storage_key FROM meeting_attachments
  UNION ALL SELECT storage_key FROM voice_notes
  UNION ALL SELECT file_key FROM emails
  UNION ALL SELECT storage_key FROM email_attachments
  UNION ALL SELECT storage_key FROM whiteboard_images
  UNION ALL SELECT storage_key FROM user_assets
  UNION ALL SELECT storage_key FROM drive_files
  UNION ALL SELECT photo_key FROM mg_people WHERE photo_key IS NOT NULL
  UNION ALL SELECT storage_key FROM sap_fn_evidence
$$;--> statement-breakpoint
-- Evidence whose step was removed from the test case (a day after it was
-- added, as for note images); its file then goes with the storage sweep.
CREATE OR REPLACE FUNCTION kh_prune_fn_evidence() RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH gone AS (
    DELETE FROM sap_fn_evidence e
     WHERE e.created_at < now() - interval '1 day'
       AND NOT EXISTS (
         SELECT 1 FROM sap_fn_records r
          WHERE r.id = e.record_id AND r.rows @> jsonb_build_array(jsonb_build_object('id', e.row_id)))
    RETURNING 1)
  SELECT count(*)::integer FROM gone
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_prune_fn_evidence() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_prune_fn_evidence() TO kh_app;--> statement-breakpoint

-- ── The new module: in the catalogue (the seed keeps it updated), in every
-- package that has Ordens de Transporte, and for the tenants that have that
-- module of their own; the console decides from here on.
INSERT INTO "modules" ("id", "grp", "label_pt", "label_en", "sort")
  VALUES ('sapnotes', 'sap', 'Notas SAP', 'SAP Notes', 38)
  ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "plan_modules" ("plan_id", "module_id")
  SELECT "plan_id", 'sapnotes' FROM "plan_modules" WHERE "module_id" = 'transports'
  ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "tenant_modules" ("tenant_id", "module_id")
  SELECT "tenant_id", 'sapnotes' FROM "tenant_modules" WHERE "module_id" = 'transports'
  ON CONFLICT DO NOTHING;
