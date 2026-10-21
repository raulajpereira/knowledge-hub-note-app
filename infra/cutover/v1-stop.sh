#!/usr/bin/env bash
# Cut-over (docs/DEPLOY.md §7): switches off the v1 and the host web stack
# that only served it (CloudPanel's Nginx, PHP-FPM, MySQL/Percona, FTP) so
# Caddy can take ports 80/443 and the memory goes to the v2. Nothing is
# deleted: `v1-stop.sh --undo` turns everything back on. Run as root.
set -euo pipefail

V1_USER="${KH_V1_USER:-raul-pereira}"
pm2_v1() {
  sudo -iu "$V1_USER" bash -c "export PATH=\$(ls -d \$HOME/.nvm/versions/node/*/bin | tail -1):\$PATH; pm2 $*"
}
# CloudPanel's services (only those that exist on this VPS)
SERVICES=$(systemctl list-unit-files --type=service --no-legend |
  awk '{print $1}' | grep -E '^(nginx|php[0-9.]*-fpm|mysql|mariadb|proftpd|clp-.*|cloudpanel.*)\.service$' || true)

if [ "${1:-}" = "--undo" ]; then
  for s in $SERVICES; do systemctl enable --now "$s" >/dev/null 2>&1 && echo "on   $s" || echo "?    $s"; done
  pm2_v1 resurrect >/dev/null 2>&1 || true
  pm2_v1 list
  echo "v1 back on. Stop Caddy first if it holds 80/443: docker compose stop caddy"
  exit 0
fi

echo "==> v1 (PM2 of $V1_USER)"
pm2_v1 stop all >/dev/null 2>&1 || true
pm2_v1 save --force >/dev/null 2>&1 || true
echo "==> host services"
for s in $SERVICES; do systemctl disable --now "$s" >/dev/null 2>&1 && echo "off  $s" || echo "?    $s"; done
echo "==> ports 80/443 now:"
ss -ltnp '( sport = :80 or sport = :443 )' || true
echo "Done. Free memory:"; free -m | sed -n 1,2p
