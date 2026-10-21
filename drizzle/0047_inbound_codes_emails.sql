-- "Email para a app": codes the person chooses (kh.entrada+raulpereira@…),
-- old codes reserved for their last owner for 30 days, and a third target
-- "email" (the message is imported into Emails). Idempotent: safe to run twice.
--
-- The code after the "+" (notify_settings.inbound_token) is a random token or
-- a chosen code: lower case, letters / digits / . - _, 3–30 characters. It is
-- unique (index notify_settings_token, 0041). Every change of a code goes
-- through kh_inbound_set_code, which also records the old one here.
CREATE TABLE IF NOT EXISTS "inbound_released_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"released_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbound_released_code_chk" CHECK ("inbound_released_codes"."code" ~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$' and position('..' in "inbound_released_codes"."code") = 0)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "inbound_released_codes" ADD CONSTRAINT "inbound_released_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "inbound_released_codes" ADD CONSTRAINT "inbound_released_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbound_released_codes_user_idx" ON "inbound_released_codes" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "inbound_released_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- a person sees (only) their own reserved codes; writes go through kh_inbound_set_code
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inbound_released_codes' AND policyname = 'inbound_released_codes_owner') THEN
    CREATE POLICY "inbound_released_codes_owner" ON "inbound_released_codes" FOR SELECT TO kh_app
      USING (tenant_id = kh_tenant_id() AND user_id = kh_user_id());
  END IF;
END $$;--> statement-breakpoint
GRANT SELECT ON "inbound_released_codes" TO kh_app;--> statement-breakpoint
-- the stored code: lower case, the charset above (old random tokens already are)
DO $$ BEGIN
  ALTER TABLE "notify_settings" ADD CONSTRAINT "notify_settings_token_chk" CHECK ("notify_settings"."inbound_token" is null or ("notify_settings"."inbound_token" ~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$' and position('..' in "notify_settings"."inbound_token") = 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
-- target "email": into the Emails module, optionally into one of its folders
ALTER TABLE "notify_settings" ADD COLUMN IF NOT EXISTS "inbound_email_folder_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notify_settings" ADD CONSTRAINT "notify_settings_inbound_email_folder_id_folders_id_fk" FOREIGN KEY ("inbound_email_folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TABLE "notify_settings" DROP CONSTRAINT IF EXISTS "notify_settings_target_chk";--> statement-breakpoint
ALTER TABLE "notify_settings" ADD CONSTRAINT "notify_settings_target_chk" CHECK ("notify_settings"."inbound_target" in ('note','task','email'));--> statement-breakpoint
-- same signature as 0041: folder_id is the notebook for a note, the Emails folder for an email
CREATE OR REPLACE FUNCTION kh_inbound_resolve(p_token text)
RETURNS TABLE (user_id uuid, tenant_id uuid, enabled boolean, target text, folder_id uuid, task_type text,
               senders text[], email text, lang text, prefs jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.user_id, s.tenant_id, s.inbound_enabled, s.inbound_target,
         CASE WHEN s.inbound_target = 'email' THEN s.inbound_email_folder_id ELSE s.inbound_folder_id END,
         s.inbound_task_type, s.inbound_senders, u.email::text, u.lang, s.prefs
    FROM notify_settings s
    JOIN users u ON u.id = s.user_id
   WHERE s.inbound_token = lower(p_token) AND u.status = 'active'
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_inbound_resolve(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_inbound_resolve(text) TO kh_app;--> statement-breakpoint
-- May the current user take this code? Not when it is someone else's address,
-- or someone else moved away from it less than 30 days ago. Their own current
-- or reserved code is free for them. Says nothing about who has it.
CREATE OR REPLACE FUNCTION kh_inbound_code_free(p_code text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT kh_user_id() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM notify_settings s
                      WHERE s.inbound_token = lower(p_code) AND s.user_id <> kh_user_id())
     AND NOT EXISTS (SELECT 1 FROM inbound_released_codes r
                      WHERE r.code = lower(p_code) AND r.user_id <> kh_user_id()
                        AND r.released_at > now() - interval '30 days')
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_inbound_code_free(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_inbound_code_free(text) TO kh_app;--> statement-breakpoint
-- Gives the current user this code (their notify_settings row must exist).
-- False when it isn't free. The old code stops working at once and is kept
-- reserved for them for 30 days. The codes involved are locked (advisory, in
-- order) for the transaction, so two people saving the same code, or one
-- taking a code while its owner leaves it, are serialized: never a duplicate,
-- never a code that is both someone's address and someone else's reservation.
CREATE OR REPLACE FUNCTION kh_inbound_set_code(p_code text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := kh_user_id();
  tn uuid := kh_tenant_id();
  c text := lower(p_code);
  old text;
BEGIN
  IF me IS NULL OR tn IS NULL THEN RAISE EXCEPTION 'kh_inbound_set_code: no user'; END IF;
  SELECT s.inbound_token INTO old FROM notify_settings s WHERE s.user_id = me AND s.tenant_id = tn FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'kh_inbound_set_code: no settings row'; END IF;
  IF old IS NOT DISTINCT FROM c THEN RETURN true; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('kh_inbound_code:' || x, 0))
     FROM unnest(array_remove(ARRAY[c, old], NULL)) AS x ORDER BY x;
  IF NOT kh_inbound_code_free(c) THEN RETURN false; END IF;
  -- their own reservation of it, or an expired one of anybody
  DELETE FROM inbound_released_codes WHERE code = c;
  UPDATE notify_settings SET inbound_token = c, updated_at = now() WHERE user_id = me;
  IF old IS NOT NULL THEN
    INSERT INTO inbound_released_codes (code, user_id, tenant_id, released_at) VALUES (old, me, tn, now())
    ON CONFLICT (code) DO UPDATE SET user_id = excluded.user_id, tenant_id = excluded.tenant_id,
                                     released_at = excluded.released_at;
  END IF;
  RETURN true;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_inbound_set_code(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_inbound_set_code(text) TO kh_app;--> statement-breakpoint
-- Retention (daily job): reservations older than 30 days are free for anyone.
CREATE OR REPLACE FUNCTION kh_prune_inbound_codes() RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH gone AS (
    DELETE FROM inbound_released_codes WHERE released_at < now() - interval '30 days' RETURNING 1)
  SELECT count(*)::integer FROM gone
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_prune_inbound_codes() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_prune_inbound_codes() TO kh_app;
