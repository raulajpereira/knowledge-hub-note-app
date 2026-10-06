# KnowledgeHub v2 — progresso

Branch `v2` (órfão, sem histórico da v1). Fases conforme
`docs/handoff/DECISIONS_AND_INFRA.md §8` (prevalece sobre o ROADMAP).

| Fase | Estado |
|---|---|
| 0 — Infra + fundações técnicas | ✅ feito |
| 1 — Fundações de UI + i18n (componentes + páginas de componentes com screenshots) | ✅ feito (aprovado) |
| 2 — Auth, tenants, códigos, entitlements | ✅ feito (a aguardar validação) |
| 3 — Shell, Definições, Dashboard | ⏳ |
| 4 — Notas, Tarefas, Calendário | ⏳ |
| 5 — Cofre, Emails, Issues | ⏳ |
| 6 — Developer (Artifacts, Code Library, API, Whiteboard) | ⏳ |
| 7 — SAP | ⏳ |
| 8 — Management | ⏳ |
| 9 — Partilha | ⏳ |
| 10 — Admin Console + pedidos de plano | ⏳ |
| 11 — Hardening e lançamento | ⏳ |

## Fase 0 — feito
- Next.js 15 (App Router, output standalone) + React 19 + TypeScript strict, Tailwind 4 com os tokens de design em CSS variables (`src/app/globals.css`), fontes Geist, logótipo (`src/components/brand/Logo.tsx`).
- `basePath` configurável em build (`NEXT_PUBLIC_BASE_PATH`): `/v2` até ao corte, vazio depois.
- Variáveis de ambiente validadas com Zod (`src/lib/env.ts`), todas documentadas em `.env.example`.
- PostgreSQL + Drizzle: migração `0000_foundations` (citext, pgcrypto, `uuid_generate_v7()`, papel `kh_app` sem privilégios/sem BYPASSRLS, `kh_tenant_id()`/`kh_user_id()`), `withTenant()` (contexto por transação), runner de migrações (`dist/migrate.mjs`).
- Redis (ioredis), BullMQ (fila `kh-system`, agendador, heartbeat), MinIO/S3 (bucket privado).
- `/api/health`: PostgreSQL, Redis e MinIO (503 se algum falhar) + idade do heartbeat do worker.
- Docker: `Dockerfile` (alvos `web` e `worker`), `docker-compose.yml` com limites de memória para KVM 1, init do Postgres (papel `kh_app`), `minio-init`, Caddy no perfil `edge` (corte), `docker-compose.dev.yml`.
- Nginx: snippet para servir `/v2` sem tocar na v1. Caddyfile final (`/v1` → v1, raiz → v2).
- CI/CD (`.github/workflows/v2.yml`): lint, typecheck, prettier, testes unitários + integração (RLS), migrações, build, E2E Playwright com Postgres/Redis/MinIO reais → imagens GHCR → deploy SSH só para `VPS_APP_DIR_V2`.
- Scripts VPS: `infra/vps/setup.sh` (Docker, swap, UFW, fail2ban, updates), `infra/backup/backup.sh` (pg_dump + MinIO + restic, retenção 7/4/6), `restore-test.sh`.
- Testes: `tests/unit/env.test.ts`, `tests/integration/rls.test.ts` (isolamento entre tenants, sem fuga entre pedidos no mesmo pool, escrita noutro tenant recusada), `tests/e2e/smoke.spec.ts`.
- Página provisória "Em construção" em `/v2` (screenshots enviadas, a aguardar aprovação).

## Fase 1 — feito
- **Componentes** (`src/components/ui/`, estilos 1:1 dos protótipos em `ui.css`): Glass (painel/cartão/suave), Well, AmbientBackground (Areia/Grafite/Crepúsculo + foto), Button (primário, vidro, contorno, perigo, perigo-contorno, acento; sm/md/lg; loading), IconButton, Chip (filtro com contagem/ponto), Tag (estado e código), Badge, Pill, Field + Input (lg/md), PasswordInput (mostrar/ocultar), SearchInput, Textarea, Select de vidro (initSelects: pesquisa >10 opções, teclado, posicionamento cima/baixo), Checkbox, Switch, Segmented, Message, Modal (blur em camadas, pilha, Esc só fecha a camada de cima, foco preso/restaurado), ConfirmDialog + `useConfirm()`, Toast + `useToast()`, Drawer redimensionável (pega, duplo clique repõe, teclado), ResizableTable (initRT: arrastar bordas, duplo clique repõe, larguras memorizadas, ordenação, seleção, vazio).
- **i18n** (`src/i18n/`): dicionários extraídos dos protótipos por `scripts/extract-i18n.mjs` — `I18N` (793 chaves PT/EN), `AD_EX` (297) + 60 regras, `MG_EX` (210) + 55 regras; `ui.*.json` (rótulos genéricos escritos à mão). `translate`, `trAdmin`, `trMg` (mesma semântica de `adTr`/`mgTr`), `I18nProvider`/`useI18n`, idioma por cookie `kh_lang` → Accept-Language; o servidor desenha logo no idioma certo.
- **Catálogo** `/ui` (11 páginas, uma por componente) — sempre ativo em dev, em produção só com `KH_UI_CATALOG=true`.
- **Screenshots** em `docs/screenshots/fase-1/` (todas as páginas + estados: select aberto/filtrado, modal, confirmação sobre modal, drawer e tabela a redimensionar, toasts, EN) e comparações lado a lado com os protótipos (`cmp-*.png`).
- **Testes**: unitários do i18n (paridade PT/EN, regras, deteção de idioma) + E2E dos componentes (select por teclado, pilha de modais/Esc/foco, redimensionar e persistir colunas, ordenar/selecionar, drawer com limites, troca de idioma persistente, toasts, checkbox/switch).

