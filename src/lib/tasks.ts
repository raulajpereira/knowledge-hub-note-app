// Task helpers shared by the server (repetition) and the view (due labels).

export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Local calendar day as YYYY-MM-DD. */
export const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Due date of the next occurrence of a repeating task: one interval after
 * its due date (or after today when it had none). Monthly keeps the day,
 * clamped to the month's length (31 Jan → 28/29 Feb).
 */
export function nextDue(due: string | null, repeat: Repeat, today: Date): string | null {
  if (repeat === 'none') return due;
  const base = due ?? localDay(today);
  const [y, m, d] = base.split('-').map(Number) as [number, number, number];
  if (repeat === 'daily') return iso(new Date(Date.UTC(y, m - 1, d + 1)));
  if (repeat === 'weekly') return iso(new Date(Date.UTC(y, m - 1, d + 7)));
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m, Math.min(d, last))));
}

/** Prototype fmtDue: 2026-09-22 → 22/09/2026. */
export const fmtDue = (s: string | null) => (s ? s.split('-').reverse().join('/') : '');
