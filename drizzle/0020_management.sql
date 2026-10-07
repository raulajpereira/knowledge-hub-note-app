CREATE TABLE "mg_allocs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"hours" double precision NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mg_people" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"team_id" uuid,
	"name" text NOT NULL,
	"area" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"level" integer NOT NULL,
	"cost" double precision DEFAULT 0 NOT NULL,
	"rate" double precision DEFAULT 0 NOT NULL,
	"cap" double precision DEFAULT 40 NOT NULL,
	"loc" text DEFAULT '' NOT NULL,
	"since" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"av" text NOT NULL,
	"skills" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mg_projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"team_id" uuid,
	"code" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"client_id" uuid,
	"budget" double precision DEFAULT 0 NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"color" text NOT NULL,
	"status" text NOT NULL,
	"manager_id" uuid,
	"phases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mg_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"team_id" uuid,
	"project_id" uuid,
	"skills" jsonb NOT NULL,
	"hours" double precision,
	"max_cost" double precision,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"status" text NOT NULL,
	"assigned_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mg_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mg_teams" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"areas" text[] DEFAULT '{}'::text[] NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" text NOT NULL,
	"target" integer,
	"lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mg_timesheets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"week" date NOT NULL,
	"status" text NOT NULL,
	"rows" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mg_allocs" ADD CONSTRAINT "mg_allocs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mg_allocs" ADD CONSTRAINT "mg_allocs_person_id_mg_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."mg_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mg_allocs" ADD CONSTRAINT "mg_allocs_project_id_mg_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."mg_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mg_people" ADD CONSTRAINT "mg_people_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mg_people" ADD CONSTRAINT "mg_people_team_id_mg_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mg_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mg_projects" ADD CONSTRAINT "mg_projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mg_projects" ADD CONSTRAINT "mg_projects_team_id_mg_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mg_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mg_projects" ADD CONSTRAINT "mg_projects_client_id_mg_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mg_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mg_projects" ADD CONSTRAINT "mg_projects_manager_id_mg_people_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."mg_people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mg_requests" ADD CONSTRAINT "mg_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mg_requests" ADD CONSTRAINT "mg_requests_team_id_mg_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."mg_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mg_requests" ADD CONSTRAINT "mg_requests_project_id_mg_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."mg_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mg_requests" ADD CONSTRAINT "mg_requests_assigned_id_mg_people_id_fk" FOREIGN KEY ("assigned_id") REFERENCES "public"."mg_people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mg_settings" ADD CONSTRAINT "mg_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mg_teams" ADD CONSTRAINT "mg_teams_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mg_timesheets" ADD CONSTRAINT "mg_timesheets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mg_timesheets" ADD CONSTRAINT "mg_timesheets_person_id_mg_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."mg_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mg_allocs_tenant_idx" ON "mg_allocs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mg_allocs_person_idx" ON "mg_allocs" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "mg_people_tenant_idx" ON "mg_people" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mg_projects_tenant_idx" ON "mg_projects" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mg_requests_tenant_idx" ON "mg_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mg_teams_tenant_idx" ON "mg_teams" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mg_timesheets_tenant_idx" ON "mg_timesheets" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mg_timesheets_person_week_uq" ON "mg_timesheets" USING btree ("person_id","week");--> statement-breakpoint
ALTER TABLE "mg_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "mg_settings_tenant" ON "mg_settings" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id()) WITH CHECK (tenant_id = kh_tenant_id());
--> statement-breakpoint
ALTER TABLE "mg_teams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "mg_teams_tenant" ON "mg_teams" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id()) WITH CHECK (tenant_id = kh_tenant_id());
--> statement-breakpoint
ALTER TABLE "mg_people" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "mg_people_tenant" ON "mg_people" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id()) WITH CHECK (tenant_id = kh_tenant_id());
--> statement-breakpoint
ALTER TABLE "mg_projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "mg_projects_tenant" ON "mg_projects" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id()) WITH CHECK (tenant_id = kh_tenant_id());
--> statement-breakpoint
ALTER TABLE "mg_allocs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "mg_allocs_tenant" ON "mg_allocs" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id()) WITH CHECK (tenant_id = kh_tenant_id());
--> statement-breakpoint
ALTER TABLE "mg_timesheets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "mg_timesheets_tenant" ON "mg_timesheets" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id()) WITH CHECK (tenant_id = kh_tenant_id());
--> statement-breakpoint
ALTER TABLE "mg_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "mg_requests_tenant" ON "mg_requests" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id()) WITH CHECK (tenant_id = kh_tenant_id());
