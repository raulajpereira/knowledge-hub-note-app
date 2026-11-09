-- Ambientes, fase 3b — SAP e Tickets por ambiente.
--
-- SAP data and Clientes belong to the account (shared by the team), the
-- workspaces to each person. Decision (09/11/2026): the person's FIRST
-- workspace is the team's — everything that exists today, and what is created
-- there, stays shared exactly as now (workspace_id NULL). What is created in
-- another workspace belongs only to that workspace (and so to that person).
--
-- No data changes: a new empty column (NULL = the team's, i.e. all current
-- rows), access rules, and unique keys that gain the workspace (new index
-- created before the old one is dropped). Tickets already belong to a person
-- and a workspace (0052): they get the rule of 0053.

-- the person's first workspace, and whether the active one is it
CREATE OR REPLACE FUNCTION kh_ws_first(p_user uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id FROM workspaces w WHERE w.owner_id = p_user ORDER BY w.sort, w.created_at, w.id LIMIT 1
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION kh_team_scope() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT kh_user_id() IS NULL OR kh_workspace_for(kh_user_id()) IS NOT DISTINCT FROM kh_ws_first(kh_user_id())
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION kh_ws_mine(p_ws uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = p_ws AND w.owner_id = kh_user_id())
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_ws_first(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_team_scope() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_ws_mine(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_ws_first(uuid) TO kh_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_team_scope() TO kh_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_ws_mine(uuid) TO kh_app;--> statement-breakpoint

-- a new row made in a private workspace belongs to it; a row can only be put
-- in one of the person's own workspaces
CREATE OR REPLACE FUNCTION kh_team_item_workspace() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.workspace_id IS NULL
     AND coalesce(current_setting('app.ws_strict', true), '') = 'on' AND NOT kh_team_scope() THEN
    NEW.workspace_id := kh_workspace_for(kh_user_id());
  END IF;
  IF NEW.workspace_id IS NOT NULL AND kh_user_id() IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id)
     AND NOT kh_ws_mine(NEW.workspace_id) THEN
    RAISE EXCEPTION 'workspace of another person';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sap_systems','sap_tcodes','sap_transports','sap_objects','sap_notes','sap_fn_records','mg_clients'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS workspace_id uuid', t);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_workspace_id_fk') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE NO ACTION',
                     t, t || '_workspace_id_fk');
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (workspace_id) WHERE workspace_id IS NOT NULL', t || '_workspace_idx', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_workspace', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF workspace_id ON %I FOR EACH ROW EXECUTE FUNCTION kh_team_item_workspace()',
                   t || '_workspace', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_workspace_scope') THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL TO kh_app
           USING ((workspace_id IS NULL AND (coalesce(current_setting(''app.ws_strict'', true), '''') <> ''on'' OR kh_team_scope()))
               OR (workspace_id IS NOT NULL AND (kh_user_id() IS NULL OR kh_ws_mine(workspace_id))
                   AND (coalesce(current_setting(''app.ws_strict'', true), '''') <> ''on''
                        OR workspace_id = (SELECT kh_workspace_for(kh_user_id())))))
           WITH CHECK ((workspace_id IS NULL AND (coalesce(current_setting(''app.ws_strict'', true), '''') <> ''on'' OR kh_team_scope()))
               OR (workspace_id IS NOT NULL AND (kh_user_id() IS NULL OR kh_ws_mine(workspace_id))
                   AND (coalesce(current_setting(''app.ws_strict'', true), '''') <> ''on''
                        OR workspace_id = (SELECT kh_workspace_for(kh_user_id())))))',
        t || '_workspace_scope', t);
    END IF;
  END LOOP;

  -- tickets and their types: the person's own, only in the active workspace (as 0053)
  FOREACH t IN ARRAY ARRAY['tickets','ticket_types'] LOOP
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
END $$;--> statement-breakpoint

-- deleting a person also deletes the SAP rows of their private workspaces
-- (like every other item of theirs); the team's rows are never touched
CREATE OR REPLACE FUNCTION kh_user_private_team_items() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sap_systems','sap_tcodes','sap_transports','sap_objects','sap_notes','sap_fn_records','mg_clients'] LOOP
    EXECUTE format('DELETE FROM %I WHERE workspace_id IN (SELECT id FROM workspaces WHERE owner_id = $1)', t) USING OLD.id;
  END LOOP;
  RETURN OLD;
END $$;--> statement-breakpoint
DROP TRIGGER IF EXISTS users_private_team_items ON users;--> statement-breakpoint
CREATE TRIGGER users_private_team_items BEFORE DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION kh_user_private_team_items();--> statement-breakpoint

-- folders: the Tickets kind too (only Passwords folders still everywhere)
ALTER POLICY folders_workspace_scope ON folders
  USING (coalesce(current_setting('app.ws_strict', true), '') <> 'on'
         OR owner_id <> kh_user_id()
         OR kind NOT IN ('notes','tasks','files','meetings','emails','artifacts','api','tickets')
         OR workspace_id = (SELECT kh_workspace_for(kh_user_id())))
  WITH CHECK (coalesce(current_setting('app.ws_strict', true), '') <> 'on'
         OR owner_id <> kh_user_id()
         OR kind NOT IN ('notes','tasks','files','meetings','emails','artifacts','api','tickets')
         OR workspace_id = (SELECT kh_workspace_for(kh_user_id())));--> statement-breakpoint

-- unique keys per workspace (new ones first)
CREATE UNIQUE INDEX IF NOT EXISTS tickets_number_ws_uq ON tickets (owner_id, workspace_id, lower(number));--> statement-breakpoint
DROP INDEX IF EXISTS tickets_number_uq;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ticket_types_name_ws_uq ON ticket_types (owner_id, workspace_id, lower(name));--> statement-breakpoint
DROP INDEX IF EXISTS ticket_types_name_uq;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS sap_notes_number_ws_uq
  ON sap_notes (tenant_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), number);--> statement-breakpoint
DROP INDEX IF EXISTS sap_notes_number_uq;--> statement-breakpoint

-- verification
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE policyname LIKE '%\_workspace\_scope') <> 26 THEN
    RAISE EXCEPTION 'workspace scope policies missing';
  END IF;
  IF (SELECT count(*) FROM pg_indexes WHERE indexname IN ('tickets_number_ws_uq','ticket_types_name_ws_uq','sap_notes_number_ws_uq')) <> 3 THEN
    RAISE EXCEPTION 'unique indexes missing';
  END IF;
  IF EXISTS (SELECT 1 FROM sap_objects WHERE workspace_id IS NOT NULL) OR EXISTS (SELECT 1 FROM mg_clients WHERE workspace_id IS NOT NULL) THEN
    RAISE EXCEPTION 'existing rows must stay the team''s';
  END IF;
END $$;
