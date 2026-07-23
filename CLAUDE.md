# Knowledge Hub — working notes for Claude

## Deploy / patch workflow

- Deploys to the VPS run via GitHub Actions (`.github/workflows/deploy.yml`) on
  every push to `main`. The workflow SSHes in, `git reset --hard origin/main`,
  then runs `deploy.sh` (npm install → `prisma migrate deploy` → `prisma
  generate` → build client → `pm2 restart`). No manual migration/restart step
  is ever needed — the pipeline handles it.
- **Always monitor the resulting deploy run until it is green after applying
  patches and pushing to `main` — do this automatically, without asking.**
  Direct pushes to `main` have no PR, so check the run via
  `mcp__github__actions_list` (`list_workflow_runs`, `resource_id: deploy.yml`,
  `branch: main`); the raw output is huge, so always pipe it through `jq`.
  A CI failure webhook wakes the session; success does not, so re-arm a short
  self check-in (`send_later`) while a run is in progress. If a run fails, fetch
  the failed job logs, diagnose, and fix drive-to-green.

## Repo conventions

- Patches arrive as `.patch` files; save them to the repo root and apply with
  `git am` in the given order. Committer/author must be
  `Claude <noreply@anthropic.com>`.
- The `.patch` files in the repo root are intentionally kept (gitignored where
  applicable) — don't treat them as stray.
