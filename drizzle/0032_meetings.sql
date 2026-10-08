CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"held_on" date NOT NULL,
	"start_time" text DEFAULT '' NOT NULL,
	"end_time" text DEFAULT '' NOT NULL,
	"participants" text[] DEFAULT '{}'::text[] NOT NULL,
	"topics" text DEFAULT '' NOT NULL,
	"review" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"todos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "meetings_len" CHECK (char_length("meetings"."title") between 1 and 300 and char_length("meetings"."topics") <= 100000 and cardinality("meetings"."participants") <= 100 and pg_column_size("meetings"."review") <= 200000 and pg_column_size("meetings"."todos") <= 200000),
	CONSTRAINT "meetings_time_chk" CHECK ("meetings"."start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^$' and "meetings"."end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^$')
);
--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meetings_owner_idx" ON "meetings" USING btree ("tenant_id","owner_id","held_on");--> statement-breakpoint
ALTER TABLE "meetings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "meetings_owner" ON "meetings" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint
-- the new module: in the catalogue (the seed keeps it updated), in every
-- package except FREE and the individual package (the console changes it
-- from here on), and for tenants that have the whole Base group of their own
INSERT INTO "modules" ("id", "grp", "label_pt", "label_en", "sort")
  VALUES ('meetings', 'base', 'Atas de Reunião', 'Meeting Minutes', 4)
  ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "plan_modules" ("plan_id", "module_id")
  SELECT "id", 'meetings' FROM "plans" WHERE "code" NOT IN ('FREE', 'CUSTOM')
  ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "tenant_modules" ("tenant_id", "module_id")
  SELECT "tenant_id", 'meetings' FROM "tenant_modules"
  WHERE "module_id" IN ('calendar', 'notes', 'voice', 'tasks')
  GROUP BY "tenant_id" HAVING count(*) = 4
  ON CONFLICT DO NOTHING;