## Fase 1 — notas / desvios
- **Toast** não existe nos protótipos como componente: estilizado a partir do menu de vidro (pílula ao fundo, ao centro).
- Larguras de colunas/painéis ficam por agora no `localStorage` (`usePersistentState`); passam para `user_prefs` (sincronizadas) na Fase 3 sem mudar os componentes.
- Uma regra de tradução da consola (texto de "Revogar") usava uma função e não é extraída; o próprio texto contradiz a decisão dos 30 dias e será reescrito na Fase 10.
- O Tailwind/Lightning CSS eliminava o `backdrop-filter` quando eu escrevia também `-webkit-backdrop-filter`: os estilos usam só a propriedade normal e o build acrescenta o prefixo.

## Fase 2 — feito
- **Base de dados** (`src/db/schema/identity.ts`, migrações 0001–0002): plans, modules, plan_modules, plan_limits, tenants, tenant_modules, users, sessions, auth_tokens, recovery_codes, codes, code_redemptions, admins, audit_log (só inserção para a app), user_prefs; CHECKs de valores permitidos; um único owner.
- **Autenticação** (`src/server/auth/`): Argon2id (64 MiB, t=3, p=1); sessões em cookie httpOnly/SameSite=Lax/Secure (30 dias com "Lembrar-me", 12 h sem), só o SHA-256 do token na BD, rotação a cada login; bloqueio 5 falhas → 30 s com backoff progressivo (até 15 min) por email+IP; verificação de email obrigatória (link 24 h, confirmado por POST para não ser consumido por scanners); recuperação de password (token 32 bytes, 30 min, uso único, resposta genérica, termina todas as sessões, email de confirmação, não mexe no cofre); reauth do ecrã de bloqueio; 2FA TOTP (RFC 6238) com 10 códigos de recuperação; HIBP k-anonymity nas passwords novas; CSRF por verificação de Origin; auditoria de todos os eventos.
- **Licenciamento** (`src/server/licensing/`): códigos `KH-LIC-######` / `KH-INV-######` resgatados em transação (`FOR UPDATE`); LIC cria o tenant (admin) e os lugares seguintes juntam-se; INV junta ao tenant ou cria um individual (FREE); pausar/retomar/revogar (dados mantidos 30 dias, tenant `deleted_at`)/restaurar com efeito imediato; entitlements = plano ∪ add-ons, no servidor, cache Redis 60 s; limites FREE.
- **Catálogo** (seed idempotente em cada deploy): 37 módulos em 7 grupos, 6 planos com preços/módulos do protótipo, limites FREE; o teu utilizador como **super admin (owner)** num tenant próprio com todos os módulos, criado sem password e com link "definir password" (7 dias).
- **CLI** (`dist/cli.mjs`, até existir a Admin Console): criar/listar/pausar/retomar/revogar/restaurar códigos, listar utilizadores, reenviar o link do super admin.
- **Email**: templates PT/EN (confirmar email, recuperar, password alterada, primeiro acesso), envio pelo worker (BullMQ, 5 tentativas com backoff); sem SMTP ficam nos logs do worker.
- **Ecrãs** (iguais aos protótipos): Login (com "Esqueceu-se?" no cartão, bloqueio, passo 2FA), Registo (medidor de força, código), Definir nova password (formulário / sucesso / link inválido + primeiro acesso), Confirmar email, `/app` provisória (olá, plano, módulos, terminar sessão). Raiz → `/app` ou `/login`; `/app/*` protegido.
- **API**: `/api/v1/auth/{register,login,login/2fa,logout,forgot,reset,verify-email,reauth,2fa/setup,2fa/enable,2fa/disable}`, `/api/v1/me`.
- **Testes**: 11 de integração (regras de códigos, verificação, bloqueio, recuperação, pausar/revogar, entitlements/limites, 2FA, super admin, reauth) + unitários (vetores RFC do TOTP, formato de códigos, força, HIBP, regras de acesso, CSRF) + E2E (registo com código → confirmar → login → app → sair; recuperação; bloqueio; EN).
- **Screenshots** em `docs/screenshots/fase-2/` + comparações com os protótipos (`cmp-*.png`).

## Fase 2 — textos novos (não existem nos protótipos, a aprovar)
Mensagens de conta por confirmar, códigos inválido/pausado/expirado/esgotado/sem lugares, email já registado, password comprometida, acesso suspenso/revogado, passo 2FA, página "Confirmar email", título "Definir password" do primeiro acesso, página `/app` provisória e os 4 emails (`src/i18n/dict/ui.*.json`, `src/server/mail/templates.ts`). A mensagem do registo mudou de "A redirecionar para o início de sessão" para "Enviámos um email para confirmar" (verificação obrigatória — SECURITY.md).

