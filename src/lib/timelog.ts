// Registo de Tempos: the rules shared by the server and the screens.

/** Seconds worked → minutes kept: always rounded up to 15 minutes, at least 15. */
export function roundUp15(seconds: number): number {
  return Math.max(15, Math.ceil(Math.max(0, seconds) / 900) * 15);
}

/** 135 → "2h 15m" */
export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Elapsed seconds → "01:23:45" */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** The local day of a moment in a time zone, as YYYY-MM-DD. */
export function localDay(at: Date, tz: string): string {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return f.format(at);
}

/** The timesheet slot of a moment: the week's Monday (YYYY-MM-DD) and the weekday (0 = Monday … 6 = Sunday). */
export function tsSlot(at: Date, tz: string): { week: string; day: number } {
  const day = localDay(at, tz);
  const d = new Date(`${day}T12:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7;
  const mon = new Date(d.getTime() - wd * 86_400_000);
  return { week: mon.toISOString().slice(0, 10), day: wd };
}
