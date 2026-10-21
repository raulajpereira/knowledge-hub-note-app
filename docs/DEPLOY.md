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

Memória (KVM 1 = 4 GB): limites no `docker-compose.yml` somam ≈ 3,0 GB para a
v2 (o worker tem 1 GB por causa da pesquisa semântica/OCR, §6c); a v1 (Node + MySQL) fica com o resto, mais 2 GB de swap criados pelo
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
- Opcional, "Email para a app" (§5d): `INBOUND_IMAP_HOST`, `INBOUND_IMAP_PORT` (993),
  `INBOUND_IMAP_USER`, `INBOUND_IMAP_PASSWORD`, `INBOUND_ADDRESS`. Vazios = a funcionalidade fica escondida.
- `SUPERADMIN_EMAIL=raul.a.j.pereira@gmail.com`
- `SUPERADMIN_NAME`
- Pesquisa semântica / OCR (opcional, §6c): `SEMANTIC_SEARCH=on|off`, `OCR=on|off`, `EMBED_MODEL`,
  `EMBED_IDLE_MIN`, `OCR_MAX_MB`, `OCR_MAX_PAGES` (os valores por omissão servem; `EMBED_URL`,
  `EMBED_HOST` e `MODEL_CACHE_DIR` são definidos pelo `docker-compose.yml`).

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
kh codes:revoke KH-LIC-123456  # deixa de aceitar novos registos (quem já entrou mantém o acesso)
kh codes:restore KH-LIC-123456
kh users:list
```

## 5c. Email (SMTP Hostinger)

1. hPanel → Emails → criar a caixa `no-reply@knowledge-hub.cloud`.
2. No `.env`: `SMTP_USER=no-reply@knowledge-hub.cloud`, `SMTP_PASS=<password da caixa>`
   (`SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465` já vêm preenchidos).
3. `docker compose up -d` (recria web e worker com a nova configuração).

## 5d. Email para a app (IMAP Hostinger, opcional)

Cada pessoa recebe em Definições › Notificações um endereço pessoal
`entrada+<código>@knowledge-hub.cloud`; o que lá chega vira nota (num caderno à
escolha), tarefa ou **email** no módulo Emails (importado como um `.eml`:
remetente, destinatários, data, corpo e anexos, numa pasta de Emails à escolha;
só com o módulo Emails no plano). O worker lê a caixa por IMAP a cada 2 minutos, apaga cada
mensagem depois de a tratar e descarta códigos desconhecidos, remetentes fora da
lista da pessoa (por omissão, o email da conta) e mensagens que o servidor de email
marcou como falhadas (DMARC fail, ou SPF fail/softfail sem DKIM válido, no
cabeçalho `Authentication-Results` de topo). Máximo de 50 por pessoa e por dia.

1. hPanel → Emails → criar a caixa `entrada@knowledge-hub.cloud` (password forte,
   só para esta caixa — não a usar para mais nada).
2. Sub-endereços: o Hostinger entrega `entrada+qualquercoisa@…` na caixa `entrada@`
   quando suporta *plus addressing*. Testar: enviar um email para
   `entrada+teste@knowledge-hub.cloud` e ver se chega à caixa (webmail).
   **Se não chegar**, ativar em hPanel → Emails → o domínio → *Catch-all* (ou
   "Reencaminhamento" de todos os endereços desconhecidos) para `entrada@`; a app
   encontra o código também nos cabeçalhos `Delivered-To` / `X-Original-To`. Em
   alternativa, um alias por pessoa não é necessário: basta o catch-all.
3. No `.env`:
   ```
   INBOUND_IMAP_HOST=imap.hostinger.com
   INBOUND_IMAP_PORT=993
   INBOUND_IMAP_USER=entrada@knowledge-hub.cloud
   INBOUND_IMAP_PASSWORD=<password da caixa>
   INBOUND_ADDRESS=entrada@knowledge-hub.cloud
   ```
4. Deploy normal (o worker passa a agendar o job `inbound`). Se o IMAP falhar
   (password errada, servidor em baixo) o worker não para: regista o erro em
   `docker compose logs worker | grep inbound` e tenta de novo com espera crescente
   (2, 4, 8 … até 30 min). Cada passagem com mensagens deixa uma linha com as
   contagens, ex. `[inbound] {"created":1}` ou `{"sender":1}` (remetente fora da
   lista), `{"unknown":1}` (sem código válido), `{"disabled":1}` (interruptor
   desligado), `{"spoof":1}` (SPF/DKIM/DMARC falhados).

**Código escolhido pela pessoa.** O código é aleatório por omissão, mas cada pessoa
pode escolher o seu (ex. `kh.entrada+raulpereira@gmail.com`): 3–30 caracteres,
minúsculas, números e `. - _`, a começar por uma letra, sem `..` e sem acabar em
`. - _`; maiúsculas contam como minúsculas; nomes como `admin`, `postmaster`,
`noreply`, `suporte`, `teste`, `entrada`… estão bloqueados. A verificação de
disponibilidade enquanto se escreve está limitada a 30 por minuto por pessoa. A
base de dados garante que nenhum código tem dois donos (índice único + função
`kh_inbound_set_code`, migração 0047). Quando alguém muda de código (escolhido ou
aleatório), o antigo deixa logo de receber mas fica **reservado 30 dias** para essa
pessoa (pode voltar a ele; mais ninguém o pode usar); depois fica livre — o job
diário `licenses` apaga as reservas expiradas (`kh_prune_inbound_codes`). Os
endereços aleatórios antigos continuam a funcionar. Nota: o Gmail ignora pontos só
na parte antes do `+`; o código depois do `+` chega tal como foi escrito.

**Alternativa grátis — Gmail** (a VPS não inclui caixas de email): uma conta Gmail
só para isto (ex. `kh.entrada@gmail.com`), com verificação em 2 passos e uma
*palavra-passe de aplicação* (Conta Google → Segurança). O Gmail entrega
`kh.entrada+código@gmail.com` na mesma caixa e acrescenta o `Authentication-Results`.
```
INBOUND_IMAP_HOST=imap.gmail.com
INBOUND_IMAP_PORT=993
INBOUND_IMAP_USER=kh.entrada@gmail.com
INBOUND_IMAP_PASSWORD=<palavra-passe de aplicação>
INBOUND_ADDRESS=kh.entrada@gmail.com
```
O worker trata **todas** as mensagens da Caixa de entrada (lidas ou não) e tira-as
de lá depois (no Gmail ficam arquivadas em "Todo o correio"); por isso a conta não
deve ser usada para mais nada.

## 6. Backups (semanais, para o PC — D67)

Todos os domingos às 03:15 a VPS faz um arquivo **cifrado** (7-Zip AES-256, nomes
dos ficheiros também escondidos) com a base de dados, os ficheiros (MinIO) e o
`.env`, em `/var/backups/knowledgehub/kh-v2-AAAA-MM-DD.7z` (+ `.sha256`); ficam os
últimos 4. O PC vai buscá-los (`pull-to-pc.ps1`). O `.env` vai junto porque sem a
`ENCRYPTION_KEY` o cofre e as chaves de IA não se leem depois de repor.

**Na VPS (uma vez, como root):**
```bash
# palavra-passe dos backups — guardar no gestor de palavras-passe: sem ela não se abrem
read -rsp 'Palavra-passe dos backups: ' P && printf %s "$P" > /root/.kh-backup-pass && chmod 600 /root/.kh-backup-pass; unset P
bash /opt/knowledgehub-v2/infra/backup/local-backup.sh        # primeiro backup (testa tudo)
crontab -e
# 15 3 * * 0  /opt/knowledgehub-v2/infra/backup/local-backup.sh >> /var/log/kh-backup.log 2>&1
```

**No PC (Windows 10/11, uma vez):**
1. PowerShell: `ssh-keygen -t ed25519` (Enter em tudo) e depois
   `type $HOME\.ssh\id_ed25519.pub | ssh root@<IP-da-VPS> "cat >> ~/.ssh/authorized_keys"`
   (pede a palavra-passe de root desta vez; a partir daí entra com a chave).
2. Guardar `infra/backup/pull-to-pc.ps1` numa pasta (ex. `Documentos\KnowledgeHub-backups`).
3. Testar: `powershell -ExecutionPolicy Bypass -File pull-to-pc.ps1 -Vps root@<IP-da-VPS>`
   → copia os `.7z` novos e confere o sha256 (registo em `copias.log`).
4. Agendador de Tarefas → Criar tarefa básica → semanal, domingo 10:00 → Iniciar um programa:
   `powershell` com argumentos `-ExecutionPolicy Bypass -File "C:\...\pull-to-pc.ps1" -Vps root@<IP-da-VPS>`;
   nas propriedades marcar "Executar a tarefa assim que possível após falhar um início agendado"
   (se o PC estiver desligado ao domingo, copia quando ligar).

**Abrir um backup**: 7-Zip no PC → pede a palavra-passe. **Repor** (VPS nova ou desastre),
com o arquivo extraído em `~/repor`:
```bash
cd /opt/knowledgehub-v2 && cp ~/repor/env.txt .env && docker compose up -d --wait postgres minio
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < ~/repor/knowledgehub.dump
docker compose run --rm -v ~/repor/files:/mirror --entrypoint sh minio-init -c \
  'mc alias set kh http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" && mc mirror --overwrite /mirror "kh/$S3_BUCKET"'
