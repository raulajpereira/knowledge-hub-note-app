-- Ambientes, fase 3a — Emails, Artefactos, Biblioteca de Código, API
-- Playground, Quadro, Tarefas de Projeto, Modelos, Vistas, Notícias e IA só
-- no ambiente ativo (como a 0053). No data changes: access rules, and the
-- "saved news" unique key gains the workspace (the same article can be saved
-- in two workspaces). The new index is created before the old one is dropped.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['emails','artifacts','snippets','api_requests','api_envs','whiteboards','issues',
                           'user_templates','saved_views','news_saved','ai_chats'] LOOP
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

-- folders: also the kinds of these modules (emails, artifacts, api); only
-- Passwords and Tickets folders still everywhere (phases 3b / 4)
ALTER POLICY folders_workspace_scope ON folders
  USING (coalesce(current_setting('app.ws_strict', true), '') <> 'on'
         OR owner_id <> kh_user_id()
         OR kind NOT IN ('notes','tasks','files','meetings','emails','artifacts','api')
         OR workspace_id = (SELECT kh_workspace_for(kh_user_id())))
  WITH CHECK (coalesce(current_setting('app.ws_strict', true), '') <> 'on'
         OR owner_id <> kh_user_id()
         OR kind NOT IN ('notes','tasks','files','meetings','emails','artifacts','api')
         OR workspace_id = (SELECT kh_workspace_for(kh_user_id())));--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS news_saved_owner_ws_link_uq ON news_saved (owner_id, workspace_id, link);--> statement-breakpoint
DROP INDEX IF EXISTS news_saved_owner_link_uq;--> statement-breakpoint

-- verification: 6 + 11 policies, the new index
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE policyname LIKE '%\_workspace\_scope') <> 17 THEN
    RAISE EXCEPTION 'workspace scope policies missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'news_saved_owner_ws_link_uq') THEN
    RAISE EXCEPTION 'news_saved index missing';
  END IF;
END $$;
