CREATE TABLE "snippets" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'snippet' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"fav" boolean DEFAULT false NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"files" jsonb NOT NULL,
	"related" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "snippets_len" CHECK (char_length("snippets"."title") between 1 and 300 and char_length("snippets"."description") <= 20000 and cardinality("snippets"."tags") <= 30 and cardinality("snippets"."related") <= 100 and pg_column_size("snippets"."files") <= 2000000)
);
--> statement-breakpoint
ALTER TABLE "snippets" ADD CONSTRAINT "snippets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snippets" ADD CONSTRAINT "snippets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "snippets_owner_idx" ON "snippets" USING btree ("tenant_id","owner_id");--> statement-breakpoint
ALTER TABLE "snippets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "snippets_owner" ON "snippets" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());
