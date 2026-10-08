import 'server-only';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { admins, planRequests, plans, tenants, users } from '@/db/schema';
import { env } from '@/lib/env';
import { ApiError } from '@/server/errors';
import { audit } from '@/server/audit';
import { allow } from '@/server/auth/rateLimit';
import type { AuthContext } from '@/server/auth/session';
import { renderMail } from '@/server/mail/templates';
import { sendMail } from '@/server/mail/send';
import { CUSTOM_PLAN } from '@/server/licensing/catalog';
import { plansFull } from '@/server/admin/plans';
import { updateClient } from '@/server/admin/tenants';
import type { AdminCtx } from '@/server/admin/guard';

// Plan requests (no billing in the app): "Pedir este plano / Pedir mudança para
// X" and custom packages from the Pricing window. They reach the console's
// Pedidos (and its administrators by email); approving applies the plan.

const DAY = 86_400_000;
const appLink = (path: string) => `${env().APP_URL.replace(/\/$/, '')}${path}`;

/** What the Pricing window shows: the plans, the custom package prices and the caller's own state. */
export async function pricingFor(auth: AuthContext) {
  const full = await plansFull();
  const pending = await db()
    .select({ kind: planRequests.kind, plan: plans.code, createdAt: planRequests.createdAt })
    .from(planRequests)
    .leftJoin(plans, eq(plans.id, planRequests.planId))
    .where(and(eq(planRequests.tenantId, auth.tenant.id), eq(planRequests.status, 'new')));
  return {
    plans: full.plans.map(({ clients: _c, ...p }) => p),
    groups: full.groups,
    addon: full.addon,
    customDisc: full.customDisc,
    current: auth.tenant.planCode,
    seats:
      (await db().select({ seats: tenants.seats }).from(tenants).where(eq(tenants.id, auth.tenant.id)))[0]
        ?.seats ?? 1,
    pending: pending.map((r) => ({ kind: r.kind, plan: r.kind === 'custom' ? CUSTOM_PLAN : r.plan })),
  };
}

export type RequestInput = {
  kind: 'plan' | 'custom';
  plan?: string;
  groups?: string[];
  seats: number;
  cycle: 'monthly' | 'annual';
  notes?: string;
};

/** Someone of a client asks for a plan; the console's administrators get an email. */
export async function createRequest(auth: AuthContext, input: RequestInput) {
  if (!(await allow(`plan-req:${auth.user.id}`, 10, 86_400))) throw new ApiError(429, 'too_many_requests');
  let planId: string | null = null;
  let label = 'Pacote individual';
  if (input.kind === 'plan') {
    const [p] = await db()
      .select({ id: plans.id, code: plans.code })
      .from(plans)
      .where(eq(plans.code, input.plan ?? ''))
      .limit(1);
    if (!p || p.code === CUSTOM_PLAN) throw new ApiError(400, 'invalid_input');
    if (p.code === auth.tenant.planCode) throw new ApiError(409, 'current_plan');
    planId = p.id;
    label = p.code;
  }
  // a plan change keeps the client's seats; a custom package says how many
  const [own] = await db()
    .select({ seats: tenants.seats })
    .from(tenants)
    .where(eq(tenants.id, auth.tenant.id));
  const seats = input.kind === 'plan' ? (own?.seats ?? 1) : input.seats;
  const groups = input.kind === 'custom' ? [...new Set(['base', ...(input.groups ?? [])])] : [];
  // the same request twice is the same request
  const [dup] = await db()
    .select({ id: planRequests.id })
    .from(planRequests)
    .where(
      and(
        eq(planRequests.tenantId, auth.tenant.id),
        eq(planRequests.status, 'new'),
        eq(planRequests.kind, input.kind),
        planId ? eq(planRequests.planId, planId) : undefined,
      ),
    )
    .limit(1);
  if (dup) return dup.id;
  const [r] = await db()
    .insert(planRequests)
    .values({
      tenantId: auth.tenant.id,
      userId: auth.user.id,
      kind: input.kind,
      planId,
      groups,
      seats,
      cycle: input.cycle,
      notes: input.notes?.trim().slice(0, 1000) ?? '',
    })
    .returning({ id: planRequests.id });
  await audit({
    action: 'request.create',
    actorUserId: auth.user.id,
    tenantId: auth.tenant.id,
    targetType: 'plan_request',
    targetId: r!.id,
    details: { name: auth.tenant.name, plan: label, seats, cycle: input.cycle, groups },
  });
  const to = await db()
    .select({ email: users.email, lang: users.lang })
    .from(admins)
    .innerJoin(users, eq(users.id, admins.userId))
    .where(and(eq(admins.status, 'active'), inArray(admins.role, ['owner', 'admin', 'billing', 'support'])));
  for (const a of to)
    await sendMail(
      renderMail('planRequest', a.lang, a.email, appLink('/admin?s=requests'), {
        who: auth.user.name,
        email: auth.user.email,
        client: auth.tenant.name,
        plan: input.kind === 'custom' ? `${label} (${groups.join(', ')})` : label,
        seats: String(seats),
        cycle:
          input.cycle === 'annual'
            ? a.lang === 'en'
              ? 'annual'
              : 'anual'
            : a.lang === 'en'
              ? 'monthly'
              : 'mensal',
        notes: input.notes?.trim().slice(0, 300) ?? '',
      }),
    );
  return r!.id;
}

