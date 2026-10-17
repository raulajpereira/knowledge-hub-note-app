import { z } from 'zod';

// Notification settings (Definições › Notificações) and the pure helpers the
// server, the worker and the view share: preference schema and defaults,
// reminder times and the inbound-email address token.

export const MEETING_LEADS = [5, 10, 15, 30] as const;

export const NotifyPrefs = z.object({
  /** tasks (and project issues) due today */
  taskDue: z.boolean(),
  /** tasks (and project issues) past their date, once a day */
  taskOverdue: z.boolean(),
  /** "Lembrar-me" on a task */
  reminders: z.boolean(),
  /** meeting records of today / starting soon */
  meetings: z.boolean(),
  /** shared-folder invitations and acceptances */
  shares: z.boolean(),
  /** minutes before a meeting's start time */
  meetingLead: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)]),
  /** reminders, meetings and shares also by email */
  email: z.boolean(),
  /** one email a day with today's tasks and meetings */
  summary: z.boolean(),
  /** local time of the daily summary, HH:MM */
  summaryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
export type NotifyPrefs = z.infer<typeof NotifyPrefs>;

export const NOTIFY_DEFAULTS: NotifyPrefs = {
  taskDue: true,
  taskOverdue: true,
  reminders: true,
  meetings: true,
  shares: true,
  meetingLead: 15,
  email: false,
  summary: false,
  summaryTime: '08:00',
};

/** Stored prefs over the defaults; anything malformed falls back to the default. */
export function notifyPrefs(stored: unknown): NotifyPrefs {
  const out = { ...NOTIFY_DEFAULTS } as Record<string, unknown>;
  if (stored && typeof stored === 'object')
    for (const [k, v] of Object.entries(stored)) {
      const s = NotifyPrefs.shape[k as keyof typeof NotifyPrefs.shape];
      if (s && s.safeParse(v).success) out[k] = v;
    }
  return out as NotifyPrefs;
}

/** An IANA time zone this runtime knows (the database uses the same names). */
export function validTz(tz: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Local day (YYYY-MM-DD) and minute of the day of an instant in a time zone. */
export function localParts(at: Date, tz: string): { day: string; minutes: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** The instant of a local wall-clock time (YYYY-MM-DD, HH:MM) in a time zone. */
export function zonedInstant(day: string, hhmm: string, tz: string): Date {
  const [y, mo, d] = day.split('-').map(Number) as [number, number, number];
  const [h, mi] = hhmm.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // the zone's offset at that moment (twice: correct across a DST change)
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(t), tz);
    const [py, pm, pd] = p.day.split('-').map(Number) as [number, number, number];
    const shown = Date.UTC(py, pm - 1, pd, Math.floor(p.minutes / 60), p.minutes % 60);
    t += guess - shown;
  }
  return new Date(t);
}

export type RemindMode = 'none' | 'due' | 'day_before' | 'custom';
export const REMIND_HOUR = '09:00';

/** When a task's reminder fires, or null (no reminder, or "at due date" without a date). */
export function reminderAt(
  t: { remind: RemindMode; remindAt: Date | string | null; dueOn: string | null },
  tz: string,
): Date | null {
  if (t.remind === 'custom') return t.remindAt ? new Date(t.remindAt) : null;
  if (t.remind === 'none' || !t.dueOn) return null;
  const day =
    t.remind === 'due'
      ? t.dueOn
      : new Date(Date.parse(`${t.dueOn}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return zonedInstant(day, REMIND_HOUR, tz);
}

// ── Inbound email ("Email para a app") ─────────────────────────────────────
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
export const INBOUND_TOKEN_LEN = 20;

/** 20 base32 characters (100 bits) from the given random bytes. */
export function inboundToken(random: Uint8Array): string {
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const b of random) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5 && out.length < INBOUND_TOKEN_LEN) {
      out += B32[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  if (out.length < INBOUND_TOKEN_LEN) throw new Error('not enough random bytes');
  return out;
}

/** entrada@exemplo.pt + token → entrada+token@exemplo.pt */
export function inboundAddress(base: string, token: string): string {
  const at = base.lastIndexOf('@');
  return `${base.slice(0, at)}+${token}@${base.slice(at + 1)}`;
}
