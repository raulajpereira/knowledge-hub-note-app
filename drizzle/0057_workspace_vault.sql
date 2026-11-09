-- Ambientes, fase 4 — um cofre (Passwords) por ambiente.
--
-- Decision (09/11/2026): each workspace has its own vault — its own master
-- password and recovery key. The existing vault (keys and items) stays in the
-- person's first workspace, exactly as it is; in another workspace the vault is
-- set up the first time it is opened. Nothing is deleted or re-encrypted.

DO $$
DECLARE
  t text;
BEGIN
  -- vault keys: the workspace column, filled with the person's first workspace
  ALTER TABLE vault_keys ADD COLUMN IF NOT EXISTS workspace_id uuid;
  UPDATE vault_keys k SET workspace_id = (SELECT w.id FROM workspaces w WHERE w.owner_id = k.owner_id
                                          ORDER BY w.sort, w.created_at, w.id LIMIT 1)
   WHERE k.workspace_id IS NULL;
  ALTER TABLE vault_keys ALTER COLUMN workspace_id SET NOT NULL;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vault_keys_workspace_id_fk') THEN
    ALTER TABLE vault_keys ADD CONSTRAINT vault_keys_workspace_id_fk
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE NO ACTION;
  END IF;
  DROP TRIGGER IF EXISTS vault_keys_workspace ON vault_keys;
  CREATE TRIGGER vault_keys_workspace BEFORE INSERT OR UPDATE OF owner_id, workspace_id ON vault_keys
    FOR EACH ROW EXECUTE FUNCTION kh_item_workspace();
  CREATE UNIQUE INDEX IF NOT EXISTS vault_keys_owner_ws_uq ON vault_keys (owner_id, workspace_id);
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vault_keys_pkey' AND conrelid = 'vault_keys'::regclass
             AND array_length(conkey, 1) = 1) THEN
    ALTER TABLE vault_keys DROP CONSTRAINT vault_keys_pkey;
    ALTER TABLE vault_keys ADD CONSTRAINT vault_keys_pkey PRIMARY KEY USING INDEX vault_keys_owner_ws_uq;
  END IF;

  FOREACH t IN ARRAY ARRAY['vault_keys','vault_items'] LOOP
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

-- folders: every kind is now per workspace
ALTER POLICY folders_workspace_scope ON folders
  USING (coalesce(current_setting('app.ws_strict', true), '') <> 'on'
         OR owner_id <> kh_user_id()
         OR workspace_id = (SELECT kh_workspace_for(kh_user_id())))
  WITH CHECK (coalesce(current_setting('app.ws_strict', true), '') <> 'on'
         OR owner_id <> kh_user_id()
         OR workspace_id = (SELECT kh_workspace_for(kh_user_id())));--> statement-breakpoint

-- verification
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE policyname LIKE '%\_workspace\_scope') <> 38 THEN
    RAISE EXCEPTION 'workspace scope policies missing';
  END IF;
  IF EXISTS (SELECT 1 FROM vault_keys WHERE workspace_id IS NULL) THEN
    RAISE EXCEPTION 'vault keys without workspace';
  END IF;
  -- every item stays with its keys: same person, same workspace
  IF EXISTS (SELECT 1 FROM vault_items i WHERE NOT EXISTS
             (SELECT 1 FROM vault_keys k WHERE k.owner_id = i.owner_id AND k.workspace_id = i.workspace_id)) THEN
    RAISE EXCEPTION 'vault items without their keys';
  END IF;
END $$;
