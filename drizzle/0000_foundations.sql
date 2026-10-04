-- KnowledgeHub v2 — database foundations (Phase 0)
-- Extensions, the unprivileged runtime role, UUID v7 and the RLS helpers that
-- every tenant-scoped table's policies are written against.

CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint

-- Runtime role. Created NOLOGIN here so migrations never carry a password;
-- infra (postgres init script / ops) sets LOGIN + password from the env.
-- Not a superuser and not the table owner, so RLS always applies to it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kh_app') THEN
    CREATE ROLE kh_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO kh_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kh_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO kh_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO kh_app;--> statement-breakpoint

-- Time-ordered UUIDs (RFC 9562 v7); PostgreSQL 16 has no built-in.
CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  b bytea;
BEGIN
  b := substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
       || gen_random_bytes(10);
  b := set_byte(b, 6, (b'0111' || get_byte(b, 6)::bit(4))::bit(8)::int);
  b := set_byte(b, 8, (b'10' || get_byte(b, 8)::bit(6))::bit(8)::int);
  RETURN encode(b, 'hex')::uuid;
END
$$;--> statement-breakpoint

-- Request context, set per transaction by withTenant() (set_config(..., true)).
-- NULL when unset, so a policy comparing against it matches nothing.
CREATE OR REPLACE FUNCTION kh_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION kh_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION uuid_generate_v7(), kh_tenant_id(), kh_user_id() TO kh_app;
