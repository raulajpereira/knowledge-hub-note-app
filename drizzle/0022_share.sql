CREATE TABLE "public_links" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"item_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_ct" text NOT NULL,
	"password_hash" text,
	"expires_on" date,
	"views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "public_links_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "public_links_type_chk" CHECK ("public_links"."item_type" in ('note','artifact'))
);
--> statement-breakpoint
CREATE TABLE "share_members" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"folder_id" uuid NOT NULL,
	"user_id" uuid,
	"email" "citext" NOT NULL,
	"perm" text DEFAULT 'read' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_members_perm_chk" CHECK ("share_members"."perm" in ('read','edit')),
	CONSTRAINT "share_members_status_chk" CHECK ("share_members"."status" in ('invited','active'))
);
--> statement-breakpoint
CREATE TABLE "share_people" (
	"owner_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"paused" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_folders" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"folder_id" uuid,
	"paused" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_folders_kind_chk" CHECK ("shared_folders"."kind" in ('notes','tasks','artifacts')),
	CONSTRAINT "shared_folders_name_len" CHECK (char_length("shared_folders"."name") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "shared_folder_id" uuid;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "shared_folder_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "shared_folder_id" uuid;--> statement-breakpoint
ALTER TABLE "public_links" ADD CONSTRAINT "public_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_links" ADD CONSTRAINT "public_links_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_members" ADD CONSTRAINT "share_members_folder_id_shared_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."shared_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_members" ADD CONSTRAINT "share_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_people" ADD CONSTRAINT "share_people_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_people" ADD CONSTRAINT "share_people_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_folders" ADD CONSTRAINT "shared_folders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_folders" ADD CONSTRAINT "shared_folders_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_folders" ADD CONSTRAINT "shared_folders_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "public_links_item_active" ON "public_links" USING btree ("owner_id","item_type","item_id") WHERE "public_links"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "share_members_folder_email" ON "share_members" USING btree ("folder_id","email");--> statement-breakpoint
CREATE INDEX "share_members_user_idx" ON "share_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "share_members_email_idx" ON "share_members" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "share_people_pk" ON "share_people" USING btree ("owner_id","email");--> statement-breakpoint
CREATE INDEX "shared_folders_owner_idx" ON "shared_folders" USING btree ("owner_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_folders_folder_uq" ON "shared_folders" USING btree ("folder_id");--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_shared_folder_id_shared_folders_id_fk" FOREIGN KEY ("shared_folder_id") REFERENCES "public"."shared_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_shared_folder_id_shared_folders_id_fk" FOREIGN KEY ("shared_folder_id") REFERENCES "public"."shared_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_shared_folder_id_shared_folders_id_fk" FOREIGN KEY ("shared_folder_id") REFERENCES "public"."shared_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- ── Sharing: RLS ────────────────────────────────────────────────────────────
-- Owner-only rows for the sharing tables themselves; members see the folders
-- and their own membership through kh_share_member(), a SECURITY DEFINER
-- helper (no policy recursion between shared_folders and share_members).
ALTER TABLE "public_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shared_folders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "share_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "share_people" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "public_links_owner" ON "public_links" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint
CREATE POLICY "share_people_owner" ON "share_people" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint
CREATE POLICY "shared_folders_owner" ON "shared_folders" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint

-- Is the current user an active, unpaused member of the folder (folder not paused,
-- person not paused by the owner)?
CREATE OR REPLACE FUNCTION kh_share_member(p_folder uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.perm FROM share_members m
  JOIN shared_folders sf ON sf.id = m.folder_id
  WHERE m.folder_id = p_folder AND m.user_id = kh_user_id() AND m.status = 'active'
    AND NOT m.paused AND NOT sf.paused
    AND NOT EXISTS (SELECT 1 FROM share_people sp WHERE sp.owner_id = sf.owner_id AND sp.email = m.email AND sp.paused)
  LIMIT 1
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_share_member(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_share_member(uuid) TO kh_app;--> statement-breakpoint
CREATE POLICY "shared_folders_member" ON "shared_folders" FOR SELECT TO kh_app
  USING (kh_share_member(id) IS NOT NULL);--> statement-breakpoint
CREATE POLICY "share_members_owner" ON "share_members" FOR ALL TO kh_app
  USING (EXISTS (SELECT 1 FROM shared_folders sf WHERE sf.id = folder_id AND sf.owner_id = kh_user_id() AND sf.tenant_id = kh_tenant_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM shared_folders sf WHERE sf.id = folder_id AND sf.owner_id = kh_user_id() AND sf.tenant_id = kh_tenant_id()));--> statement-breakpoint
CREATE POLICY "share_members_self" ON "share_members" FOR SELECT TO kh_app
  USING (user_id = kh_user_id());--> statement-breakpoint

-- Access of the current user to an item through sharing: 'edit' | 'read' | NULL.
-- The folder owner has 'edit' (items members create in it belong to them).
-- Only consulted when the request enabled the share scope (app.share = 'on'),
-- so lists, counts, calendar and search stay owner-only.
CREATE OR REPLACE FUNCTION kh_share_perm(p_kind text, p_sf uuid, p_folder uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r text;
BEGIN
  IF current_setting('app.share', true) IS DISTINCT FROM 'on' OR (p_sf IS NULL AND p_folder IS NULL) THEN
    RETURN NULL;
  END IF;
  SELECT CASE WHEN bool_or(sf.owner_id = kh_user_id()) OR bool_or(kh_share_member(sf.id) = 'edit') THEN 'edit'
              WHEN bool_or(kh_share_member(sf.id) = 'read') THEN 'read' END
    INTO r
    FROM shared_folders sf
   WHERE sf.kind = p_kind AND (sf.id = p_sf OR (p_folder IS NOT NULL AND sf.folder_id = p_folder));
  RETURN r;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_share_perm(text, uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_share_perm(text, uuid, uuid) TO kh_app;--> statement-breakpoint

CREATE POLICY "notes_shared_read" ON "notes" FOR SELECT TO kh_app
  USING (kh_share_perm('notes', shared_folder_id, folder_id) IS NOT NULL);--> statement-breakpoint
CREATE POLICY "notes_shared_edit" ON "notes" FOR UPDATE TO kh_app
  USING (kh_share_perm('notes', shared_folder_id, folder_id) = 'edit')
  WITH CHECK (kh_share_perm('notes', shared_folder_id, folder_id) = 'edit');--> statement-breakpoint
CREATE POLICY "note_attachments_shared" ON "note_attachments" FOR SELECT TO kh_app
  USING (EXISTS (SELECT 1 FROM notes n WHERE n.id = note_id));--> statement-breakpoint
CREATE POLICY "tasks_shared_read" ON "tasks" FOR SELECT TO kh_app
  USING (kh_share_perm('tasks', shared_folder_id, NULL) IS NOT NULL);--> statement-breakpoint
CREATE POLICY "tasks_shared_edit" ON "tasks" FOR UPDATE TO kh_app
  USING (kh_share_perm('tasks', shared_folder_id, NULL) = 'edit')
  WITH CHECK (kh_share_perm('tasks', shared_folder_id, NULL) = 'edit');--> statement-breakpoint
CREATE POLICY "task_subtasks_shared_read" ON "task_subtasks" FOR SELECT TO kh_app
  USING (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id));--> statement-breakpoint
CREATE POLICY "task_subtasks_shared_edit" ON "task_subtasks" FOR ALL TO kh_app
  USING (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND kh_share_perm('tasks', t.shared_folder_id, NULL) = 'edit'))
  WITH CHECK (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_id AND kh_share_perm('tasks', t.shared_folder_id, NULL) = 'edit'));--> statement-breakpoint
CREATE POLICY "artifacts_shared_read" ON "artifacts" FOR SELECT TO kh_app
  USING (kh_share_perm('artifacts', shared_folder_id, folder_id) IS NOT NULL);--> statement-breakpoint
CREATE POLICY "artifacts_shared_edit" ON "artifacts" FOR UPDATE TO kh_app
  USING (kh_share_perm('artifacts', shared_folder_id, folder_id) = 'edit')
  WITH CHECK (kh_share_perm('artifacts', shared_folder_id, folder_id) = 'edit');--> statement-breakpoint
CREATE POLICY "artifact_versions_shared_read" ON "artifact_versions" FOR SELECT TO kh_app
  USING (EXISTS (SELECT 1 FROM artifacts a WHERE a.id = artifact_id));--> statement-breakpoint
CREATE POLICY "artifact_versions_shared_edit" ON "artifact_versions" FOR INSERT TO kh_app
  WITH CHECK (EXISTS (SELECT 1 FROM artifacts a WHERE a.id = artifact_id AND kh_share_perm('artifacts', a.shared_folder_id, a.folder_id) = 'edit'));--> statement-breakpoint

-- An item can only be put in a shared folder its writer may edit (owner or 'edit' member).
CREATE OR REPLACE FUNCTION kh_item_shared_folder() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text := CASE TG_TABLE_NAME WHEN 'notes' THEN 'notes' WHEN 'tasks' THEN 'tasks' ELSE 'artifacts' END;
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
CREATE TRIGGER notes_shared_folder BEFORE INSERT OR UPDATE OF shared_folder_id ON "notes"
  FOR EACH ROW EXECUTE FUNCTION kh_item_shared_folder();--> statement-breakpoint
CREATE TRIGGER tasks_shared_folder BEFORE INSERT OR UPDATE OF shared_folder_id ON "tasks"
  FOR EACH ROW EXECUTE FUNCTION kh_item_shared_folder();--> statement-breakpoint
CREATE TRIGGER artifacts_shared_folder BEFORE INSERT OR UPDATE OF shared_folder_id ON "artifacts"
  FOR EACH ROW EXECUTE FUNCTION kh_item_shared_folder();--> statement-breakpoint
CREATE INDEX "notes_shared_folder_idx" ON "notes" ("shared_folder_id") WHERE "shared_folder_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tasks_shared_folder_idx" ON "tasks" ("shared_folder_id") WHERE "shared_folder_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "artifacts_shared_folder_idx" ON "artifacts" ("shared_folder_id") WHERE "shared_folder_id" IS NOT NULL;--> statement-breakpoint

-- Public links are opened without a session: look a link up by the hash of its token.
CREATE OR REPLACE FUNCTION kh_public_link(p_hash text)
RETURNS TABLE (id uuid, tenant_id uuid, owner_id uuid, item_type text, item_id uuid, password_hash text, expires_on date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.tenant_id, l.owner_id, l.item_type, l.item_id, l.password_hash, l.expires_on
    FROM public_links l WHERE l.token_hash = p_hash AND l.revoked_at IS NULL
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION kh_public_link_view(p_id uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  UPDATE public_links SET views = views + 1 WHERE id = p_id
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_public_link(text), kh_public_link_view(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_public_link(text), kh_public_link_view(uuid) TO kh_app;--> statement-breakpoint

-- Invitations: once an invited email has a (verified) account, its memberships become active.
CREATE OR REPLACE FUNCTION kh_share_bind(p_user uuid, p_email citext) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE share_members SET user_id = p_user, status = 'active'
   WHERE email = p_email AND (user_id IS NULL OR user_id = p_user);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_share_bind(uuid, citext) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_share_bind(uuid, citext) TO kh_app;--> statement-breakpoint
-- Is there a pending invitation for this email (registration without a code)?
CREATE OR REPLACE FUNCTION kh_share_invited(p_email citext) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM share_members WHERE email = p_email AND user_id IS NULL)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_share_invited(citext) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_share_invited(citext) TO kh_app;
