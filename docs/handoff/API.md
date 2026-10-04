# API (proposta)

Convenção: `/api/v1/...`, JSON, sessão por cookie, erros `{ error: { code, message } }`, paginação por cursor. Todas as rotas da app exigem sessão + entitlement do módulo. Rotas admin em `/api/admin/v1` com papel.

## Auth
- `POST /auth/register` { name, email, password, code } → valida código, cria tenant (se individual/licença) ou junta a tenant (convite), envia verificação
- `POST /auth/login` { email, password, remember } · `POST /auth/logout` · `POST /auth/reauth` { password } (ecrã de bloqueio)
- `POST /auth/forgot` { email } · `POST /auth/reset` { token, password } · `POST /auth/verify-email` { token }
- `POST /auth/2fa/setup|enable|disable|verify`
- `GET /me` → user, tenant, plan, entitlements, prefs · `PATCH /me` · `PUT /me/photo` · `POST /me/password`
- `GET|PUT /me/prefs` (tema, layout, larguras…)
- `POST /me/export` (zip) · `DELETE /me`

## Conteúdo (CRUD padrão: GET list, POST, GET :id, PATCH :id, DELETE :id)
- `/folders?kind=` · `/notes` (+ `POST /notes/:id/move` {folderId}) · `/notes/:id/attachments` (upload assinado)
- `/tags` · `/tasks` (+ subtasks) · `/calendar/events` · `/voice` (+ `POST /voice/:id/transcribe`)
- `/vault/keys` (GET/PUT wraps, salt, verifier) · `/vault/items` (ciphertext) · `/vault/folders`
- `/emails/import` (multipart .msg/.eml) · `/emails` · `/emails/:id/to-task`
- `/issues` · `/artifacts` (+ `/versions`, `POST /:id/move`) · `/snippets` (+ files, links) · `/api-requests` (+ `POST /api-requests/:id/execute` via proxy seguro)
- `/whiteboards` (doc JSON; gravação com `updated_at` e aviso de conflito — sem tempo real neste lançamento)
- `/search?q=` (full-text sobre notas, tarefas, objetos SAP, TCodes, transports…)

## SAP
- `/sap/objects` (+ `GET /sap/objects/resolve?names=` para links automáticos) · `/sap/systems` (+ `GET /:id/sapgui` → ficheiro .sap)
- `/sap/tcodes?q=` (catálogo) · `POST /sap/tcodes/:code/use`
- `/sap/transports` (filtros: system, client, project, type, status)
- `/sap/functional/:page` (proc|test|mig|cut)

## Management
- `/mg/teams` · `/mg/people` · `/mg/skills` · `/mg/areas` · `/mg/levels` · `/mg/clients` · `/mg/projects` (+ phases)
- `/mg/allocations` (+ `PATCH /:id/overrides` semanas/dias) · `GET /mg/capacity?from&to&team&groupBy=`
- `/mg/staff-requests` + `POST /mg/resource-finder` { skills[], level, from, to, hours, maxRate } → candidatos com disponibilidade
- `/mg/timesheets?week=` (+ submit/approve) · agregados por função/projeto/equipa

## Partilha e notícias
- `POST /share/links` {itemType, itemId, password?, expiresAt?} · `DELETE /share/links/:id` · `GET /p/:token` (pública)
- `/share/folders` (+ members: POST invite, PATCH perm/pause, DELETE) · `POST /share/folders/:id/accept`
- `/news/sources?scope=sap|footer` · `GET /news?scope=` (cache servidor) · `/news/saved`
- `GET /weather?lat&lon` ou `?city=` (proxy Open-Meteo com cache)

## Pedidos de plano (sem faturação na app)
- `GET /plans` (público) · `POST /plan-requests` {planId | modules[], seats, cycle, notes} → notifica administradores por email e aparece na Admin Console

## Admin Console (`/api/admin/v1`)
- `GET /overview` (MRR, ARR, atenção: pagamentos falhados, trials a terminar, lugares esgotados, tickets)
- `/tenants` (packs e individuais; PATCH plano, ciclo, lugares, estado, renovação) · `/users` (pausar, reativar, desativar, reset password)
- `/codes` (POST gera `KH-INV|LIC-######` aleatório único; PATCH pause/resume; DELETE revoke → acesso cortado, dados retidos 30 dias; `POST /:id/restore` dentro do prazo) 
- `/plans` (+ modules, limits, trial, preços por módulo, desconto anual, desconto pacote individual)
- `/admins` (papéis) · `GET /audit?from&to&actor&action&target` (+ CSV) · `/support/tickets`

## Jobs agendados
- Refresh feeds RSS (15 min) · expiração de trials, licenças e códigos (diário → tenant `suspended`) · lembretes de expiração (7/3/1 dias) · purge de revogados e soft-deletes (30 dias) · repetição de tarefas · agregados de uso por módulo · backup diário
