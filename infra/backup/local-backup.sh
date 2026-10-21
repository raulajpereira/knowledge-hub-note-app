#!/usr/bin/env bash
# Weekly backup of KnowledgeHub v2 kept on the VPS, to be copied to the
# owner's PC (D67): PostgreSQL dump + MinIO files + .env in one encrypted
# 7-Zip archive (AES-256, file names hidden too), last KH_BACKUP_KEEP kept.
# The .env goes in because without its ENCRYPTION_KEY the vault and the AI
# keys can't be read after a restore — hence the encryption.
#
# The password lives in /root/.kh-backup-pass (chmod 600), chosen by the
# owner and kept in their password manager: without it the archive can't be
# opened. Cron (root), Sundays at 03:15:
#   15 3 * * 0  /opt/knowledgehub-v2/infra/backup/local-backup.sh >> /var/log/kh-backup.log 2>&1
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$APP_DIR"
PASS_FILE="${KH_BACKUP_PASS_FILE:-/root/.kh-backup-pass}"
OUT="${KH_BACKUP_DIR:-/var/backups/knowledgehub}"
KEEP="${KH_BACKUP_KEEP:-4}"

if [ ! -s "$PASS_FILE" ]; then
  echo "ERROR: $PASS_FILE is missing. Create it once (see docs/DEPLOY.md §6):" >&2
  echo "  read -rsp 'Password: ' P && printf %s \"\$P\" > $PASS_FILE && chmod 600 $PASS_FILE" >&2
  exit 1
fi
command -v 7z >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq 7zip >/dev/null 2>&1 || apt-get install -y -qq p7zip-full >/dev/null; }

set -a
# shellcheck disable=SC1091
. "$APP_DIR/.env"
set +a

DAY="$(date +%F)"
WORK="$(mktemp -d /var/tmp/kh-backup.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT" "$WORK/files"
chmod 700 "$OUT" "$WORK"

# room for the dump, the files and the archive: at least 2 GB free
need_kb=$((2 * 1024 * 1024))
free_kb=$(df -Pk "$OUT" | awk 'NR==2 {print $4}')
if [ "$free_kb" -lt "$need_kb" ]; then
  echo "ERROR: not enough disk space in $OUT ($((free_kb / 1024)) MB free, ~$((need_kb / 1024)) MB needed)" >&2
  exit 1
fi

echo "==> [$(date -Is)] PostgreSQL dump"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner > "$WORK/knowledgehub.dump"

echo "==> MinIO files"
docker compose run --rm -T -v "$WORK/files:/mirror" --entrypoint sh minio-init -c \
  'mc alias set kh http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null && mc mirror --overwrite "kh/$S3_BUCKET" /mirror' >/dev/null

cp "$APP_DIR/.env" "$WORK/env.txt"
git -C "$APP_DIR" rev-parse HEAD > "$WORK/commit.txt"
cat > "$WORK/LEIA-ME.txt" <<EOF
KnowledgeHub v2 — backup de $DAY (commit $(cat "$WORK/commit.txt"))
knowledgehub.dump  base de dados (pg_restore)
files/             ficheiros (MinIO, bucket $S3_BUCKET)
env.txt            o .env da VPS (contém as chaves — guardar com cuidado)
Repor: docs/DEPLOY.md §6.
EOF

echo "==> Encrypted archive"
ARCHIVE="$OUT/kh-v2-$DAY.7z"
rm -f "$ARCHIVE"
( cd "$WORK" && 7z a -t7z -mhe=on -mx=5 -p"$(cat "$PASS_FILE")" "$ARCHIVE" . >/dev/null )
chmod 600 "$ARCHIVE"
sha256sum "$ARCHIVE" | sed "s#  $OUT/#  #" > "$ARCHIVE.sha256"

# keep the newest $KEEP
ls -1t "$OUT"/kh-v2-*.7z 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r f; do rm -f "$f" "$f.sha256"; done

echo "==> Done: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