docker compose up -d
```
(Alternativa automática fora da VPS, diária: `infra/backup/backup.sh` com restic + Backblaze B2.)

## 6b. Monitorização (leve, sem serviços extra)
- O **worker** verifica a cada 5 minutos a base de dados, o Redis, o MinIO, o endereço público (`APP_URL/api/health`), a fila de emails e os erros do servidor da última hora. Quando algo falha, envia email ao Manager e aos Administradores da consola (de novo a cada 6 h enquanto durar) e outro quando volta ao normal. Precisa do SMTP configurado (§5c).
- Se o próprio worker parar, quem avisa é um monitor externo. Sugestão grátis: **UptimeRobot** (ou BetterStack) → novo monitor HTTP(s) para `https://knowledge-hub.cloud/v2/api/health?strict=1` (depois do corte, sem `/v2`), intervalo 5 min, alerta por email. Com `strict=1` a resposta é 503 também quando o worker não dá sinal há mais de 3 minutos.
- Logs: `docker compose logs -f web` (pedidos com erro aparecem como `[api] unhandled MÉTODO /caminho`) e `docker compose logs -f worker` (`[monitor] problems: …`).

## 6c. Pesquisa por significado (semântica) e OCR

Grátis e local, sem chaves nem custos por uso:
- **Embeddings**: `@huggingface/transformers` (Apache-2.0) + `onnxruntime-node` (MIT) com o modelo
  `Xenova/multilingual-e5-small` (MIT; PT + EN; 384 dimensões; quantizado q8, ~118 MB). Corre **só
  no worker**; a imagem `web` nunca carrega o modelo — pede o vetor da pesquisa ao worker por HTTP
  interno (`EMBED_URL=http://worker:3210`, não publicado no host, com token derivado de
  `ENCRYPTION_KEY`). Se o worker estiver desligado, lento (>300 ms nas Notas, >1,5 s no assistente) ou
  a carregar o modelo, a pesquisa usa só palavras — sem erros para o utilizador.
