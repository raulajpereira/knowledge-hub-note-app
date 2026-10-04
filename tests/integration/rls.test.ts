import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { withTenant } from '@/db/tenant';

// Proves the multi-tenant isolation mechanism every content table relies on:
// the app role (kh_app) only ever sees rows of the tenant set by withTenant(),
// the setting is transaction-local (never leaks across pooled requests), and
// writes into another tenant are rejected. Needs a disposable database:
//   TEST_DATABASE_ADMIN_URL  owner of the test DB (runs migrations)
//   TEST_DATABASE_URL        same DB, as kh_app
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const appPassword = appUrl ? decodeURIComponent(new URL(appUrl).password) : '';

const A = '0190f0a0-0000-7000-8000-00000000000a';
const B = '0190f0b0-0000-7000-8000-00000000000b';

describe.skipIf(!adminUrl || !appUrl)('row level security', () => {
  let admin: postgres.Sql;
  let app: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(`ALTER ROLE kh_app LOGIN PASSWORD '${appPassword.replace(/'/g, "''")}'`);
    await admin.unsafe(`
      DROP TABLE IF EXISTS rls_probe;
      CREATE TABLE rls_probe (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
        tenant_id uuid NOT NULL,
        owner_id uuid,
        body text
      );
      ALTER TABLE rls_probe ENABLE ROW LEVEL SECURITY;
      CREATE POLICY rls_probe_tenant ON rls_probe
        USING (tenant_id = kh_tenant_id())
        WITH CHECK (tenant_id = kh_tenant_id());
      INSERT INTO rls_probe (tenant_id, body) VALUES ('${A}', 'a1'), ('${A}', 'a2'), ('${B}', 'b1');
    `);
    // A single connection makes the "no leak across requests" check meaningful.
    app = postgres(appUrl!, { max: 1 });
  });

  afterAll(async () => {
    await admin?.unsafe('DROP TABLE IF EXISTS rls_probe');
    await app?.end();
    await admin?.end();
  });

  const bodies = (rows: unknown) => (rows as { body: string }[]).map((r) => r.body).sort();

  it('runs as a role that cannot bypass RLS', async () => {
    const [role] = await app`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('shows only the current tenant rows', async () => {
    const db = drizzle(app);
    const a = await withTenant(db, { tenantId: A }, (tx) => tx.execute(sql`select body from rls_probe`));
    const b = await withTenant(db, { tenantId: B }, (tx) => tx.execute(sql`select body from rls_probe`));
    expect(bodies(a)).toEqual(['a1', 'a2']);
    expect(bodies(b)).toEqual(['b1']);
  });

  it('shows nothing without a tenant context, even after a tenant transaction', async () => {
    const db = drizzle(app);
    await withTenant(db, { tenantId: A }, (tx) => tx.execute(sql`select 1`));
    const rows = await db.execute(sql`select body from rls_probe`);
    expect(bodies(rows)).toEqual([]);
  });

  it('rejects writes into another tenant', async () => {
    const db = drizzle(app);
    const err = await withTenant(db, { tenantId: A }, (tx) =>
      tx.execute(sql`insert into rls_probe (tenant_id, body) values (${B}::uuid, 'sneaky')`),
    ).catch((e: unknown) => e);
    // Drizzle wraps the driver error; the Postgres one is the cause.
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    expect(cause?.code).toBe('42501'); // insufficient_privilege
    expect(cause?.message).toMatch(/row-level security/);
  });

  it('cannot update or delete another tenant rows', async () => {
    const db = drizzle(app);
    await withTenant(db, { tenantId: A }, async (tx) => {
      await tx.execute(sql`update rls_probe set body = 'hacked' where body = 'b1'`);
      await tx.execute(sql`delete from rls_probe where body = 'b1'`);
    });
    const b = await withTenant(db, { tenantId: B }, (tx) => tx.execute(sql`select body from rls_probe`));
    expect(bodies(b)).toEqual(['b1']);
  });

  it('refuses a malformed tenant id before touching the database', async () => {
    await expect(withTenant(drizzle(app), { tenantId: "x' or 1=1" }, async () => 1)).rejects.toThrow(
      /invalid tenantId/,
    );
  });
});
