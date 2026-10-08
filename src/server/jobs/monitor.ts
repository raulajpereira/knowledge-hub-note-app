import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { admins, users } from '@/db/schema';
import { env } from '@/lib/env';
import { healthReport } from '@/lib/health';
import { queue, QUEUES } from '@/lib/queue';
import { redis } from '@/lib/redis';
import { errorsKey } from '@/lib/serverErrors';
import { renderMail } from '@/server/mail/templates';
import { deliverMail } from '@/server/mail/send';

// Light monitoring (decision D50, no extra services on the VPS): every few
// minutes the worker checks the services, the public address, the email
// queue and the server errors of the last hour, and emails the console's
// Manager/Administradores when something breaks or recovers (again every 6 h
// while it lasts). If the worker itself stops, /api/health?strict=1 fails —
// that is the address for an external uptime monitor.

const STATE = 'kh:mon:state';
const REPEAT_MS = 6 * 3600_000;
const ERRORS_PER_HOUR = 20;
const MAIL_BACKLOG = 50;

type Problems = Record<string, string>;

type Deps = { fetch?: typeof fetch; health?: typeof healthReport };

export async function checkAll({
  fetch: fetchImpl = fetch,
  health = healthReport,
}: Deps = {}): Promise<Problems> {
  const out: Problems = {};
  const h = await health();
  for (const [name, c] of Object.entries(h.checks)) if (!c.ok) out[name] = c.error ?? 'down';
  try {
    const r = await fetchImpl(`${env().APP_URL.replace(/\/$/, '')}/api/health`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'KnowledgeHub-monitor' },
    });
    if (!r.ok) out.web = `HTTP ${r.status}`;
  } catch (e) {
    out.web = e instanceof Error ? e.message : String(e);
  }
  try {
    const c = await queue(QUEUES.mail).getJobCounts('waiting', 'delayed', 'failed');
    if ((c.waiting ?? 0) + (c.delayed ?? 0) > MAIL_BACKLOG)
      out.mail = `${c.waiting} waiting, ${c.delayed} retrying`;
  } catch (e) {
    out.mail = String(e);
  }
  const prev = new Date(Date.now() - 3600_000);
  const [a, b] = await redis()
    .mget(errorsKey(), errorsKey(prev))
    .catch(() => [null, null]);
  const errs = Number(a ?? 0) + Number(b ?? 0);
  if (errs > ERRORS_PER_HOUR) out.errors = `${errs} server errors in the last hour`;
  return out;
}

async function recipients() {
  return db()
    .select({ email: users.email, lang: users.lang })
    .from(admins)
    .innerJoin(users, eq(users.id, admins.userId))
    .where(and(eq(admins.status, 'active'), inArray(admins.role, ['owner', 'admin'])));
}

export async function runMonitor(now = new Date(), deps: Deps = {}) {
  const problems = await checkAll(deps);
  const raw = await redis().get(STATE);
  const prev = raw
    ? (JSON.parse(raw) as { problems: Problems; sentAt: number })
    : { problems: {}, sentAt: 0 };
  const names = Object.keys(problems).sort().join(',');
  const before = Object.keys(prev.problems).sort().join(',');
  const changed = names !== before;
  const repeat = !!names && now.getTime() - prev.sentAt > REPEAT_MS;
  let sent = false;
  if (changed || repeat) {
    const list = Object.entries(problems)
      .map(([k, v]) => `• ${k}: ${v}`)
      .join('\n');
    const kind = names ? 'monitorAlert' : 'monitorRecovered';
    const link = `${env().APP_URL.replace(/\/$/, '')}/admin`;
    // sent directly, not through the queue: the queue may be what is broken
    for (const r of await recipients())
      await deliverMail(renderMail(kind, r.lang, r.email, link, { list }))
        .then(() => (sent = true))
        .catch((e: unknown) => console.error('[monitor] alert not sent:', e));
    // nobody reached: keep the old state so the next run tries again
    if (!sent) return { problems, alerted: false };
  }
  await redis().set(
    STATE,
    JSON.stringify({ problems, sentAt: sent ? now.getTime() : prev.sentAt }),
    'EX',
    7 * 86400,
  );
  if (names) console.error('[monitor] problems:', JSON.stringify(problems));
  return { problems, alerted: sent };
}
