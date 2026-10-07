CREATE TABLE "mg_clients" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'external' NOT NULL,
	"sector" text DEFAULT '' NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "mg_clients_len" CHECK (char_length("mg_clients"."name") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "sap_system_favs" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"system_id" uuid NOT NULL,
	CONSTRAINT "sap_system_favs_user_id_system_id_pk" PRIMARY KEY("user_id","system_id")
);
--> statement-breakpoint
CREATE TABLE "sap_systems" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid,
	"name" text NOT NULL,
	"sid" text DEFAULT '' NOT NULL,
	"env" text DEFAULT 'DEV' NOT NULL,
	"type" text DEFAULT '' NOT NULL,
	"host" text DEFAULT '' NOT NULL,
	"inst" text DEFAULT '00' NOT NULL,
	"mandt" text DEFAULT '100' NOT NULL,
	"router" text DEFAULT '' NOT NULL,
	"lang" text DEFAULT 'PT' NOT NULL,
	"sap_user" text DEFAULT '' NOT NULL,
	"fiori" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "sap_systems_env_chk" CHECK ("sap_systems"."env" in ('DEV','QAS','PRD')),
	CONSTRAINT "sap_systems_len" CHECK (char_length("sap_systems"."name") between 1 and 200 and char_length("sap_systems"."sid") <= 8 and char_length("sap_systems"."host") <= 255 and char_length("sap_systems"."router") <= 500 and char_length("sap_systems"."fiori") <= 2000 and char_length("sap_systems"."notes") <= 20000)
);
--> statement-breakpoint
CREATE TABLE "sap_tcode_usage" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"tcode_id" uuid NOT NULL,
	"fav" boolean DEFAULT false NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"last_used" timestamp with time zone,
	CONSTRAINT "sap_tcode_usage_user_id_tcode_id_pk" PRIMARY KEY("user_id","tcode_id")
);
--> statement-breakpoint
CREATE TABLE "sap_tcodes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"module" text DEFAULT 'BC' NOT NULL,
	"program" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'dialog' NOT NULL,
	"params" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "sap_tcodes_type_chk" CHECK ("sap_tcodes"."type" in ('dialog','report','param','variant','oo','area')),
	CONSTRAINT "sap_tcodes_len" CHECK (char_length("sap_tcodes"."code") <= 40 and char_length("sap_tcodes"."description") <= 300 and char_length("sap_tcodes"."program") <= 60 and char_length("sap_tcodes"."params") <= 1000 and char_length("sap_tcodes"."notes") <= 20000)
);
--> statement-breakpoint
ALTER TABLE "mg_clients" ADD CONSTRAINT "mg_clients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_system_favs" ADD CONSTRAINT "sap_system_favs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_system_favs" ADD CONSTRAINT "sap_system_favs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_system_favs" ADD CONSTRAINT "sap_system_favs_system_id_sap_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."sap_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_systems" ADD CONSTRAINT "sap_systems_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_systems" ADD CONSTRAINT "sap_systems_client_id_mg_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mg_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_systems" ADD CONSTRAINT "sap_systems_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_tcode_usage" ADD CONSTRAINT "sap_tcode_usage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_tcode_usage" ADD CONSTRAINT "sap_tcode_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_tcode_usage" ADD CONSTRAINT "sap_tcode_usage_tcode_id_sap_tcodes_id_fk" FOREIGN KEY ("tcode_id") REFERENCES "public"."sap_tcodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_tcodes" ADD CONSTRAINT "sap_tcodes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mg_clients_tenant_idx" ON "mg_clients" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "sap_systems_tenant_idx" ON "sap_systems" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "sap_tcodes_tenant_idx" ON "sap_tcodes" USING btree ("tenant_id");--> statement-breakpoint
-- Tenant-shared tables: every member of the tenant sees and edits them.
ALTER TABLE "mg_clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "mg_clients_tenant" ON "mg_clients" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id()) WITH CHECK (tenant_id = kh_tenant_id());--> statement-breakpoint
ALTER TABLE "sap_systems" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sap_systems_tenant" ON "sap_systems" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id()) WITH CHECK (tenant_id = kh_tenant_id());--> statement-breakpoint
ALTER TABLE "sap_tcodes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sap_tcodes_tenant" ON "sap_tcodes" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id()) WITH CHECK (tenant_id = kh_tenant_id());--> statement-breakpoint
-- Per-user rows: only the user's own.
ALTER TABLE "sap_system_favs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sap_system_favs_owner" ON "sap_system_favs" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND user_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND user_id = kh_user_id());--> statement-breakpoint
ALTER TABLE "sap_tcode_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sap_tcode_usage_owner" ON "sap_tcode_usage" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND user_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND user_id = kh_user_id());
