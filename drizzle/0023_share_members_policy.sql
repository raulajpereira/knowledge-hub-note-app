-- 0022's share_members_owner compared sf.id with the unqualified folder_id,
-- which resolved to shared_folders.folder_id: no owner could add members.
DROP POLICY IF EXISTS "share_members_owner" ON "share_members";--> statement-breakpoint
CREATE POLICY "share_members_owner" ON "share_members" FOR ALL TO kh_app
  USING (EXISTS (SELECT 1 FROM shared_folders sf WHERE sf.id = share_members.folder_id AND sf.owner_id = kh_user_id() AND sf.tenant_id = kh_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM shared_folders sf WHERE sf.id = share_members.folder_id AND sf.owner_id = kh_user_id() AND sf.tenant_id = kh_tenant_id()));
