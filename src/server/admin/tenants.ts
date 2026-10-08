import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { codes, plans, tenantModules, tenants, users, type TenantStatus } from '@/db/schema';
import { createCode } from '@/server/licensing/codes';
import { CUSTOM_PLAN, groupModules } from '@/server/licensing/catalog';
import { env } from '@/lib/env';
import { ApiError } from '@/server/errors';
import { audit } from '@/server/audit';
import { renderMail } from '@/server/mail/templates';
import { sendMail } from '@/server/mail/send';
import { invalidateEntitlements } from '@/server/licensing/entitlements';
import type { AdminCtx } from './guard';

const DAY = 86_400_000;

async function loadTenant(id: string) {
  const [t] = await db().select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!t || t.deletedAt) throw new ApiError(404, 'not_found');
  return t;
}

/**
 * "Precisa de atenção" actions (prototype): send the overdue reminder, turn a
 * trial into a paid subscription, add 5 seats, note that the invoice was
 * issued (sales happen outside the app: the console only records it).
 */
export async function quickAction(
  ctx: AdminCtx,
  tenantId: string,
  action: 'reminder' | 'convert' | 'seats5' | 'invoice',
  ip: string | null,
) {
  const t = await loadTenant(tenantId);
  const log = (a: string, details?: Record<string, unknown>) =>
    audit({
      action: a,
      actorUserId: ctx.user.id,
      tenantId,
      targetType: 'tenant',
      targetId: tenantId,
      details: { name: t.name, ...details },
      ip,
    });
  if (action === 'reminder') {
    if (t.status !== 'past_due') throw new ApiError(409, 'not_past_due');
    const [plan] = t.planId ? await db().select().from(plans).where(eq(plans.id, t.planId)).limit(1) : [];
    const to = await db()
      .select({ email: users.email, lang: users.lang })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.roleInTenant, 'admin'), eq(users.status, 'active')));
    const list = to.length ? to : t.contactEmail ? [{ email: t.contactEmail, lang: 'pt' as const }] : [];
    if (!list.length) throw new ApiError(409, 'no_contact');
    for (const u of list)
      await sendMail(
        renderMail('paymentReminder', u.lang, u.email, `${env().APP_URL.replace(/\/$/, '')}/app`, {
          plan: plan?.code ?? '',
          client: t.name,
          date: (t.renewAt ?? new Date()).toLocaleDateString(u.lang === 'en' ? 'en-GB' : 'pt-PT'),
        }),
      );
    await log('tenant.reminder', { to: list.map((u) => u.email) });
    return;
  }
  if (action === 'convert') {
    if (t.status !== 'trial') throw new ApiError(409, 'not_trial');
    const renewAt = new Date(Date.now() + (t.billingCycle === 'annual' ? 365 : 30) * DAY);
    await db()
      .update(tenants)
      .set({ status: 'active', trialEndsAt: null, renewAt })
      .where(eq(tenants.id, tenantId));
    await invalidateEntitlements(tenantId);
    await log('tenant.convert');
    return;
  }
  if (action === 'seats5') {
    await db()
      .update(tenants)
      .set({ seats: t.seats + 5 })
      .where(eq(tenants.id, tenantId));
    await log('tenant.seats', { from: t.seats, to: t.seats + 5 });
    return;
  }
  await log('tenant.invoice', { cycle: t.billingCycle });
}

// ── Client page (Subscrição, Utilizadores, Códigos) ─────────────────────────

export type ClientUser = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  status: 'active' | 'invited' | 'paused' | 'disabled';
  verified: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  code: string | null;
  tenantId: string;
  /** Ficheiros: limits set in the console (null = the defaults) and what is stored */
  filesQuotaMb: number | null;
  filesMaxMb: number | null;
  filesUsed: number;
};

