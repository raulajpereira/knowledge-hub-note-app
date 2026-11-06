#!/usr/bin/env bash
# Exact number of rows of the main tables (deploy log: before and after the
# migrations, to compare). Read-only. With "after": also the Ambientes checks.
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$APP_DIR"
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
[ "${1:-}" = after ] || exit 0
# Ambientes (migration 0052): how many, and notes left without one (must be 0)
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F " " -v ON_ERROR_STOP=1' <<'SQL' | sed 's/^/    /'
select 'workspaces', count(*) from workspaces
 union all select 'users_without_workspace', count(*) from users u where not exists (select 1 from workspaces w where w.owner_id = u.id)
 union all select 'notes_without_workspace', count(*) from notes where workspace_id is null
 union all select 'tasks_without_workspace', count(*) from tasks where workspace_id is null;
SQL
