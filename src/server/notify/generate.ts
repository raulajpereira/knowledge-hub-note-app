import 'server-only';
import { and, asc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { issues, meetings, notifySettings, tasks, tenants, users } from '@/db/schema';
import { env } from '@/lib/env';
import { localParts, notifyPrefs, reminderAt, type NotifyPrefs, type RemindMode } from '@/lib/notify';
import { allow } from '@/server/auth/rateLimit';
import type { AuthContext } from '@/server/auth/session';
import { asUser, type Tx } from '@/server/content/tenant';
import { getEntitlements } from '@/server/licensing/entitlements';
import { sendMail } from '@/server/mail/send';
import { renderMail } from '@/server/mail/templates';
import { addNotification, type NotifyKind } from './service';

// The notification job (worker, every minute). For each active person, as
// that person under RLS: tasks and project issues due today / overdue, task
// reminders, today's meeting records and pending shared-folder invitations
// become notifications. Each has a dedupe key (item + kind + day, or the
// reminder's instant), unique per person in the database, so a restart or two
// workers running at once never write one twice. Then the optional emails
// (reminders and meetings) and the daily summary.

const LIVE_TENANTS = ['trial', 'active', 'past_due'] as const;
const PER_KIND = 50;
const MAX_INSTANT_MAILS_PER_DAY = 30;
const SUMMARY_WINDOW_MIN = 120;

type Person = { id: string; tenantId: string; email: string; lang: 'pt' | 'en'; name: string };
type Made = {
  kind: NotifyKind;
  itemType: string;
  itemId: string;
  title: string;
  meta: Record<string, string>;
};

const hm = (s: string) => {
  const [h, m] = s.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

async function settingsOf(tx: Tx, userId: string) {
  const [s] = await tx
    .select({ prefs: notifySettings.prefs, tz: notifySettings.tz, sent: notifySettings.summarySentOn })
    .from(notifySettings)
    .where(eq(notifySettings.userId, userId));
  return { prefs: notifyPrefs(s?.prefs), tz: s?.tz ?? 'Europe/Lisbon', hasRow: !!s };
}

/** Writes this person's due notifications; returns the new ones that may also go by email. */
async function generateFor(p: Person, modules: ReadonlySet<string>, now: Date) {
  const auth = { tenantId: p.tenantId, userId: p.id };
  return asUser({ user: { id: p.id }, tenant: { id: p.tenantId } } as AuthContext, async (tx) => {
    const { prefs, tz } = await settingsOf(tx, p.id);
    const { day, minutes } = localParts(now, tz);
    const mailable: Made[] = [];
    const add = async (m: Made, key: string, mail = false) => {
      const isNew = await addNotification(tx, auth, { ...m, key });
      if (isNew && mail) mailable.push(m);
    };

    if (modules.has('tasks')) {
      const open = and(isNull(tasks.deletedAt), isNull(tasks.doneAt), eq(tasks.ownerId, p.id));
      if (prefs.taskDue)
        for (const t of await tx
          .select({ id: tasks.id, title: tasks.title })
          .from(tasks)
          .where(and(open, eq(tasks.dueOn, day)))
          .limit(PER_KIND))
          await add(
            { kind: 'task_due', itemType: 'task', itemId: t.id, title: t.title, meta: { due: day } },
            `task_due:${t.id}:${day}`,
          );
      if (prefs.taskOverdue)
        for (const t of await tx
          .select({ id: tasks.id, title: tasks.title, due: tasks.dueOn })
          .from(tasks)
          .where(and(open, lt(tasks.dueOn, day)))
          .orderBy(sql`${tasks.dueOn} desc`)
          .limit(PER_KIND))
          await add(
            { kind: 'task_overdue', itemType: 'task', itemId: t.id, title: t.title, meta: { due: t.due! } },
            `task_overdue:${t.id}:${day}`,
          );
      if (prefs.reminders)
        for (const t of await tx
          .select({
            id: tasks.id,
            title: tasks.title,
            remind: tasks.remind,
            remindAt: tasks.remindAt,
            dueOn: tasks.dueOn,
          })
          .from(tasks)
          .where(and(open, ne(tasks.remind, 'none')))
          .limit(500)) {
          const at = reminderAt({ ...t, remind: t.remind as RemindMode }, tz);
          // due now, and not a stale one from long ago (a reminder set in the past)
          if (!at || at > now || now.getTime() - at.getTime() > 86_400_000) continue;
          await add(
            {
              kind: 'task_reminder',
              itemType: 'task',
              itemId: t.id,
              title: t.title,
              meta: { at: at.toISOString(), ...(t.dueOn ? { due: t.dueOn } : {}) },
            },
            `task_reminder:${t.id}:${at.toISOString()}`,
            true,
          );
        }
    }

    if (modules.has('issues') && (prefs.taskDue || prefs.taskOverdue)) {
      const open = and(isNull(issues.deletedAt), ne(issues.status, 'done'), eq(issues.ownerId, p.id));
      const cond = [
        prefs.taskDue ? eq(issues.dueOn, day) : undefined,
        prefs.taskOverdue ? lt(issues.dueOn, day) : undefined,
      ].filter(Boolean);
      for (const t of await tx
        .select({ id: issues.id, title: issues.title, due: issues.dueOn })
        .from(issues)
        .where(and(open, or(...cond)))
        .limit(PER_KIND * 2)) {
        const kind = t.due === day ? 'issue_due' : 'issue_overdue';
        await add(
          { kind, itemType: 'issue', itemId: t.id, title: t.title, meta: { due: t.due! } },
          `${kind}:${t.id}:${day}`,
        );
      }
    }

    if (modules.has('meetings') && prefs.meetings)
      for (const m of await tx
        .select({ id: meetings.id, title: meetings.title, start: meetings.startTime, end: meetings.endTime })
        .from(meetings)
        .where(and(isNull(meetings.deletedAt), eq(meetings.heldOn, day), eq(meetings.ownerId, p.id)))
        .limit(PER_KIND)) {
        // with a start time: from "lead" minutes before until it starts; without: any time that day
        if (m.start) {
          const s = hm(m.start);
          if (minutes < s - prefs.meetingLead || minutes > s) continue;
        }
        await add(
          {
            kind: 'meeting',
            itemType: 'meeting',
            itemId: m.id,
            title: m.title,
            meta: { day, start: m.start, end: m.end },
          },
          `meeting:${m.id}:${day}`,
          !!m.start,
        );
      }

    if (modules.has('share') && prefs.shares) {
      const inv = await tx.execute<{
        id: string;
        folder_id: string;
        folder_name: string;
        kind: string;
        owner_name: string;
      }>(sql`select id, folder_id, folder_name, kind, owner_name from kh_share_invites()`);
      for (const i of inv)
        await add(
          {
            kind: 'share_invite',
            itemType: 'share',
            itemId: i.folder_id,
            title: i.folder_name,
            meta: { who: i.owner_name, kind: i.kind },
          },
          `share_invite:${i.id}`,
        );
    }
    return { mailable, prefs, tz, day, minutes };
  });
}

// ── Email ──────────────────────────────────────────────────────────────────
const L = {
  pt: {
    reminder: 'Lembrete',
    meeting: 'Reunião a começar',
    meetingAt: 'A reunião "{t}" começa às {s}.',
    reminderText: 'Lembrete da tarefa "{t}".',
    due: 'Prazo: {d}',
    tasksToday: 'Tarefas para hoje',
    overdue: 'Tarefas em atraso',
    issues: 'Tarefas de projeto',
    meetings: 'Reuniões de hoje',
  },
  en: {
    reminder: 'Reminder',
    meeting: 'Meeting starting',
    meetingAt: 'The meeting "{t}" starts at {s}.',
    reminderText: 'Reminder for the task "{t}".',
    due: 'Due: {d}',
    tasksToday: 'Tasks for today',
    overdue: 'Overdue tasks',
    issues: 'Project issues',
    meetings: "Today's meetings",
  },
} as const;
const fmtDay = (d: string) => d.split('-').reverse().join('/');
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w)\}/g, (_m, k: string) => v[k] ?? '');

