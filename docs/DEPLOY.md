# Deploy — KnowledgeHub v2 na VPS Hostinger (KVM 1)

A v2 corre **ao lado** da v1 na mesma VPS, sem lhe tocar:

| | v1 (atual) | v2 (nova) |
|---|---|---|
| Código | branch `main` (e `v1`) | branch `v2` |
| Pasta na VPS | a de sempre (`VPS_APP_DIR`) | `/opt/knowledgehub-v2` (`VPS_APP_DIR_V2`) |
| Processo | PM2 `knowledge-hub-api` (porta 4000) | Docker Compose (`web` em 127.0.0.1:3100) |
| Base de dados | MySQL atual (intocada) | PostgreSQL 16 em Docker (nova, vazia) |
| URL até ao corte | `https://knowledge-hub.cloud/` | `https://knowledge-hub.cloud/v2/` |
| URL depois do corte | `https://knowledge-hub.cloud/v1/` | `https://knowledge-hub.cloud/` |

Memória (KVM 1 = 4 GB): limites no `docker-compose.yml` somam ≈ 2,4 GB para a
v2; a v1 (Node + MySQL) fica com o resto, mais 2 GB de swap criados pelo
`setup.sh`. A v1 é temporária (só para passares os teus dados à mão).

## 1. Preparar a VPS (uma vez)

```bash
# na VPS, como o utilizador de deploy (o mesmo do secret VPS_USER)
git clone -b v2 https://github.com/raulajpereira/knowledge-hub-note-app.git /tmp/kh-v2-setup
sudo bash /tmp/kh-v2-setup/infra/vps/setup.sh "$USER"
# sair e voltar a entrar (grupo docker)
git clone -b v2 https://github.com/raulajpereira/knowledge-hub-note-app.git /opt/knowledgehub-v2
```

O `setup.sh` instala Docker, swap, UFW (SSH/80/443), fail2ban e atualizações
automáticas. **Não** mexe no Nginx, na v1, no MySQL nem na configuração do SSH.

Endurecimento do SSH (manual, depois de confirmares que entras por chave):
`/etc/ssh/sshd_config` → `PasswordAuthentication no`, `PermitRootLogin no`
→ `sudo systemctl reload ssh`. Ativa também a firewall no hPanel.

## 2. Configuração (`/opt/knowledgehub-v2/.env`)

```bash
cd /opt/knowledgehub-v2
cp .env.example .env && chmod 600 .env
# gerar segredos (hex: sem caracteres especiais nos URLs):
for v in POSTGRES_PASSWORD KH_APP_DB_PASSWORD S3_SECRET_KEY ENCRYPTION_KEY; do
  sed -i "s|^$v=.*|$v=$(openssl rand -hex 32)|" .env
done
nano .env
```

Valores a preencher no `.env`:
- `NODE_ENV=production`
- `APP_URL=https://knowledge-hub.cloud/v2`
- `NEXT_PUBLIC_BASE_PATH=/v2`
- `SMTP_USER` / `SMTP_PASS`: a caixa de email Hostinger que envia (ex. `no-reply@knowledge-hub.cloud`).
- `SUPERADMIN_EMAIL=raul.a.j.pereira@gmail.com`
- `SUPERADMIN_NAME`

## 3. GitHub (Settings → Secrets and variables → Actions)

- **Secret** `VPS_APP_DIR_V2` = `/opt/knowledgehub-v2` (os outros secrets
  `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` já existem e são reutilizados).
- **Variable** `KH_BASE_PATH` = `/v2` (opcional; é o valor por omissão).

Sem `VPS_APP_DIR_V2` o workflow corre CI e publica as imagens, mas não faz deploy.

## 4. Nginx: publicar a v2 em `/v2` (até ao corte)

A VPS é gerida pelo **CloudPanel**, que é dono da configuração do Nginx: a
alteração faz-se no painel (`https://IP:8443` › Sites › knowledge-hub.cloud ›
**Vhost**), não no ficheiro (o painel reescrevê-lo-ia). Colar o conteúdo de
`infra/nginx/knowledgehub-v2.locations.conf` imediatamente **antes** da linha
`location / {` (a que faz `proxy_pass` para a v1 na porta 4000) e **Save** — o
painel valida e recarrega o Nginx.

