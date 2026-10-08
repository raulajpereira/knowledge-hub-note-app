import 'server-only';
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { codes, consoleSettings, planRequests, plans, tenants, users } from '@/db/schema';
import type { TenantStatus } from '@/db/schema';

// Clients (tenants) as the Admin Console sees them: plan, price, seats in use,
// contact, renewal. Value is a monthly equivalent (annual = discounted / 12).

export type PlanRow = {
  id: string;
  code: string;
  color: string | null;
  price: number;
  disc: number;
  trialEnabled: boolean;
  trialDays: number;
};
export type ClientSummary = {
  id: string;
  name: string;
  kind: 'pack' | 'individual';
  status: TenantStatus;
  plan: { code: string; color: string | null } | null;
  addonGroups: string[];
  cycle: 'monthly' | 'annual';
  seats: number;
  used: number;
  renewAt: string | null;
  trialEndsAt: string | null;
  since: string;
  contactName: string;
  contactEmail: string;
  /** € per month (monthly equivalent) */
  value: number;
  licenseCode: string | null;
  deletedAt: string | null;
};

export type ConsolePrices = { addon: Record<string, number>; customDisc: number };

export async function consolePrices(): Promise<ConsolePrices> {
  const rows = await db().select().from(consoleSettings);
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  return {
    addon: (get('addon') as Record<string, number> | undefined) ?? {},
    customDisc: Number(get('customDisc') ?? 0),
  };
}

export async function listPlans(): Promise<PlanRow[]> {
  const rows = await db().select().from(plans).orderBy(plans.sort);
  return rows.map((p) => ({
    id: p.id,
    code: p.code,
    color: p.color,
    price: Number(p.priceMonthPerUser),
    disc: p.annualDiscountPct,
    trialEnabled: p.trialEnabled,
    trialDays: p.trialDays,
  }));
}

/** Monthly value of a client (prototype `price`): trials and canceled clients are worth 0. */
export function clientValue(
  c: { status: string; seats: number; cycle: string; addonGroups: string[] },
  plan: PlanRow | undefined,
  prices: ConsolePrices,
): number {
  if (c.status === 'trial' || c.status === 'canceled' || !plan) return 0;
  const annual = c.cycle === 'annual';
  if (plan.code === 'CUSTOM') {
    const groups = c.addonGroups.includes('base') ? c.addonGroups : ['base', ...c.addonGroups];
    const m = groups.reduce((s, g) => s + (Number(prices.addon[g]) || 0), 0);
    return c.seats * m * (annual ? 1 - prices.customDisc / 100 : 1);
  }
  return c.seats * plan.price * (annual ? 1 - plan.disc / 100 : 1);
}

/** All clients (revoked ones only with `withDeleted`), newest first. */
export async function listClients(opts: { withDeleted?: boolean; ids?: string[] } = {}) {
  const [rows, planRows, prices] = await Promise.all([
    db()
      .select()
      .from(tenants)
      .where(
        and(
          opts.withDeleted ? undefined : isNull(tenants.deletedAt),
          opts.ids ? inArray(tenants.id, opts.ids) : undefined,
        ),
      )
      .orderBy(desc(tenants.createdAt)),
    listPlans(),
    consolePrices(),
  ]);
  if (!rows.length) return { clients: [] as ClientSummary[], plans: planRows, prices };
  const ids = rows.map((r) => r.id);
  const [counts, firstAdmins, lic] = await Promise.all([
    db()
      .select({ tenantId: users.tenantId, n: sql<number>`count(*)::int` })
      .from(users)
      .where(and(inArray(users.tenantId, ids), inArray(users.status, ['active', 'invited', 'paused'])))
      .groupBy(users.tenantId),
    db()
      .selectDistinctOn([users.tenantId], { tenantId: users.tenantId, name: users.name, email: users.email })
      .from(users)
      .where(and(inArray(users.tenantId, ids), eq(users.roleInTenant, 'admin')))
      .orderBy(users.tenantId, users.createdAt),
    db()
      .selectDistinctOn([codes.tenantId], { tenantId: codes.tenantId, code: codes.code })
      .from(codes)
      .where(and(inArray(codes.tenantId, ids), eq(codes.type, 'license')))
      .orderBy(codes.tenantId, codes.createdAt),
  ]);
  const clients: ClientSummary[] = rows.map((t) => {
    const plan = planRows.find((p) => p.id === t.planId);
    const adm = firstAdmins.find((a) => a.tenantId === t.id);
    return {
      id: t.id,
      name: t.name,
      kind: t.kind,
      status: t.status,
      plan: plan ? { code: plan.code, color: plan.color } : null,
      addonGroups: t.addonGroups,
      cycle: t.billingCycle,
      seats: t.seats,
      used: counts.find((c) => c.tenantId === t.id)?.n ?? 0,
      renewAt: t.renewAt?.toISOString() ?? null,
      trialEndsAt: t.trialEndsAt?.toISOString() ?? null,
      since: t.createdAt.toISOString(),
      contactName: t.contactName ?? adm?.name ?? '',
      contactEmail: t.contactEmail ?? adm?.email ?? '',
      value: Math.round(clientValue({ ...t, cycle: t.billingCycle }, plan, prices) * 100) / 100,
      licenseCode: lic.find((l) => l.tenantId === t.id)?.code ?? null,
      deletedAt: t.deletedAt?.toISOString() ?? null,
    };
  });
  return { clients, plans: planRows, prices };
}

