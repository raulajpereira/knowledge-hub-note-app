# Modelo de dados

## 1. Princípios
- **Multi-tenant**: tudo pertence a um `tenant` (cliente). Um utilizador individual é um tenant com 1 lugar. Colunas `tenant_id` em todas as tabelas de conteúdo + **Row Level Security** no Postgres (`current_setting('app.tenant_id')`).
- **Propriedade**: conteúdo pessoal tem `owner_id`; conteúdo em pasta partilhada é acedido via `share_members`.
- IDs `uuid` (v7), timestamps `timestamptz`, soft delete (`deleted_at`) onde existe Lixo.
- Preferências de UI (larguras de colunas, ordem da barra lateral, tema) em `user_prefs` (JSONB) — sincronizadas entre dispositivos.

## 2. Identidade, tenants e licenciamento
| Tabela | Campos principais |
|---|---|
| `tenants` | id, name, kind (`pack`/`individual`), status (`trial`,`active`,`past_due`,`suspended`,`canceled`), plan_id, billing_cycle (`monthly`/`annual`), seats, renew_at, trial_ends_at, sales_notes (venda feita fora da app), deleted_at (revogação: purge após 30 dias), created_at |
| `users` | id, tenant_id, name, email (citext unique), password_hash (argon2id), email_verified_at, role_in_tenant (`admin`/`member`), status (`active`,`invited`,`paused`,`disabled`), last_seen_at, registered_with_code_id, totp_secret_enc, created_at |
| `sessions` | id, user_id, created_at, expires_at, ip, user_agent, revoked_at |
| `password_resets` / `email_verifications` | token_hash, user_id, expires_at, used_at |
| `plans` | id, code (`FREE`,`PRO`,`DEVELOPER`,`SAP`,`MANAGEMENT`,`ULTRA`,`CUSTOM`), price_month_per_user, annual_discount_pct, trial_enabled, trial_days, color, is_popular, sort |
| `modules` | id (`notes`,`tasks`,…), group (`base`,`pro`,`mgmt`,`dev`,`sap`,`feat`,`custom`), label_pt, label_en, addon_price_month |
| `plan_modules` | plan_id, module_id |
| `plan_limits` | plan_id, resource (`notes`,`tasks`,`artifacts`,`whiteboards`,`snippets`,`voice`), max |
| `tenant_modules` | tenant_id, module_id (para pacote individual / add-ons) |
| `codes` | id, code (`KH-INV-######` / `KH-LIC-######`, unique), type (`invite`/`license`), tenant_id (nullable para convites individuais), plan_id, max_uses, uses, expires_at (null = vitalício), status (`active`,`paused`,`revoked`,`expired`), created_by |
| `code_redemptions` | code_id, user_id, redeemed_at |
| `admins` | user_id, role (`owner`,`admin`,`billing`,`support`,`readonly`), status |
| `audit_log` | id, at, actor_user_id, actor_kind (`user`/`system`), action, target_type, target_id, details (jsonb), ip |
| `support_tickets` | id, tenant_id, user_id, title, priority, status, created_at |
| `custom_plan_requests` | id, tenant_id/user_id, modules[], seats, cycle, notes, status |

Regras de códigos (ver Admin Console):
- **Pausar** código → utilizadores associados perdem acesso, dados mantêm-se.
- **Revogar** código → acesso cortado de imediato; dados marcados com `deleted_at` e **mantidos 30 dias** (podem ser restaurados pela Admin Console); depois um job diário apaga definitivamente. Tudo registado no audit log.
- Convite individual: sem tenant; tenant individual criado no registo.

## 3. Gating por plano
`entitlements(user) = plan_modules(tenant.plan) ∪ tenant_modules(tenant)` calculado **no servidor** em cada request (cache Redis 60 s). Grupos de módulos (do Admin `AGRP`):
- **base**: calendar, notes, voice, tasks
- **pro**: passwords, issues, emails
- **mgmt**: mg_overview, mg_teams, mg_people, mg_skills, mg_projects, mg_dash, mg_alloc, mg_staff, mg_time, mg_clients
- **dev**: artifacts, devlib, api
- **sap**: codelib, systems, tcodes, transports, fn_proc, fn_test, fn_mig, fn_cut (inclui Definições › SAP GUI)
- **feat**: whiteboard, share, news
- **custom**: brand, bgphoto, typeface, glass, accent, sidebar (Definições de personalização)

