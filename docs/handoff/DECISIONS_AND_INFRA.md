# Decisões finais e arquitetura (VPS Hostinger)

Este documento **substitui** as recomendações de stack/hosting do `README.md §4` e as decisões em aberto do `ROADMAP.md`.

## 1. Decisões confirmadas
| Tema | Decisão |
|---|---|
| Hosting | **VPS Hostinger** (self-hosted, um único servidor) |
| Revogar código | Utilizadores perdem acesso imediatamente; **dados mantidos 30 dias** (`deleted_at` + job diário de purge). Pode ser restaurado nesse período. |
| Faturação / Stripe | **Fora de âmbito.** Vendas geridas fora da app. Ativação por **código de licença** gerado na Admin Console. Remover webhooks, checkout e portal. |
| Instâncias dedicadas | **Não existem.** Remover campo `hosting` e opção na consola. Todos os clientes na mesma BD, isolados por `tenant_id` + RLS. |
| Tempo real | **Fora do lançamento.** Whiteboard e notas com gravação normal (último a gravar vence + aviso de conflito por `updated_at`). |

## 2. Arquitetura recomendada na VPS
Plano Hostinger mínimo recomendado: **KVM 2** (2 vCPU, 8 GB RAM, 100 GB NVMe) — Ubuntu 24.04 LTS. Começar aqui e subir para KVM 4 com >200 utilizadores ativos.

```
                Internet
                   │  443 (HTTPS)
            ┌──────▼───────┐
            │    Caddy     │  TLS automático (Let's Encrypt), HTTP/3, headers de segurança, rate-limit básico
            └──┬───┬───┬───┘
   app.dominio │   │   │ usercontent.dominio  (iframes dos artifacts, sem cookies)
               │   │ admin.dominio
         ┌─────▼───▼───┐
         │  Next.js    │  (Node 22, modo standalone) — UI + API routes + Server Actions
         │  (web)      │
         └──┬──────┬───┘
            │      │
   ┌────────▼┐  ┌──▼──────┐  ┌──────────────┐
   │Postgres │  │  Redis  │  │   Worker     │  BullMQ: RSS, meteorologia, emails .msg/.eml,
   │   16    │  │    7    │  │ (Node)       │  purge de revogados (30 d), expiração de códigos,
   └─────────┘  └─────────┘  └──────┬───────┘  repetição de tarefas, envio de emails
                                    │
                             ┌──────▼──────┐
                             │   MinIO     │  Ficheiros (fotos, fundos, imagens de notas, áudio,
                             │ (S3 local)  │  anexos de email) — URLs assinados
                             └─────────────┘
```

Tudo em **Docker Compose** (um `docker-compose.yml` no repo):
| Serviço | Imagem | Notas |
|---|---|---|
| `caddy` | `caddy:2` | Único serviço exposto (80/443). `Caddyfile` com 3 hosts. |
| `web` | build do repo (`next build`, output standalone) | 2 réplicas com `restart: unless-stopped`; health check `/api/health` |
| `worker` | mesmo build, `node worker.js` | Filas BullMQ + cron |
| `postgres` | `postgres:16` | Volume persistente; **não** expor porta |
| `redis` | `redis:7` | Sessões de rate-limit, cache de entitlements, filas; `appendonly yes` |
| `minio` | `minio/minio` | Bucket privado `kh-files`; acesso só pela app |

### Stack aplicacional (mantém-se)
Next.js 15 + React 19 + TypeScript, Tailwind + CSS vars, Drizzle ORM, TipTap (editor), tldraw (whiteboard, sem multiplayer), Argon2id (`@node-rs/argon2`), sessões em BD com cookie httpOnly, Zod para validação.

### Email transacional
A VPS não deve enviar email diretamente (má entregabilidade). Usar SMTP externo: **Hostinger Email/SMTP** do domínio, ou Brevo/Resend (plano grátis). Convites, verificação, reset de password, avisos de expiração de licença.

## 3. Segurança da VPS
- Utilizador não-root com sudo; **SSH só por chave**, porta alterada, `PasswordAuthentication no`.
- **UFW**: permitir apenas 22 (ou porta SSH), 80, 443. Postgres/Redis/MinIO só na rede interna do Docker.
- **fail2ban** para SSH; atualizações automáticas (`unattended-upgrades`).
- Segredos em `.env` fora do repo (permissões 600) ou Docker secrets; nunca no código.
- Firewall da Hostinger (hPanel) também ativa.

## 4. Backups
- `pg_dump` diário (cron no worker) + WAL archiving opcional → cópia **fora da VPS** (Backblaze B2 / outro bucket S3) com `restic` encriptado; retenção 7 diários, 4 semanais, 6 mensais.
- `mc mirror` do MinIO para o mesmo destino externo.
- Snapshots semanais da VPS no hPanel (complementar, não substitui).
- Testar restore mensalmente.

## 5. Deploy
- GitHub Actions: lint + typecheck + testes → build da imagem → push para GHCR → SSH na VPS → `docker compose pull && docker compose up -d` (zero-downtime com 2 réplicas web).
- Migrações Drizzle executadas num step antes do `up` (`drizzle-kit migrate`).
- Ambientes: `staging` (subdomínio, mesma VPS ou outra pequena) e `prod`.

## 6. Monitorização
- Uptime Kuma (container) para health checks + alertas por email/Telegram.
- Logs: `docker compose logs` + Loki/Grafana opcional; Sentry (plano grátis) para erros de front e back.
- Métricas básicas: Netdata ou node-exporter.

## 7. Alterações ao modelo de dados por estas decisões
- `tenants`: remover `stripe_customer_id`, `stripe_subscription_id`, `pay_mode` (ou manter `pay_mode` só como nota interna `manual`), remover `hosting`.
- Remover tabela `invoices` e rotas `/billing/*` e `/webhooks/stripe`.
- `codes`: `status` passa a incluir `revoked` com `revoked_at`; tenant/users associados recebem `deleted_at = now()` e são purgados por job após 30 dias. Admin pode **restaurar** dentro do prazo (`POST /api/admin/v1/codes/:id/restore`).
- Validade da licença vem do código (`expires_at`, null = vitalício) e dos campos do tenant (`renew_at`) definidos manualmente na Admin Console. Job diário: tenants com licença expirada → `status = suspended` (só leitura), aviso por email 7/3/1 dias antes.
- Popup de planos na app: botões **Subscrever / Mudar para X** passam a abrir **"Pedir este plano"** (cria `custom_plan_requests` / pedido de contacto) em vez de checkout. Pedido de pacote personalizado mantém-se.
- Fase 9 do roadmap reduz-se a: Admin Console + pedidos de plano (sem Stripe).

## 8. Ordem de implementação ajustada
0. Infra VPS (Docker, Caddy, Postgres, Redis, MinIO, backups, CI/CD) — 3–4 dias
1. Fundações de UI + i18n
2. Auth + tenants + códigos + entitlements
3. Shell + Definições + Dashboard
4. Notas, Tarefas, Calendário
5. Cofre, Emails, Issues
6. Developer (Artifacts, Code Library, API, Whiteboard sem tempo real)
7. SAP
8. Management
9. Partilha
10. Admin Console (sem billing) + pedidos de plano
11. Hardening, pentest, lançamento