const DAY = 86_400_000;
const daysTo = (iso: string | null, now: number) => (iso ? Math.round((Date.parse(iso) - now) / DAY) : null);

export type AttentionItem = {
  cat: 'late' | 'requests' | 'trial' | 'seats' | 'renew';
  clientId: string;
  name: string;
  plan: string | null;
  value: number;
  cycle: 'monthly' | 'annual';
  used: number;
  seats: number;
  contact: string;
  /** days to the date that matters (negative = past) */
  days: number | null;
  /** plan request id (cat requests) */
  requestId?: string;
  requestPlan?: string;
};

/** Visão Geral: MRR/ARR, KPIs and "Precisa de atenção" (prototype rules; plan requests per D43). */
export async function overview() {
  const now = Date.now();
  const { clients } = await listClients();
  const [usersAll, active7, reqs] = await Promise.all([
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .where(isNull(tenants.deletedAt)),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .where(and(isNull(tenants.deletedAt), gt(users.lastSeenAt, new Date(now - 7 * DAY)))),
    db()
      .select({
        id: planRequests.id,
        tenantId: planRequests.tenantId,
        kind: planRequests.kind,
        planCode: plans.code,
        createdAt: planRequests.createdAt,
      })
      .from(planRequests)
      .leftJoin(plans, eq(plans.id, planRequests.planId))
      .where(eq(planRequests.status, 'new'))
      .orderBy(desc(planRequests.createdAt)),
  ]);
  const mrr = clients.reduce((s, c) => s + c.value, 0);
  const seats = clients.reduce((s, c) => s + c.seats, 0);
  const used = clients.reduce((s, c) => s + c.used, 0);
  const base = (c: ClientSummary) => ({
    clientId: c.id,
    name: c.name,
    plan: c.plan?.code ?? null,
    value: c.value,
    cycle: c.cycle,
    used: c.used,
    seats: c.seats,
    contact: c.contactName || c.contactEmail,
  });
  const items: AttentionItem[] = [];
  for (const c of clients) {
    const renew = daysTo(c.renewAt, now);
    if (c.status === 'past_due') items.push({ ...base(c), cat: 'late', days: renew });
  }
  for (const r of reqs) {
    const c = clients.find((x) => x.id === r.tenantId);
    if (c)
      items.push({
        ...base(c),
        cat: 'requests',
        days: Math.round((r.createdAt.getTime() - now) / DAY),
        requestId: r.id,
        requestPlan: r.kind === 'custom' ? 'CUSTOM' : (r.planCode ?? undefined),
      });
  }
  for (const c of clients) {
    const trialEnd = daysTo(c.trialEndsAt ?? c.renewAt, now);
    const renew = daysTo(c.renewAt, now);
    if (c.status === 'trial' && trialEnd !== null && trialEnd <= 14)
      items.push({ ...base(c), cat: 'trial', days: trialEnd });
    if (c.status === 'active' && c.used >= c.seats && c.seats > 1)
      items.push({ ...base(c), cat: 'seats', days: null });
    if (c.status === 'active' && renew !== null && renew >= 0 && renew <= 30)
      items.push({ ...base(c), cat: 'renew', days: renew });
  }
  return {
    mrr: Math.round(mrr * 100) / 100,
    arr: Math.round(mrr * 12 * 100) / 100,
    paying: clients.filter((c) => c.status === 'active' || c.status === 'past_due').length,
    trials: clients.filter((c) => c.status === 'trial').length,
    canceled: clients.filter((c) => c.status === 'canceled').length,
    seats,
    used,
    activeUsers: active7[0]?.n ?? 0,
    users: usersAll[0]?.n ?? 0,
    attention: items,
  };
}
