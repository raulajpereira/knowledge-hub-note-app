-- "Orçamentos" (Management): each person's matrix + Excel model + mapping
-- (budget_settings) and their budgets. RLS: each person only their own. A new
-- console switch "mg_budget" in the Management group (on in every plan at
-- first, like mg_profit in 0058). Idempotent; nothing existing is changed.
CREATE TABLE IF NOT EXISTS "budget_settings" (
	"tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"owner_id" uuid PRIMARY KEY NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"matrix" jsonb NOT NULL,
	"template" bytea,
	"template_name" text DEFAULT '' NOT NULL,
	"template_size" integer DEFAULT 0 NOT NULL,
	"template_at" timestamp with time zone,
	"mapping" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_settings_len" CHECK (char_length("budget_settings"."template_name") <= 200 and "budget_settings"."template_size" <= 5242880)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "budgets" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"owner_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"ref" text NOT NULL,
	"client" text NOT NULL,
	"scenario" text NOT NULL,
	"modules" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_scenario_chk" CHECK ("budgets"."scenario" in ('gf','bf')),
	CONSTRAINT "budgets_len" CHECK (char_length("budgets"."client") between 1 and 200 and char_length("budgets"."ref") <= 40)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budgets_owner_idx" ON "budgets" USING btree ("tenant_id","owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "budgets_ref_uq" ON "budgets" USING btree ("owner_id","ref");--> statement-breakpoint
ALTER TABLE "budget_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'budget_settings' AND policyname = 'budget_settings_owner') THEN
    CREATE POLICY "budget_settings_owner" ON "budget_settings" FOR ALL TO kh_app
      USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
      WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'budgets' AND policyname = 'budgets_owner') THEN
    CREATE POLICY "budgets_owner" ON "budgets" FOR ALL TO kh_app
      USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
      WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());
  END IF;
END $$;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "budget_settings" TO kh_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "budgets" TO kh_app;--> statement-breakpoint
-- the console switch: on in every plan (CUSTOM tenants through tenant_modules)
INSERT INTO modules (id, grp, label_pt, label_en, sort) VALUES
  ('mg_budget', 'mgmt', 'Orçamentos', 'Budgets', 211)
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint
INSERT INTO "plan_modules" ("plan_id", "module_id")
SELECT p."id", 'mg_budget' FROM "plans" p WHERE p."code" <> 'CUSTOM'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "tenant_modules" ("tenant_id", "module_id")
SELECT t."id", 'mg_budget' FROM "tenants" t JOIN "plans" p ON p."id" = t."plan_id" WHERE p."code" = 'CUSTOM'
ON CONFLICT DO NOTHING;