/** The people of some clients (members rows, client page, user page). */
export async function clientUsers(tenantIds: string[]): Promise<ClientUser[]> {
  if (!tenantIds.length) return [];
  const rows = await db()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.roleInTenant,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
      lastSeenAt: users.lastSeenAt,
      createdAt: users.createdAt,
      code: codes.code,
      tenantId: users.tenantId,
      filesQuotaMb: users.filesQuotaMb,
      filesMaxMb: users.filesMaxMb,
    })
    .from(users)
    .leftJoin(codes, eq(codes.id, users.registeredWithCodeId))
    .where(inArray(users.tenantId, tenantIds))
    .orderBy(desc(sql`${users.roleInTenant} = 'admin'`), users.createdAt);
  const usage = new Map<string, number>();
  if (rows.length) {
    const ids = sql.join(
      rows.map((u) => sql`${u.id}`),
      sql`, `,
    );
    const r = await db().execute<{ owner_id: string; used: string }>(
      sql`SELECT owner_id, used FROM kh_drive_usage(ARRAY[${ids}]::uuid[])`,
    );
    for (const x of r) usage.set(x.owner_id, Number(x.used));
  }
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    verified: !!u.emailVerifiedAt,
    lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    code: u.code ?? null,
    tenantId: u.tenantId,
    filesQuotaMb: u.filesQuotaMb,
    filesMaxMb: u.filesMaxMb,
    filesUsed: usage.get(u.id) ?? 0,
  }));
}

export type ClientPatch = Partial<{
  name: string;
  plan: string;
  addonGroups: string[];
  cycle: 'monthly' | 'annual';
  seats: number;
  renewAt: string | null;
  status: TenantStatus;
  contactName: string;
  contactEmail: string;
}>;

/**
 * "Subscrição" (every change saves at once and is audited). The CUSTOM plan's
 * groups are copied into tenant_modules; leaving CUSTOM takes them away.
 * Seats decide pack vs individual, like the prototype (1 seat = individual).
 */
export async function updateClient(ctx: AdminCtx, tenantId: string, patch: ClientPatch, ip: string | null) {
  const t = await loadTenant(tenantId);
  const set: Partial<typeof tenants.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.cycle !== undefined) set.billingCycle = patch.cycle;
  if (patch.seats !== undefined) {
    set.seats = patch.seats;
    set.kind = patch.seats === 1 ? 'individual' : 'pack';
  }
  if (patch.renewAt !== undefined)
    set.renewAt = patch.renewAt ? new Date(`${patch.renewAt}T12:00:00Z`) : null;
  if (patch.status !== undefined) {
    set.status = patch.status;
    if (patch.status !== 'trial') set.trialEndsAt = null;
  }
  if (patch.contactName !== undefined) set.contactName = patch.contactName || null;
  if (patch.contactEmail !== undefined) set.contactEmail = patch.contactEmail || null;
  let groups: string[] | null = null;
  if (patch.plan !== undefined) {
    const [p] = await db().select({ id: plans.id }).from(plans).where(eq(plans.code, patch.plan)).limit(1);
    if (!p) throw new ApiError(400, 'invalid_input');
    set.planId = p.id;
    groups =
      patch.plan === CUSTOM_PLAN
        ? (patch.addonGroups ?? (t.addonGroups.length ? t.addonGroups : ['base']))
        : [];
  } else if (patch.addonGroups !== undefined) {
    const [cur] = t.planId
      ? await db().select({ code: plans.code }).from(plans).where(eq(plans.id, t.planId))
      : [];
    if (cur?.code !== CUSTOM_PLAN) throw new ApiError(409, 'not_custom');
    groups = patch.addonGroups;
  }
  if (groups) {
    const g = [...new Set(groups.length ? ['base', ...groups] : [])];
    set.addonGroups = g;
    const before = t.addonGroups.flatMap(groupModules);
    const after = g.flatMap(groupModules);
    await db().transaction(async (tx) => {
      const gone = before.filter((m) => !after.includes(m));
      if (gone.length)
        await tx
          .delete(tenantModules)
          .where(and(eq(tenantModules.tenantId, tenantId), inArray(tenantModules.moduleId, gone)));
      if (after.length)
        await tx
          .insert(tenantModules)
          .values(after.map((moduleId) => ({ tenantId, moduleId })))
          .onConflictDoNothing();
    });
  }
  if (Object.keys(set).length) await db().update(tenants).set(set).where(eq(tenants.id, tenantId));
  await invalidateEntitlements(tenantId);
  const action =
    patch.status === 'suspended' && t.status !== 'suspended'
      ? 'tenant.suspend'
      : patch.status && t.status === 'suspended' && patch.status !== 'suspended'
        ? 'tenant.reactivate'
        : groups && patch.plan === undefined
          ? 'tenant.custom'
          : 'tenant.update';
  await audit({
    action,
    actorUserId: ctx.user.id,
    tenantId,
    targetType: 'tenant',
    targetId: tenantId,
    details: {
      name: patch.name ?? t.name,
      ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v])),
    },
    ip,
  });
}

