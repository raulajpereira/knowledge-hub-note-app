CREATE TABLE "sap_transports" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"trkorr" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"client_id" uuid,
	"project_id" uuid,
	"system_id" uuid,
	"type" text DEFAULT 'W' NOT NULL,
	"owner" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"released_at" timestamp with time zone,
	"qas_at" timestamp with time zone,
	"prd_at" timestamp with time zone,
	"junk_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "sap_transports_type_chk" CHECK ("sap_transports"."type" in ('W','C')),
	CONSTRAINT "sap_transports_len" CHECK (char_length("sap_transports"."trkorr") <= 20 and char_length("sap_transports"."description") <= 500 and char_length("sap_transports"."owner") <= 40 and char_length("sap_transports"."notes") <= 20000)
);
--> statement-breakpoint
ALTER TABLE "sap_transports" ADD CONSTRAINT "sap_transports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_transports" ADD CONSTRAINT "sap_transports_client_id_mg_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mg_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_transports" ADD CONSTRAINT "sap_transports_system_id_sap_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."sap_systems"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_transports" ADD CONSTRAINT "sap_transports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sap_transports_tenant_idx" ON "sap_transports" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "sap_transports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sap_transports_tenant" ON "sap_transports" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id()) WITH CHECK (tenant_id = kh_tenant_id());