FREE tem limites (`plan_limits`) — ex. 30 notas, 20 tarefas; validar em cada create.

## 4. Conteúdo
| Tabela | Campos principais |
|---|---|
| `folders` | id, tenant_id, owner_id, kind (`notes`,`tasks`,`artifacts`,`passwords`,`emails`,`api`), name, color, parent_id, sort |
| `notes` | id, tenant_id, owner_id, folder_id, title, content (TipTap JSON), content_text (tsvector), tags[], favorite, meta (jsonb: projeto, sistema…), created_at, updated_at, deleted_at |
| `note_attachments` | id, note_id, storage_key, mime, size |
| `note_checklist_state` | (se não ficar dentro do JSON) |
| `tags` | id, tenant_id, name, color |
| `tasks` | id, tenant_id, owner_id, folder_id/shared_folder_id, title, type (`tech`/`mgmt`), priority, due_at, repeat, project_id, notes, pinned, done_at, created_at |
| `task_subtasks` | id, task_id, title, done |
| `voice_notes` | id, owner_id, title, audio_key, duration, transcript, created_at |
| `calendar_events` | id, owner_id, title, start_at, end_at, all_day, color, location, notes, linked_type/linked_id |
| `vault_items` | id, owner_id, folder_id, **ciphertext**, iv, version, updated_at (sem campos em claro) |
| `vault_keys` | user_id, kdf_salt, kdf_params, verifier, dek_wrapped_mp, dek_wrapped_rk, rk_fingerprint, rk_created_at |
| `emails` | id, owner_id, folder_id, subject, from, to, cc, date, body_html_key, body_text, starred, pinned, notes, file_key |
| `email_attachments` | id, email_id, name, mime, storage_key |
| `issues` | id, tenant_id, project_id, title, status, priority, owner_id, due_at, description, created_at |
| `artifacts` | id, tenant_id, owner_id, folder_id, title, description, tags[], pinned, current_html, created_at, updated_at |
| `artifact_versions` | id, artifact_id, html, created_at |
| `snippets` (Dev) | id, owner_id, title, type, tags[], description, favorite, created_at |
| `snippet_files` | id, snippet_id, name, language, code |
| `snippet_links` | a_id, b_id |
| `api_requests` | id, owner_id, folder_id, method, url, headers jsonb, params jsonb, body, auth jsonb (**segredos encriptados**) |
| `whiteboards` | id, tenant_id, owner_id, name, doc (jsonb tldraw), thumbnail_key, updated_at |
| `shortcuts`, `dashboard_layout` | em `user_prefs` |

## 5. SAP e Management
| Tabela | Campos |
|---|---|
| `sap_objects` (Code Library SAP) | id, tenant_id, type (program, class, FM, include, table, structure, CDS…), name, package, description, source, fields jsonb (tabelas/estruturas), params jsonb (FMs/métodos), components jsonb |
| `sap_systems` | id, tenant_id, client_id (FK `mg_clients`), sid, client_no, type (DEV/QAS/PRD), host, instance, saprouter, msg_server, group, description |
| `sap_tcodes` | código, descrição, módulo, programa (catálogo global, leitura) |
| `tcode_usage` | user_id, tcode, count, last_used |
| `transports` | id, tenant_id, tr_number, description, type (workbench/customizing), owner, system_id, project_id, status, stage, objects jsonb, released_at |
| `fn_records` | id, tenant_id, page (`proc`,`test`,`mig`,`cut`), title, code, status, fields jsonb, rows jsonb, client_id, project_id |
| `mg_teams` | id, tenant_id, name, lead_user_id, color, target_pct, description, areas[] |
| `mg_people` (Recursos) | id, tenant_id, user_id (nullable), name, email, team_id, role, area, level, cost_rate, sell_rate, capacity_h, location, since |
| `mg_skills` | person_id, skill, level |
| `mg_areas`, `mg_levels` | listas geridas em Definições › Management |
| `mg_clients` | id, tenant_id, name, type (externo/interno), sector, contact, email |
| `mg_projects` | id, tenant_id, client_id, code, name, status, budget, start, end, manager_id, color |
| `mg_phases` | id, project_id, name, start_week, end_week |
| `mg_allocations` | id, person_id, project_id, start_date, end_date, hours_per_week, week_overrides jsonb, day_overrides jsonb |
| `mg_staff_requests` | id, project_id, skills jsonb, level_min, hours_week, start, end, max_rate, status, filled_by |
| `mg_timesheets` | id, person_id, week_start, status (draft/submitted/approved), rows jsonb (project → 5 dias) |

