import 'server-only';
import { getEntitlements } from '@/server/licensing/entitlements';
import { desc, eq, sql } from 'drizzle-orm';
import webpush from 'web-push';
import { db } from '@/db/client';
import { pushSubscriptions } from '@/db/schema';
import { env } from '@/lib/env';
import { translate, type Lang } from '@/i18n';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { asUser } from '@/server/content/tenant';

// Web Push (docs/DEPLOY.md §5e): the bell's notifications on the person's
// phone / computer, even with the app closed. Each browser where the person
// turned it on is a subscription (Definições › Notificações). The worker
// (runPush, every minute) claims the notifications not pushed yet — only the
// last 15 minutes' — and sends one message per subscription; a subscription
// the push service no longer knows (404 / 410) is deleted.

export function pushConfigured(): boolean {
  const e = env();
  return !!(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY && e.VAPID_SUBJECT);
}
export function pushPublicKey(): string | null {
  return pushConfigured() ? env().VAPID_PUBLIC_KEY! : null;
}

let vapidSet = false;
function vapid() {
  if (!vapidSet) {
    const e = env();
    webpush.setVapidDetails(e.VAPID_SUBJECT!, e.VAPID_PUBLIC_KEY!, e.VAPID_PRIVATE_KEY!);
    vapidSet = true;
  }
}

export type PushDevice = { id: string; device: string; createdAt: string; lastOkAt: string | null };

export async function listDevices(auth: AuthContext): Promise<PushDevice[]> {
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select()
      .from(pushSubscriptions)
      .orderBy(desc(pushSubscriptions.createdAt))
      .limit(50);
    return rows.map((r) => ({
      id: r.id,
      device: r.device,
      createdAt: r.createdAt.toISOString(),
      lastOkAt: r.lastOkAt?.toISOString() ?? null,
    }));
  });
}

export async function subscribe(
  auth: AuthContext,
  s: { endpoint: string; p256dh: string; auth: string; device: string },
): Promise<string> {
  if (!pushConfigured()) throw new ApiError(404, 'not_found', 'Push not configured');
  // only real push services (https), never an address of ours or a private network
  let u: URL;
  try {
    u = new URL(s.endpoint);
  } catch {
    throw new ApiError(400, 'validation', 'Bad endpoint');
  }
  if (u.protocol !== 'https:' || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname))
    throw new ApiError(400, 'validation', 'Bad endpoint');
  return asUser(auth, async (tx) => {
    const n = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(pushSubscriptions)
      .then((r) => r[0]?.n ?? 0);
    if (n >= 20) throw new ApiError(409, 'limit_reached', 'Too many devices');
    const r = await tx.execute<{ id: string }>(
      sql`select kh_push_subscribe(${s.endpoint}, ${s.p256dh}, ${s.auth}, ${s.device}) as id`,
    );
    return (r as unknown as Array<{ id: string }>)[0]!.id;
  });
}

/** Turns it off for one browser (by its endpoint) or one device of the list (by id). */
export async function unsubscribe(auth: AuthContext, by: { endpoint?: string; id?: string }) {
  return asUser(auth, async (tx) => {
    if (by.id) await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, by.id));
    else if (by.endpoint)
      await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, by.endpoint));
  });
}

type Payload = { title: string; body: string; url: string; tag: string };

const HREF: Record<string, string> = {
  task: '/app/tasks?t=',
  issue: '/app/issues?i=',
  meeting: '/app/meetings?m=',
  note: '/app/notes?n=',
  email: '/app/emails?m=',
};
const ddmm = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso;

/** The same words as the bell (NotificationBell's label). */
export function pushPayload(
  n: {
    id: string;
    kind: string;
    itemType: string;
    itemId: string | null;
    title: string;
    meta: Record<string, unknown>;
  },
  lang: Lang,
): Payload {
  const t = (k: string) => translate(lang, k);
  const m = n.meta as Record<string, string | undefined>;
  const head: Record<string, string> = {
    task_due: t('nt_taskDue'),
    task_overdue: t('nt_taskOverdue').replace('{d}', ddmm(m.due ?? '')),
    issue_due: t('nt_issueDue'),
    issue_overdue: t('nt_issueOverdue').replace('{d}', ddmm(m.due ?? '')),
    task_reminder: t('nt_reminder'),
    meeting: m.start ? t('nt_meetingAt').replace('{s}', m.start) : t('nt_meetingToday'),
    share_invite: t('nt_shareInvite').replace('{who}', m.who ?? ''),
    share_accepted: t('nt_shareAccepted').replace('{who}', m.who ?? ''),
    inbound_note: t('nt_inboundNote'),
    inbound_task: t('nt_inboundTask'),
    inbound_email: t('nt_inboundEmail'),
  };
  const base = env().NEXT_PUBLIC_BASE_PATH;
  const path =
    n.itemType === 'share'
      ? '/app/settings?tab=share'
      : HREF[n.itemType] && n.itemId
        ? `${HREF[n.itemType]}${n.itemId}`
        : '/app';
  return {
    title: head[n.kind] || 'KnowledgeHub',
    body: n.title,
    // Ambientes: the app opens it in the item's workspace (AppShell reads kh_ws)
    url: `${base}${path}${typeof n.meta?.ws === 'string' ? `${path.includes('?') ? '&' : '?'}kh_ws=${n.meta.ws}` : ''}`,
    // the same item replaces its earlier message on the device
    tag: `${n.kind.split('_')[0]}:${n.itemId ?? n.id}`,
  };
}

