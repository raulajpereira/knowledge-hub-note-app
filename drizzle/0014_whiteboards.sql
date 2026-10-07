CREATE TABLE "whiteboard_images" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whiteboard_images_mime_chk" CHECK ("whiteboard_images"."mime" in ('image/png','image/jpeg','image/webp','image/gif'))
);
--> statement-breakpoint
CREATE TABLE "whiteboards" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"doc" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "whiteboards_len" CHECK (char_length("whiteboards"."name") <= 200 and pg_column_size("whiteboards"."doc") <= 3000000)
);
--> statement-breakpoint
ALTER TABLE "whiteboard_images" ADD CONSTRAINT "whiteboard_images_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard_images" ADD CONSTRAINT "whiteboard_images_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboard_images" ADD CONSTRAINT "whiteboard_images_board_id_whiteboards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."whiteboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboards" ADD CONSTRAINT "whiteboards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whiteboards" ADD CONSTRAINT "whiteboards_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whiteboard_images_board_idx" ON "whiteboard_images" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "whiteboards_owner_idx" ON "whiteboards" USING btree ("tenant_id","owner_id");--> statement-breakpoint
ALTER TABLE "whiteboards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "whiteboards_owner" ON "whiteboards" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());--> statement-breakpoint
ALTER TABLE "whiteboard_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "whiteboard_images_owner" ON "whiteboard_images" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());
