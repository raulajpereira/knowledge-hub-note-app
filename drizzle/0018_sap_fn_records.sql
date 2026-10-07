CREATE TABLE "sap_fn_records" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"page" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"st" text NOT NULL,
	"f" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "sap_fn_records_page_chk" CHECK ("sap_fn_records"."page" in ('fn_proc','fn_test','fn_mig','fn_cut')),
	CONSTRAINT "sap_fn_records_len" CHECK (char_length("sap_fn_records"."title") <= 300 and char_length("sap_fn_records"."code") <= 120 and pg_column_size("sap_fn_records"."f") + pg_column_size("sap_fn_records"."rows") <= 2000000)
);
--> statement-breakpoint
ALTER TABLE "sap_fn_records" ADD CONSTRAINT "sap_fn_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_fn_records" ADD CONSTRAINT "sap_fn_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sap_fn_records_tenant_idx" ON "sap_fn_records" USING btree ("tenant_id","page");--> statement-breakpoint
ALTER TABLE "sap_fn_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sap_fn_records_tenant" ON "sap_fn_records" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id()) WITH CHECK (tenant_id = kh_tenant_id());
