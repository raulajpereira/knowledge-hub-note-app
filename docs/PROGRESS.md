# KnowledgeHub v2 — progresso

Branch `v2` (órfão, sem histórico da v1). Fases conforme
`docs/handoff/DECISIONS_AND_INFRA.md §8` (prevalece sobre o ROADMAP).

| Fase | Estado |
|---|---|
| 0 — Infra + fundações técnicas | ✅ feito |
| 1 — Fundações de UI + i18n (componentes + páginas de componentes com screenshots) | ✅ feito (aprovado) |
| 2 — Auth, tenants, códigos, entitlements | ✅ feito (validado: super admin criado na VPS) |
| 3 — Shell, Definições, Dashboard | 🔧 3.1 Estrutura ✅ · 3.2 Definições ✅ · 3.3 Dashboard |
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
- Larguras de colunas/painéis ficavam no `localStorage` (`usePersistentState`); desde a Fase 3.1 vão para `user_prefs` (chaves `ui.*`, sincronizadas) dentro da app, sem mudar os componentes.
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
- ~~Ecrã para ativar 2FA e ver sessões abertas~~ → feito na Fase 3.1 (Conta e Dados).
- 2FA obrigatório para administradores da consola → Fase 10 (Admin Console).
- CAPTCHA (Turnstile) após falhas → Fase 11 (precisa de chaves Cloudflare).
- Job diário de expiração de licenças / purge dos revogados (30 dias) → Fase 10.

## Fase 3.1 — Estrutura da app (feito)
- **Shell** (`src/components/shell/`, igual ao `ZNotes.dc.html`): grelha 64 px / conteúdo / 36 px; barra superior (logótipo, pesquisa, SAP TCodes e SAP News só com os módulos `tcodes`/`news`, relógio Geist Mono + data, Whiteboard só com `whiteboard`, Atividade, Modo Foco, notificações, Consola de Administração só para o owner, bloquear); barra lateral (layout `NAV_DEFAULT`/ícones extraídos do protótipo, grupos recolhíveis, separadores, contadores, cartão "Mudar para PRO" no FREE, Lixo, Definições, Sobre, cartão de conta com iniciais e o selo do plano); rodapé com ticker de notícias.
- **Barra lateral filtrada pelo plano**: cada item só aparece se o módulo estiver nos entitlements do tenant; grupos e separadores que ficam vazios desaparecem. O servidor volta a verificar: `/app/<módulo>` fora do plano mostra "não está incluído no seu plano"; ids desconhecidos dão 404.
- **Coluna redimensionável** (pega como no protótipo, 180–480 px, duplo clique repõe 236 px) e **Modo Foco** (esconde a barra lateral).
- **Preferências sincronizadas** (`user_prefs`): `GET|PUT /api/v1/me/prefs` com merge-patch por chave (dois dispositivos a mudar coisas diferentes não se apagam), chaves validadas por Zod (`cols`, `nav`, `newsSources`, `ui.*`; desconhecidas recusadas; máx. 64 KB), escrita com debounce de 0,5 s e releitura quando a janela volta a ter foco. `usePersistentState` (tabelas, drawers) passou a gravar em `ui.*`.
- **Ecrã de bloqueio**: estado guardado na sessão do separador (sobrevive a recarregar), desbloqueio com `/auth/reauth` no servidor (bloqueio 5 falhas → 30 s, backoff), "Não é você?" termina a sessão.
- **Conta e Dados**: nome, licença (plano, validade, as 4 famílias de módulos), atalho para a consola (admins), exportar dados (JSON — perfil, tenant, preferências, sessões; cresce com cada módulo), terminar sessão, **alterar password** (pede a atual, termina as outras sessões, email de confirmação, bloqueio por tentativas), **2FA** (QR gerado no servidor, código, códigos de recuperação; ativar pede reautenticação se a última tem > 15 min; desativar pede password + código), **sessões ativas** (dispositivo pelo user-agent, IP, última atividade; terminar uma / as outras).
- **Sobre** (versão 2.0.0) e **Atividade** (intervalo + atalhos Hoje/Ontem/Esta Semana/Este Mês; fica vazia até existirem notas/tarefas na Fase 4).
- **Notícias do rodapé**: o servidor lê os RSS (fontes do protótipo por omissão; editáveis em Definições › Notícias na 3.2) sem proxies de terceiros, com proteção SSRF (só http/https, IPs privados/loopback/metadata bloqueados no momento da ligação, redirecionamentos verificados, 2 MB, 6 s), cache Redis 15 min, intercalado como no protótipo.
- **Páginas provisórias** para os módulos das fases seguintes e para `/admin` (só admins ativos; os outros recebem 404).
- **API nova**: `PATCH /me`, `GET|PUT /me/prefs`, `POST /me/password`, `GET|DELETE /me/sessions`, `DELETE /me/sessions/:id`, `GET /me/export`, `GET /news/ticker`; `/auth/2fa/setup` devolve também o QR (SVG).
- **Testes**: unitários (prefs, barra lateral/gating, RSS/Atom, SSRF, dispositivos) + integração (prefs merge-patch, alterar password termina as outras sessões, sessões só do próprio, exportação sem segredos) + E2E (barra filtrada e gate do servidor, largura sincronizada entre dois browsers, bloqueio/recarregar/desbloqueio, foco/sobre/conta). 92 unitários/integração + 18 E2E.
- **Screenshots** em `docs/screenshots/fase-3/` + comparações `cmp-*.png`.

