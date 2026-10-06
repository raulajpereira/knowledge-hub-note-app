CREATE TABLE "vault_items" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"ciphertext" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vault_items_ct_len" CHECK (char_length("vault_items"."ciphertext") <= 90000)
);
--> statement-breakpoint
CREATE TABLE "vault_keys" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kdf_salt" text NOT NULL,
	"kdf_params" jsonb NOT NULL,
	"dek_wrapped_mp" text NOT NULL,
	"dek_wrapped_rk" text,
	"rk_fingerprint" text,
	"rk_created_at" timestamp with time zone,
	"meta_ct" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vault_items" ADD CONSTRAINT "vault_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_items" ADD CONSTRAINT "vault_items_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_keys" ADD CONSTRAINT "vault_keys_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_keys" ADD CONSTRAINT "vault_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vault_items_owner_idx" ON "vault_items" USING btree ("tenant_id","owner_id");--> statement-breakpoint
ALTER TABLE "vault_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vault_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "vault_keys_owner" ON "vault_keys" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint
CREATE POLICY "vault_items_owner" ON "vault_items" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());