## 6. Partilha e notícias
| Tabela | Campos |
|---|---|
| `public_links` | id, item_type, item_id, token (≥128 bits), password_hash, expires_at, views, created_by, revoked_at |
| `shared_folders` | id, tenant_id, owner_id, kind, name, source_folder_id (quando uma pasta normal é partilhada), paused |
| `share_members` | folder_id, user_id/email, permission (`read`/`edit`), status (`active`,`invited`,`paused`), invited_at |
| `news_sources` | id, owner_id (null = global), scope (`sap`/`footer`), name, url, enabled |
| `news_items` (cache) | id, source_id, guid, title, link, image, excerpt, html, published_at |
| `news_saved` | user_id, news_item_id, saved_at |
| `user_prefs` | user_id, data jsonb (tema, fundo, blur, accent, escala, idioma, nav layout, larguras, dashboard, vault_minutes…) |

## 7. Mapa protótipo → BD (chaves de `localStorage`)
| Chave no protótipo | Destino |
|---|---|
| `kv.authUser`, `kv.authPassHash`, `kv.authEmail`, `kv.locked` (session) | `sessions`, `users.password_hash`; lock = estado de cliente + re-auth |
| `znotes.profile` | `users` (nome, email, foto→storage, 2FA) |
| `znotes.license` | derivado de `tenants.plan_id` |
| `kv.admin.v1` | `tenants`, `users`, `codes`, `plans`, `plan_modules`, `plan_limits`, `admins`, `audit_log`, `support_tickets`, `custom_plan_requests` (pedidos de plano) |
| `znotes.userNotes`, `znotes.notesDel`, `znotes.nbUser`, `znotes.noteMove`, `znotes.noteHtml`, `znotes.noteTodos`, `znotes.trash` | `notes`, `folders`, soft delete |
| `znotes.arts`, `znotes.aFolders` | `artifacts`, `artifact_versions`, `folders` |
| `znotes.pwEnc`, `znotes.dekMP`, `znotes.dekRK`, `znotes.vaultHash`, `znotes.vaultRK*`, `znotes.vaultFp`, `znotes.vaultMins`, `znotes.pwFolders` | `vault_items`, `vault_keys`, `folders(kind=passwords)` |
| `idb:emails` | `emails`, `email_attachments` (storage) |
| `znotes.codelib`, `znotes.links` | `sap_objects` |
| `znotes.tcodes`, `znotes.tcUse`, `znotes.sapTx` | `sap_tcodes`, `tcode_usage` |
| `kv.mg.v3` | tabelas `mg_*` |
| `kv.fn.v1` | `fn_records` |
| `kv.dev.v1` | `snippets`, `snippet_files`, `snippet_links` |
| `kv.share` | `public_links`, `shared_folders`, `share_members` |
| `kv.news.*`, `kv.footer.*` | `news_sources`, `news_items`, `news_saved` |
| `znotes.wx`, `znotes.wxLoc` | cache servidor (Redis) + `user_prefs.weather_city` |
| `znotes.home`, `znotes.nav`, `znotes.cols`, `znotes.*W`, `znotes.panels`, `znotes.bg`, `kv.theme`, `znotes.accent`, `znotes.glassBlur`, `znotes.uiScale`, `znotes.fontScale`, `znotes.brand`, `znotes.setTab`, `kv.mg.cols`, `kv.admin.navW` … | `user_prefs.data` |