const HREF: Record<string, string> = {
  task: '/app/tasks?t=',
  issue: '/app/issues?i=',
  meeting: '/app/meetings?m=',
  note: '/app/notes?n=',
};
export const itemLink = (type: string, id: string | null) =>
  `${env().APP_URL.replace(/\/$/, '')}${type === 'share' ? '/app/settings?tab=share' : `${HREF[type] ?? '/app'}${HREF[type] && id ? id : ''}`}`;

async function mailInstant(p: Person, made: Made[]) {
  const c = L[p.lang];
  for (const m of made) {
    if (!(await allow(`notify-mail:${p.id}`, MAX_INSTANT_MAILS_PER_DAY, 86_400))) return;
    const isMeeting = m.kind === 'meeting';
    const heading = isMeeting ? c.meeting : c.reminder;
    const text = isMeeting
      ? fill(c.meetingAt, { t: m.title, s: m.meta.start ?? '' })
      : fill(c.reminderText, { t: m.title }) +
        (m.meta.due ? `\n${fill(c.due, { d: fmtDay(m.meta.due) })}` : '');
    await sendMail(
      renderMail('notify', p.lang, p.email, itemLink(m.itemType, m.itemId), {
        subject: `${heading}: ${m.title}`.slice(0, 160),
        heading,
        text,
      }),
    ).catch((e: unknown) => console.error('[notify] mail failed', p.id, e));
  }
}

