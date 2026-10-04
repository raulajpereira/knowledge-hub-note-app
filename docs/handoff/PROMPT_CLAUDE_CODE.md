# Prompt inicial para o Claude Code

Cola o texto abaixo (entre as linhas) na primeira mensagem do novo chat, depois de copiares esta pasta para o repositório em `docs/handoff/`.

---

Vais implementar o **KnowledgeHub v2.0.0**, uma app SaaS multi-cliente, a partir de protótipos HTML de alta fidelidade e de documentação técnica que estão em `docs/handoff/`.

**Antes de escreveres código, lê por esta ordem:**
1. `docs/handoff/README.md` — visão geral, páginas, rotas e design tokens
2. `docs/handoff/DECISIONS_AND_INFRA.md` — **decisões finais e arquitetura; prevalece sobre todos os outros documentos**
3. `docs/handoff/DATA_MODEL.md` e `docs/handoff/schema.sql` — tabelas, relações, multi-tenant e RLS
4. `docs/handoff/SECURITY.md` — autenticação, autorização, cofre E2E, sanitização, checklist
5. `docs/handoff/API.md` — endpoints e jobs
6. `docs/handoff/ROADMAP.md` — fases e critérios de aceitação

As páginas públicas são `Login`, `Register` e `ResetPassword`; a app é `ZNotes` (com os módulos importados) e a consola é `Admin Console`. Os ficheiros em `docs/handoff/design/*.dc.html` são **referências visuais e de comportamento**, não código para copiar. Cada um tem um template HTML com estilos inline e uma classe JS (`renderVals()`) que produz os valores do template. Abre-os no browser (precisam de `support.js` ao lado) e recria-os pixel-perfect: cores, tipografia, espaçamentos, raios, sombras, efeito liquid glass, textos PT/EN e interações.

**Decisões fixas (não alterar sem me perguntar):**
- Alojamento numa **VPS Hostinger** com Docker Compose: Caddy, Next.js (web), worker (BullMQ), PostgreSQL 16, Redis 7, MinIO.
- Stack: Next.js 15 (App Router) + React 19 + TypeScript, Tailwind + CSS variables, Drizzle ORM, Zod, TipTap para as notas, tldraw para o whiteboard, Argon2id com sessões em cookie httpOnly e TOTP.
- **Sem faturação nem Stripe na app.** As vendas são feitas fora. A ativação é feita com códigos `KH-LIC-######` (licença) e `KH-INV-######` (convite), gerados na Admin Console. Os botões de planos criam **pedidos**, não pagamentos.
- **Sem instâncias dedicadas.** Todos os clientes partilham a mesma base de dados, isolados por `tenant_id` + Row Level Security.
- **Sem colaboração em tempo real** neste lançamento.
- **Revogar um código** corta o acesso de imediato, mantém os dados 30 dias com opção de restaurar e depois apaga definitivamente.
- Permissões por plano/módulo, limites do FREE e papéis de admin são **sempre verificados no servidor**.
- O cofre de passwords é zero-knowledge: AES-256-GCM no cliente, DEK embrulhada pela palavra-passe mestra e pela chave de recuperação. O servidor nunca vê dados em claro.
- Interface em PT e EN; extrai os dicionários dos protótipos (`I18N`, `AD_EX`, `MG_EX`).

**Como quero que trabalhes:**
1. Começa por me apresentar um plano curto da Fase 0 (infraestrutura + fundações) e a estrutura de pastas do repositório. Espera pela minha confirmação.
2. Implementa **uma fase de cada vez**, seguindo o `ROADMAP.md`. No fim de cada fase, mostra-me o que ficou feito, como testar e o que falta, e espera pela minha confirmação antes de passares à seguinte.
3. Para cada ecrã, abre o `.dc.html` correspondente e confirma que a tua versão está igual (layout, estados de hover/erro/vazio, popups, colunas redimensionáveis, modo de edição).
4. Cria migrações Drizzle, seeds de desenvolvimento (com os dados de exemplo dos protótipos) e testes: unitários para regras de negócio e Playwright para os fluxos críticos (registo com código, login, recuperação de password, bloqueio, cofre, partilha, Admin Console).
5. Nunca coloques credenciais no código. Usa `.env.example` e documenta todas as variáveis.
6. Mantém um `docs/PROGRESS.md` atualizado com o que está feito, o que falta e as decisões que tomaste.
7. Se algo no design ou na documentação for ambíguo ou contraditório, **pergunta-me** antes de assumir.

Começa por ler os documentos e responde com: (a) um resumo de uma página do que entendeste, (b) dúvidas que tenhas, (c) o plano da Fase 0.

---

## Dicas
- Se o Claude Code perder contexto numa sessão longa, diz-lhe: "Relê `docs/handoff/DECISIONS_AND_INFRA.md` e `docs/PROGRESS.md` antes de continuares."
- Para um ecrã específico: "Implementa a página X tal como está em `docs/handoff/design/<ficheiro>.dc.html`, secção Y. Compara visualmente antes de terminar."