export type RequestRow = {
  id: string;
  kind: 'plan' | 'custom';
  plan: string;
  groups: string[];
  seats: number;
  cycle: 'monthly' | 'annual';
  notes: string;
  status: 'new' | 'approved' | 'rejected';
  createdAt: string;
  handledAt: string | null;
  client: { id: string; name: string; plan: string | null; seats: number; kind: 'pack' | 'individual' };
  user: { name: string; email: string } | null;
  handledBy: string | null;
};

export async function listRequests(): Promise<RequestRow[]> {
  const rows = await db()
    .select({
      r: planRequests,
      plan: plans.code,
      tName: tenants.name,
      tSeats: tenants.seats,
      tKind: tenants.kind,
      tPlan: tenants.planId,
      uName: users.name,
      uEmail: users.email,
    })
    .from(planRequests)
    .innerJoin(tenants, eq(tenants.id, planRequests.tenantId))
    .leftJoin(plans, eq(plans.id, planRequests.planId))
    .leftJoin(users, eq(users.id, planRequests.userId))
    .orderBy(desc(planRequests.createdAt))
    .limit(500);
  const planCodes = await db().select({ id: plans.id, code: plans.code }).from(plans);
  const handlers = await db()
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(
      inArray(
        users.id,
        rows
          .map((x) => x.r.handledBy)
          .filter((x): x is string => !!x)
          .concat('00000000-0000-0000-0000-000000000000'),
      ),
    );
  return rows.map((x) => ({
    id: x.r.id,
    kind: x.r.kind,
    plan: x.r.kind === 'custom' ? CUSTOM_PLAN : (x.plan ?? ''),
    groups: x.r.groups,
    seats: x.r.seats,
    cycle: x.r.cycle,
    notes: x.r.notes,
    status: x.r.status,
    createdAt: x.r.createdAt.toISOString(),
    handledAt: x.r.handledAt?.toISOString() ?? null,
    client: {
      id: x.r.tenantId,
      name: x.tName,
      plan: planCodes.find((p) => p.id === x.tPlan)?.code ?? null,
      seats: x.tSeats,
      kind: x.tKind,
    },
    user: x.uEmail ? { name: x.uName ?? '', email: x.uEmail } : null,
    handledBy: handlers.find((h) => h.id === x.r.handledBy)?.name ?? null,
  }));
}

async function loadNew(id: string) {
  const [r] = await db().select().from(planRequests).where(eq(planRequests.id, id)).limit(1);
  if (!r) throw new ApiError(404, 'not_found');
  if (r.status !== 'new') throw new ApiError(409, 'already_handled');
  return r;
}