- **OCR**: `tesseract.js` (Apache-2.0, WebAssembly) com por+eng (os dados de treino vêm nos pacotes npm
  `@tesseract.js-data/por|eng`, MIT — nada é descarregado); PDFs: primeiro a camada de texto
  (`pdfjs-dist`, Apache-2.0), OCR só das páginas sem texto (renderizadas com `@napi-rs/canvas`, MIT),
  no máximo `OCR_MAX_PAGES` páginas e ficheiros até `OCR_MAX_MB`. Lê imagens das Notas e Registos
  Reuniões, imagens/PDFs dos Ficheiros e anexos de email guardados.
- **Armazenamento**: pgvector (tabela `embeddings`, índice HNSW cosseno), `ocr_texts` e a fila
  `search_jobs` (migração 0043). A fila é preenchida por triggers em cada criação/alteração (com 30 s
  de espera após a última alteração) e esvaziada pelo worker **um trabalho de cada vez**; ao arrancar,
  o worker põe em fila (prioridade baixa, retomável) o que ainda não tem vetores/OCR. Falhas: 3
  tentativas (1, 4 min) e desiste. Vetores e textos seguem o RLS do item de origem (dono, biblioteca
  SAP do tenant, pastas partilhadas).
- **Modelo**: descarregado **uma vez** do CDN do Hugging Face (`huggingface.co`, precisa de saída
  HTTPS na VPS) na primeira utilização, para o volume Docker `models` (`MODEL_CACHE_DIR=/models`), que
  sobrevive às atualizações. Escolhido em vez de o meter na imagem: a imagem do worker fica ~120 MB
  mais pequena e cada deploy puxa menos. Sem acesso ao Hugging Face: copiar a pasta do modelo para
  `/models/local/Xenova/multilingual-e5-small/` (ficheiros `config.json`, `tokenizer.json`,
  `tokenizer_config.json`, `onnx/model_quantized.onnx`).