Nota: o prefixo é `location /v2` (sem barra final). O Next.js redireciona
`/v2/` → `/v2`; um redirecionamento inverso no Nginx criaria um ciclo.

Só são acrescentados os caminhos `/v2`; tudo o resto continua a ir para a v1.

## 5. Primeiro deploy

Um push para o branch `v2` (ou "Run workflow" em Actions → *v2 — CI & Deploy*)
faz: CI → imagens no GHCR → SSH → `docker compose pull` → migrações →
`up -d` → espera pelo `healthy`. Verificar: `https://knowledge-hub.cloud/v2/api/health`.

## 5b. Primeiro acesso do super admin e códigos

Em cada deploy o seed cria (se não existir) o teu utilizador `SUPERADMIN_EMAIL`
sem password e envia um link "Definir password" válido 7 dias. Enquanto o SMTP
não estiver configurado, o email fica nos logs do worker:

```bash
cd /opt/knowledgehub-v2
docker compose logs worker | grep -A8 "setup for"
```

Novo link, se expirar: `docker compose run --rm migrate node dist/cli.mjs superadmin:resend-setup`

Códigos de ativação (até existir a Admin Console):

```bash
cd /opt/knowledgehub-v2
alias kh='docker compose run --rm migrate node dist/cli.mjs'
kh codes:create --type license --plan PRO --seats 5 --client "Empresa X" --expires 2027-12-31
kh codes:create --type invite                      # conta individual FREE
kh codes:list
kh codes:pause KH-LIC-123456   # corta o acesso já, mantém os dados
kh codes:resume KH-LIC-123456
kh codes:revoke KH-LIC-123456  # corta o acesso, dados mantidos 30 dias
kh codes:restore KH-LIC-123456
kh users:list
```

## 5c. Email (SMTP Hostinger)

1. hPanel → Emails → criar a caixa `no-reply@knowledge-hub.cloud`.
2. No `.env`: `SMTP_USER=no-reply@knowledge-hub.cloud`, `SMTP_PASS=<password da caixa>`
   (`SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465` já vêm preenchidos).
3. `docker compose up -d` (recria web e worker com a nova configuração).

## 6. Backups

```bash
cp infra/backup/.env.backup.example infra/backup/.env.backup && chmod 600 infra/backup/.env.backup
nano infra/backup/.env.backup     # destino restic fora da VPS (ex. Backblaze B2)
crontab -e
# 15 3 * * *  /opt/knowledgehub-v2/infra/backup/backup.sh       >> /var/log/kh-backup.log 2>&1
# 30 4 1 * *  /opt/knowledgehub-v2/infra/backup/restore-test.sh >> /var/log/kh-backup.log 2>&1
```

## 7. Corte final (v2 na raiz, v1 em `/v1`) — fazer em conjunto

1. Backup da v1 (`mysqldump` + `server/uploads/`) e da v2 (`backup.sh`).
2. v1: na pasta da v1 mudar para o branch `v1` (`git fetch origin v1 && git checkout v1`),
   acrescentar `BASE_PATH=/v1` ao `server/.env` e correr `bash deploy.sh`.
3. GitHub: variable `KH_BASE_PATH` = `/`; `.env` da v2: `APP_URL=https://knowledge-hub.cloud`,
   `NEXT_PUBLIC_BASE_PATH=` (vazio), `ACME_EMAIL=...`; correr o workflow (imagem sem `/v2`).
4. Parar o Nginx (`sudo systemctl disable --now nginx`) e ligar o Caddy:
   `docker compose --profile edge up -d`. O Caddy obtém o certificado e encaminha
   `/v1/*` → v1 (porta 4000 no host) e o resto → v2. `/v2/...` redireciona para `/`.
5. Reverter (se necessário): `docker compose stop caddy && sudo systemctl enable --now nginx`.
