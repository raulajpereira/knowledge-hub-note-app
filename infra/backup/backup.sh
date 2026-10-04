#!/usr/bin/env bash
# Daily backup of KnowledgeHub v2: PostgreSQL dump + MinIO files, pushed
# encrypted to external storage with restic. Retention 7 daily / 4 weekly /
# 6 monthly (DECISIONS_AND_INFRA.md §4). Cron (as the deploy user):
#   15 3 * * *  /opt/knowledgehub-v2/infra/backup/backup.sh >> /var/log/kh-backup.log 2>&1
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$APP_DIR"

# restic settings (RESTIC_REPOSITORY, RESTIC_PASSWORD, AWS_ACCESS_KEY_ID /
# AWS_SECRET_ACCESS_KEY or B2_ACCOUNT_ID / B2_ACCOUNT_KEY) — see .env.backup.example
set -a
# shellcheck disable=SC1091
. "$APP_DIR/infra/backup/.env.backup"
# shellcheck disable=SC1091
. "$APP_DIR/.env"
set +a

STAGING="${KH_BACKUP_STAGING:-/var/backups/knowledgehub}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$STAGING/db" "$STAGING/files"

echo "==> [$TS] PostgreSQL dump"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner \
  > "$STAGING/db/knowledgehub-$TS.dump"
# Keep only the last 3 local dumps; history lives in restic.
ls -1t "$STAGING"/db/knowledgehub-*.dump | tail -n +4 | xargs -r rm -f

echo "==> MinIO mirror"
docker compose run --rm -T -v "$STAGING/files:/mirror" --entrypoint sh minio-init -c \
  'mc alias set kh http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null && mc mirror --overwrite --remove "kh/$S3_BUCKET" /mirror'

echo "==> restic backup"
restic snapshots >/dev/null 2>&1 || restic init
restic backup "$STAGING" --tag knowledgehub --host knowledgehub-vps
restic forget --tag knowledgehub --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune

echo "==> Backup complete"
