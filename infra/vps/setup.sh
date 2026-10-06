#!/usr/bin/env bash
# One-time preparation of the Hostinger VPS for KnowledgeHub v2, alongside
# the v1 app that keeps running untouched (Nginx + PM2 + MySQL).
# Idempotent; safe to re-run. Run as root (or with sudo):
#   sudo bash infra/vps/setup.sh <deploy-user>
#
# What it does:          Docker Engine + compose plugin, 2 GB swap (KVM 1 has
#                        4 GB RAM), UFW (SSH/80/443 only), fail2ban,
#                        unattended-upgrades, restic, /opt/knowledgehub-v2.
# What it does NOT do:   touch Nginx, v1, MySQL or the SSH daemon config —
#                        see docs/DEPLOY.md for the SSH hardening checklist.
set -euo pipefail

DEPLOY_USER="${1:-${SUDO_USER:-}}"
[ -n "$DEPLOY_USER" ] || { echo "usage: sudo bash setup.sh <deploy-user>"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "run as root (sudo)"; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends ca-certificates curl gnupg ufw fail2ban unattended-upgrades restic

echo "==> Docker"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
usermod -aG docker "$DEPLOY_USER"
# Rotate container logs by default.
if [ ! -f /etc/docker/daemon.json ]; then
  echo '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }' > /etc/docker/daemon.json
  systemctl restart docker
fi

echo "==> Swap (2 GB, only if the VPS has none yet)"
if [ -z "$(swapon --noheadings --show)" ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 && echo 'vm.swappiness=10' > /etc/sysctl.d/99-kh-swap.conf
fi

echo "==> Firewall (UFW)"
# Keep whatever port sshd really listens on, so enabling UFW can't lock us out.
# `sshd -T` can fail (e.g. CloudPanel servers): never abort on it.
SSH_PORT="$( (sshd -T 2>/dev/null || true) | awk '/^port /{print $2; exit}')"
SSH_PORT="${SSH_PORT:-$(awk 'tolower($1)=="port"{print $2; exit}' /etc/ssh/sshd_config 2>/dev/null)}"
SSH_PORT="${SSH_PORT:-22}"
ufw allow "${SSH_PORT}/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
# After the cut-over Caddy (in Docker) proxies /v1 to the v1 API on the host.
ufw allow from 172.16.0.0/12 to any port 4000 proto tcp
ufw --force enable

echo "==> fail2ban + unattended-upgrades"
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> App directory"
mkdir -p /opt/knowledgehub-v2 /var/backups/knowledgehub
chown "$DEPLOY_USER":"$DEPLOY_USER" /opt/knowledgehub-v2 /var/backups/knowledgehub

echo "==> Done. Log out and back in so '$DEPLOY_USER' picks up the docker group."