## Fase 3.1 — textos novos (aprovados pelo utilizador)
"Em construção — Este módulo chega numa próxima fase do KnowledgeHub 2.0.", "Este módulo não está incluído no seu plano.", "O painel com cartões chega na próxima entrega desta fase.", "Sem notícias de momento.", "Confirme a sua password — Por segurança, indique a password para continuar.", texto dos códigos de recuperação do 2FA, "Código da app de autenticação", "Dispositivo desconhecido", "Notificações" (título do sino) (`src/i18n/dict/ui.*.json`). Os restantes vêm do protótipo.

## Fase 3.1 — desvios do protótipo
- ~~Fotografia de perfil~~ → feita na 3.2.
- Linha "O seu plano — Mudar de plano, comparar pacotes e faturação · Gerir plano" omitida: não há faturação na app e os pedidos de plano chegam com a página de preços e a consola (Fase 10). O botão "Go PRO →" do FREE abre por agora uma página provisória.
- Password mínima: o protótipo da conta diz "Mínimo de 10 caracteres"; uso a mesma regra do registo/reset (8, `MIN_PASSWORD`) e a mensagem do registo, para não haver duas regras (o utilizador deixou ao critério do Claude).
- O botão SAP TCodes abre a página de TCodes (popup com catálogo na Fase 7); o sino não tem ainda notificações (não há eventos até às fases de conteúdo).
- Selo FREE: o protótipo não tinha cor para FREE (caía na do ULTRA); usa um selo neutro claro.
- Saudação do Início calculada no fuso de Lisboa no servidor; o painel (3.3) passa a usar a hora do browser.

