#!/usr/bin/env bash
# Removes the v1 for good (docs/DEPLOY.md §7, step 7 — only after the v2 has
# run fine for some days and the final v1 backup is on the owner's PC):
# its PM2 process, its folder and its MySQL database. The host services stay
# switched off (v1-stop.sh); the packages themselves are left installed.
# Run as root:  bash v1-purge.sh  (asks for confirmation)
set -euo pipefail

OUT="${KH_BACKUP_DIR:-/var/backups/knowledgehub}"
V1_USER="${KH_V1_USER:-raul-pereira}"
V1_DIR="${1:-$(cat "$OUT/.v1-dir" 2>/dev/null || true)}"
ls "$OUT"/kh-v1-final-*.7z >/dev/null 2>&1 || { echo "ERROR: no final v1 backup in $OUT (run v1-backup.sh first)" >&2; exit 1; }
[ -n "$V1_DIR" ] && [ -d "$V1_DIR" ] || { echo "ERROR: v1 folder unknown — pass it as an argument" >&2; exit 1; }
DBN=$(sed -nE 's#^\s*DATABASE_URL\s*=\s*"?mysql://[^/]+/([^"?]+).*#\1#p' "$V1_DIR/server/.env" | head -1)

echo "This deletes, with no way back except the backup:"
echo "  - the PM2 process knowledge-hub-api of $V1_USER"
echo "  - the folder $V1_DIR"
echo "  - the MySQL database ${DBN:-?}"
read -rp "Type APAGAR to continue: " ok
[ "$ok" = "APAGAR" ] || { echo "Cancelled."; exit 1; }

sudo -iu "$V1_USER" bash -c 'export PATH=$(ls -d $HOME/.nvm/versions/node/*/bin | tail -1):$PATH; pm2 delete knowledge-hub-api; pm2 save --force; pm2 kill' || true
if [ -n "$DBN" ]; then
  systemctl start mysql 2>/dev/null || true
  mysql -e "DROP DATABASE IF EXISTS \`$DBN\`" && echo "database $DBN dropped" || echo "WARNING: could not drop $DBN (drop it in CloudPanel or with mysql as root)"
  systemctl stop mysql 2>/dev/null || true
fi
rm -rf "$V1_DIR"
rm -f "$OUT/.v1-dir"
echo "v1 removed. Disk: $(df -h / | awk 'NR==2 {print $4}') free."
