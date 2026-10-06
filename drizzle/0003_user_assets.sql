CREATE TABLE "user_assets" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_assets_user_id_kind_pk" PRIMARY KEY("user_id","kind"),
	CONSTRAINT "user_assets_kind_chk" CHECK ("user_assets"."kind" in ('avatar','background','logo')),
	CONSTRAINT "user_assets_type_chk" CHECK ("user_assets"."content_type" in ('image/png','image/jpeg','image/webp'))
);
--> statement-breakpoint
ALTER TABLE "user_assets" ADD CONSTRAINT "user_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;