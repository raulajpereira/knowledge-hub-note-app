-- Tickets (SAP › Tickets, new module `tickets`): tickets with the number the
-- person types (unique per owner, any case), notes as a document, parent
-- ticket typed by hand, client / responsible (a Management record or a name),
-- priority, a type from the owner's own list, status and dates; a history of
-- comments and changes; attachments kept only with the ticket (counted in the
-- uploader's space). In folders, shareable like Notes (RLS: owner + members of
-- a shared folder when the share scope is on). Idempotent: safe to run again.

-- ── Tables ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ticket_types" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_types_len" CHECK (char_length("ticket_types"."name") between 1 and 60)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tickets" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"folder_id" uuid,
	"shared_folder_id" uuid,
	"number" text NOT NULL,
	"summary" text NOT NULL,
	"notes_doc" jsonb,
	"notes_text" text DEFAULT '' NOT NULL,
	"parent_number" text DEFAULT '' NOT NULL,
	"parent_summary" text DEFAULT '' NOT NULL,
	"client_id" uuid,
	"client_name" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"type_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"responsible_id" uuid,
	"responsible_name" text DEFAULT '' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_on" date,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tickets_status_chk" CHECK ("tickets"."status" in ('open','progress','pending_customer','pending_vendor','on_hold','awaiting_info','resolved','closed','cancelled')),
	CONSTRAINT "tickets_priority_chk" CHECK ("tickets"."priority" in ('very_low','low','medium','high','very_high')),
	CONSTRAINT "tickets_len" CHECK (char_length("tickets"."number") between 1 and 40 and char_length("tickets"."summary") between 1 and 300 and char_length("tickets"."parent_number") <= 40 and char_length("tickets"."parent_summary") <= 300 and char_length("tickets"."client_name") <= 120 and char_length("tickets"."responsible_name") <= 120 and char_length("tickets"."notes_text") <= 200000 and coalesce(pg_column_size("tickets"."notes_doc"), 0) <= 1000000)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_events" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_value" text DEFAULT '' NOT NULL,
	"to_value" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"author_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_events_kind_chk" CHECK ("ticket_events"."kind" in ('created','comment','status','priority','responsible')),
	CONSTRAINT "ticket_events_len" CHECK (char_length("ticket_events"."body") <= 20000 and char_length("ticket_events"."from_value") <= 200 and char_length("ticket_events"."to_value") <= 200 and char_length("ticket_events"."author_name") <= 120)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_attachments" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime" text DEFAULT 'application/octet-stream' NOT NULL,
	"size" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"inline" boolean DEFAULT false NOT NULL,
	"author_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_attachments_len" CHECK (char_length("ticket_attachments"."name") between 1 and 255 and char_length("ticket_attachments"."mime") <= 200 and "ticket_attachments"."size" >= 0 and char_length("ticket_attachments"."author_name") <= 120)
);--> statement-breakpoint