async function notify(
  r: typeof planRequests.$inferSelect,
  kind: 'planApproved' | 'planRejected',
  vars: (lang: 'pt' | 'en') => Record<string, string>,
) {
  if (!r.userId) return;
  const [u] = await db()
    .select({ email: users.email, lang: users.lang })
    .from(users)
    .where(eq(users.id, r.userId))
    .limit(1);
  if (u) await sendMail(renderMail(kind, u.lang, u.email, appLink('/app'), vars(u.lang)));
}

/**
 * "Aprovar": the client gets the plan (or the custom groups), cycle and seats
 * asked for (never fewer seats than in use). Coming from a free plan to a plan
 * with a trial starts the trial; otherwise the subscription is active and
 * renews after the cycle.
 */
export async function approveRequest(ctx: AdminCtx, id: string, ip: string | null) {
  const r = await loadNew(id);
  const [t] = await db().select().from(tenants).where(eq(tenants.id, r.tenantId)).limit(1);
  if (!t || t.deletedAt) throw new ApiError(404, 'not_found');
  const [cur] = t.planId ? await db().select().from(plans).where(eq(plans.id, t.planId)).limit(1) : [];
  const [target] = r.planId ? await db().select().from(plans).where(eq(plans.id, r.planId)).limit(1) : [];
  const code = r.kind === 'custom' ? CUSTOM_PLAN : target?.code;
  if (!code) throw new ApiError(409, 'plan_missing');
  const [used] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.tenantId, t.id), ne(users.status, 'disabled')));
  const trial = !!target && target.trialEnabled && Number(cur?.priceMonthPerUser ?? 0) === 0;
  const now = Date.now();
  await updateClient(
    ctx,
    t.id,
    {
      plan: code,
      ...(r.kind === 'custom' ? { addonGroups: r.groups } : {}),
      cycle: r.cycle,
      seats: Math.max(r.seats, used?.n ?? 0, 1),
      status: trial ? 'trial' : 'active',
      renewAt: new Date(now + (trial ? target!.trialDays : r.cycle === 'annual' ? 365 : 30) * DAY)
        .toISOString()
        .slice(0, 10),
    },
    ip,
  );
  if (trial)
    await db()
      .update(tenants)
      .set({ trialEndsAt: new Date(now + target!.trialDays * DAY) })
      .where(eq(tenants.id, t.id));
  await db()
    .update(planRequests)
    .set({ status: 'approved', handledBy: ctx.user.id, handledAt: new Date() })
    .where(eq(planRequests.id, id));
  await audit({
    action: 'request.approve',
    actorUserId: ctx.user.id,
    tenantId: t.id,
    targetType: 'plan_request',
    targetId: id,
    details: { name: t.name, plan: code, seats: r.seats, cycle: r.cycle, trial },
    ip,
  });
  await notify(r, 'planApproved', (lang) => ({
    plan: code === CUSTOM_PLAN ? (lang === 'en' ? 'Custom plan' : 'Pacote individual') : code,
    client: t.name,
    extra: trial
      ? lang === 'en'
        ? `${target!.trialDays}-day trial.`
        : `Trial de ${target!.trialDays} dias.`
      : '',
  }));
}

export async function rejectRequest(ctx: AdminCtx, id: string, reason: string, ip: string | null) {
  const r = await loadNew(id);
  const [t] = await db()
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, r.tenantId))
    .limit(1);
  const [p] = r.planId
    ? await db().select({ code: plans.code }).from(plans).where(eq(plans.id, r.planId))
    : [];
  await db()
    .update(planRequests)
    .set({ status: 'rejected', handledBy: ctx.user.id, handledAt: new Date() })
    .where(eq(planRequests.id, id));
  await audit({
    action: 'request.reject',
    actorUserId: ctx.user.id,
    tenantId: r.tenantId,
    targetType: 'plan_request',
    targetId: id,
    details: { name: t?.name, plan: p?.code ?? CUSTOM_PLAN, reason },
    ip,
  });
  await notify(r, 'planRejected', (lang) => ({
    plan: p?.code ?? (lang === 'en' ? 'Custom plan' : 'Pacote individual'),
    client: t?.name ?? '',
    extra: reason.trim().slice(0, 500),
  }));
}
