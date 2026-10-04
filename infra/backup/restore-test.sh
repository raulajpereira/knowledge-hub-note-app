#!/usr/bin/env bash
# Monthly restore drill: restores the latest dump into a throw-away database
# inside the postgres container, checks it, and drops it. Never touches the
# live database. Cron:  30 4 1 * *  /opt/knowledgehub-v2/infra/backup/restore-test.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$APP_DIR"
set -a
# shellcheck disable=SC1091
. "$APP_DIR/.env"
set +a

STAGING="${KH_BACKUP_STAGING:-/var/backups/knowledgehub}"
DUMP="$(ls -1t "$STAGING"/db/knowledgehub-*.dump 2>/dev/null | head -n1 || true)"
[ -n "$DUMP" ] || { echo "No local dump found in $STAGING/db"; exit 1; }

DB=kh_restore_test
echo "==> Restoring $DUMP into $DB"
docker compose exec -T postgres dropdb -U "$POSTGRES_USER" --if-exists "$DB"
docker compose exec -T postgres createdb -U "$POSTGRES_USER" "$DB"
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$DB" --no-owner < "$DUMP"

TABLES="$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$DB" -Atc \
  "select count(*) from information_schema.tables where table_schema = 'public'")"
MIGRATIONS="$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$DB" -Atc \
  "select count(*) from drizzle.__drizzle_migrations")"
docker compose exec -T postgres dropdb -U "$POSTGRES_USER" "$DB"

echo "==> Restore OK: $TABLES tables, $MIGRATIONS migrations"
[ "$MIGRATIONS" -gt 0 ]