/** The daily summary, once per local day (claimed atomically: one worker sends it). */
async function dailySummary(p: Person, modules: ReadonlySet<string>, day: string) {
  const auth = { user: { id: p.id }, tenant: { id: p.tenantId } } as AuthContext;
  const body = await asUser(auth, async (tx) => {
    const claimed = await tx
      .update(notifySettings)
      .set({ summarySentOn: day })
      .where(
        and(
          eq(notifySettings.userId, p.id),
          or(isNull(notifySettings.summarySentOn), ne(notifySettings.summarySentOn, day)),
        ),
      )
      .returning({ id: notifySettings.userId });
    if (!claimed.length) return null;
    const c = L[p.lang];
    const parts: string[] = [];
    const section = (title: string, lines: string[]) => {
      if (lines.length) parts.push(`${title}:\n${lines.map((l) => `• ${l}`).join('\n')}`);
    };
    if (modules.has('tasks')) {
      const rows = await tx
        .select({ title: tasks.title, due: tasks.dueOn })
        .from(tasks)
        .where(
          and(
            isNull(tasks.deletedAt),
            isNull(tasks.doneAt),
            eq(tasks.ownerId, p.id),
            sql`${tasks.dueOn} <= ${day}`,
          ),
        )
        .orderBy(asc(tasks.dueOn))
        .limit(60);
      section(
        c.tasksToday,
        rows.filter((r) => r.due === day).map((r) => r.title || '—'),
      );
      section(
        c.overdue,
        rows.filter((r) => r.due !== day).map((r) => `${r.title || '—'} (${fmtDay(r.due!)})`),
      );
    }
    if (modules.has('issues')) {
      const rows = await tx
        .select({ title: issues.title, due: issues.dueOn })
        .from(issues)
        .where(
          and(
            isNull(issues.deletedAt),
            ne(issues.status, 'done'),
            eq(issues.ownerId, p.id),
            sql`${issues.dueOn} <= ${day}`,
          ),
        )
        .orderBy(asc(issues.dueOn))
        .limit(30);
      section(
        c.issues,
        rows.map((r) => `${r.title} (${fmtDay(r.due!)})`),
      );
    }
    if (modules.has('meetings')) {
      const rows = await tx
        .select({ title: meetings.title, start: meetings.startTime, end: meetings.endTime })
        .from(meetings)
        .where(and(isNull(meetings.deletedAt), eq(meetings.heldOn, day), eq(meetings.ownerId, p.id)))
        .orderBy(asc(meetings.startTime))
        .limit(30);
      section(
        c.meetings,
        rows.map((r) => (r.start ? `${r.start}${r.end ? `–${r.end}` : ''} ${r.title}` : r.title)),
      );
    }
    return parts.length ? parts.join('\n\n') : null;
  });
  if (!body) return false; // nothing today: no email
  await sendMail(
    renderMail('dailySummary', p.lang, p.email, `${env().APP_URL.replace(/\/$/, '')}/app`, {
      date: fmtDay(day),
      list: body,
    }),
  );
  return true;
}

/** People who get notifications: active accounts of live clients. */
async function people(email?: string): Promise<Person[]> {
  return db()
    .select({
      id: users.id,
      tenantId: users.tenantId,
      email: users.email,
      lang: users.lang,
      name: users.name,
    })
    .from(users)
    .innerJoin(tenants, eq(tenants.id, users.tenantId))
    .where(
      and(
        eq(users.status, 'active'),
        isNull(tenants.deletedAt),
        inArray(tenants.status, [...LIVE_TENANTS]),
        email ? eq(users.email, email) : undefined,
      ),
    );
}

export async function runNotify(now = new Date(), opts: { email?: string } = {}) {
  const out = { people: 0, mailed: 0, summaries: 0, failed: 0 };
  const mods = new Map<string, ReadonlySet<string>>();
  for (const p of await people(opts.email)) {
    try {
      let m = mods.get(p.tenantId);
      if (!m) mods.set(p.tenantId, (m = new Set((await getEntitlements(p.tenantId)).modules)));
      const r = await generateFor(p, m, now);
      out.people++;
      if (r.prefs.email && r.mailable.length) {
        await mailInstant(p, r.mailable);
        out.mailed += r.mailable.length;
      }
      if (summaryDue(r.prefs, r.minutes) && (await dailySummary(p, m, r.day))) out.summaries++;
    } catch (e) {
      out.failed++;
      console.error('[notify] failed for user', p.id, e);
    }
  }
  return out;
}

/** Within the two hours after the chosen time (so turning it on late at night sends nothing until tomorrow). */
export function summaryDue(prefs: NotifyPrefs, minutes: number) {
  if (!prefs.summary) return false;
  const at = hm(prefs.summaryTime);
  return minutes >= at && minutes < at + SUMMARY_WINDOW_MIN;
}

/** Retention (daily job): read notifications after 30 days, all after 90. */
export async function pruneNotifications() {
  const [r] = await db().execute<{ n: number }>(sql`select kh_prune_notifications() as n`);
  return r?.n ?? 0;
}
