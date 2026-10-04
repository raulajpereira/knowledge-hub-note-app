# KnowledgeHub v2 — progresso

Branch `v2` (órfão, sem histórico da v1). Fases conforme
`docs/handoff/DECISIONS_AND_INFRA.md §8` (prevalece sobre o ROADMAP).

| Fase | Estado |
|---|---|
| 0 — Infra + fundações técnicas | ✅ feito |
| 1 — Fundações de UI + i18n (componentes + páginas de componentes com screenshots) | ✅ feito (a aguardar validação) |
| 2 — Auth, tenants, códigos, entitlements | ⏳ |
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
| D17 | Backups externos adiados (scripts prontos em `infra/backup/`, não agendados); a ativar antes de haver dados reais na v2 | utilizador |
| D15 | Migrações correm como owner (`DATABASE_ADMIN_URL`) num contentor `migrate` antes do `up` | Claude |