async function sendTo(sub: { id: string; endpoint: string; p256dh: string; auth: string }, p: Payload) {
  vapid();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(p),
      { TTL: 15 * 60, urgency: 'normal', timeout: 10_000 },
    );
    return 'ok' as const;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    return code === 404 || code === 410 ? ('gone' as const) : ('error' as const);
  }
}

/** "Enviar teste" in Definições: one message to every device of the caller. */
export async function sendTest(auth: AuthContext, lang: Lang): Promise<{ sent: number; failed: number }> {
  if (!pushConfigured()) throw new ApiError(404, 'not_found', 'Push not configured');
  const subs = await asUser(auth, (tx) => tx.select().from(pushSubscriptions).limit(20));
  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    const r = await sendTo(s, {
      title: 'KnowledgeHub',
      body: translate(lang, 'pu_testBody'),
      url: `${env().NEXT_PUBLIC_BASE_PATH}/app/settings?tab=notify`,
      tag: 'test',
    });
    if (r === 'ok') sent++;
    else failed++;
    await db().execute(sql`select kh_push_result(${s.id}::uuid, ${r !== 'gone'})`);
  }
  return { sent, failed };
}

/** The worker job (every minute). */
export async function runPush(): Promise<{ claimed: number; sent: number; gone: number; failed: number }> {
  if (!pushConfigured()) return { claimed: 0, sent: 0, gone: 0, failed: 0 };
  const rows = (await db().execute(sql`select * from kh_push_claim(200)`)) as unknown as Array<{
    id: string;
    user_id: string;
    kind: string;
    item_type: string;
    item_id: string | null;
    title: string;
    meta: Record<string, unknown>;
    lang: string;
  }>;
  if (!rows.length) return { claimed: 0, sent: 0, gone: 0, failed: 0 };
  const users = [...new Set(rows.map((r) => r.user_id))];
  // the ids go as bound parameters: array[$1, $2, …]::uuid[]
  const uuidArray = sql`array[${sql.join(
    users.map((u) => sql`${u}`),
    sql`, `,
  )}]::uuid[]`;
  // only people whose plan has "Notificações push" (the console's switch)
  const tenantOf = new Map(
    (
      (await db().execute(sql`select * from kh_user_tenants(${uuidArray})`)) as unknown as Array<{
        user_id: string;
        tenant_id: string;
      }>
    ).map((x) => [x.user_id, x.tenant_id]),
  );
  const pushOn = new Map<string, boolean>();
  for (const t of new Set(tenantOf.values()))
    pushOn.set(t, (await getEntitlements(t)).modules.includes('push'));
  const allowed = (u: string) => pushOn.get(tenantOf.get(u) ?? '') === true;
  const subs = (await db().execute(sql`select * from kh_push_targets(${uuidArray})`)) as unknown as Array<{
    id: string;
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>;
  let sent = 0;
  let gone = 0;
  let failed = 0;
  const dead = new Set<string>();
  for (const r of rows) {
    const p = pushPayload(
      {
        id: r.id,
        kind: r.kind,
        itemType: r.item_type,
        itemId: r.item_id,
        title: r.title,
        meta: r.meta ?? {},
      },
      r.lang === 'en' ? 'en' : 'pt',
    );
    if (!allowed(r.user_id)) continue;
    for (const s of subs) {
      if (s.user_id !== r.user_id || dead.has(s.id)) continue;
      const res = await sendTo(s, p);
      if (res === 'ok') sent++;
      else if (res === 'gone') {
        gone++;
        dead.add(s.id);
      } else failed++;
      if (res !== 'error') await db().execute(sql`select kh_push_result(${s.id}::uuid, ${res === 'ok'})`);
    }
  }
  return { claimed: rows.length, sent, gone, failed };
}
