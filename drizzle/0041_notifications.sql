-- Notification centre (header bell), task reminders, notification settings
-- and "Email para a app" (inbound email). Idempotent: safe to run twice.
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"item_type" text DEFAULT '' NOT NULL,
	"item_id" uuid,
	"title" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_len" CHECK (char_length("notifications"."title") <= 300 and char_length("notifications"."dedupe_key") <= 200)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notify_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tz" text DEFAULT 'Europe/Lisbon' NOT NULL,
	"summary_sent_on" date,
	"inbound_token" text,
	"inbound_enabled" boolean DEFAULT false NOT NULL,
	"inbound_target" text DEFAULT 'note' NOT NULL,
	"inbound_folder_id" uuid,
	"inbound_task_type" text DEFAULT 'tech' NOT NULL,
	"inbound_senders" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notify_settings_target_chk" CHECK ("notify_settings"."inbound_target" in ('note','task')),
	CONSTRAINT "notify_settings_type_chk" CHECK ("notify_settings"."inbound_task_type" in ('tech','mgmt')),
	CONSTRAINT "notify_settings_len" CHECK (char_length("notify_settings"."tz") <= 64 and cardinality("notify_settings"."inbound_senders") <= 20 and pg_column_size("notify_settings"."prefs") <= 4096)
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "remind" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "remind_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_remind_chk" CHECK ("tasks"."remind" in ('none','due','day_before','custom'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notify_settings" ADD CONSTRAINT "notify_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notify_settings" ADD CONSTRAINT "notify_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notify_settings" ADD CONSTRAINT "notify_settings_inbound_folder_id_folders_id_fk" FOREIGN KEY ("inbound_folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedupe" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notify_settings_token" ON "notify_settings" USING btree ("inbound_token");--> statement-breakpoint
-- the reminder scan: open tasks with a reminder
CREATE INDEX IF NOT EXISTS "tasks_remind_idx" ON "tasks" USING btree ("tenant_id","owner_id") WHERE "remind" <> 'none' AND "done_at" IS NULL AND "deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notify_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'notifications_owner') THEN
    CREATE POLICY "notifications_owner" ON "notifications" FOR ALL TO kh_app
      USING (tenant_id = kh_tenant_id() AND user_id = kh_user_id())
      WITH CHECK (tenant_id = kh_tenant_id() AND user_id = kh_user_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notify_settings' AND policyname = 'notify_settings_owner') THEN
    CREATE POLICY "notify_settings_owner" ON "notify_settings" FOR ALL TO kh_app
      USING (tenant_id = kh_tenant_id() AND user_id = kh_user_id())
      WITH CHECK (tenant_id = kh_tenant_id() AND user_id = kh_user_id());
  END IF;
END $$;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "notifications", "notify_settings" TO kh_app;--> statement-breakpoint
-- Inbound email: who an address token belongs to. Knowing the token is what
-- grants the lookup (it is the secret part of the address); nothing else is
-- reachable through it.
CREATE OR REPLACE FUNCTION kh_inbound_resolve(p_token text)
RETURNS TABLE (user_id uuid, tenant_id uuid, enabled boolean, target text, folder_id uuid, task_type text,
               senders text[], email text, lang text, prefs jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.user_id, s.tenant_id, s.inbound_enabled, s.inbound_target, s.inbound_folder_id, s.inbound_task_type,
         s.inbound_senders, u.email::text, u.lang, s.prefs
    FROM notify_settings s
    JOIN users u ON u.id = s.user_id
   WHERE s.inbound_token = lower(p_token) AND u.status = 'active'
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_inbound_resolve(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_inbound_resolve(text) TO kh_app;--> statement-breakpoint
-- "X aceitou o seu convite": written for the folder's owner when the current
-- user accepts. Only the person who accepted can trigger it, once per membership.
CREATE OR REPLACE FUNCTION kh_notify_share_accepted(p_member uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO notifications (tenant_id, user_id, kind, item_type, item_id, title, meta, dedupe_key)
  SELECT sf.tenant_id, sf.owner_id, 'share_accepted', 'share', sf.id, left(sf.name, 300),
         jsonb_build_object('who', left(u.name, 120), 'kind', sf.kind),
         'share_accepted:' || m.id::text
    FROM share_members m
    JOIN shared_folders sf ON sf.id = m.folder_id
    JOIN users u ON u.id = m.user_id
    LEFT JOIN notify_settings ns ON ns.user_id = sf.owner_id
   WHERE m.id = p_member AND m.user_id = kh_user_id() AND m.status = 'active'
     AND coalesce((ns.prefs->>'shares')::boolean, true)
  ON CONFLICT (user_id, dedupe_key) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_notify_share_accepted(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_notify_share_accepted(uuid) TO kh_app;--> statement-breakpoint
-- Retention (daily job): read notifications go after 30 days, all after 90.
CREATE OR REPLACE FUNCTION kh_prune_notifications() RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH gone AS (
    DELETE FROM notifications
     WHERE (read_at IS NOT NULL AND read_at < now() - interval '30 days')
        OR created_at < now() - interval '90 days'
    RETURNING 1)
  SELECT count(*)::integer FROM gone
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_prune_notifications() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_prune_notifications() TO kh_app;