- **Imagem do worker**: passa de Alpine para `node:22-bookworm-slim` (o onnxruntime-node só tem binários
  glibc); binários de outras plataformas são removidos no build. `.npmrc` impede o download dos
  binários CUDA do onnxruntime (`onnxruntime-node-install=skip`). A imagem `web` não muda.

**Memória/CPU (KVM 1: 1 vCPU, 4 GB)**: worker `mem_limit` 384 MB → **1 GB** e `cpus: 0.6` (indexação
inicial e OCR nunca tiram mais de 60% do vCPU à web/Postgres). Com o modelo carregado o worker ocupa ~400–450 MB; o tesseract
mais ~170 MB enquanto há imagens para ler (libertado 2 min depois). O modelo é libertado após
`EMBED_IDLE_MIN` minutos sem uso (60 por omissão; a primeira pesquisa a seguir usa só palavras e
volta a carregá-lo, ~1–2 s). Soma dos limites da v2: ≈ 3,0 GB (web 640 + worker 1024 + postgres 640 +
redis 192 + minio 384 + caddy 128). Se a memória apertar: `EMBED_IDLE_MIN=10`, ou `OCR=off` /
`SEMANTIC_SEARCH=off` no `.env` e `docker compose up -d`.

Tempos medidos na máquina de desenvolvimento, **limitados a 1 núcleo** (mesmo modelo/arquitetura,
q8, 1 thread):
| | medido (1 núcleo) | esperado na VPS (1 vCPU partilhado, ~1,5–2×) |
|---|---|---|
| vetor de uma pesquisa (no worker) | 6–12 ms | 15–25 ms |
| pedido web → worker (HTTP, p50/p95) | 8 / 13 ms | 15–30 ms (limite 300 ms) |
| um bloco de texto (~1 600 car., ~450 tokens) | 200–240 ms | 350–500 ms |
| carregar o modelo (já descarregado) | 0,5–1 s | 1–2 s |
| OCR de uma imagem pequena (1 linha–4 linhas) | 180–300 ms (+0,6 s a 1.ª vez) | 0,4–0,8 s |
| PDF: 1 página com texto + 1 digitalizada | ~1,0 s | ~2 s (≈1–2 s por página digitalizada) |

Uma nota típica (1–3 blocos) indexa-se em < 1,5 s; a indexação inicial de N blocos leva ≈ N × 0,4 s
(1 000 notas médias ≈ 15–25 min com o limite de 60% de CPU, em segundo plano).

**Atualização do Postgres para pgvector (uma vez, é feita pelo deploy)**: `docker-compose.yml` passa de
`postgres:16-alpine` para `pgvector/pgvector:pg16` — mesma versão major, o volume `pgdata` é
compatível. O workflow faz `docker compose pull … postgres` e `docker compose up -d --wait postgres`
**antes** das migrações; a migração 0043 corre como o superutilizador da imagem e faz
`CREATE EXTENSION vector`. Como a imagem nova é Debian (glibc) e a antiga Alpine (musl), a ordenação de
texto do locale muda: a migração deteta-o (base sem versão de collation + glibc) e reconstrói os
índices da app uma vez (`REINDEX`, segundos numa base pequena). À mão, se necessário:
```bash
cd /opt/knowledgehub-v2
docker compose pull postgres && docker compose up -d --wait postgres
docker compose run --rm migrate
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c "select extversion from pg_extension where extname='vector'"
```
(Fazer a cópia `pg_dump` do §7.1 antes, por precaução.)

Estado e "Reindexar": Definições › Assistente IA › *Pesquisa por significado e OCR* (itens indexados,
em fila, ficheiros com texto reconhecido; Reindexar no máximo 2× por hora). Logs: `docker compose logs
worker | grep '\[search\]'`.

