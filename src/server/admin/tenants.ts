import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { plans, tenants, users } from '@/db/schema';
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
