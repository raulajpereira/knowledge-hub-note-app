#!/usr/bin/env bash
# Safety copy of the database right before every deploy's migrations (run by
# .github/workflows/v2.yml, after postgres is up and before `migrate`).
#
#  - full pg_dump (custom format) to $KH_BACKUP_STAGING/pre-deploy/
#    (default /var/backups/knowledgehub/pre-deploy), readable only by its owner;
#  - the copy is checked (not empty, pg_restore can read its table of contents);
#    if anything fails this script exits non-zero and the deploy STOPS before
#    any migration runs;
#  - the number of rows of the main tables goes to the deploy log, to compare
#    before / after;
#  - NOTHING is ever deleted here: old copies stay until a person removes them
#    (docs/DEPLOY.md §6d).
#
# usage: infra/backup/pre-deploy.sh <label>   (label: the image tag / commit)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$APP_DIR"

LABEL="$(printf '%s' "${1:-manual}" | tr -c 'A-Za-z0-9._-' '_' | cut -c1-40)"
DIR="${KH_BACKUP_STAGING:-/var/backups/knowledgehub}/pre-deploy"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DIR/knowledgehub-$TS-$LABEL.dump"

umask 077
mkdir -p "$DIR"

echo "==> [pre-deploy] database copy → $OUT"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner' > "$OUT.part"
mv "$OUT.part" "$OUT"

SIZE="$(stat -c %s "$OUT")"
if [ "$SIZE" -lt 10240 ]; then
  echo "[pre-deploy] the copy is too small ($SIZE bytes): deploy stopped, nothing was migrated" >&2
  exit 1
fi
# pg_restore must be able to read the whole table of contents
ENTRIES="$(docker compose exec -T postgres pg_restore --list < "$OUT" | grep -c ';' || true)"
if [ "${ENTRIES:-0}" -lt 50 ]; then
  echo "[pre-deploy] the copy could not be read back ($ENTRIES entries): deploy stopped, nothing was migrated" >&2
  exit 1
fi

echo "==> [pre-deploy] copy OK: $SIZE bytes, $ENTRIES entries"
echo "==> [pre-deploy] rows before the migrations (exact):"
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F " " -v ON_ERROR_STOP=1' <<'SQL' | sed 's/^/    /'
select 'tenants', count(*) from tenants
 union all select 'users', count(*) from users
 union all select 'folders', count(*) from folders
 union all select 'notes', count(*) from notes
 union all select 'tasks', count(*) from tasks
 union all select 'meetings', count(*) from meetings
 union all select 'voice_notes', count(*) from voice_notes
 union all select 'drive_files', count(*) from drive_files
 union all select 'emails', count(*) from emails
 union all select 'vault_items', count(*) from vault_items
 union all select 'tickets', count(*) from tickets
 union all select 'issues', count(*) from issues
 union all select 'artifacts', count(*) from artifacts
 union all select 'snippets', count(*) from snippets
 union all select 'whiteboards', count(*) from whiteboards
 union all select 'sap_objects', count(*) from sap_objects
 union all select 'sap_transports', count(*) from sap_transports
 union all select 'mg_people', count(*) from mg_people
 union all select 'mg_projects', count(*) from mg_projects
 union all select 'mg_bookings', count(*) from mg_bookings;
SQL
echo "==> [pre-deploy] copies kept in $DIR:"
ls -1sh "$DIR" | tail -n +2 | sed 's/^/    /'
