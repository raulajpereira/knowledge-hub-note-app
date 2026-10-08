CREATE TABLE "drive_files" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"folder_id" uuid,
	"shared_folder_id" uuid,
	"name" text NOT NULL,
	"mime" text DEFAULT 'application/octet-stream' NOT NULL,
	"size" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "drive_files_len" CHECK (char_length("drive_files"."name") between 1 and 255 and char_length("drive_files"."mime") <= 200 and "drive_files"."size" >= 0)
);
--> statement-breakpoint
ALTER TABLE "folders" DROP CONSTRAINT "folders_kind_chk";--> statement-breakpoint
ALTER TABLE "public_links" DROP CONSTRAINT "public_links_type_chk";--> statement-breakpoint
ALTER TABLE "shared_folders" DROP CONSTRAINT "shared_folders_kind_chk";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "files_quota_mb" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "files_max_mb" integer;--> statement-breakpoint
ALTER TABLE "drive_files" ADD CONSTRAINT "drive_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_files" ADD CONSTRAINT "drive_files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_files" ADD CONSTRAINT "drive_files_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_files" ADD CONSTRAINT "drive_files_shared_folder_id_shared_folders_id_fk" FOREIGN KEY ("shared_folder_id") REFERENCES "public"."shared_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drive_files_owner_idx" ON "drive_files" USING btree ("tenant_id","owner_id");--> statement-breakpoint
CREATE INDEX "drive_files_folder_idx" ON "drive_files" USING btree ("folder_id");--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_kind_chk" CHECK ("folders"."kind" in ('notes','tasks','artifacts','passwords','emails','api','files'));--> statement-breakpoint
ALTER TABLE "public_links" ADD CONSTRAINT "public_links_type_chk" CHECK ("public_links"."item_type" in ('note','artifact','file'));--> statement-breakpoint
ALTER TABLE "shared_folders" ADD CONSTRAINT "shared_folders_kind_chk" CHECK ("shared_folders"."kind" in ('notes','tasks','artifacts','files'));--> statement-breakpoint
ALTER TABLE "drive_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "drive_files_owner" ON "drive_files" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint
-- shared folders: members read (and 'edit' members rename/move) files of the folder
CREATE POLICY "drive_files_shared_read" ON "drive_files" FOR SELECT TO kh_app
  USING (kh_share_perm('files', shared_folder_id, folder_id) IS NOT NULL);--> statement-breakpoint
CREATE POLICY "drive_files_shared_edit" ON "drive_files" FOR UPDATE TO kh_app
  USING (kh_share_perm('files', shared_folder_id, folder_id) = 'edit')
  WITH CHECK (kh_share_perm('files', shared_folder_id, folder_id) = 'edit');--> statement-breakpoint
CREATE INDEX "drive_files_shared_folder_idx" ON "drive_files" ("shared_folder_id") WHERE "shared_folder_id" IS NOT NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION kh_item_shared_folder() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text := CASE TG_TABLE_NAME WHEN 'notes' THEN 'notes' WHEN 'tasks' THEN 'tasks'
                     WHEN 'drive_files' THEN 'files' ELSE 'artifacts' END;
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
CREATE TRIGGER drive_files_shared_folder BEFORE INSERT OR UPDATE OF shared_folder_id ON "drive_files"
  FOR EACH ROW EXECUTE FUNCTION kh_item_shared_folder();--> statement-breakpoint
-- the storage sweep keeps every object a row points to
CREATE OR REPLACE FUNCTION kh_storage_keys() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT storage_key FROM note_attachments
  UNION ALL SELECT storage_key FROM voice_notes
  UNION ALL SELECT file_key FROM emails
  UNION ALL SELECT storage_key FROM email_attachments
  UNION ALL SELECT storage_key FROM whiteboard_images
  UNION ALL SELECT storage_key FROM user_assets
  UNION ALL SELECT storage_key FROM drive_files
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_storage_keys() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_storage_keys() TO kh_app;--> statement-breakpoint
-- the new module, as for Atas de Reunião (0032): every package except FREE and
-- the individual one, and tenants with the whole Base group; the console decides after
INSERT INTO "modules" ("id", "grp", "label_pt", "label_en", "sort")
  VALUES ('files', 'base', 'Ficheiros', 'Files', 5)
  ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "plan_modules" ("plan_id", "module_id")
  SELECT "id", 'files' FROM "plans" WHERE "code" NOT IN ('FREE', 'CUSTOM')
  ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "tenant_modules" ("tenant_id", "module_id")
  SELECT "tenant_id", 'files' FROM "tenant_modules"
  WHERE "module_id" IN ('calendar', 'notes', 'voice', 'tasks')
  GROUP BY "tenant_id" HAVING count(*) = 4
  ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- what each person stores (Lixo included until it is emptied), for the console's user page
CREATE OR REPLACE FUNCTION kh_drive_usage(ids uuid[]) RETURNS TABLE (owner_id uuid, used bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT owner_id, coalesce(sum(size), 0)::bigint FROM drive_files WHERE owner_id = ANY(ids) GROUP BY owner_id
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_drive_usage(uuid[]) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_drive_usage(uuid[]) TO kh_app;
