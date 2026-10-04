# Handoff — KnowledgeHub v2.0.0 (SaaS)

> Documento de passagem para implementação e deploy. Lê primeiro este ficheiro e depois **`DECISIONS_AND_INFRA.md`** (decisões finais: VPS Hostinger, sem Stripe, sem instâncias dedicadas, sem tempo real, revogação com retenção de 30 dias — **prevalece** sobre os outros documentos). Os restantes (`DATA_MODEL.md`, `SECURITY.md`, `API.md`, `ROADMAP.md`, `schema.sql`) detalham cada área.

## 1. O que é
KnowledgeHub é uma app SaaS multi-cliente para consultores e equipas SAP: notas ricas, tarefas, calendário, notas de voz, cofre de passwords (encriptado), emails importados, project issues, artifacts HTML, biblioteca de código (genérica e SAP), API playground, whiteboard infinito, gestão de equipas/alocações/timesheets (Management), módulos SAP (sistemas, TCodes, ordens de transporte, processos, testes, migração, cutover), SAP News e partilha (links públicos e pastas partilhadas).
É vendida por **pacotes** (FREE, PRO, DEVELOPER, SAP, MANAGEMENT, ULTRA) ou **pacote individual** (módulos à la carte), com trial configurável. **As vendas e a faturação são feitas fora da app**; a ativação é feita com códigos de licença gerados na **Admin Console**. Todos os clientes partilham a mesma instância (sem instâncias dedicadas).

## 2. Sobre os ficheiros de design
A pasta `design/` contém **protótipos HTML de alta fidelidade** (hi-fi). São referências de aspeto e comportamento, **não código de produção**. O trabalho é **recriar** estes ecrãs numa stack real, com backend, base de dados e autenticação. Cores, tipografia, espaçamentos, raios, sombras, textos (PT/EN) e interações devem ser reproduzidos fielmente.

Os ficheiros `.dc.html` são "Design Components": um template HTML com estilos inline + uma classe JS (`class Component extends DCLogic`) cujo `renderVals()` devolve os valores do template. Abrem diretamente no browser (precisam de `support.js` ao lado). Para perceber um ecrã: ler o template (markup) e procurar no JS a chave com o mesmo nome.

Todo o estado do protótipo está em `localStorage`/`sessionStorage`/IndexedDB do browser — ver `DATA_MODEL.md §6` para o mapa de chaves → tabelas.

## 3. Fidelidade
**Hi-fi.** Recriar pixel-perfect. O estilo é "liquid glass" sobre fundo fotográfico/gradiente escuro quente, com acento azul configurável.

