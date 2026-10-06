-- Row Level Security for tenant content (D12). The app connects as kh_app,
-- which is neither owner nor BYPASSRLS, so these policies always apply:
-- a row is visible/writable only inside its tenant AND by its owner (the
-- values withTenant() sets per transaction). Shared folders (Phase 9) add
-- policies for members on top of these.
ALTER TABLE "folders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "note_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "item_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "folders_owner" ON "folders" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint
CREATE POLICY "notes_owner" ON "notes" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint
CREATE POLICY "note_attachments_owner" ON "note_attachments" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint
CREATE POLICY "item_links_owner" ON "item_links" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint
-- A note can only sit in a folder of the same owner (cross-row check RLS can't express).
CREATE OR REPLACE FUNCTION kh_note_folder_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.folder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM folders f WHERE f.id = NEW.folder_id AND f.owner_id = NEW.owner_id AND f.tenant_id = NEW.tenant_id AND f.kind = 'notes'
  ) THEN
    RAISE EXCEPTION 'folder not owned' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER notes_folder_owner BEFORE INSERT OR UPDATE OF folder_id ON "notes"
  FOR EACH ROW EXECUTE FUNCTION kh_note_folder_owner();
