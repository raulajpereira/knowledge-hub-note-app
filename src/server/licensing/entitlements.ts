import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { planLimits, planModules, tenantModules, tenants } from '@/db/schema';
import { redis } from '@/lib/redis';
import { ApiError } from '@/server/errors';

// DATA_MODEL.md §3: entitlements = plan_modules(tenant.plan) ∪
// tenant_modules(tenant), computed on the server for every request and
// cached in Redis for 60 s. Never trust the client for any of this.
export type Entitlements = { modules: string[]; limits: Record<string, number> };

const TTL_S = 60;
const key = (tenantId: string) => `kh:ent:${tenantId}`;

export async function computeEntitlements(tenantId: string): Promise<Entitlements> {
  const [t] = await db()
    .select({ planId: tenants.planId })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!t) return { modules: [], limits: {} };
  const [fromPlan, extra, lim] = await Promise.all([
    t.planId
      ? db().select({ m: planModules.moduleId }).from(planModules).where(eq(planModules.planId, t.planId))
      : [],
    db()
      .select({ m: tenantModules.moduleId })
      .from(tenantModules)
      .where(eq(tenantModules.tenantId, tenantId)),
    t.planId ? db().select().from(planLimits).where(eq(planLimits.planId, t.planId)) : [],
  ]);
  const modules = [...new Set([...fromPlan.map((r) => r.m), ...extra.map((r) => r.m)])].sort();
  const limits = Object.fromEntries(lim.map((l) => [l.resource, l.max]));
  return { modules, limits };
}

export async function getEntitlements(tenantId: string): Promise<Entitlements> {
  try {
    const cached = await redis().get(key(tenantId));
    if (cached) return JSON.parse(cached) as Entitlements;
  } catch {
    // Redis down: fall through to the database
  }
  const ent = await computeEntitlements(tenantId);
  try {
    await redis().set(key(tenantId), JSON.stringify(ent), 'EX', TTL_S);
  } catch {
    // cache is best-effort
  }
  return ent;
}

/** Call after any change to a tenant's plan, add-ons or access (effect is immediate). */
export async function invalidateEntitlements(tenantId: string): Promise<void> {
  try {
    await redis().del(key(tenantId));
  } catch {
    // ignore
  }
}

export async function requireModule(tenantId: string, moduleId: string): Promise<void> {
  const { modules } = await getEntitlements(tenantId);
  if (!modules.includes(moduleId))
    throw new ApiError(403, 'module_not_included', undefined, { module: moduleId });
}

/** FREE limits: refuse a create when the current count already reached the plan's max. */
export async function assertWithinLimit(
  tenantId: string,
  resource: string,
  currentCount: number,
): Promise<void> {
  const { limits } = await getEntitlements(tenantId);
  const max = limits[resource];
  if (max !== undefined && currentCount >= max) {
    throw new ApiError(403, 'limit_reached', undefined, { resource, max });
  }
}
