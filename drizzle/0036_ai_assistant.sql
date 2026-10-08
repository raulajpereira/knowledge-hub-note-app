CREATE TABLE "ai_chats" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_chats_title_len" CHECK (char_length("ai_chats"."title") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"chat_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_messages_role_chk" CHECK ("ai_messages"."role" in ('user','assistant')),
	CONSTRAINT "ai_messages_len" CHECK (char_length("ai_messages"."content") <= 200000)
);
--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"key_ct" text NOT NULL,
	"key_hint" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_settings_len" CHECK (char_length("ai_settings"."model") <= 200 and char_length("ai_settings"."provider") <= 40)
);
--> statement-breakpoint
ALTER TABLE "ai_chats" ADD CONSTRAINT "ai_chats_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chats" ADD CONSTRAINT "ai_chats_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_chat_id_ai_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."ai_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_chats_owner_idx" ON "ai_chats" USING btree ("tenant_id","owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "ai_messages_chat_idx" ON "ai_messages" USING btree ("chat_id","created_at");--> statement-breakpoint
ALTER TABLE "ai_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_settings_owner" ON "ai_settings" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint
ALTER TABLE "ai_chats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_chats_owner" ON "ai_chats" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint
ALTER TABLE "ai_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_messages_owner" ON "ai_messages" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint
-- the new module, as for Registos Reuniões: every package except FREE and the
-- individual one, and the tenants that already have Partilha; the console decides after
INSERT INTO "modules" ("id", "grp", "label_pt", "label_en", "sort")
  VALUES ('ai', 'feat', 'Assistente IA', 'AI Assistant', 3)
  ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "plan_modules" ("plan_id", "module_id")
  SELECT "id", 'ai' FROM "plans" WHERE "code" NOT IN ('FREE', 'CUSTOM')
  ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "tenant_modules" ("tenant_id", "module_id")
  SELECT "tenant_id", 'ai' FROM "tenant_modules" WHERE "module_id" = 'share'
  ON CONFLICT DO NOTHING;
