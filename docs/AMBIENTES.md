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
| 1 | Fundação invisível: tabela `workspaces`, "Meu Ambiente", `workspace_id` nos itens, limites por plano (migração 0052) | aprovada; em deploy |
| 2a | Seletor no cabeçalho + personalização | — |
| 2b | Criar/apagar ambientes, módulos, separação nos módulos principais, mover | — |
| 3a | Emails, Artefactos, Biblioteca de Código, API Playground, Quadro, Tarefas de Projeto, Modelos, Vistas, Notícias, IA | — |
| 3b | SAP e Tickets | — |
| 3c | Management | — |
| 4 | Cofre por ambiente | — |
| 5 | Vista combinada (Calendário, Início, Pesquisa) | — |
| 6 | Notificações/push por ambiente, atalhos, contadores | — |

## Produção antes da fase 1 (log do deploy de 06/11/2026 00:08 UTC)

tenants 2 · users 2 · folders 11 · notes 24 · tasks 17 · meetings 5 · voice_notes 0 ·
drive_files 8 · emails 1 · vault_items 7 · tickets 1 · issues 0 · artifacts 27 ·
snippets 0 · whiteboards 1 · sap_objects 8 · sap_transports 26 · mg_people 6 ·
mg_projects 3 · mg_bookings 2
