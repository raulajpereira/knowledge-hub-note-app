CREATE TABLE "meeting_attachments" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"meeting_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_attachments_mime_chk" CHECK ("meeting_attachments"."mime" in ('image/png','image/jpeg','image/webp','image/gif'))
);
--> statement-breakpoint
ALTER TABLE "share_members" DROP CONSTRAINT "share_members_status_chk";--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "topics_doc" jsonb;--> statement-breakpoint
ALTER TABLE "meeting_attachments" ADD CONSTRAINT "meeting_attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attachments" ADD CONSTRAINT "meeting_attachments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attachments" ADD CONSTRAINT "meeting_attachments_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_attachments_meeting_idx" ON "meeting_attachments" USING btree ("meeting_id");--> statement-breakpoint
ALTER TABLE "share_members" ADD CONSTRAINT "share_members_status_chk" CHECK ("share_members"."status" in ('invited','pending','active'));--> statement-breakpoint
ALTER TABLE "meeting_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "meeting_attachments_owner" ON "meeting_attachments" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint
-- the storage sweep keeps meeting images too
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
$$;--> statement-breakpoint
-- Images nothing points to any more (a day after they were added), as for notes:
-- meeting images no longer in the topics, whiteboard images no longer on the board.
CREATE OR REPLACE FUNCTION kh_prune_meeting_attachments() RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH gone AS (
    DELETE FROM meeting_attachments a
     WHERE a.created_at < now() - interval '1 day'
       AND NOT EXISTS (
         SELECT 1 FROM meetings m
          WHERE m.id = a.meeting_id AND position(a.id::text in coalesce(m.topics_doc::text, '')) > 0)
    RETURNING 1)
  SELECT count(*)::integer FROM gone
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_prune_meeting_attachments() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_prune_meeting_attachments() TO kh_app;--> statement-breakpoint
CREATE OR REPLACE FUNCTION kh_prune_whiteboard_images() RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH gone AS (
    DELETE FROM whiteboard_images i
     WHERE i.created_at < now() - interval '1 day'
       AND NOT EXISTS (
         SELECT 1 FROM whiteboards b
          WHERE b.id = i.board_id AND position(i.id::text in b.doc::text) > 0)
    RETURNING 1)
  SELECT count(*)::integer FROM gone
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_prune_whiteboard_images() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_prune_whiteboard_images() TO kh_app;--> statement-breakpoint
-- Sharing with an existing account now waits for the person to accept
-- ('pending'). Binding a new account to its invitations only touches the
-- invitations made before it existed (user_id still empty).
CREATE OR REPLACE FUNCTION kh_share_bind(p_user uuid, p_email citext) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE share_members SET user_id = p_user, status = 'active'
   WHERE email = p_email AND user_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;--> statement-breakpoint
-- The invitations waiting for the current user: folder, kind and who shares it.
CREATE OR REPLACE FUNCTION kh_share_invites()
RETURNS TABLE (id uuid, folder_id uuid, folder_name text, kind text, perm text, owner_name text, invited_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, sf.id, sf.name, sf.kind, m.perm, u.name, m.invited_at
    FROM share_members m
    JOIN shared_folders sf ON sf.id = m.folder_id
    JOIN users u ON u.id = sf.owner_id
   WHERE m.user_id = kh_user_id() AND m.status = 'pending'
   ORDER BY m.invited_at DESC
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_share_invites() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_share_invites() TO kh_app;--> statement-breakpoint
-- Accept (→ active) or decline (row removed) one of the current user's invitations.
CREATE OR REPLACE FUNCTION kh_share_answer(p_member uuid, p_accept boolean) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF p_accept THEN
    UPDATE share_members SET status = 'active'
     WHERE id = p_member AND user_id = kh_user_id() AND status = 'pending';
  ELSE
    DELETE FROM share_members
     WHERE id = p_member AND user_id = kh_user_id() AND status = 'pending';
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_share_answer(uuid, boolean) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_share_answer(uuid, boolean) TO kh_app;--> statement-breakpoint
-- Extra guards in the database (not only in the app):
-- a shared folder can only point at one of its owner's own folders…
CREATE OR REPLACE FUNCTION kh_shared_folder_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.folder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM folders f WHERE f.id = NEW.folder_id AND f.owner_id = NEW.owner_id AND f.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'folder not owned' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER shared_folders_folder_owner BEFORE INSERT OR UPDATE OF folder_id, owner_id ON "shared_folders"
  FOR EACH ROW EXECUTE FUNCTION kh_shared_folder_owner();--> statement-breakpoint
-- …and an item edited through a shared folder never changes owner or tenant.
CREATE OR REPLACE FUNCTION kh_pin_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'owner and tenant are fixed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER notes_pin_owner BEFORE UPDATE OF owner_id, tenant_id ON "notes"
  FOR EACH ROW EXECUTE FUNCTION kh_pin_owner();--> statement-breakpoint
CREATE TRIGGER tasks_pin_owner BEFORE UPDATE OF owner_id, tenant_id ON "tasks"
  FOR EACH ROW EXECUTE FUNCTION kh_pin_owner();--> statement-breakpoint
CREATE TRIGGER artifacts_pin_owner BEFORE UPDATE OF owner_id, tenant_id ON "artifacts"
  FOR EACH ROW EXECUTE FUNCTION kh_pin_owner();--> statement-breakpoint
CREATE TRIGGER drive_files_pin_owner BEFORE UPDATE OF owner_id, tenant_id ON "drive_files"
  FOR EACH ROW EXECUTE FUNCTION kh_pin_owner();
