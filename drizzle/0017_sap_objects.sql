CREATE TABLE "sap_objects" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "sap_objects_type_chk" CHECK ("sap_objects"."type" in ('PROG','FUGR','CLAS','INTF','TABL','STRU','DTEL','DOMA','SNIP')),
	CONSTRAINT "sap_objects_len" CHECK (char_length("sap_objects"."name") <= 120 and char_length("sap_objects"."description") <= 500 and cardinality("sap_objects"."tags") <= 30 and pg_column_size("sap_objects"."nodes") <= 2000000)
);
--> statement-breakpoint
ALTER TABLE "sap_objects" ADD CONSTRAINT "sap_objects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_objects" ADD CONSTRAINT "sap_objects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sap_objects_tenant_idx" ON "sap_objects" USING btree ("tenant_id","type");--> statement-breakpoint
ALTER TABLE "sap_objects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sap_objects_tenant" ON "sap_objects" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id()) WITH CHECK (tenant_id = kh_tenant_id());
