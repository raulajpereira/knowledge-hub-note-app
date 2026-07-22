#!/usr/bin/env bash
# Runs on the VPS. Pulls the latest code, applies migrations, rebuilds the
# client, and restarts the API. Called manually or by the GitHub Actions
# workflow in .github/workflows/deploy.yml on every push to main.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

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
