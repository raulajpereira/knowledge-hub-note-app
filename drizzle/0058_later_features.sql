-- Features added after the first plans get their own switch in the console
-- (Planos). At first every plan — and every client on the individual plan
-- (CUSTOM, modules per client) — has them, so nothing disappears for anyone;
-- the console then turns them off where they don't belong. Nothing is deleted.

INSERT INTO modules (id, grp, label_pt, label_en, sort) VALUES
  ('push', 'feat', 'Notificações push', 'Push notifications', 200),
  ('mailnotify', 'feat', 'Notificações por email', 'Email notifications', 201),
  ('inbound', 'feat', 'Email para a app', 'Email to the app', 202),
  ('import', 'feat', 'Importar notas', 'Import notes', 203),
  ('xlsx', 'feat', 'Exportar para Excel', 'Export to Excel', 204),
  ('publiclinks', 'feat', 'Links públicos', 'Public links', 205),
  ('templates', 'feat', 'Modelos', 'Templates', 206),
  ('views', 'feat', 'Vistas guardadas', 'Saved views', 207),
  ('history', 'feat', 'Histórico de versões', 'Version history', 208),
  ('mg_profit', 'mgmt', 'Rentabilidade', 'Profitability', 209)
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint

INSERT INTO plan_modules (plan_id, module_id)
SELECT p.id, m
  FROM plans p
 CROSS JOIN unnest(ARRAY['push','mailnotify','inbound','import','xlsx','publiclinks','templates','views','history','mg_profit']) AS m
 WHERE p.code <> 'CUSTOM'
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO tenant_modules (tenant_id, module_id)
SELECT t.id, m
  FROM tenants t
  JOIN plans p ON p.id = t.plan_id
 CROSS JOIN unnest(ARRAY['push','mailnotify','inbound','import','xlsx','publiclinks','templates','views','history','mg_profit']) AS m
 WHERE p.code = 'CUSTOM'
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- the tenant of each person, for the push worker (it has no tenant context):
-- a plan without "Notificações push" sends nothing (the devices stay subscribed)
CREATE OR REPLACE FUNCTION kh_user_tenants(p_users uuid[]) RETURNS TABLE (user_id uuid, tenant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.tenant_id FROM users u WHERE u.id = ANY(p_users)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION kh_user_tenants(uuid[]) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION kh_user_tenants(uuid[]) TO kh_app;--> statement-breakpoint

-- verification: the 10 modules exist and every (non-CUSTOM) plan has them
DO $$
BEGIN
  IF (SELECT count(*) FROM modules WHERE id IN ('push','mailnotify','inbound','import','xlsx','publiclinks','templates','views','history','mg_profit')) <> 10 THEN
    RAISE EXCEPTION 'later features missing';
  END IF;
  IF EXISTS (SELECT 1 FROM plans p WHERE p.code <> 'CUSTOM'
             AND (SELECT count(*) FROM plan_modules pm WHERE pm.plan_id = p.id
                  AND pm.module_id IN ('push','mailnotify','inbound','import','xlsx','publiclinks','templates','views','history','mg_profit')) <> 10) THEN
    RAISE EXCEPTION 'a plan without the later features';
  END IF;
END $$;
