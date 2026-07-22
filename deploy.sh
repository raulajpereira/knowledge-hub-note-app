#!/usr/bin/env bash
# Runs on the VPS. Pulls the latest code, applies migrations, rebuilds the
# client, and restarts the API. Called manually or by the GitHub Actions
# workflow in .github/workflows/deploy.yml on every push to main.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

# Non-interactive SSH shells don't load the user's profile, so Node installed
# via nvm (or a versioned path) isn't on PATH. Make npm/npx resolvable here.
if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use --lts >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
fi
if ! command -v npm >/dev/null 2>&1; then
  for dir in /usr/local/bin /usr/bin /snap/bin "$HOME/.nvm/versions/node"/*/bin; do
    if [ -x "$dir/npm" ]; then
      PATH="$dir:$PATH"
      break
    fi
  done
  export PATH
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm not found on PATH after loading nvm and common install dirs." >&2
  exit 1
fi

echo "==> Pulling latest code"
git pull origin main

echo "==> Installing server dependencies"
cd "$APP_DIR/server"
npm install --omit=dev

echo "==> Applying database migrations"
npx prisma migrate deploy

echo "==> Regenerating Prisma client"
npx prisma generate

echo "==> Building client"
cd "$APP_DIR/client"
npm install
npm run build

echo "==> Restarting API (PM2)"
cd "$APP_DIR/server"
pm2 restart knowledge-hub-api || pm2 start src/index.js --name knowledge-hub-api
pm2 save

echo "==> Deploy complete"
