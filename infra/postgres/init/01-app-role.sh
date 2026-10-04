#!/bin/sh
# Runs once, when the postgres volume is first initialised. Creates the
# unprivileged runtime role the app connects as (RLS applies to it); the
# migrations then grant it table privileges. Password comes from the env.
set -eu
: "${KH_APP_DB_PASSWORD:?KH_APP_DB_PASSWORD must be set}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v pw="$KH_APP_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE kh_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L', :'pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kh_app')\gexec
SELECT format('ALTER ROLE kh_app LOGIN PASSWORD %L', :'pw')\gexec
SQL
