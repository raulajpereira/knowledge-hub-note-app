-- The audit log is append-only for the app (UPDATE/DELETE revoked); entries
-- older than the retention (SECURITY.md §8: 1–2 years → 2 years) are removed
-- by the daily job through this owner function only.
CREATE OR REPLACE FUNCTION kh_purge_audit(p_before timestamptz) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF p_before > now() - interval '365 days' THEN
    RAISE EXCEPTION 'audit retention must be at least one year';
  END IF;
  DELETE FROM audit_log WHERE "at" < p_before;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_purge_audit(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_purge_audit(timestamptz) TO kh_app;
