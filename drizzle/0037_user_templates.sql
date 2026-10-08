CREATE TABLE "user_templates" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_templates_kind_chk" CHECK ("user_templates"."kind" in ('meeting','fn_proc','fn_test','fn_mig','fn_cut','project')),
	CONSTRAINT "user_templates_name_len" CHECK (char_length("user_templates"."name") between 1 and 120),
	CONSTRAINT "user_templates_body_size" CHECK (pg_column_size("user_templates"."body") <= 1048576)
);
--> statement-breakpoint
ALTER TABLE "user_templates" ADD CONSTRAINT "user_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_templates" ADD CONSTRAINT "user_templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_templates_owner_idx" ON "user_templates" USING btree ("tenant_id","owner_id","kind");--> statement-breakpoint
ALTER TABLE "user_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "user_templates_owner" ON "user_templates" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());
