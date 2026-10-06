CREATE TABLE "email_attachments" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"email_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	CONSTRAINT "email_attachments_name_len" CHECK (char_length("email_attachments"."name") <= 300)
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"folder_id" uuid,
	"subject" text DEFAULT '' NOT NULL,
	"from_name" text DEFAULT '' NOT NULL,
	"from_email" text DEFAULT '' NOT NULL,
	"to_addr" text DEFAULT '' NOT NULL,
	"cc" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone,
	"body_text" text DEFAULT '' NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"starred" boolean DEFAULT false NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"file_key" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "emails_len" CHECK (char_length("emails"."subject") <= 1000 and char_length("emails"."from_name") <= 300 and char_length("emails"."from_email") <= 320 and char_length("emails"."to_addr") <= 20000 and char_length("emails"."cc") <= 20000 and char_length("emails"."notes") <= 20000 and char_length("emails"."file_name") <= 300),
	CONSTRAINT "emails_body_len" CHECK (char_length("emails"."body_text") <= 1000000 and char_length("emails"."body_html") <= 8000000)
);
--> statement-breakpoint
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_attachments_email_idx" ON "email_attachments" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "emails_owner_idx" ON "emails" USING btree ("tenant_id","owner_id","sent_at");--> statement-breakpoint
ALTER TABLE "emails" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "email_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "emails_owner" ON "emails" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint
CREATE POLICY "email_attachments_owner" ON "email_attachments" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());