/**
 * "Novo cliente": the client's account (trial with the plan's days, or active
 * now) and a license code for its seats that the client's admin registers
 * with — the first person to use it becomes the client's admin.
 */
export async function createClient(
  ctx: AdminCtx,
  input: {
    name: string;
    contactName: string;
    contactEmail: string;
    plan: string;
    cycle: 'monthly' | 'annual';
    seats: number;
    start: 'trial' | 'active';
  },
  ip: string | null,
) {
  if (input.plan === CUSTOM_PLAN) throw new ApiError(400, 'invalid_input');
  const [p] = await db().select().from(plans).where(eq(plans.code, input.plan)).limit(1);
  if (!p) throw new ApiError(400, 'invalid_input');
  const now = Date.now();
  const trialDays = p.trialEnabled ? p.trialDays : 30;
  const trial = input.start === 'trial';
  const [t] = await db()
    .insert(tenants)
    .values({
      name: input.name,
      kind: input.seats === 1 ? 'individual' : 'pack',
      planId: p.id,
      billingCycle: input.cycle,
      seats: input.seats,
      status: trial ? 'trial' : 'active',
      trialEndsAt: trial ? new Date(now + trialDays * DAY) : null,
      renewAt: new Date(now + (trial ? trialDays : input.cycle === 'annual' ? 365 : 30) * DAY),
      contactName: input.contactName || null,
      contactEmail: input.contactEmail,
    })
    .returning({ id: tenants.id });
  const code = await createCode({
    type: 'license',
    planCode: input.plan,
    maxUses: input.seats,
    expiresAt: new Date(now + 30 * DAY),
    tenantId: t!.id,
    createdBy: ctx.user.id,
  });
  await audit({
    action: 'tenant.create',
    actorUserId: ctx.user.id,
    tenantId: t!.id,
    targetType: 'tenant',
    targetId: t!.id,
    details: { name: input.name, plan: input.plan, seats: input.seats, code: code.code },
    ip,
  });
  return { id: t!.id, code: code.code };
}

/** "+ Convidar utilizador": an invite code for the seats still free (30 days). */
export async function inviteToClient(ctx: AdminCtx, tenantId: string, ip: string | null) {
  const t = await loadTenant(tenantId);
  const [{ n }] = (await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), inArray(users.status, ['active', 'invited', 'paused'])))) as [
    { n: number },
  ];
  const free = t.seats - n;
  if (free <= 0) throw new ApiError(409, 'code_no_seats');
  const code = await createCode({
    type: 'invite',
    maxUses: free,
    expiresAt: new Date(Date.now() + 30 * DAY),
    tenantId,
    createdBy: ctx.user.id,
  });
  await audit({
    action: 'code.create',
    actorUserId: ctx.user.id,
    tenantId,
    targetType: 'code',
    targetId: code.code,
    details: { name: t.name, maxUses: free },
    ip,
  });
  return code.code;
}
