# Ambientes (workspaces) — plano, decisões e estado

Documento de trabalho: guarda o plano aprovado, as decisões do utilizador e o
estado de cada fase, para não se perder contexto entre sessões.

## Regras de ouro (do utilizador)

- **Não perder nenhum dado.** Migrações só acrescentam (sem DROP / RENAME),
  verificam contagens e anulam-se se algo não bater certo.
- **Nada é apagado sem autorização explícita do utilizador** (dados, ficheiros,
  cópias de segurança).
- Avançar **fase a fase**, com validação do utilizador; deploy no fim de cada
  fase, exceto quando depender da seguinte. Screenshots dos ecrãs novos antes do deploy.
- Tudo na mesma conversa.

## Conceito

Como os ambientes de trabalho do Windows/Mac: a mesma conta e os mesmos dados,
mas cada item pertence a um ambiente e só se vê o ambiente ativo. Mover um item
só muda o ambiente a que pertence.

## Decisões

| # | Tema | Decisão |
|---|---|---|
| Modelo | | Opção A — ambientes dentro da mesma conta |
| 1 | Natureza | Qualquer separação (não só pessoal/profissional) |
| 2 | Mistura | Nunca, exceto na vista combinada "Todos os ambientes" |
| 3 | Pesquisa e IA | Só no ambiente ativo; todos na vista combinada |
| 4 | Módulos | Cada ambiente escolhe os seus, dentro do plano |
| 5 | Itens | Cada item pertence a um só ambiente; move-se |
| 6 | Pastas partilhadas | Ficam no ambiente onde foram criadas |
| 6b | Partilhas recebidas | Escolhe-se o ambiente ao aceitar |
| 7 | Notificações / push | Escolher de que ambientes (ou todos) |
| 8 | Cofre | Separado por ambiente (palavra-passe mestra própria) |
| 9 | Aparência | Cor, ícone, fundo, tema, menu lateral, página inicial e widgets por ambiente |
| 9b | Global | Idioma, tipo de letra, escala, 2FA, conta |
| 10 | Existentes | Cada utilizador recebe "Meu Ambiente" com tudo o que tem; renomeável; tem de existir sempre ≥ 1 |
| 11 | Limites | Número de ambientes por plano, com opção "sem limite" |
| 12 | Management | Privado de cada pessoa |
| 13 | Lixo | Um por ambiente |
| 14 | Ligações entre itens de ambientes diferentes | Mantêm-se; ao mover, avisar e oferecer mover também os itens ligados |
| 15 | Dados da conta (SAP: sistemas, transações, OT, Code Library SAP, Notas SAP, Funcional; Clientes) | Separados por ambiente (opção b) — fase 3b/3c |

## Fases

| Fase | Conteúdo | Estado |
|---|---|---|
| 0 | Cópia da BD antes das migrações em cada deploy (`infra/backup/pre-deploy.sh`), sem apagar cópias | ✅ em produção (06/11/2026, 1.ª cópia 3,5 MB) |
| 1 | Fundação invisível: tabela `workspaces`, "Meu Ambiente", `workspace_id` nos itens, limites por plano (migração 0052) | ✅ em produção (06/11/2026 07:02 UTC; contagens iguais antes/depois; 2 ambientes, 0 itens sem ambiente) |
| 2a | Seletor no cabeçalho + personalização; aparência por ambiente; ambiente ativo por dispositivo (cookie kh_ws) | ✅ produção 06/11 07:28 UTC (contagens iguais) |
| 2b | Criar/apagar ambientes (só vazio, nunca o último; limite do plano), módulos por ambiente; Notas, pastas, Tarefas, Registos Reuniões, Ficheiros, Notas de Voz, Calendário, Etiquetas, Lixo, contadores, pesquisa, IA e Início só do ambiente ativo; mover itens/pastas com aviso das ligações | ✅ produção 06/11 10:01 UTC (dcb1c05; cópia pre-deploy; contagens iguais) |
| 3a | Emails, Artefactos, Biblioteca de Código, API Playground, Quadro, Tarefas de Projeto, Modelos, Vistas, Notícias, IA (migração 0054; pastas de Emails/Artefactos/API; Notícias únicas por ambiente; mover artefactos, tarefas de projeto, emails, snippets, quadros, pastas) | ✅ produção 06/11 12:09 UTC (cb66b84; cópia pre-deploy; contagens iguais) |
| 3b | SAP e Tickets (migração 0055): 1.º ambiente = equipa (dados atuais, workspace_id vazio); outros ambientes com dados SAP/Clientes privados; Tickets por ambiente; números únicos por ambiente | ✅ produção 09/11 11:13 UTC (8f2acb8; cópia pre-deploy; contagens iguais) |
| 3c | Management (migração 0056): regra da 0053; dias das marcações seguem a marcação; mg_settings uma por pessoa e ambiente (a existente no 1.º); "Repor Dados" só no ambiente ativo | ✅ produção 09/11 11:58 UTC (2e8d64e; cópia pre-deploy; contagens iguais) |
| 4 | Cofre por ambiente (migração 0057): um cofre por ambiente, com palavra-passe mestra e chave de recuperação próprias; o existente fica no 1.º; proteção de dois separadores (409 workspace_changed) | ✅ produção 09/11 15:46 UTC (658b03b; cópia pre-deploy; contagens iguais, 7 passwords) |
| 5 | Vista combinada "Todos os ambientes" (kh_ws=all): só consulta (409 combined_readonly); Início e Calendário (bolinha do ambiente; abrir muda para o ambiente do item); pesquisa em todos | ✅ produção 09/11 17:04 UTC (b5e4eab; cópia pre-deploy; contagens iguais) |
| 6 | Notificações por ambiente (escolha em Definições › Notificações; meta.ws; o sino e o push abrem no ambiente do item), Alt+1…9 / Alt+0 | aprovada 10/11; em deploy |

