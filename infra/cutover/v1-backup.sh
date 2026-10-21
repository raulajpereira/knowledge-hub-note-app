#!/usr/bin/env bash
# Last backup of the v1 (before it is removed — docs/DEPLOY.md §7): its MySQL
# database, its uploads/code and its .env, in one encrypted 7-Zip archive in
# /var/backups/knowledgehub, with the same password as the v2 backups
# (/root/.kh-backup-pass). Run as root:
#   bash /opt/knowledgehub-v2/infra/cutover/v1-backup.sh [v1-folder]
# Without the folder it is found from the PM2 process knowledge-hub-api.
set -euo pipefail

PASS_FILE="${KH_BACKUP_PASS_FILE:-/root/.kh-backup-pass}"
OUT="${KH_BACKUP_DIR:-/var/backups/knowledgehub}"
V1_USER="${KH_V1_USER:-raul-pereira}"
[ -s "$PASS_FILE" ] || { echo "ERROR: $PASS_FILE missing (docs/DEPLOY.md §6)" >&2; exit 1; }
command -v 7z >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq 7zip >/dev/null 2>&1 || apt-get install -y -qq p7zip-full >/dev/null; }

V1_DIR="${1:-}"
if [ -z "$V1_DIR" ]; then
  # the API runs from <v1>/server
  V1_DIR=$(sudo -iu "$V1_USER" bash -c 'export PATH=$(ls -d $HOME/.nvm/versions/node/*/bin | tail -1):$PATH; pm2 jlist 2>/dev/null' |
    python3 -c 'import json,sys
for p in json.load(sys.stdin):
    if p.get("name")=="knowledge-hub-api": print(p["pm2_env"]["pm_cwd"]); break' 2>/dev/null || true)
  V1_DIR="${V1_DIR%/server}"
fi
[ -n "$V1_DIR" ] && [ -f "$V1_DIR/server/.env" ] || {
  echo "ERROR: v1 folder not found. Pass it: v1-backup.sh /home/$V1_USER/htdocs/<site>" >&2
  exit 1
}
echo "==> v1 folder: $V1_DIR"

# DATABASE_URL="mysql://user:pass@host:port/db" from the v1 server/.env
read -r DBU DBP DBH DBPORT DBN < <(python3 - "$V1_DIR/server/.env" <<'PY'
import re, sys
from urllib.parse import urlparse, unquote
for line in open(sys.argv[1]):
    m = re.match(r'\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?', line)
    if m:
        u = urlparse(m.group(1))
        print(unquote(u.username or ''), unquote(u.password or ''), u.hostname or 'localhost', u.port or 3306, u.path.lstrip('/'))
        break
PY
)
[ -n "${DBN:-}" ] || { echo "ERROR: DATABASE_URL not found in $V1_DIR/server/.env" >&2; exit 1; }

DAY="$(date +%F)"
WORK="$(mktemp -d /var/tmp/kh-v1.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT"; chmod 700 "$OUT" "$WORK"

echo "==> MySQL dump ($DBN)"
MYSQL_PWD="$DBP" mysqldump -h "$DBH" -P "$DBPORT" -u "$DBU" --single-transaction --no-tablespaces --routines --triggers \
  --default-character-set=utf8mb4 "$DBN" > "$WORK/v1-$DBN.sql"
echo "    $(wc -l < "$WORK/v1-$DBN.sql") lines"

echo "==> v1 files (without node_modules / builds)"
tar -C "$(dirname "$V1_DIR")" -czf "$WORK/v1-files.tar.gz" \
  --exclude='node_modules' --exclude='.git' --exclude='client/dist' --exclude='backoffice/dist' \
  "$(basename "$V1_DIR")"
cp "$V1_DIR/server/.env" "$WORK/v1-server-env.txt"

ARCHIVE="$OUT/kh-v1-final-$DAY.7z"
rm -f "$ARCHIVE"
( cd "$WORK" && 7z a -t7z -mhe=on -mx=5 -p"$(cat "$PASS_FILE")" "$ARCHIVE" . >/dev/null )
chmod 600 "$ARCHIVE"
sha256sum "$ARCHIVE" | sed "s#  $OUT/#  #" > "$ARCHIVE.sha256"
echo "==> Done: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
echo "$V1_DIR" > "$OUT/.v1-dir"
