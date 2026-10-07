CREATE TABLE "api_envs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vars_ct" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_envs_name_len" CHECK (char_length("api_envs"."name") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "api_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"folder_id" uuid,
	"title" text NOT NULL,
	"method" text DEFAULT 'GET' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"params" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"headers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body_type" text DEFAULT 'none' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"auth_type" text DEFAULT 'none' NOT NULL,
	"auth_ct" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "api_requests_method_chk" CHECK ("api_requests"."method" in ('GET','POST','PUT','PATCH','DELETE')),
	CONSTRAINT "api_requests_body_chk" CHECK ("api_requests"."body_type" in ('none','json','form','xml','text')),
	CONSTRAINT "api_requests_auth_chk" CHECK ("api_requests"."auth_type" in ('none','basic','bearer')),
	CONSTRAINT "api_requests_len" CHECK (char_length("api_requests"."title") between 1 and 300 and char_length("api_requests"."url") <= 8000 and char_length("api_requests"."body") <= 1000000 and pg_column_size("api_requests"."params") <= 200000 and pg_column_size("api_requests"."headers") <= 200000)
);
--> statement-breakpoint
ALTER TABLE "api_envs" ADD CONSTRAINT "api_envs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_envs" ADD CONSTRAINT "api_envs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_requests" ADD CONSTRAINT "api_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_requests" ADD CONSTRAINT "api_requests_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_requests" ADD CONSTRAINT "api_requests_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_envs_owner_idx" ON "api_envs" USING btree ("tenant_id","owner_id");--> statement-breakpoint
CREATE INDEX "api_requests_owner_idx" ON "api_requests" USING btree ("tenant_id","owner_id");--> statement-breakpoint
ALTER TABLE "api_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_envs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "api_requests_owner" ON "api_requests" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint
CREATE POLICY "api_envs_owner" ON "api_envs" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());
