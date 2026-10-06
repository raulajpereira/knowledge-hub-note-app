CREATE TABLE "voice_notes" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'mic' NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"levels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transcript" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "voice_notes_kind_chk" CHECK ("voice_notes"."kind" in ('mic','pc')),
	CONSTRAINT "voice_notes_mime_chk" CHECK ("voice_notes"."mime" in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav')),
	CONSTRAINT "voice_notes_title_len" CHECK (char_length("voice_notes"."title") <= 300),
	CONSTRAINT "voice_notes_text_len" CHECK (char_length("voice_notes"."transcript") <= 100000 and char_length("voice_notes"."notes") <= 20000)
);
--> statement-breakpoint
ALTER TABLE "voice_notes" ADD CONSTRAINT "voice_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_notes" ADD CONSTRAINT "voice_notes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voice_notes_owner_idx" ON "voice_notes" USING btree ("tenant_id","owner_id","created_at");--> statement-breakpoint
ALTER TABLE "voice_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "voice_notes_owner" ON "voice_notes" FOR ALL TO kh_app
  USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
  WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());
