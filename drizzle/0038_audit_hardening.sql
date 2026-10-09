ALTER TABLE "users" ADD COLUMN "totp_last_step" bigint;--> statement-breakpoint
-- Images removed from a note are no longer deleted when the note is saved (a
-- stale autosave could delete an image being uploaded or used by a newer
-- version): the daily job drops the attachments no note content points to any
-- more, a day after they were added. Their files then go with the storage sweep.
CREATE OR REPLACE FUNCTION kh_prune_note_attachments() RETURNS integer
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  WITH gone AS (
    DELETE FROM note_attachments a
     WHERE a.created_at < now() - interval '1 day'
       AND NOT EXISTS (
         SELECT 1 FROM notes n
          WHERE n.id = a.note_id AND position(a.id::text in n.content::text) > 0)
    RETURNING 1)
  SELECT count(*)::integer FROM gone
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_prune_note_attachments() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_prune_note_attachments() TO kh_app;--> statement-breakpoint
-- A public link stops working when its owner is disabled or paused, or the
-- client is suspended, cancelled or deleted.
CREATE OR REPLACE FUNCTION kh_public_link(p_hash text)
RETURNS TABLE (id uuid, tenant_id uuid, owner_id uuid, item_type text, item_id uuid, password_hash text, expires_on date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.tenant_id, l.owner_id, l.item_type, l.item_id, l.password_hash, l.expires_on
    FROM public_links l
    JOIN users u ON u.id = l.owner_id AND u.status = 'active'
    JOIN tenants t ON t.id = l.tenant_id AND t.deleted_at IS NULL
                  AND t.status NOT IN ('suspended', 'canceled')
   WHERE l.token_hash = p_hash AND l.revoked_at IS NULL
$$;
