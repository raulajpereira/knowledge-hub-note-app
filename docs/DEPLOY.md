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

## 6b. Monitorização (leve, sem serviços extra)
- O **worker** verifica a cada 5 minutos a base de dados, o Redis, o MinIO, o endereço público (`APP_URL/api/health`), a fila de emails e os erros do servidor da última hora. Quando algo falha, envia email ao Manager e aos Administradores da consola (de novo a cada 6 h enquanto durar) e outro quando volta ao normal. Precisa do SMTP configurado (§5c).
- Se o próprio worker parar, quem avisa é um monitor externo. Sugestão grátis: **UptimeRobot** (ou BetterStack) → novo monitor HTTP(s) para `https://knowledge-hub.cloud/v2/api/health?strict=1` (depois do corte, sem `/v2`), intervalo 5 min, alerta por email. Com `strict=1` a resposta é 503 também quando o worker não dá sinal há mais de 3 minutos.
- Logs: `docker compose logs -f web` (pedidos com erro aparecem como `[api] unhandled MÉTODO /caminho`) e `docker compose logs -f worker` (`[monitor] problems: …`).

## 7. Corte final (v2 na raiz, v1 em `/v1`) — fazer em conjunto

Janela de manutenção de ~30 min: entre o passo 4 e o passo 6 a v1 e a v2
ficam indisponíveis (a v1 já está em `/v1` e a v2 já foi construída para a
raiz, mas o Nginx ainda encaminha à moda antiga). Fazer os passos 4 → 6 seguidos.
Todos os utilizadores terão de voltar a entrar (os cookies eram de `/v2`) e
quem instalou a app (PWA) deve reinstalá-la.

**0. Antes do dia**
- DNS: `knowledge-hub.cloud` e `www.knowledge-hub.cloud` (A e, se existir, AAAA)
  apontam para a VPS (`dig +short knowledge-hub.cloud`).
- Desligar o Nginx também desliga o CloudPanel (`:8443`) e quaisquer outros
  sites dele — confirmar que nada mais depende dele.
- Anotar o tag da imagem atual (para reverter): `grep KH_IMAGE_TAG .env`.
- Confirmar as migrações aplicadas:
  `docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c 'select count(*) from drizzle.__drizzle_migrations'`
  (deve ser igual ao número de ficheiros `drizzle/*.sql`).

**1. Cópias (obrigatório — os backups automáticos ainda estão adiados, D17)**
```bash
mkdir -p ~/corte-$(date +%F) && cd ~/corte-$(date +%F)
set -a; . /opt/knowledgehub-v2/.env; set +a
# v2: base de dados e ficheiros
docker compose -f /opt/knowledgehub-v2/docker-compose.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > v2.dump
docker run --rm --network knowledgehub_default -e S3_ACCESS_KEY -e S3_SECRET_KEY -e S3_BUCKET \
  -v "$PWD/minio:/out" --entrypoint sh minio/mc -c \
  'mc alias set kh http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" && mc mirror kh/"$S3_BUCKET" /out'
# v1: mysqldump + server/uploads/
```
Copiar a pasta para fora da VPS (`scp -r`) antes de continuar. Durante os
primeiros dias pôr `STORAGE_SWEEP_DRY_RUN=true` no `.env` (a limpeza diária só
reporta o que apagaria).

**2. GitHub**: variable `KH_BASE_PATH` = `/`.

**3. `.env` da v2** (na VPS): `APP_URL=https://knowledge-hub.cloud`,
`NEXT_PUBLIC_BASE_PATH=` (vazio), `ACME_EMAIL=...`, `COMPOSE_PROFILES=edge`.
(Se o caminho de `APP_URL` não coincidir com o base path, os logs da app mostram um aviso `[env] WARNING`.)

**4. v1**: na pasta da v1, `git fetch origin v1 && git checkout v1`, acrescentar
`BASE_PATH=/v1` ao `server/.env` e `bash deploy.sh`.

**5. v2**: correr o workflow (Actions › v2 › Run workflow) — constrói a imagem sem
`/v2` e faz o deploy; com `COMPOSE_PROFILES=edge` o `docker compose up` passa a
incluir o Caddy.

**6. Trocar o proxy**: `sudo systemctl disable --now nginx` e
`docker compose up -d caddy`. Verificar: `docker compose logs caddy | grep -i certificate`,
`curl -I https://knowledge-hub.cloud` (200), `curl -I https://knowledge-hub.cloud/v2/app`
(308 → `/app`), `curl -I https://knowledge-hub.cloud/v1/` (v1).

**7. Depois**: atualizar o monitor externo (§6b) para
`https://knowledge-hub.cloud/api/health?strict=1`; entrar, abrir algumas notas e
ficheiros; ver `docker compose logs worker` na manhã seguinte (limpeza em modo de ensaio).

**Reverter** (se algo correr mal):
1. `docker compose stop caddy && sudo systemctl enable --now nginx`.
2. v1: tirar `BASE_PATH` do `server/.env` e `bash deploy.sh`.
3. v2: `.env` de volta a `APP_URL=https://knowledge-hub.cloud/v2`,
   `NEXT_PUBLIC_BASE_PATH=/v2`, `COMPOSE_PROFILES=` e `KH_IMAGE_TAG=<tag anotado>`;
   `docker compose up -d` (a imagem `/v2` continua no GHCR, não é preciso reconstruir).
4. GitHub: `KH_BASE_PATH` de volta a `/v2`.
5. Se houve perda de dados: `pg_restore -c` do `v2.dump` e `mc mirror` de volta.
