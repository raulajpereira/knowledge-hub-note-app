-- Ambientes (workspaces), fase 1 — fundação invisível. docs/AMBIENTES.md
--
-- Só ACRESCENTA: uma tabela nova (workspaces) e uma coluna nova (workspace_id)
-- nos itens de cada pessoa. Nada é apagado nem renomeado. Cada pessoa recebe
-- "Meu Ambiente" e todos os seus itens passam a pertencer-lhe; na app nada
-- muda enquanto só houver esse ambiente. No fim, verificações: se alguma falhar
-- a migração inteira é anulada (a base de dados fica como estava).
--
-- Fora desta fase (decididos depois): os dados SAP e os Clientes, que são da
-- conta (partilhados pela equipa) e não de uma pessoa; mg_settings (uma linha
-- por pessoa); as unicidades por pessoa (n.º de ticket, tipos de ticket, notícias).

-- ── 1. Os ambientes ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	-- módulos visíveis neste ambiente (NULL = todos os do plano)
	"modules" text[],
	-- aparência e menu deste ambiente (fase 2)
	"look" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_len" CHECK (char_length("name") between 1 and 60 and char_length("color") <= 40 and char_length("icon") <= 16 and coalesce(cardinality("modules"), 0) <= 100 and pg_column_size("look") <= 16384)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspaces_owner_idx" ON "workspaces" ("tenant_id", "owner_id", "sort");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workspaces' AND policyname = 'workspaces_owner') THEN
    CREATE POLICY "workspaces_owner" ON "workspaces" FOR ALL TO kh_app
      USING (tenant_id = kh_tenant_id() AND owner_id = kh_user_id())
      WITH CHECK (tenant_id = kh_tenant_id() AND owner_id = kh_user_id());
  END IF;
END $$;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "workspaces" TO kh_app;--> statement-breakpoint

-- o ambiente onde vai um item novo: o ativo do pedido (app.workspace_id, se é
-- da mesma pessoa), senão o primeiro ambiente da pessoa
CREATE OR REPLACE FUNCTION kh_workspace_for(p_owner uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT w.id FROM workspaces w
      WHERE w.id = nullif(current_setting('app.workspace_id', true), '')::uuid AND w.owner_id = p_owner),
    (SELECT w.id FROM workspaces w WHERE w.owner_id = p_owner ORDER BY w.sort, w.created_at, w.id LIMIT 1))
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_workspace_for(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_workspace_for(uuid) TO kh_app;--> statement-breakpoint

-- cada pessoa nova recebe o seu primeiro ambiente
CREATE OR REPLACE FUNCTION kh_user_first_workspace() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM workspaces WHERE owner_id = NEW.id) THEN
    INSERT INTO workspaces (tenant_id, owner_id, name)
    VALUES (NEW.tenant_id, NEW.id, CASE WHEN NEW.lang = 'en' THEN 'My Workspace' ELSE 'Meu Ambiente' END);
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "users_first_workspace" ON "users";--> statement-breakpoint
CREATE TRIGGER "users_first_workspace" AFTER INSERT ON "users"
  FOR EACH ROW EXECUTE FUNCTION kh_user_first_workspace();--> statement-breakpoint

-- tem de existir sempre um ambiente (exceto quando a própria pessoa é apagada)
CREATE OR REPLACE FUNCTION kh_workspace_keep_one() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = OLD.owner_id)
     AND NOT EXISTS (SELECT 1 FROM workspaces WHERE owner_id = OLD.owner_id AND id <> OLD.id) THEN
    RAISE EXCEPTION 'last workspace' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "workspaces_keep_one" ON "workspaces";--> statement-breakpoint
CREATE TRIGGER "workspaces_keep_one" BEFORE DELETE ON "workspaces"
  FOR EACH ROW EXECUTE FUNCTION kh_workspace_keep_one();--> statement-breakpoint

