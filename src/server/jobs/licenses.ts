import { and, eq, gt, inArray, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm';
import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { db } from '@/db/client';
import { codes, plans, tenants, users } from '@/db/schema';
import { env } from '@/lib/env';
import { s3 } from '@/lib/storage';
import { audit } from '@/server/audit';
import { invalidateEntitlements } from '@/server/licensing/entitlements';
import { REVOKE_RETENTION_DAYS } from '@/server/licensing/codes';
import { renderMail } from '@/server/mail/templates';
import { sendMail } from '@/server/mail/send';

// Daily license job (API.md "Jobs agendados"):
//  - a trial that ended, or a paid subscription 7 days past its renewal date,
//    makes the client "suspended" (read-only; ROADMAP CA). A renewal date that
//    just passed makes it "Em atraso" first, so it shows in Precisa de atenção;
//  - reminders 7, 3 and 1 days before a renewal;
//  - codes past their date become "expired";
//  - what was revoked more than 30 days ago is deleted for good (D45), files included;
//  - audit entries older than 2 years are removed (SECURITY.md §8 retention).

const DAY = 86_400_000;
const GRACE_DAYS = 7;
const AUDIT_RETENTION_DAYS = 730;

async function removePrefix(prefix: string) {
  const bucket = env().S3_BUCKET;
  for (let token: string | undefined; ;) {
    const page = await s3().send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (keys.length) await s3().send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }));
    if (!page.IsTruncated) break;
    token = page.NextContinuationToken;
  }
}

async function adminsOf(tenantId: string, fallback: string | null) {
  const rows = await db()
    .select({ email: users.email, lang: users.lang })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.roleInTenant, 'admin'), eq(users.status, 'active')));
  return rows.length ? rows : fallback ? [{ email: fallback, lang: 'pt' as const }] : [];
}

export async function runLicenseJob(now = new Date()) {
  const out = { suspended: 0, pastDue: 0, reminders: 0, codesExpired: 0, purged: 0, auditPurged: 0 };
  const t = now.getTime();
  const paid = sql`exists (select 1 from ${plans} p where p.id = ${tenants.planId} and p.price_month_per_user > 0)`;

  // trials that ended → suspended
  const trials = await db()
    .update(tenants)
    .set({ status: 'suspended' })
    .where(and(eq(tenants.status, 'trial'), isNull(tenants.deletedAt), lt(tenants.trialEndsAt, now)))
    .returning({ id: tenants.id, name: tenants.name });
  // paid subscriptions past their renewal: "Em atraso", then suspended after the grace days
  const late = await db()
    .update(tenants)
    .set({ status: 'past_due' })
    .where(and(eq(tenants.status, 'active'), isNull(tenants.deletedAt), lt(tenants.renewAt, now), paid))
    .returning({ id: tenants.id, name: tenants.name });
  const overdue = await db()
    .update(tenants)
    .set({ status: 'suspended' })
    .where(
      and(
        eq(tenants.status, 'past_due'),
        isNull(tenants.deletedAt),
        lt(tenants.renewAt, new Date(t - GRACE_DAYS * DAY)),
      ),
    )
    .returning({ id: tenants.id, name: tenants.name });
  for (const x of [...trials, ...overdue]) {
    await invalidateEntitlements(x.id);
    await audit({
      action: 'tenant.expired',
      actorKind: 'system',
      tenantId: x.id,
      targetType: 'tenant',
      targetId: x.id,
      details: { name: x.name },
    });
  }
  for (const x of late)
    await audit({
      action: 'tenant.update',
      actorKind: 'system',
      tenantId: x.id,
      targetType: 'tenant',
      targetId: x.id,
      details: { name: x.name, status: 'past_due' },
    });
  out.suspended = trials.length + overdue.length;
  out.pastDue = late.length;

  // renewal reminders 7, 3 and 1 days before (each day's window once)
  for (const d of [7, 3, 1]) {
    const from = new Date(t + (d - 1) * DAY);
    const to = new Date(t + d * DAY);
    const due = await db()
      .select({
        id: tenants.id,
        name: tenants.name,
        renewAt: tenants.renewAt,
        contact: tenants.contactEmail,
        plan: plans.code,
      })
      .from(tenants)
      .innerJoin(plans, eq(plans.id, tenants.planId))
      .where(
        and(
          eq(tenants.status, 'active'),
          isNull(tenants.deletedAt),
          gt(tenants.renewAt, from),
          lt(tenants.renewAt, to),
          sql`${plans.priceMonthPerUser} > 0`,
        ),
      );
    for (const x of due)
      for (const a of await adminsOf(x.id, x.contact)) {
        await sendMail(
          renderMail('renewalReminder', a.lang, a.email, `${env().APP_URL.replace(/\/$/, '')}/app`, {
            days: String(d),
            plan: x.plan,
            client: x.name,
            date: x.renewAt!.toLocaleDateString(a.lang === 'en' ? 'en-GB' : 'pt-PT'),
          }),
        );
        out.reminders++;
      }
  }

  // codes past their date
  const exp = await db()
    .update(codes)
    .set({ status: 'expired' })
    .where(and(eq(codes.status, 'active'), isNotNull(codes.expiresAt), lt(codes.expiresAt, now)))
    .returning({ id: codes.id });
  out.codesExpired = exp.length;

  // revoked more than 30 days ago: delete for good
  const limit = new Date(t - REVOKE_RETENTION_DAYS * DAY);
  const goneTenants = await db()
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(and(isNotNull(tenants.deletedAt), lt(tenants.deletedAt, limit)));
  const revoked = await db()
    .select({ id: codes.id, code: codes.code })
    .from(codes)
    .where(and(eq(codes.status, 'revoked'), lt(codes.revokedAt, limit)));
  // people who registered with a revoked invite (their own individual clients go with them)
  const people = revoked.length
    ? await db()
        .select({ id: users.id, tenantId: users.tenantId })
        .from(users)
        .where(
          inArray(
            users.registeredWithCodeId,
            revoked.map((c) => c.id),
          ),
        )
    : [];
  for (const p of people) {
    await removePrefix(`users/${p.id}/`).catch(() => {});
    await db().delete(users).where(eq(users.id, p.id));
    const [left] = await db()
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(and(eq(users.tenantId, p.tenantId), ne(users.id, p.id)));
    const [tk] = await db().select({ kind: tenants.kind }).from(tenants).where(eq(tenants.id, p.tenantId));
    if (left!.n === 0 && tk?.kind === 'individual') goneTenants.push({ id: p.tenantId, name: '' });
  }
  for (const g of goneTenants) {
    const members = await db().select({ id: users.id }).from(users).where(eq(users.tenantId, g.id));
    for (const m of members) await removePrefix(`users/${m.id}/`).catch(() => {});
    await removePrefix(`tenants/${g.id}/`).catch(() => {});
    await db().delete(tenants).where(eq(tenants.id, g.id));
    await audit({
      action: 'tenant.purged',
      actorKind: 'system',
      targetType: 'tenant',
      targetId: g.id,
      details: { name: g.name },
    });
  }
  out.purged = goneTenants.length + people.length;

  const [ap] = await db().execute<{ n: number }>(
    sql`select kh_purge_audit(${new Date(t - AUDIT_RETENTION_DAYS * DAY).toISOString()}::timestamptz) as n`,
  );
  out.auditPurged = Number(ap?.n ?? 0);
  return out;
}
