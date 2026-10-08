// Idempotent seed, run on every deploy (`node dist/seed.mjs`):
//  1. module catalogue (labels/groups follow the code)
//  2. plans + their modules + FREE limits — only when a plan is missing, so
//     prices/modules edited later in the Admin Console are never overwritten
//  3. the operator's tenant and super admin (SUPERADMIN_EMAIL), created
//     without a password; a "set your password" link is emailed (or logged
//     while SMTP isn't configured).
import { eq, sql } from 'drizzle-orm';
import { db, sqlClient } from '@/db/client';
import { admins, modules, planLimits, planModules, plans, tenantModules, tenants, users } from '@/db/schema';
import { env } from '@/lib/env';
import { CUSTOM_PLAN, FREE_LIMITS, MODULES, OWNER_PLAN, PLANS } from '@/server/licensing/catalog';
import { sendSetupLink } from '@/server/auth/service';
import { audit } from '@/server/audit';

export async function seedCatalogue() {
  await db()
    .insert(modules)
    .values(MODULES.map((m, i) => ({ id: m.id, grp: m.grp, labelPt: m.pt, labelEn: m.en, sort: i })))
    .onConflictDoUpdate({
      target: modules.id,
      set: {
        grp: sql`excluded.grp`,
        labelPt: sql`excluded.label_pt`,
        labelEn: sql`excluded.label_en`,
        sort: sql`excluded.sort`,
      },
    });

  for (const [i, p] of PLANS.entries()) {
    const created = await db()
      .insert(plans)
      .values({
        code: p.code,
        color: p.color,
        priceMonthPerUser: String(p.price),
        annualDiscountPct: p.annualDiscountPct,
        sort: i,
        isPopular: p.code === 'PRO',
      })
      .onConflictDoNothing({ target: plans.code })
      .returning({ id: plans.id });
    if (!created[0]) continue;
    await db()
      .insert(planModules)
      .values(p.modules.map((moduleId) => ({ planId: created[0]!.id, moduleId })));
    if (p.code === 'FREE') {
      await db()
        .insert(planLimits)
        .values(
          Object.entries(FREE_LIMITS).map(([resource, max]) => ({ planId: created[0]!.id, resource, max })),
        );
    }
    console.log(`[seed] plan ${p.code} created`);
  }
  // the CUSTOM plan has no modules of its own (tenant_modules carry the chosen groups)
  await db()
    .insert(plans)
    .values({ code: CUSTOM_PLAN, color: 'linear-gradient(135deg,#b8e0ff,#d8c4ff)', sort: 99 })
    .onConflictDoNothing({ target: plans.code });
}

export async function seedSuperAdmin(): Promise<{ created: boolean }> {
  const e = env();
  if (!e.SUPERADMIN_EMAIL) return { created: false };
  const email = e.SUPERADMIN_EMAIL.toLowerCase();
  const [existing] = await db().select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { created: false };

  const [plan] = await db().select({ id: plans.id }).from(plans).where(eq(plans.code, OWNER_PLAN)).limit(1);
  const userId = await db().transaction(async (tx) => {
    const [t] = await tx
      .insert(tenants)
      .values({
        name: 'KnowledgeHub',
        kind: 'individual',
        planId: plan?.id ?? null,
        seats: 1,
        status: 'active',
      })
      .returning({ id: tenants.id });
    // The operator's own tenant gets every module, customisation included.
    await tx.insert(tenantModules).values(MODULES.map((m) => ({ tenantId: t!.id, moduleId: m.id })));
    const [u] = await tx
      .insert(users)
      .values({
        tenantId: t!.id,
        name: e.SUPERADMIN_NAME || email.split('@')[0]!,
        email,
        roleInTenant: 'admin',
        lang: 'pt',
      })
      .returning({ id: users.id });
    await tx.insert(admins).values({ userId: u!.id, role: 'owner' });
    return u!.id;
  });
  await sendSetupLink(userId, email, 'pt');
  await audit({ action: 'seed.superadmin_created', targetType: 'user', targetId: userId });
  console.log(`[seed] super admin ${email} created — set-password link sent`);
  return { created: true };
}

async function main() {
  env();
  await seedCatalogue();
  await seedSuperAdmin();
  console.log('[seed] done');
}

// Run when executed directly (bundled as dist/seed.mjs or via tsx).
if (process.argv[1] && /seed(\/index)?\.(m?js|ts)$/.test(process.argv[1])) {
  main()
    .then(() => sqlClient().end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed] failed', err);
      process.exit(1);
    });
}