## Fase 3.2 — Definições (feito)
- **Página `/app/settings`** igual ao protótipo: coluna de separadores redimensionável (180–520 px, duplo clique repõe), título e cartões de vidro. Separadores conforme o plano: Aparência e Notícias para todos; **Marca** só com o módulo `brand`; **Barra lateral** só com `sidebar`. Passwords, SAP GUI, Partilhas e Management aparecem com os respetivos módulos (Fases 5, 7, 9, 8).
- **Aparência**: fundos Areia/Grafite/Crepúsculo; **foto de fundo** (módulo `bgphoto`) com desfoque e escurecer; **tipo de letra** (módulo `typeface`) — 8 tipos do protótipo com pré-visualização ao passar o rato, servidos pela própria app (@fontsource, sem pedidos ao Google); **tamanho** do texto (85–125 %) e dos elementos (80–120 %, `zoom` como no protótipo); **Liquid Glass** (módulo `glass`, 0–80 px ou "Original"); **cor de destaque** (módulo `accent`, 8 cores + cor personalizada); **idioma** PT/EN (cookie + `users.lang`).
- **Marca**: logótipo da empresa no lugar do logótipo KnowledgeHub na barra superior.
- **Notícias**: fontes RSS do rodapé (ligar/desligar, remover, adicionar por endereço, estado Ativa/Erro/Desligada, atualizar); o ticker recarrega quando as fontes mudam.
- **Barra lateral**: editor do protótipo — renomear (vazio repõe o nome original), agrupar/desagrupar, esconder, subir/descer, arrastar pela pega, adicionar grupo/espaçador, remover, repor. Abrir/fechar grupos na barra continua disponível para todos os planos (guardado à parte em `ui.navOpen`).
- **Foto de perfil** em Conta e Dados (barra lateral, ecrã de bloqueio, conta).
- **Imagens (foto de perfil, fundo, logótipo)**: o browser redimensiona e volta a codificar (perfil 256×256 JPEG, fundo ≤2000 px JPEG, logótipo ≤200 px de altura PNG — SVG também é convertido para PNG); o servidor verifica a assinatura real do ficheiro (só PNG/JPEG/WebP), tamanho (1 MB / 4 MB / 1 MB), módulo e limite de pedidos, guarda no bucket privado (MinIO) e só a devolve ao próprio dono através da app (`/api/v1/me/assets/:kind`), com URL versionado em cache. Tabela nova `user_assets` (migração 0003).
- **Preferências com plano**: as chaves de personalização (`font`, `accent`, `glassBlur`, `nav`, fundo em modo foto) só são aceites pelo servidor com o módulo correspondente (403 caso contrário) e são ignoradas se o plano deixar de as incluir. Valores que chegam ao CSS são validados (listas fechadas, intervalos, `#rrggbb`).
- **Testes**: 99 unitários/integração (inclui validação de CSS, gates por módulo, assinaturas de imagem, upload/substituição/remoção) + 19 E2E (separadores conforme o plano, fundo sincronizado após recarregar, o servidor recusa `font` sem módulo, upload da foto de perfil).
- **Screenshots** `docs/screenshots/fase-3/20-*` a `25b-*` + `cmp-definicoes.png`.

## Fase 3.2 — notas
- Por omissão (catálogo do protótipo) os planos não incluem os módulos de "Personalização" (são add-ons): um cliente PRO/ULTRA só vê Tipo de Letra, Liquid Glass, Cor de Destaque, Marca, Barra lateral e Foto de fundo se esses módulos lhe forem atribuídos (na consola, Fase 10). O teu tenant tem todos.
- Textos novos (curtos): "A imagem é demasiado grande.", "Não foi possível ler esta imagem. Use PNG, JPEG ou WebP.", "A carregar…". Os restantes vêm do protótipo.

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
| D23 | Ecrã de bloqueio: estado de cliente (sessionStorage) + desbloqueio por `/auth/reauth`; a sessão continua válida no backend (SECURITY.md §2) | SECURITY.md |
| D24 | `user_prefs` por merge-patch de chaves de topo validadas (lista fechada + `ui.*`), não um JSON livre | Claude |
| D25 | RSS do rodapé lido no servidor (sem rss2json/allorigins do protótipo), com proteção SSRF e cache Redis | Claude (SECURITY.md) |
| D26 | Imagens do utilizador servidas pela app (stream do MinIO, só ao dono), não por URLs assinados: o MinIO não fica exposto à internet | Claude |
| D27 | Fontes tipográficas servidas pela app (@fontsource), sem Google Fonts | Claude |
| D15 | Migrações correm como owner (`DATABASE_ADMIN_URL`) num contentor `migrate` antes do `up` | Claude |