## Fase 2 — adiado (com fase prevista)
- Ecrã para ativar 2FA e ver sessões abertas → Fase 3 (Definições › Conta). A API já existe.
- 2FA obrigatório para administradores da consola → Fase 10 (Admin Console).
- CAPTCHA (Turnstile) após falhas → Fase 11 (precisa de chaves Cloudflare).
- Job diário de expiração de licenças / purge dos revogados (30 dias) → Fase 10.

## O que falta / depende do utilizador
- Preparar a VPS e o `.env` (ver `docs/DEPLOY.md` §1–4) e criar o secret `VPS_APP_DIR_V2`.
- Backups adiados por decisão do utilizador (D17).
- Caixa SMTP da Hostinger para envio (`no-reply@knowledge-hub.cloud`).
- Uptime Kuma / Sentry: adiados para a Fase 11 (memória do KVM 1).

## Decisões tomadas
| # | Decisão | Origem |
|---|---|---|
| D1 | v2 num branch órfão `v2`; v1 intacta na sua pasta, MySQL e PM2 | utilizador |
| D2 | Até ao corte: v2 em `knowledge-hub.cloud/v2` via Nginx existente; depois do corte: v2 na raiz, v1 em `/v1`, Caddy como proxy | utilizador |
| D3 | Admin Console em `knowledge-hub.cloud/admin` (mesma app, rotas `/admin/*`), não subdomínio | utilizador |
| D4 | Sem importação automática de dados v1→v2 (feita à mão pelo utilizador) | utilizador |
| D5 | Base de dados separada (PostgreSQL novo); MySQL da v1 intocado | utilizador |
| D6 | VPS KVM 1: 1 réplica `web` (não 2) com limites de memória e 2 GB de swap; deploy tem ~segundos de indisponibilidade | KVM 1 |
| D7 | Overview da consola: MRR = preço × lugares definidos manualmente; sem "pagamentos falhados"; estado `past_due` removido | utilizador |
| D8 | Fase 1: páginas de componentes (todas) com screenshots em vez de Storybook | utilizador |
| D9 | Cofre: Argon2id (WASM, m=64 MiB, t=3, p=1) para a palavra-passe mestra desde o lançamento (sem PBKDF2); DEK 256 bits, AES-256-GCM; chave de recuperação 256 bits aleatória (HKDF-SHA256 → chave de embrulho); verificador derivado separado; tudo no cliente | Claude (pedido "o mais seguro possível") |
| D10 | Email transacional por SMTP Hostinger | utilizador |
| D11 | Primeiro super admin = `SUPERADMIN_EMAIL` do `.env` (raul.a.j.pereira@gmail.com); criado pelo seed sem password utilizável, recebe link de definição de password; 2FA obrigatório | utilizador + SECURITY.md |
| D12 | `tenant_id` em **todas** as tabelas de conteúdo (incl. `vault_items`, `task_subtasks`, `voice_notes`…) para RLS uniforme; app liga-se como `kh_app` (não owner, sem BYPASSRLS) | Claude |
| D13 | Conteúdo de utilizador (Artifacts HTML) servido de `usercontent.knowledge-hub.cloud` (origem separada, sem cookies) — DNS a criar na Fase 6 | Claude |
| D14 | Fase 0 = infra + fundações técnicas; componentes/i18n na Fase 1 (ordem do DECISIONS §8) | DECISIONS_AND_INFRA |
| D16 | A MinIO deixou de publicar imagens (`minio/minio`, `minio/mc` já não existem no Docker Hub): usar `pgsty/minio` + `pgsty/mc` (builds comunitários do mesmo código MinIO), fixados a uma versão | utilizador |
| D18 | Tabelas de identidade/licenciamento são globais (sem RLS): são lidas antes de haver tenant (login, resgate de código) e só o serviço de auth lhes toca; o RLS protege o conteúdo (Fase 3+) | Claude |
| D19 | Código `KH-LIC` com N lugares: o 1.º registo cria o tenant (pack se N>1) e fica admin; os seguintes juntam-se como membros até esgotar. `KH-INV` sem tenant cria um tenant individual com o plano do código (FREE por omissão) | Claude (DATA_MODEL §2) |
| D20 | O link de confirmação de email confirma por POST feito pela página (não no GET), para não ser gasto por scanners de email | Claude |
| D21 | Sem SMTP configurado, os emails ficam nos logs do worker (fluxos continuam utilizáveis pelo operador) | Claude |
| D22 | Bloqueio do login: 5 falhas → 30 s (protótipo), depois 60 s, 120 s… até 15 min (SECURITY.md "backoff progressivo") | Claude |
| D17 | Backups externos adiados (scripts prontos em `infra/backup/`, não agendados); a ativar antes de haver dados reais na v2 | utilizador |
| D15 | Migrações correm como owner (`DATABASE_ADMIN_URL`) num contentor `migrate` antes do `up` | Claude |
