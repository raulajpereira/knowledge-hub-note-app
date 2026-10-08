ALTER TABLE "folders" DROP CONSTRAINT "folders_kind_chk";--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_kind_chk" CHECK ("folders"."kind" in ('notes','tasks','artifacts','passwords','emails','api','files','meetings'));--> statement-breakpoint
-- the module's new name (packages and the console show it)
UPDATE "modules" SET "label_pt" = 'Registos Reuniões', "label_en" = 'Meeting Records' WHERE "id" = 'meetings';
