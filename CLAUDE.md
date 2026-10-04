# KnowledgeHub v2 — notas para o Claude

Branch `v2` (órfão). A v1 vive nos branches `main`/`v1` e **nunca** deve ser
tocada a partir daqui.

## Fontes de verdade

- `docs/handoff/` — protótipos (`design/*.dc.html`) e documentação. `DECISIONS_AND_INFRA.md` prevalece.
- `docs/PROGRESS.md` — fases, o que está feito, decisões (manter sempre atualizado).
- `docs/DEPLOY.md` — VPS, corte, backups.

## Forma de trabalhar (pedida pelo utilizador)

- Uma fase de cada vez; no fim mostrar o que ficou feito, como testar e o que falta, e **esperar confirmação**.
- Cada ecrã novo: comparar com o `.dc.html` correspondente e mostrar **screenshots** antes de dar por concluído.
- Ambiguidades no design/documentação: perguntar antes de assumir.
- Nunca credenciais no código; variáveis novas vão para `.env.example` (documentadas) e `src/lib/env.ts`.
- Permissões, limites FREE e papéis de admin verificados sempre no servidor.
- Acesso a dados de tenant sempre via `withTenant()` com a ligação `kh_app`.

## Verificações antes de cada push

`npm run lint -- --max-warnings 0 && npm run typecheck && npm run format:check && npm test && npm run build`
(testes de integração precisam de `TEST_DATABASE_ADMIN_URL` / `TEST_DATABASE_URL`).

## Deploy

Push para `v2` → workflow `.github/workflows/v2.yml` (CI → GHCR → deploy só para `VPS_APP_DIR_V2`).
Acompanhar o run até ficar verde. Commits com autor `Claude <noreply@anthropic.com>`.