## 7. Passagem para a v2 na raiz e fim da v1 — fazer em conjunto

A v1 deixa de existir (os dados já foram passados à mão, D4) e a v2 passa a
`https://knowledge-hub.cloud`. O Nginx/CloudPanel, o PHP, o MySQL e o PM2 da v1
desligam-se (libertam memória); o Caddy da v2 serve 80/443 com HTTPS automático.
Todos voltam a entrar (os cookies eram de `/v2`); quem instalou a app (PWA)
reinstala. Endereços antigos `/v2/...` e `/v1` redirecionam para a raiz.

**1. Backups finais (obrigatório, antes de tudo)** — como root na VPS:
```bash
cd /opt/knowledgehub-v2
# (uma vez) palavra-passe dos backups, ver §6
bash infra/backup/local-backup.sh          # v2 → /var/backups/knowledgehub/kh-v2-<data>.7z
bash infra/cutover/v1-backup.sh            # v1 → kh-v1-final-<data>.7z (MySQL + ficheiros + .env)
ls -lh /var/backups/knowledgehub
```
Copiar os dois `.7z` para o PC (`pull-to-pc.ps1`, ou WinSCP) e **abrir no 7-Zip para
confirmar** antes de continuar. Anotar o tag atual (para reverter):
`grep -E '^KH_IMAGE_TAG|^APP_URL' .env` e `docker compose images web`.

**2. GitHub**: Settings → Secrets and variables → Actions → *Variables* →
`KH_BASE_PATH` = `/`. E desligar o deploy da v1: Actions → *Deploy to VPS* → ⋯ →
*Disable workflow*.

**3. `.env` da v2**: `APP_URL=https://knowledge-hub.cloud`, `NEXT_PUBLIC_BASE_PATH=`
(vazio), `ACME_EMAIL=<o teu email>`; `COMPOSE_PROFILES` fica vazio por agora.

**4. Deploy da v2 para a raiz**: um push para `v2` (ou Actions → v2 → Run workflow).
Durante o deploy a v1 continua a funcionar; a v2 em `/v2` fica indisponível
uns minutos (já foi construída para a raiz, o Nginx ainda a serve em `/v2`).

**5. Trocar para o Caddy (alguns minutos sem site)** — logo a seguir ao deploy ficar verde:
```bash
cd /opt/knowledgehub-v2
bash infra/cutover/v1-stop.sh               # desliga v1 (PM2), Nginx, PHP-FPM, MySQL, FTP — nada é apagado
sed -i 's/^COMPOSE_PROFILES=.*/COMPOSE_PROFILES=edge/' .env
docker compose up -d --no-deps caddy       # só o Caddy, em 80/443 (o web/worker do deploy ficam como estão)
docker compose logs caddy | grep -iE 'certificate obtained|error'
curl -sI https://knowledge-hub.cloud | head -1              # 200
curl -sI https://knowledge-hub.cloud/v2/app | grep -i location   # → /app
```
A firewall do hPanel tem de deixar entrar 80 e 443 (TCP; 443/UDP opcional).

**6. Depois**: monitor externo (§6b) para `https://knowledge-hub.cloud/api/health?strict=1`;
entrar, abrir notas e ficheiros; o Email para a app e os emails continuam iguais.
Ativar os backups semanais (§6, cron + PC).

**7. Apagar a v1 de vez** (passados uns dias, com o backup final no PC):
`bash infra/cutover/v1-purge.sh` — apaga o processo PM2, a pasta e a base MySQL
da v1 (pede para escrever APAGAR). Os serviços do CloudPanel ficam desligados.

**Reverter** (antes do passo 7):
1. `docker compose stop caddy` e `bash infra/cutover/v1-stop.sh --undo` (Nginx, MySQL, v1 de volta).
2. `.env` da v2: `APP_URL=https://knowledge-hub.cloud/v2`, `NEXT_PUBLIC_BASE_PATH=/v2`,
   `COMPOSE_PROFILES=`, `KH_IMAGE_TAG=<tag anotado>`; `docker compose up -d`.
3. GitHub: `KH_BASE_PATH` de volta a `/v2`; voltar a ligar o workflow da v1.
4. Perda de dados: repor o backup do passo 1 (§6).
