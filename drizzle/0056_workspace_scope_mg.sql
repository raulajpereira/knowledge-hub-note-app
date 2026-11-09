-- Ambientes, fase 3c — Management por ambiente.
--
-- The Management rows already belong to a person and a workspace (0052): they
-- get the rule of 0053. Booking days follow their booking. The Management
-- settings (areas, levels, …) were one row per person: they gain the workspace
-- — the existing row goes to the person's first workspace (where it was used)
-- — and become one row per person and workspace. Nothing is deleted.

DO $$
DECLARE
  t text;
BEGIN
  -- settings: the workspace column, filled with the person's first workspace
  ALTER TABLE mg_settings ADD COLUMN IF NOT EXISTS workspace_id uuid;
  UPDATE mg_settings s SET workspace_id = (SELECT w.id FROM workspaces w WHERE w.owner_id = s.owner_id
                                           ORDER BY w.sort, w.created_at, w.id LIMIT 1)
   WHERE s.workspace_id IS NULL;
  ALTER TABLE mg_settings ALTER COLUMN workspace_id SET NOT NULL;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mg_settings_workspace_id_fk') THEN
    ALTER TABLE mg_settings ADD CONSTRAINT mg_settings_workspace_id_fk
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE NO ACTION;
  END IF;
  DROP TRIGGER IF EXISTS mg_settings_workspace ON mg_settings;
  CREATE TRIGGER mg_settings_workspace BEFORE INSERT OR UPDATE OF owner_id, workspace_id ON mg_settings
    FOR EACH ROW EXECUTE FUNCTION kh_item_workspace();
  -- one row per person and workspace (the new key first, then the old one goes)
  CREATE UNIQUE INDEX IF NOT EXISTS mg_settings_owner_ws_uq ON mg_settings (owner_id, workspace_id);
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mg_settings_pkey'
             AND conrelid = 'mg_settings'::regclass
             AND array_length(conkey, 1) = 1) THEN
    ALTER TABLE mg_settings DROP CONSTRAINT mg_settings_pkey;
    ALTER TABLE mg_settings ADD CONSTRAINT mg_settings_pkey PRIMARY KEY USING INDEX mg_settings_owner_ws_uq;
  END IF;

  FOREACH t IN ARRAY ARRAY['mg_teams','mg_people','mg_projects','mg_allocs','mg_bookings','mg_absences',
                           'mg_timesheets','mg_requests','mg_settings'] LOOP
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

  -- booking days: only those of a booking that can be seen
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mg_booking_days' AND policyname = 'mg_booking_days_workspace_scope') THEN
    CREATE POLICY mg_booking_days_workspace_scope ON mg_booking_days AS RESTRICTIVE FOR ALL TO kh_app
      USING (EXISTS (SELECT 1 FROM mg_bookings b WHERE b.id = booking_id))
      WITH CHECK (EXISTS (SELECT 1 FROM mg_bookings b WHERE b.id = booking_id));
  END IF;
END $$;--> statement-breakpoint

-- verification
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE policyname LIKE '%\_workspace\_scope') <> 36 THEN
    RAISE EXCEPTION 'workspace scope policies missing';
  END IF;
  IF EXISTS (SELECT 1 FROM mg_settings WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'mg_settings without workspace';
  END IF;
  IF (SELECT count(*) FROM pg_index i JOIN pg_constraint c ON c.conindid = i.indexrelid
      WHERE c.conname = 'mg_settings_pkey' AND array_length(c.conkey, 1) = 2) <> 1 THEN
    RAISE EXCEPTION 'mg_settings key not per workspace';
  END IF;
END $$;