-- ── 2. "Meu Ambiente" para todas as pessoas que já existem ──────────────────
INSERT INTO workspaces (tenant_id, owner_id, name)
SELECT u.tenant_id, u.id, CASE WHEN u.lang = 'en' THEN 'My Workspace' ELSE 'Meu Ambiente' END
  FROM users u
 WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.owner_id = u.id);--> statement-breakpoint

-- ── 3. O ambiente de cada item ──────────────────────────────────────────────
-- item novo sem ambiente → o ativo / o primeiro da pessoa; um item só pode estar
-- num ambiente do seu dono; se o dono mudar, vai para o ambiente do novo dono
CREATE OR REPLACE FUNCTION kh_item_workspace() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.owner_id IS DISTINCT FROM OLD.owner_id
     AND NEW.workspace_id IS NOT DISTINCT FROM OLD.workspace_id THEN
    NEW.workspace_id := NULL;
  END IF;
  IF NEW.workspace_id IS NULL THEN
    NEW.workspace_id := kh_workspace_for(NEW.owner_id);
  END IF;
  IF NEW.workspace_id IS NULL THEN
    RAISE EXCEPTION 'no workspace for %', NEW.owner_id USING ERRCODE = 'not_null_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = NEW.workspace_id AND w.owner_id = NEW.owner_id) THEN
    RAISE EXCEPTION 'workspace of another person' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['folders','notes','tasks','voice_notes','meetings','drive_files','emails','issues','artifacts','snippets','api_requests','api_envs','whiteboards','news_saved','saved_views','user_templates','ai_chats','vault_items','tickets','ticket_types','mg_teams','mg_people','mg_projects','mg_allocs','mg_bookings','mg_absences','mg_timesheets','mg_requests'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "workspace_id" uuid', t);
    -- os itens que já existem: o "Meu Ambiente" do seu dono
    EXECUTE format(
      'UPDATE %I x SET workspace_id = (SELECT w.id FROM workspaces w WHERE w.owner_id = x.owner_id ORDER BY w.sort, w.created_at, w.id LIMIT 1) WHERE x.workspace_id IS NULL',
      t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "workspace_id" SET NOT NULL', t);
    BEGIN
      -- NO ACTION: um ambiente com itens não pode ser apagado (nem os itens desaparecem com ele)
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE NO ACTION',
        t, t || '_workspace_id_fk');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("workspace_id")', t || '_workspace_idx', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_workspace', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF owner_id, workspace_id ON %I FOR EACH ROW EXECUTE FUNCTION kh_item_workspace()',
      t || '_workspace', t);
  END LOOP;
END $$;--> statement-breakpoint

-- ── 4. Verificações (qualquer falha anula a migração inteira) ───────────────
DO $$
DECLARE
  t text;
  n bigint;
BEGIN
  -- todas as pessoas têm pelo menos um ambiente
  SELECT count(*) INTO n FROM users u WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.owner_id = u.id);
  IF n > 0 THEN RAISE EXCEPTION 'verificação falhou: % pessoas sem ambiente', n; END IF;
  FOREACH t IN ARRAY ARRAY['folders','notes','tasks','voice_notes','meetings','drive_files','emails','issues','artifacts','snippets','api_requests','api_envs','whiteboards','news_saved','saved_views','user_templates','ai_chats','vault_items','tickets','ticket_types','mg_teams','mg_people','mg_projects','mg_allocs','mg_bookings','mg_absences','mg_timesheets','mg_requests'] LOOP
    -- nenhum item sem ambiente
    EXECUTE format('SELECT count(*) FROM %I WHERE workspace_id IS NULL', t) INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'verificação falhou: % itens de % sem ambiente', n, t; END IF;
    -- e cada item está num ambiente do seu próprio dono
    EXECUTE format(
      'SELECT count(*) FROM %I x JOIN workspaces w ON w.id = x.workspace_id WHERE w.owner_id <> x.owner_id', t) INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'verificação falhou: % itens de % num ambiente de outra pessoa', n, t; END IF;
  END LOOP;
END $$;
