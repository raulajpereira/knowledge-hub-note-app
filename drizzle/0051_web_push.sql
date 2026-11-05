-- Web Push (notificações no telemóvel / computador): one subscription per
-- browser of a person (Push API endpoint + keys), and when each notification
-- was pushed. The worker claims what is new every minute through SECURITY
-- DEFINER functions (it has no user context); everything else runs as the
-- person under RLS. Idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"device" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_ok_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_len" CHECK (char_length("endpoint") between 10 and 1000 and char_length("p256dh") between 20 and 200 and char_length("auth") between 8 and 100 and char_length("device") <= 120)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint" ON "push_subscriptions" ("endpoint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscriptions_user" ON "push_subscriptions" ("user_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'push_subscriptions_owner') THEN
    CREATE POLICY "push_subscriptions_owner" ON "push_subscriptions" FOR ALL TO kh_app
      USING (tenant_id = kh_tenant_id() AND user_id = kh_user_id())
      WITH CHECK (tenant_id = kh_tenant_id() AND user_id = kh_user_id());
  END IF;
END $$;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "push_subscriptions" TO kh_app;--> statement-breakpoint

-- what was already there when this arrived is never pushed
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "pushed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "notifications" SET "pushed_at" = now() WHERE "pushed_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_unpushed" ON "notifications" ("created_at") WHERE "pushed_at" IS NULL;--> statement-breakpoint

-- The worker: claims the notifications not pushed yet (only recent ones: an
-- old one is never sent late), with the person's language, for people that
-- have at least one subscription; the rest are just marked.
CREATE OR REPLACE FUNCTION kh_push_claim(p_max integer)
RETURNS TABLE (id uuid, user_id uuid, kind text, item_type text, item_id uuid, title text, meta jsonb, lang text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  UPDATE notifications n SET pushed_at = now()
   WHERE n.pushed_at IS NULL
     AND (n.created_at < now() - interval '15 minutes'
          OR NOT EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = n.user_id));
  RETURN QUERY
  WITH c AS (
    SELECT n.id FROM notifications n
     WHERE n.pushed_at IS NULL
     ORDER BY n.created_at
     LIMIT greatest(1, least(p_max, 500))
     FOR UPDATE SKIP LOCKED)
  UPDATE notifications n SET pushed_at = now()
    FROM c, users u
   WHERE n.id = c.id AND u.id = n.user_id
  RETURNING n.id, n.user_id, n.kind, n.item_type, n.item_id, n.title, n.meta, coalesce(u.lang, 'pt')::text;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_push_claim(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_push_claim(integer) TO kh_app;--> statement-breakpoint

CREATE OR REPLACE FUNCTION kh_push_targets(p_users uuid[])
RETURNS TABLE (id uuid, user_id uuid, endpoint text, p256dh text, auth text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.user_id, s.endpoint, s.p256dh, s.auth FROM push_subscriptions s WHERE s.user_id = ANY(p_users)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_push_targets(uuid[]) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_push_targets(uuid[]) TO kh_app;--> statement-breakpoint

-- after a send: gone (404 / 410 from the push service) or delivered
CREATE OR REPLACE FUNCTION kh_push_result(p_id uuid, p_ok boolean) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM push_subscriptions WHERE id = p_id AND NOT p_ok;
  UPDATE push_subscriptions SET last_ok_at = now() WHERE id = p_id AND p_ok;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_push_result(uuid, boolean) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_push_result(uuid, boolean) TO kh_app;
--> statement-breakpoint
-- Turning it on in a browser: that endpoint becomes the caller's (a browser
-- used before by someone else of any tenant stops getting their notifications).
CREATE OR REPLACE FUNCTION kh_push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_device text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF kh_user_id() IS NULL OR kh_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'no user';
  END IF;
  DELETE FROM push_subscriptions WHERE endpoint = p_endpoint AND user_id <> kh_user_id();
  INSERT INTO push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth, device)
  VALUES (kh_tenant_id(), kh_user_id(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_device, ''), 120))
  ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_push_subscribe(text, text, text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_push_subscribe(text, text, text, text) TO kh_app;