## Produção antes da fase 1 (log do deploy de 06/11/2026 00:08 UTC)

tenants 2 · users 2 · folders 11 · notes 24 · tasks 17 · meetings 5 · voice_notes 0 ·
drive_files 8 · emails 1 · vault_items 7 · tickets 1 · issues 0 · artifacts 27 ·
snippets 0 · whiteboards 1 · sap_objects 8 · sap_transports 26 · mg_people 6 ·
mg_projects 3 · mg_bookings 2

## Fase 2b — como funciona (migração 0053)

- A separação é feita pela base de dados: uma política RLS **restritiva** em
  folders (tipos notes/tasks/files/meetings), notes, tasks, meetings,
  drive_files e voice_notes. Quando o pedido da app liga `app.ws_strict`
  (getAuth → `wsScope`), os itens **da própria pessoa** só aparecem no ambiente
  ativo (`kh_workspace_for`). Itens de outras pessoas (pastas partilhadas) não
  são afetados. Trabalho em segundo plano (notificações, indexação, exportação)
  não liga o modo e vê tudo. Nenhum dado é alterado pela migração.
- `allWorkspaces(tx, fn)` desliga o modo dentro de uma transação: limites do
  plano e quota de ficheiros contam todos os ambientes; mover itens.
- Módulos: `wsModules` — fora do primeiro ambiente só os módulos já separados
  (calendar, notes, voice, tasks, meetings, files) + funcionalidades sem itens
  (ai, share, personalização); a escolha do ambiente (`workspaces.modules`)
  restringe mais. Aplicado no menu, nas páginas e na API (`entitlementsFor`,
  `requireModuleFor`).
- Mover (`POST /workspaces/move`, com `preview`): pasta leva subpastas e as
  suas notas/ficheiros/reuniões; item movido sozinho sai da pasta; itens
  ligados (um nível) só com `withLinked`; ligações mantêm-se.
- Pendente para fases seguintes: os outros módulos (3a–4); escolher o ambiente
  ao aceitar uma pasta partilhada de outra pessoa (hoje aparece em todos);
  notificações por ambiente (6). Pergunta em aberto: Atalhos do Início por
  ambiente?

## Fase 3a — notas

- Migração 0054: política restritiva em emails, artifacts, snippets,
  api_requests, api_envs, whiteboards, issues, user_templates, saved_views,
  news_saved, ai_chats; `folders_workspace_scope` passa a incluir os tipos
  emails, artifacts e api; índice único `news_saved_owner_ws_link_uq`
  (owner, workspace, link) criado antes de retirar o antigo.
- Fora do primeiro ambiente ficam por agora Management, SAP, Tickets e
  Passwords (fases 3b, 3c, 4).
- Mover na interface: Ligações (artefactos, tarefas de projeto) e Emails; no
  servidor também snippets, quadros e pastas de Emails/Artefactos/API (botões
  nesses ecrãs: a seguir).

## Fase 3b — notas (decisão 09/11/2026)

- Dados SAP e Clientes são da conta (equipa). O **1.º ambiente** de cada
  pessoa é o da equipa: tudo o que existe e o que lá se cria fica partilhado
  como antes (`workspace_id` vazio). Noutro ambiente, o que se cria fica só
  nesse ambiente e dessa pessoa (`kh_team_item_workspace`, política
  `*_workspace_scope` com `kh_team_scope()` / `kh_ws_mine()`).
- Tickets e tipos: regra da 0053; únicos por (pessoa, ambiente, número/nome);
  Notas SAP únicas por (conta, ambiente, número).
- Apagar uma conta apaga os dados SAP dos ambientes privados dela
  (`users_private_team_items`), nunca os da equipa.
- Por fazer: mover itens SAP entre ambientes.
