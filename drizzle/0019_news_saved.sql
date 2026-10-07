CREATE TABLE "news_saved" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"link" text NOT NULL,
	"item" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_saved_len" CHECK (char_length("news_saved"."link") <= 2000 and pg_column_size("news_saved"."item") <= 400000)
);
--> statement-breakpoint
ALTER TABLE "news_saved" ADD CONSTRAINT "news_saved_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_saved" ADD CONSTRAINT "news_saved_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "news_saved_owner_idx" ON "news_saved" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "news_saved_owner_link_uq" ON "news_saved" USING btree ("owner_id","link");--> statement-breakpoint
ALTER TABLE "news_saved" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "news_saved_owner" ON "news_saved" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());
