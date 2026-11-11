import 'server-only';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  consoleSettings,
  modules,
  planLimits,
  planModules,
  plans,
  tenantModuleGrace,
  tenants,
} from '@/db/schema';
import { adminsOf } from '@/server/jobs/licenses';
import { sendMail } from '@/server/mail/send';
import { renderMail } from '@/server/mail/templates';
import { env } from '@/lib/env';

/** Pricing policy: the least a client keeps a module taken out of its plan. */
export const GRACE_DAYS = 30;
import { ApiError } from '@/server/errors';
import { audit } from '@/server/audit';
import { invalidateEntitlements } from '@/server/licensing/entitlements';
import { CUSTOM_PLAN, MODULE_GROUPS } from '@/server/licensing/catalog';
import { consolePrices } from './clients';
import type { AdminCtx } from './guard';

// Pacotes e Preços: monthly price per user, annual discount, trial, the
// FREE creation limits, the modules of each plan and the prices of the
// "pacote individual" (per module group). Changes reach every client of the
// plan at once (entitlements are recomputed).

/** creation limits; 'workspaces' (Ambientes) is set for every plan, the others for FREE. Empty = no limit. */
export const LIMIT_KEYS = [
  'notes',
  'tasks',
  'artifacts',
  'whiteboards',
  'snippets',
  'voice',
  'workspaces',
] as const;

export type PlanFull = {
  code: string;
  color: string | null;
  price: number;
  disc: number;
  trialEnabled: boolean;
  trialDays: number;
  modules: string[];
  limits: Partial<Record<(typeof LIMIT_KEYS)[number], number>>;
  clients: number;
};

export async function plansFull() {
  const [rows, mods, lims, counts, prices] = await Promise.all([
    db().select().from(plans).orderBy(plans.sort),
    db().select().from(planModules),
    db().select().from(planLimits),
    db()
      .select({ planId: tenants.planId, n: sql<number>`count(*)::int` })
      .from(tenants)
      .where(isNull(tenants.deletedAt))
      .groupBy(tenants.planId),
    consolePrices(),
  ]);
  const list: PlanFull[] = rows
    .filter((p) => p.code !== CUSTOM_PLAN)
    .map((p) => ({
      code: p.code,
      color: p.color,
      price: Number(p.priceMonthPerUser),
      disc: p.annualDiscountPct,
      trialEnabled: p.trialEnabled,
      trialDays: p.trialDays,
      modules: mods.filter((m) => m.planId === p.id).map((m) => m.moduleId),
      limits: Object.fromEntries(lims.filter((l) => l.planId === p.id).map((l) => [l.resource, l.max])),
      clients: counts.find((c) => c.planId === p.id)?.n ?? 0,
    }));
  const custom = rows.find((p) => p.code === CUSTOM_PLAN);
  return {
    plans: list,
    groups: MODULE_GROUPS.map((g) => ({
      grp: g.grp,
      pt: g.pt,
      en: g.en,
      modules: g.modules.map(([id, pt, en]) => ({ id, pt, en })),
    })),
    addon: prices.addon,
    customDisc: prices.customDisc,
    customClients: (custom && counts.find((c) => c.planId === custom.id)?.n) ?? 0,
  };
}

async function planByCode(code: string) {
  const [p] = await db().select().from(plans).where(eq(plans.code, code)).limit(1);
  if (!p || p.code === CUSTOM_PLAN) throw new ApiError(404, 'not_found');
  return p;
}

/** Every client of a plan sees the change at once. */
async function refresh(planId: string) {
  const ts = await db().select({ id: tenants.id }).from(tenants).where(eq(tenants.planId, planId));
  await Promise.all(ts.map((t) => invalidateEntitlements(t.id)));
}

export async function updatePlan(
  ctx: AdminCtx,
  code: string,
  patch: Partial<{ price: number; disc: number; trialEnabled: boolean; trialDays: number }>,
) {
  const p = await planByCode(code);
  const set: Partial<typeof plans.$inferInsert> = {};
  if (patch.price !== undefined) set.priceMonthPerUser = String(patch.price);
  if (patch.disc !== undefined) set.annualDiscountPct = patch.disc;
  if (patch.trialEnabled !== undefined) set.trialEnabled = patch.trialEnabled;
  if (patch.trialDays !== undefined) set.trialDays = patch.trialDays;
  if (!Object.keys(set).length) return;
  await db().update(plans).set(set).where(eq(plans.id, p.id));
  await audit({
    action: patch.trialEnabled !== undefined || patch.trialDays !== undefined ? 'plan.trial' : 'plan.update',
    actorUserId: ctx.user.id,
    targetType: 'plan',
    targetId: code,
    details: { plan: code, ...patch },
  });
}

