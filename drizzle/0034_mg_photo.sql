ALTER TABLE "mg_people" ADD COLUMN "photo_key" text;--> statement-breakpoint
-- the storage sweep keeps the photos of Management people too
CREATE OR REPLACE FUNCTION kh_storage_keys() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT storage_key FROM note_attachments
  UNION ALL SELECT storage_key FROM voice_notes
  UNION ALL SELECT file_key FROM emails
  UNION ALL SELECT storage_key FROM email_attachments
  UNION ALL SELECT storage_key FROM whiteboard_images
  UNION ALL SELECT storage_key FROM user_assets
  UNION ALL SELECT storage_key FROM drive_files
  UNION ALL SELECT photo_key FROM mg_people WHERE photo_key IS NOT NULL
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_storage_keys() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_storage_keys() TO kh_app;
