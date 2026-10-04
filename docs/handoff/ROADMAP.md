# O que falta implementar (por fases)

Tudo o que está nos protótipos funciona apenas no browser. Abaixo, o trabalho para chegar a produção, com critérios de aceitação (CA).

## Fase 0 — Fundações e infraestrutura (1–2 semanas)
- VPS Hostinger: Docker Compose (Caddy, web, worker, Postgres, Redis, MinIO), hardening, backups externos, CI/CD por GitHub Actions — ver `DECISIONS_AND_INFRA.md`.
- Repo Next.js + TS + Tailwind + Drizzle; ambientes staging/prod.
- Tokens de design (CSS vars: `--accent`, `--glass-blur`, `--font-scale`, `--ui-scale`, fundo), fontes Geist, componentes base: GlassPanel, Button, Pill, Input, **Select de vidro custom** (o protótipo substitui `<select>` nativos por menu próprio — `initSelects()`), Modal com blur em camadas, Drawer lateral redimensionável, Table com colunas redimensionáveis (`initRT()`), Toast, Confirm.
- i18n PT/EN (extrair dicionário `I18N` de `ZNotes.dc.html` + `AD_EX`/`MG_EX` dos outros ficheiros). Regras: Title Case nas labels EN; PT com preposições minúsculas.
- CA: Storybook com componentes iguais aos protótipos.

## Fase 1 — Auth, tenants, licenças (2 semanas)
- Login, Registo (código de licença/convite), verificação email, **recuperação de password** (email + página `ResetPassword.dc.html` com estados formulário/sucesso/expirado), sessões, lock-screen com re-auth, 2FA.
- Tabelas `tenants`, `users`, `codes`, `plans`, `modules`, `plan_modules`, `plan_limits`, `tenant_modules`.
- Entitlements no servidor; gating da barra lateral e definições.
- CA: reset com token válido altera a password e termina outras sessões; token usado ou >30 min mostra "Link inválido ou expirado"; registo com `KH-INV-######` junta ao tenant; `KH-LIC-######` ativa plano; código pausado bloqueia login; limites FREE aplicados.

## Fase 2 — Shell da app + Definições + Dashboard (2 semanas)
- Barra lateral configurável (drag, grupos, larguras), pesquisa global, topo (TCodes popup, News, relógio, Admin, lock), rodapé ticker.
- Definições: Aparência (fundo/foto upload, tipo de letra, escalas, blur, accent, idioma), Marca (logo), Barra lateral, Notícias, Partilha, Management, SAP GUI, Passwords.
- Dashboard com widgets (modo edição: reordenar, redimensionar, remover; Acesso rápido e Shortcuts só editáveis em modo edição), meteorologia via proxy.
- CA: preferências sincronizadas entre dispositivos.

## Fase 3 — Notas, Tarefas, Calendário, Tags, Lixo (3 semanas)
- TipTap com: títulos, listas, checklist com % de execução, callout, código, imagens (upload/colar/URL), links, chips de objetos SAP/TCodes, colar HTML de sites.
- Pastas, favoritos, drag & drop entre pastas, pastas partilhadas, inspector, links automáticos para objetos.
- Tarefas: tipos Técnica/Gestão, filtros, subtarefas, repetição, projetos do Management.
- CA: nota de exemplo "Go-live SuccessFactors" reproduzível só com a barra do editor.

## Fase 4 — Passwords (cofre E2E) + Emails + Project Issues (3 semanas)
- Cofre conforme `SECURITY.md §4` (setup, kit de recuperação, mudar master, recuperar, auto-lock, gerador, TOTP).
- Emails: import .msg/.eml no servidor, pastas, criar tarefa.
- Issues: tabela com colunas ajustáveis que ocupam a largura toda + Kanban com colunas a dividir a largura.