-- ── Foreign keys ───────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_shared_folder_id_shared_folders_id_fk" FOREIGN KEY ("shared_folder_id") REFERENCES "public"."shared_folders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_client_id_mg_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mg_clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_type_id_ticket_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."ticket_types"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_responsible_id_mg_people_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."mg_people"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- ── Indexes ────────────────────────────────────────────────────────────────
-- one number per owner, any case (also while in the Trash: restore it instead)
CREATE UNIQUE INDEX IF NOT EXISTS "tickets_number_uq" ON "tickets" USING btree ("owner_id", lower("number"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_owner_idx" ON "tickets" USING btree ("tenant_id","owner_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_folder_idx" ON "tickets" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tickets_shared_folder_idx" ON "tickets" ("shared_folder_id") WHERE "shared_folder_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_types_name_uq" ON "ticket_types" USING btree ("owner_id", lower("name"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_events_ticket_idx" ON "ticket_events" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_attachments_ticket_idx" ON "ticket_attachments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_attachments_owner_idx" ON "ticket_attachments" USING btree ("owner_id");--> statement-breakpoint

-- ── Folders of kind 'tickets', shared folders of kind 'tickets' ───────────────
ALTER TABLE "folders" DROP CONSTRAINT IF EXISTS "folders_kind_chk";--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_kind_chk" CHECK ("folders"."kind" in ('notes','tasks','artifacts','passwords','emails','api','files','meetings','tickets'));--> statement-breakpoint
ALTER TABLE "shared_folders" DROP CONSTRAINT IF EXISTS "shared_folders_kind_chk";--> statement-breakpoint
ALTER TABLE "shared_folders" ADD CONSTRAINT "shared_folders_kind_chk" CHECK ("shared_folders"."kind" in ('notes','tasks','artifacts','files','tickets'));--> statement-breakpoint

-- ── RLS ────────────────────────────────────────────────────────────────────
-- tickets: the owner's own; members of a shared folder read ('edit': update)
-- through kh_share_perm() when the request turned the share scope on.
-- events / attachments: each row is its author's (their own tenant and id);
-- visible with the ticket; written only by someone who may edit the ticket.
-- types: the owner's; members of the owner's shared ticket folders read them.
ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ticket_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ticket_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tickets' AND policyname = 'tickets_owner') THEN
    CREATE POLICY "tickets_owner" ON "tickets" FOR ALL TO kh_app
      USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
      WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tickets' AND policyname = 'tickets_shared_read') THEN
    CREATE POLICY "tickets_shared_read" ON "tickets" FOR SELECT TO kh_app
      USING (kh_share_perm('tickets', shared_folder_id, folder_id) IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tickets' AND policyname = 'tickets_shared_edit') THEN
    CREATE POLICY "tickets_shared_edit" ON "tickets" FOR UPDATE TO kh_app
      USING (kh_share_perm('tickets', shared_folder_id, folder_id) = 'edit')
      WITH CHECK (kh_share_perm('tickets', shared_folder_id, folder_id) = 'edit');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ticket_types' AND policyname = 'ticket_types_owner') THEN
    CREATE POLICY "ticket_types_owner" ON "ticket_types" FOR ALL TO kh_app
      USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
      WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ticket_types' AND policyname = 'ticket_types_shared_read') THEN
    CREATE POLICY "ticket_types_shared_read" ON "ticket_types" FOR SELECT TO kh_app
      USING (current_setting('app.share', true) = 'on' AND EXISTS (
        SELECT 1 FROM shared_folders sf
         WHERE sf.owner_id = ticket_types.owner_id AND sf.kind = 'tickets' AND kh_share_member(sf.id) IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ticket_events' AND policyname = 'ticket_events_read') THEN
    CREATE POLICY "ticket_events_read" ON "ticket_events" FOR SELECT TO kh_app
      USING (EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ticket_events' AND policyname = 'ticket_events_write') THEN
    CREATE POLICY "ticket_events_write" ON "ticket_events" FOR INSERT TO kh_app
      WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id() AND EXISTS (
        SELECT 1 FROM tickets t WHERE t.id = ticket_id
           AND ((t.tenant_id = kh_tenant_id() AND t.owner_id = kh_user_id())
                OR kh_share_perm('tickets', t.shared_folder_id, t.folder_id) = 'edit')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ticket_events' AND policyname = 'ticket_events_delete') THEN
    CREATE POLICY "ticket_events_delete" ON "ticket_events" FOR DELETE TO kh_app
      USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id() AND kind = 'comment');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ticket_attachments' AND policyname = 'ticket_attachments_read') THEN
    CREATE POLICY "ticket_attachments_read" ON "ticket_attachments" FOR SELECT TO kh_app
      USING ((tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
             OR EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ticket_attachments' AND policyname = 'ticket_attachments_write') THEN
    CREATE POLICY "ticket_attachments_write" ON "ticket_attachments" FOR INSERT TO kh_app
      WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id() AND EXISTS (
        SELECT 1 FROM tickets t WHERE t.id = ticket_id
           AND ((t.tenant_id = kh_tenant_id() AND t.owner_id = kh_user_id())
                OR kh_share_perm('tickets', t.shared_folder_id, t.folder_id) = 'edit')));
  END IF;
  -- the uploader, or the ticket's owner
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ticket_attachments' AND policyname = 'ticket_attachments_delete') THEN
    CREATE POLICY "ticket_attachments_delete" ON "ticket_attachments" FOR DELETE TO kh_app
      USING ((tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
             OR EXISTS (SELECT 1 FROM tickets t WHERE t.id = ticket_id AND t.tenant_id = kh_tenant_id() AND t.owner_id = kh_user_id()));
  END IF;
END $$;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "tickets", "ticket_types", "ticket_events", "ticket_attachments" TO kh_app;--> statement-breakpoint

-- An item can only be put in a shared folder its writer may edit (now tickets too).
CREATE OR REPLACE FUNCTION kh_item_shared_folder() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text := CASE TG_TABLE_NAME WHEN 'notes' THEN 'notes' WHEN 'tasks' THEN 'tasks'
                     WHEN 'drive_files' THEN 'files' WHEN 'tickets' THEN 'tickets' ELSE 'artifacts' END;
BEGIN
  IF NEW.shared_folder_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.shared_folder_id IS DISTINCT FROM OLD.shared_folder_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM shared_folders sf
       WHERE sf.id = NEW.shared_folder_id AND sf.kind = k
         AND (sf.owner_id = kh_user_id() OR kh_share_member(sf.id) = 'edit')
    ) THEN
      RAISE EXCEPTION 'shared folder not writable' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "tickets_shared_folder" ON "tickets";--> statement-breakpoint
CREATE TRIGGER "tickets_shared_folder" BEFORE INSERT OR UPDATE OF shared_folder_id ON "tickets"
  FOR EACH ROW EXECUTE FUNCTION kh_item_shared_folder();--> statement-breakpoint

-- ── Storage: the sweep keeps ticket files; the console's usage counts them ───
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
  UNION ALL SELECT storage_key FROM ticket_attachments
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_storage_keys() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_storage_keys() TO kh_app;--> statement-breakpoint
CREATE OR REPLACE FUNCTION kh_drive_usage(ids uuid[]) RETURNS TABLE (owner_id uuid, used bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT x.owner_id, coalesce(sum(x.size), 0)::bigint FROM (
    SELECT owner_id, size FROM drive_files WHERE owner_id = ANY(ids)
    UNION ALL SELECT owner_id, size FROM ticket_attachments WHERE owner_id = ANY(ids)
  ) x GROUP BY x.owner_id
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_drive_usage(uuid[]) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_drive_usage(uuid[]) TO kh_app;--> statement-breakpoint
-- Images in the notes no longer in the document (a day after they were added),
-- as for meeting records; their files then go with the storage sweep.
CREATE OR REPLACE FUNCTION kh_prune_ticket_images() RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH gone AS (
    DELETE FROM ticket_attachments a
     WHERE a.inline AND a.created_at < now() - interval '1 day'
       AND NOT EXISTS (
         SELECT 1 FROM tickets t
          WHERE t.id = a.ticket_id AND position(a.id::text in coalesce(t.notes_doc::text, '')) > 0)
    RETURNING 1)
  SELECT count(*)::integer FROM gone
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_prune_ticket_images() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_prune_ticket_images() TO kh_app;--> statement-breakpoint

-- ── Search (assistant + meaning): tickets are a source like the others ──────
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
    WHEN 'ticket' THEN EXISTS (SELECT 1 FROM tickets x WHERE x.id = p_id)
    ELSE false END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "tickets_search" ON "tickets";--> statement-breakpoint
CREATE TRIGGER "tickets_search" AFTER INSERT OR UPDATE OR DELETE ON "tickets"
  FOR EACH ROW EXECUTE FUNCTION kh_search_item_changed('ticket');--> statement-breakpoint

-- ── The new module: in the catalogue (the seed keeps it updated), in every
-- package that has Ordens de Transporte, and for the tenants that have that
-- module of their own; the console decides from here on.
INSERT INTO "modules" ("id", "grp", "label_pt", "label_en", "sort")
  VALUES ('tickets', 'sap', 'Tickets', 'Tickets', 39)
  ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "plan_modules" ("plan_id", "module_id")
  SELECT "plan_id", 'tickets' FROM "plan_modules" WHERE "module_id" = 'transports'
  ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "tenant_modules" ("tenant_id", "module_id")
  SELECT "tenant_id", 'tickets' FROM "tenant_modules" WHERE "module_id" = 'transports'
  ON CONFLICT DO NOTHING;
