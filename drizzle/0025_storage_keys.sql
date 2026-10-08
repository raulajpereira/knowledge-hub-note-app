-- Every object key the database still points to, for the daily sweep that
-- removes files left behind in the bucket (deleted people, notes, emails…).
-- SECURITY DEFINER: the job has no tenant context, and RLS would hide the rows.
CREATE OR REPLACE FUNCTION kh_storage_keys() RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT storage_key FROM note_attachments
  UNION ALL SELECT storage_key FROM voice_notes
  UNION ALL SELECT file_key FROM emails
  UNION ALL SELECT storage_key FROM email_attachments
  UNION ALL SELECT storage_key FROM whiteboard_images
  UNION ALL SELECT storage_key FROM user_assets
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_storage_keys() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_storage_keys() TO kh_app;
