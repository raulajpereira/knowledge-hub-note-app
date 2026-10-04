# KnowledgeHub v2 — progresso

Branch `v2` (órfão, sem histórico da v1). Fases conforme
`docs/handoff/DECISIONS_AND_INFRA.md §8` (prevalece sobre o ROADMAP).

| Fase | Estado |
|---|---|
| 0 — Infra + fundações técnicas | ✅ feito (a aguardar validação) |
| 1 — Fundações de UI + i18n (componentes + páginas de componentes com screenshots) | ⏳ |
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

## O que falta / depende do utilizador
- Preparar a VPS e o `.env` (ver `docs/DEPLOY.md` §1–4) e criar o secret `VPS_APP_DIR_V2`.
- Destino externo dos backups (ex. Backblaze B2) → `infra/backup/.env.backup`.
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
| D16 | **A confirmar:** a MinIO deixou de publicar imagens (`minio/minio`, `minio/mc` já não existem no Docker Hub). Provisoriamente: `pgsty/minio` + `pgsty/mc` (builds comunitários do mesmo código MinIO), fixados a uma versão. Alternativas: Garage ou RustFS (S3-compatíveis, imagens oficiais) | Claude → utilizador |
| D15 | Migrações correm como owner (`DATABASE_ADMIN_URL`) num contentor `migrate` antes do `up` | Claude |