## 4. Stack e alojamento
Alojamento numa **VPS Hostinger** com Docker Compose (detalhe completo em `DECISIONS_AND_INFRA.md`).
| Camada | Escolha |
|---|---|
| Front + API | **Next.js 15 (App Router) + React 19 + TypeScript** (output standalone, Node 22) |
| Estilo | Tailwind CSS + CSS variables (accent, blur, escalas, fundo) |
| Estado cliente | TanStack Query + Zustand |
| Editor de notas | **TipTap** (ProseMirror) |
| Whiteboard | **tldraw** (sem multiplayer neste lançamento) |
| Base de dados | **PostgreSQL 16** (container na VPS) com Row Level Security por tenant |
| ORM / validação | Drizzle ORM + Zod |
| Auth | Própria: Argon2id, sessões em BD com cookie httpOnly, TOTP 2FA |
| Ficheiros | **MinIO** (S3 compatível, container na VPS), URLs assinados |
| Cache / filas | **Redis 7** + BullMQ (worker separado) |
| Proxy / TLS | **Caddy** (Let's Encrypt automático) |
| Email | SMTP externo (Hostinger Email, Brevo ou Resend) |
| Backups | pg_dump + restic para armazenamento externo (B2/S3) |
| Monitorização | Uptime Kuma + Sentry |
| Faturação | **Fora da app** — vendas geridas externamente; ativação por códigos de licença na Admin Console |

## 5. Páginas / ecrãs (todos em `design/`)
| Ficheiro | Rota sugerida | Notas |
|---|---|---|
| `Login.dc.html` | `/login` | Split: slogan à esquerda, cartão vidro à direita. Email, password (mostrar/ocultar), Lembrar-me, **Esqueceu-se?** (pede o email e envia o link de recuperação — no protótipo aparece um link "demo" que simula o email), link Criar conta, seletor PT/EN. Rate-limit 5 tentativas → 30 s. |
| `ResetPassword.dc.html` | `/reset-password?token=…` | Página aberta pelo link do email de recuperação. Estados: **formulário** (nova password + confirmar, medidor de força, 3 regras com visto, nota sobre sessões e cofre), **sucesso** (password alterada → Iniciar sessão), **link inválido/expirado** (→ Pedir novo link). Token de uso único, 30 min. |
| `Register.dc.html` | `/register` | Nome, email, password (medidor de força 4 barras, mín. 8), **Licença** (`KH-INV-######` ou `KH-LIC-######`). |
| `ZNotes.dc.html` | `/app/*` | A app completa (shell + todas as páginas abaixo). |
| `Management.dc.html` | `/app/management/*` | Importado pela app (10 páginas). |
| `DevLibrary.dc.html` | `/app/code` | Biblioteca de código genérica (30 linguagens em `devlib-langs.js`). |
| `SapFunctional.dc.html` | `/app/sap/{processes,tests,migration,cutover}` | Esquema em `fn-schema.js`. |
| `SapNews.dc.html` | `/app/news` | Feed RSS + guardadas. |
| `Whiteboard.dc.html` | `/app/whiteboard` | |
| `Sharing.dc.html` | modal | Link público, pastas partilhadas, gestão em Definições. |
| `VaultKeys.dc.html` | modal | Chave de recuperação do cofre (estilo Passbolt). |
| `Pricing.dc.html` | modal / `/pricing` | Planos, comparação, "Why KnowledgeHub". Botões **Pedir este plano / Pedir mudança para X** criam um pedido (sem checkout); pedido de pacote personalizado. |
| `Admin Console.dc.html` | `/admin/*` (subdomínio `admin.` recomendado) | Consola de administração. |

### 5.1 App (`ZNotes.dc.html`) — mapa de páginas
Barra lateral (reordenável por drag, grupos colapsáveis, largura ajustável; layout por utilizador). IDs de navegação entre parêntesis.

- **Início / Dashboard** (`home`): widgets reordenáveis/redimensionáveis em modo edição — saudação, meteorologia (Open-Meteo + geolocalização/IP), tarefas por tipo (Funcional/Técnica vs Gestão), favoritos, acesso rápido, shortcuts (com favicon), captura rápida, pomodoro, TCodes, ordens em curso, problemas abertos.
- **Calendário** (`calendar`)
- **Notas** (`notes`): pastas (notebooks) + pastas partilhadas; editor rico; inspector com objetos/TCodes/ligações; links automáticos para objetos da Code Library; colar HTML/imagens; arrastar notas entre pastas; favoritos; lixo.
- **Notas de Voz** (`voice`): gravar microfone/áudio do PC, transcrição (requer serviço STT — ver ROADMAP).
- **Tarefas** (`tasks`): tipo (tech/mgmt), prioridade, repetição, subtarefas, projeto (do Management), pastas partilhadas.
- **Passwords** (`passwords`): cofre encriptado (AES-256-GCM), pastas, gerador, TOTP, partilha, chave de recuperação, auto-bloqueio.
- **Emails** (`emails`): importar `.msg`/`.eml` (parser no cliente), pastas, criar tarefa a partir do email.
- **Tarefas de Projeto / Project Issues** (`issues`): tabela com colunas ajustáveis + Kanban.
- **Management** (`mg_*`): Visão Geral, Equipas, Recursos, Competências (matriz), Projetos (fases, orçamento), Painel de Alocação, Alocações (Timeline/Semanas/Dias, arrastar barras, editar horas), Pesquisar Recursos (Resource Finder), Folhas de Tempos, Clientes.
- **Artifacts** (`artifacts`): HTML com versões, pastas, preview/código, partilha.
- **Biblioteca de Código** (`devlib`) e **API Playground** (`api`).
- **SAP**: Biblioteca de Código SAP (`codelib`, objetos ABAP, tabelas em vista SAP, includes/links), Sistemas SAP (`systems`, SAP GUI shortcut), SAP TCodes (`tcodes` + popup global), Ordens de Transporte (`transports`, filtros múltiplos), Processos/Testes/Migração/Cutover (`fn_*`).
- **Tags**, **Whiteboard**, **SAP News**, **Lixo**, **Sobre**, **Definições** (Aparência: fundo/foto, tipo de letra, tamanho texto/UI, blur liquid glass, cor de destaque, idioma; Marca; Passwords; SAP GUI; Notícias do rodapé; Barra lateral; Partilha; Management).
- Barra superior: pesquisa global, SAP TCodes, SAP News, relógio/data, Admin Console (só administradores), bloquear.
- Rodapé: ticker de notícias RSS (fontes configuráveis) + © ano KnowledgeHub.
- **Gating por plano**: cada item da barra lateral/definição só aparece se o plano (ou add-ons) o incluir — ver `DATA_MODEL.md §3`.

### 5.2 Admin Console
Secções: Visão Geral (MRR/ARR, "Precisa de atenção"), Packs Utilizadores (clientes com vários lugares, agrupadores expansíveis), Utilizadores Individuais, Códigos (Convite/Licença, `KH-INV-######`/`KH-LIC-######`, nº de utilizadores, validade ou vitalício, pausar/revogar), Pacotes e Preços (módulos por grupo, trial por pacote, limites do FREE, preços por módulo para pacote individual), Administradores (papéis: Manager, Administrador, Faturação, Suporte, Só leitura), Auditoria (filtros + export CSV). Barra superior: Back To App + bloquear. Partilha tema/fundo/blur com a app.

## 6. Design tokens
- Fundo: foto do utilizador ou gradientes quentes; overlay `rgba(20,14,10,.12–.22)` + `backdrop-filter: blur(var(--glass-blur))`.
- Vidro (cartões): `linear-gradient(180deg, rgba(255,255,255,.12–.22), rgba(255,255,255,.04–.10))`, `border: 1px solid rgba(255,255,255,.12–.28)`, `box-shadow: inset 0 1px 0 rgba(255,255,255,.18–.4), 0 30px 70px rgba(0,0,0,.25)`, blur 30–40 px saturate 150–170 %.
- Texto: `#fbf8f5`; secundário `rgba(255,248,240,.6–.8)`; botão primário fundo `#fbf8f5` texto `#2a211c`.
- Acento por omissão: `oklch(0.76 0.17 245)` (azul "Hub"); configurável pelo utilizador.
- Estados: verde `oklch(0.78 0.14 150)`, âmbar `oklch(0.82 0.13 85)`, vermelho `oklch(0.70 0.17 25)`, violeta (Gestão) `oklch(0.76 0.14 305)`.
- Alocação: <90 % âmbar, 90–100 % verde, >100 % vermelho.
- Raios: 999 px (pílulas), 30 px (painéis), 20–28 px (cartões/modais), 12–14 px (inputs).
- Tipografia: Geist (UI) + Geist Mono (códigos/números); escala ajustável pelo utilizador (`--font-scale`, `--ui-scale`).
- Scrollbars auto-ocultas; colunas e painéis redimensionáveis com persistência por utilizador.

## 7. Documentos neste pacote
- `DATA_MODEL.md` — entidades, relações, multi-tenant, mapa localStorage → tabelas.
- `schema.sql` — DDL PostgreSQL inicial com RLS.
- `SECURITY.md` — autenticação, autorização, cofre E2E, partilha, RGPD, checklist.
- `API.md` — endpoints REST/RPC por domínio + webhooks.
- `ROADMAP.md` — o que falta implementar, por fases, com critérios de aceitação.
- `PROMPT_CLAUDE_CODE.md` — texto para colar no Claude Code para iniciar a implementação.
- `DECISIONS_AND_INFRA.md` — decisões finais e arquitetura da VPS (Docker Compose, Caddy, Postgres, Redis, MinIO, backups, CI/CD).

## 8. Como usar com o Claude Code
1. Criar repositório Next.js + Drizzle + Postgres e o `docker-compose.yml` da VPS (ver `DECISIONS_AND_INFRA.md`).
2. Copiar `design/` para `docs/design/` no repo (referência).
3. Pedir ao Claude Code para implementar fase a fase seguindo `ROADMAP.md`, abrindo o `.dc.html` correspondente para cada ecrã.
4. Começar por: tokens + shell + auth (Fase 0–1), depois módulos.
