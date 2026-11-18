-- "Helpdesk" (SAP): a helpdesk page's tickets read by the browser extension
-- (helpdesk_sources / helpdesk_items / helpdesk_changes, each person only
-- their own) and the extension's own sign-in: a session with scope 'ext' that
-- only reaches the extension's routes. A new console switch "helpdesk" in the
-- SAP group, on in the plans (and CUSTOM tenants) that have Tickets.
-- Idempotent; nothing existing is changed (sessions get a column, default 'app').
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "scope" text DEFAULT 'app' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_scope_chk') THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_scope_chk" CHECK ("scope" in ('app','ext'));
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "helpdesk_sources" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"owner_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"interval_min" integer DEFAULT 15 NOT NULL,
	"on_missing" text DEFAULT 'notify' NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"snapshot" jsonb,
	"active" boolean DEFAULT false NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"sync_requested_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "helpdesk_sources_chk" CHECK (char_length("helpdesk_sources"."name") between 1 and 120 and char_length("helpdesk_sources"."url") between 1 and 2000 and "helpdesk_sources"."interval_min" in (5,15,30,60) and "helpdesk_sources"."on_missing" in ('notify','nothing'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "helpdesk_sources_url_uq" ON "helpdesk_sources" USING btree ("owner_id","url");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "helpdesk_items" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"owner_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"source_id" uuid NOT NULL REFERENCES "public"."helpdesk_sources"("id") ON DELETE cascade,
	"number" text NOT NULL,
	"summary" text NOT NULL,
	"parent" text DEFAULT '' NOT NULL,
	"assignee" text DEFAULT '' NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT '' NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"client" text DEFAULT '' NOT NULL,
	"reported_by" text DEFAULT '' NOT NULL,
	"reported_at" text DEFAULT '' NOT NULL,
	"comment_by" text DEFAULT '' NOT NULL,
	"comment_at" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"cells" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"in_list" boolean DEFAULT true NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"gone_at" timestamp with time zone,
	"ticket_id" uuid REFERENCES "public"."tickets"("id") ON DELETE set null,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "helpdesk_items_number_uq" ON "helpdesk_items" USING btree ("source_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "helpdesk_items_owner_idx" ON "helpdesk_items" USING btree ("tenant_id","owner_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "helpdesk_changes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"owner_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"source_id" uuid NOT NULL REFERENCES "public"."helpdesk_sources"("id") ON DELETE cascade,
	"item_id" uuid NOT NULL REFERENCES "public"."helpdesk_items"("id") ON DELETE cascade,
	"number" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"field" text DEFAULT '' NOT NULL,
	"from_value" text DEFAULT '' NOT NULL,
	"to_value" text DEFAULT '' NOT NULL,
	"sync_at" timestamp with time zone NOT NULL,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "helpdesk_changes_kind_chk" CHECK ("helpdesk_changes"."kind" in ('new','field','comment','gone','back'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "helpdesk_changes_owner_idx" ON "helpdesk_changes" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "helpdesk_changes_item_idx" ON "helpdesk_changes" USING btree ("item_id","created_at");--> statement-breakpoint
ALTER TABLE "helpdesk_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "helpdesk_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "helpdesk_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['helpdesk_sources','helpdesk_items','helpdesk_changes'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_owner') THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO kh_app USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id()) WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())', t || '_owner', t);
    END IF;
  END LOOP;
END $$;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "helpdesk_sources", "helpdesk_items", "helpdesk_changes" TO kh_app;--> statement-breakpoint
-- the console switch, in the SAP group: on where Tickets is (plans; CUSTOM tenants)
INSERT INTO modules (id, grp, label_pt, label_en, sort) VALUES
  ('helpdesk', 'sap', 'Helpdesk', 'Helpdesk', 40)
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint
INSERT INTO "plan_modules" ("plan_id", "module_id")
SELECT pm."plan_id", 'helpdesk' FROM "plan_modules" pm WHERE pm."module_id" = 'tickets'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "tenant_modules" ("tenant_id", "module_id")
SELECT tm."tenant_id", 'helpdesk' FROM "tenant_modules" tm WHERE tm."module_id" = 'tickets'
ON CONFLICT DO NOTHING;