## Fase 5 — Developer: Artifacts, Code Library, API Playground, Whiteboard (3 semanas)
- Artifacts com versões, iframe sandbox em domínio separado, mover/partilhar.
- Code Library: snippets multi-ficheiro, 30 linguagens (Shiki/Prism), relacionados com voltar.
- API Playground: coleções, ambientes, execução segura.
- Whiteboard (tldraw, sem tempo real): formas, setas, cores/espessuras, itens ligados da app que abrem em popup sem sair, vários quadros.

## Fase 6 — SAP (3 semanas)
- Code Library SAP (tipos de objeto, campos/componentes em vista lista ou tabela SAP, includes, links automáticos e navegação com "voltar").
- Sistemas (cliente do Management, gerar atalho SAP GUI a partir do caminho definido em Definições), TCodes (catálogo + mais usadas + copiar), Ordens de Transporte (projeto, sistema, filtros múltiplos), Processos/Testes/Migração/Cutover (`fn-schema.js`).
- SAP News (fontes configuráveis, ler em popup, guardar para mais tarde com contador, marcar como lida).

## Fase 7 — Management (3–4 semanas)
- Equipas (vista diretor, cartões 3 por linha, edição na mesma janela com voltar, membros + popup adicionar/criar recurso), Recursos, Competências (matriz), Projetos, Clientes.
- Alocações: Timeline / Grelha semanal / Dias; arrastar pontas; painel lateral; editar horas por célula; cores <90/90–100/>100 %.
- Painel de Alocação (cartões abaixo/dentro/acima, filtros, popup com detalhe), Pesquisar Recursos (critérios múltiplos, nível exato, disponibilidade, custo máx., guardar como pedido), Folhas de Tempos (vista pessoal e agregada por função/projeto/equipa).

## Fase 8 — Partilha (2 semanas)
- Links públicos (só leitura, expiração, password, views, revogar) para notas e artifacts; página pública.
- Pastas partilhadas (notas, tarefas, artifacts): partilhar pasta existente ou criar nova; convites por email; permissões por utilizador; pausar/remover; símbolo de partilha na pasta e nos itens; confirmação ao criar/mover itens para pasta partilhada.

## Fase 9 — Admin Console e pedidos de plano (2–3 semanas)
- **Sem faturação na app.** Vendas geridas fora; a Admin Console gera códigos de licença/convite, define plano, lugares, ciclo e data de renovação manualmente.
- Popup de planos na app: **Pedir este plano / Pedir mudança para X** e pedido de pacote personalizado → aparecem na Admin Console (Suporte / pedidos) e notificam administradores por email.
- Admin Console completa (ver README §5.2), auditoria com filtros e CSV, papéis de admin. Revogar código: retém dados 30 dias com opção de restaurar.
- CA: licença expirada → tenant `suspended` (só leitura) e aparece em "Precisa de atenção".

## Fase 10 — Hardening e lançamento (2 semanas)
- Checklist `SECURITY.md §9`, testes E2E (Playwright) dos fluxos críticos, performance (Lighthouse), acessibilidade (contraste, foco, teclado), monitorização, backups, termos/privacidade, landing page.

## Integrações externas a substituir
| Protótipo | Produção |
|---|---|
| rss2json / allorigins | Fetch + parse RSS no servidor (job) com cache |
| Open-Meteo direto + geojs/bigdatacloud | Proxy servidor com cache; geolocalização do browser com consentimento |
| Parser .msg/.eml no cliente | Worker servidor (`msgreader`, `mailparser`) |
| Transcrição de voz (não implementada) | Whisper (self-hosted no worker, `faster-whisper`) ou API externa |
| SAP GUI (ficheiro gerado) | Igual, gerado no cliente; caminho do executável nas Definições |

## Decisões
Ver `DECISIONS_AND_INFRA.md`: VPS Hostinger; revogar mantém dados 30 dias; sem faturação/Stripe na app; sem instâncias dedicadas; sem tempo real neste lançamento. Fase 9 = Admin Console + pedidos de plano (sem Stripe).
