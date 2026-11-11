import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { admins, supportReports, tenants, users } from '@/db/schema';
import { env } from '@/lib/env';
import { ApiError } from '@/server/errors';
import { audit } from '@/server/audit';
import { renderMail } from '@/server/mail/templates';
import { sendMail } from '@/server/mail/send';
import type { AuthContext } from '@/server/auth/session';
import type { AdminCtx } from '@/server/admin/guard';

// "Reportar problema": what the person wrote, the page, the browser and the
// app version — kept for the console (Pedidos) and emailed to its admins.

export const SupportInput = z.object({
  message: z.string().trim().min(1).max(4000),
  page: z.string().trim().max(500).default(''),
  ua: z.string().trim().max(300).default(''),
  version: z.string().trim().max(60).default(''),
});

export async function reportProblem(auth: AuthContext, input: z.infer<typeof SupportInput>) {
  // at most 10 an hour per person (a stuck button can't flood the console)
  const [{ n }] = (await db().execute(
    sql`select count(*)::int as n from support_reports where user_id = ${auth.user.id} and created_at > now() - interval '1 hour'`,
  )) as unknown as [{ n: number }];
  if (n >= 10) throw new ApiError(429, 'too_many');
  const [r] = await db()
    .insert(supportReports)
    .values({ tenantId: auth.tenant.id, userId: auth.user.id, ...input })
    .returning({ id: supportReports.id });
  const to = await db()
    .select({ email: users.email, lang: users.lang })
    .from(admins)
    .innerJoin(users, eq(users.id, admins.userId))
    .where(and(eq(admins.status, 'active'), inArray(admins.role, ['owner', 'admin', 'support'])));
  const link = `${env().APP_URL.replace(/\/$/, '')}/admin?s=requests`;
  for (const a of to)
    await sendMail(
      renderMail('supportReport', a.lang, a.email, link, {
        who: auth.user.name,
        email: auth.user.email,
        client: auth.tenant.name,
        message: input.message,
        page: input.page || '—',
        ua: input.ua || '—',
        version: input.version || '—',
      }),
    ).catch((e: unknown) => console.error('[support] email failed', e));
  return { id: r!.id };
}

export type SupportRow = {
  id: string;
  message: string;
  page: string;
  ua: string;
  version: string;
  status: 'new' | 'done';
  createdAt: string;
  client: { id: string; name: string };
  user: { name: string; email: string };
};

export async function listReports(): Promise<SupportRow[]> {
  const rows = await db()
    .select({
      r: supportReports,
      cid: tenants.id,
      cname: tenants.name,
      uname: users.name,
      uemail: users.email,
    })
    .from(supportReports)
    .innerJoin(tenants, eq(tenants.id, supportReports.tenantId))
    .innerJoin(users, eq(users.id, supportReports.userId))
    .orderBy(desc(supportReports.createdAt))
    .limit(300);
  return rows.map((x) => ({
    id: x.r.id,
    message: x.r.message,
    page: x.r.page,
    ua: x.r.ua,
    version: x.r.version,
    status: x.r.status,
    createdAt: x.r.createdAt.toISOString(),
    client: { id: x.cid, name: x.cname },
    user: { name: x.uname, email: x.uemail },
  }));
}

export async function setReportStatus(ctx: AdminCtx, id: string, status: 'new' | 'done') {
  const r = await db()
    .update(supportReports)
    .set({ status })
    .where(eq(supportReports.id, id))
    .returning({ id: supportReports.id });
  if (!r.length) throw new ApiError(404, 'not_found');
  await audit({
    action: 'support.status',
    actorUserId: ctx.user.id,
    targetType: 'support',
    targetId: id,
    details: { status },
  });
}
