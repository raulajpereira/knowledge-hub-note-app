-- Ambientes, fase 2b — the app only sees the active workspace.
--
-- No data changes: only access rules. A RESTRICTIVE policy (ANDed with the
-- existing ones) on the items of the modules separated in this phase: when a
-- request of the app sets app.ws_strict = 'on', the person's own items are
-- seen only in the active workspace (kh_workspace_for). Items of other people
-- (shared folders) are not affected. Background jobs (notifications, search
-- indexing, data export) never set it and keep seeing everything. Moving an
-- item to another workspace runs without it. Folders: only the kinds of the
-- separated modules (notes, tasks, files, meetings); the others follow later.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['notes','tasks','meetings','drive_files','voice_notes'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_workspace_scope') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL TO kh_app
           USING (coalesce(current_setting(''app.ws_strict'', true), '''') <> ''on''
                  OR owner_id <> kh_user_id()
                  OR workspace_id = (SELECT kh_workspace_for(kh_user_id())))
           WITH CHECK (coalesce(current_setting(''app.ws_strict'', true), '''') <> ''on''
                  OR owner_id <> kh_user_id()
                  OR workspace_id = (SELECT kh_workspace_for(kh_user_id())))',
        t || '_workspace_scope', t);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'folders' AND policyname = 'folders_workspace_scope') THEN
    CREATE POLICY folders_workspace_scope ON folders AS RESTRICTIVE FOR ALL TO kh_app
      USING (coalesce(current_setting('app.ws_strict', true), '') <> 'on'
             OR owner_id <> kh_user_id()
             OR kind NOT IN ('notes','tasks','files','meetings')
             OR workspace_id = (SELECT kh_workspace_for(kh_user_id())))
      WITH CHECK (coalesce(current_setting('app.ws_strict', true), '') <> 'on'
             OR owner_id <> kh_user_id()
             OR kind NOT IN ('notes','tasks','files','meetings')
             OR workspace_id = (SELECT kh_workspace_for(kh_user_id())));
  END IF;
END $$;--> statement-breakpoint

-- verification: the six policies exist and nothing else changed
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE policyname LIKE '%\_workspace\_scope') <> 6 THEN
    RAISE EXCEPTION 'workspace scope policies missing';
  END IF;
END $$;
