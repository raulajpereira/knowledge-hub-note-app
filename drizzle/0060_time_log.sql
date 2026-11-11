-- "Registo de Tempos" (registo de horas): the person's time entries, a new
-- console switch "timelog" (on in every plan at first, like 0058) and RLS
-- (each person only their own). Idempotent; nothing existing is changed.
CREATE TABLE IF NOT EXISTS "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
	"owner_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
	"ref_kind" text,
	"ref_id" uuid,
	"ref_label" text DEFAULT '' NOT NULL,
	"client_id" uuid,
	"client_label" text DEFAULT '' NOT NULL,
	"project_id" uuid,
	"project_label" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"minutes" integer,
	"in_timesheet" boolean DEFAULT true NOT NULL,
	"ts_applied" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entries_ref_chk" CHECK ("time_entries"."ref_kind" is null or "time_entries"."ref_kind" in ('ticket','issue')),
	CONSTRAINT "time_entries_len" CHECK (char_length("time_entries"."ref_label") <= 200 and char_length("time_entries"."client_label") <= 200 and char_length("time_entries"."project_label") <= 200 and char_length("time_entries"."description") <= 4000),
	CONSTRAINT "time_entries_range_chk" CHECK ("time_entries"."ended_at" is null or "time_entries"."ended_at" >= "time_entries"."started_at")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_entries_owner_idx" ON "time_entries" USING btree ("tenant_id","owner_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "time_entries_running_uq" ON "time_entries" USING btree ("owner_id") WHERE "ended_at" is null and "deleted_at" is null;--> statement-breakpoint
ALTER TABLE "time_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'time_entries' AND policyname = 'time_entries_owner') THEN
    CREATE POLICY "time_entries_owner" ON "time_entries" FOR ALL TO kh_app
      USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
      WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());
  END IF;
END $$;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "time_entries" TO kh_app;--> statement-breakpoint
-- the console switch: on in every plan (CUSTOM tenants through tenant_modules)
INSERT INTO modules (id, grp, label_pt, label_en, sort) VALUES
  ('timelog', 'feat', 'Registo de Tempos', 'Time log', 210)
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint
INSERT INTO "plan_modules" ("plan_id", "module_id")
SELECT p."id", 'timelog' FROM "plans" p WHERE p."code" <> 'CUSTOM'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "tenant_modules" ("tenant_id", "module_id")
SELECT t."id", 'timelog' FROM "tenants" t JOIN "plans" p ON p."id" = t."plan_id" WHERE p."code" = 'CUSTOM'
ON CONFLICT DO NOTHING;
