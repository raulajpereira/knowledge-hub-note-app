ALTER TABLE "api_envs" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "api_envs" ADD CONSTRAINT "api_envs_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_envs_folder_idx" ON "api_envs" USING btree ("folder_id");