/** The plan's modules (whole groups or single modules, the console decides). */
export async function setPlanModules(ctx: AdminCtx, code: string, ids: string[]) {
  const p = await planByCode(code);
  const known = new Set((await db().select({ id: modules.id }).from(modules)).map((m) => m.id));
  const next = [...new Set(ids)].filter((m) => known.has(m));
  const cur = (await db().select().from(planModules).where(eq(planModules.planId, p.id))).map(
    (m) => m.moduleId,
  );
  const added = next.filter((m) => !cur.includes(m));
  const removed = cur.filter((m) => !next.includes(m));
  if (!added.length && !removed.length) return;
  // Pricing policy: the clients already on this plan keep what is taken out until
  // their renewal (at least 30 days) and are told by email; put back, the grace ends.
  const graced = await db().transaction(async (tx) => {
    if (removed.length)
      await tx
        .delete(planModules)
        .where(and(eq(planModules.planId, p.id), inArray(planModules.moduleId, removed)));
    if (added.length) {
      await tx.insert(planModules).values(added.map((moduleId) => ({ planId: p.id, moduleId })));
      await tx
        .delete(tenantModuleGrace)
        .where(
          and(
            inArray(tenantModuleGrace.moduleId, added),
            sql`${tenantModuleGrace.tenantId} in (select id from tenants where plan_id = ${p.id})`,
          ),
        );
    }
    if (!removed.length) return [];
    const ts = await tx
      .select({ id: tenants.id, name: tenants.name, renewAt: tenants.renewAt, contact: tenants.contactEmail })
      .from(tenants)
      .where(and(eq(tenants.planId, p.id), isNull(tenants.deletedAt)));
    const min = new Date(Date.now() + GRACE_DAYS * 86_400_000);
    for (const t of ts)
      await tx
        .insert(tenantModuleGrace)
        .values(
          removed.map((moduleId) => ({
            tenantId: t.id,
            moduleId,
            until: t.renewAt && t.renewAt > min ? t.renewAt : min,
          })),
        )
        .onConflictDoNothing();
    return ts.map((t) => ({ ...t, until: t.renewAt && t.renewAt > min ? t.renewAt : min }));
  });
  await refresh(p.id);
  if (graced.length) {
    const names = new Map(
      (await db().select({ id: modules.id, pt: modules.labelPt, en: modules.labelEn }).from(modules)).map(
        (m) => [m.id, m],
      ),
    );
    for (const t of graced)
      for (const a of await adminsOf(t.id, t.contact))
        await sendMail(
          renderMail('featureEnding', a.lang, a.email, `${env().APP_URL.replace(/\/$/, '')}/app`, {
            plan: code,
            client: t.name,
            features: removed
              .map((m) => (a.lang === 'en' ? names.get(m)?.en : names.get(m)?.pt) ?? m)
              .join(', '),
            date: t.until.toLocaleDateString(a.lang === 'en' ? 'en-GB' : 'pt-PT'),
          }),
        ).catch((e: unknown) => console.error('[plans] grace email failed', t.id, e));
  }
  await audit({
    action: 'plan.modules',
    actorUserId: ctx.user.id,
    targetType: 'plan',
    targetId: code,
    details: { plan: code, added, removed },
  });
}

/** FREE creation limits (empty = unlimited). */
export async function setLimits(
  ctx: AdminCtx,
  code: string,
  limits: Partial<Record<(typeof LIMIT_KEYS)[number], number | null>>,
) {
  const p = await planByCode(code);
  await db().transaction(async (tx) => {
    for (const [resource, max] of Object.entries(limits)) {
      await tx.delete(planLimits).where(and(eq(planLimits.planId, p.id), eq(planLimits.resource, resource)));
      if (max !== null && max !== undefined)
        await tx.insert(planLimits).values({ planId: p.id, resource, max });
    }
  });
  await refresh(p.id);
  await audit({
    action: 'plan.limits',
    actorUserId: ctx.user.id,
    targetType: 'plan',
    targetId: code,
    details: { plan: code, ...limits },
  });
}

/** "Pacote individual": € per user per month of each module group, and its annual discount. */
export async function setCustomPrices(
  ctx: AdminCtx,
  patch: { addon?: Record<string, number>; customDisc?: number },
) {
  const now = new Date();
  if (patch.addon) {
    const cur = (await consolePrices()).addon;
    const value = { ...cur };
    for (const g of MODULE_GROUPS.map((x) => x.grp))
      if (patch.addon[g] !== undefined) value[g] = patch.addon[g]!;
    await db()
      .insert(consoleSettings)
      .values({ key: 'addon', value, updatedAt: now })
      .onConflictDoUpdate({ target: consoleSettings.key, set: { value, updatedAt: now } });
  }
  if (patch.customDisc !== undefined)
    await db()
      .insert(consoleSettings)
      .values({ key: 'customDisc', value: patch.customDisc, updatedAt: now })
      .onConflictDoUpdate({ target: consoleSettings.key, set: { value: patch.customDisc, updatedAt: now } });
  await audit({
    action: 'plan.addon',
    actorUserId: ctx.user.id,
    targetType: 'plan',
    targetId: CUSTOM_PLAN,
    details: { ...patch.addon, ...(patch.customDisc !== undefined ? { customDisc: patch.customDisc } : {}) },
  });
}
