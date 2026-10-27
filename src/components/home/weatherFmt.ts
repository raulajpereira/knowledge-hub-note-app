// Formatting for the weather card: times in the PLACE's time zone (not the
// device's), temperatures in °C or °F, and {n}-style message templates.
import type { Lang } from '@/i18n';

export type TempUnit = 'C' | 'F';

export const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export const toUnit = (c: number, u: TempUnit) => (u === 'F' ? (c * 9) / 5 + 32 : c);
export const deg = (c: number, u: TempUnit) => `${Math.round(toUnit(c, u))}°`;

const cache = new Map<string, Intl.DateTimeFormat>();
function f(lang: Lang, tz: string | undefined, o: Intl.DateTimeFormatOptions) {
  const k = `${lang}|${tz ?? ''}|${JSON.stringify(o)}`;
  let v = cache.get(k);
  if (!v) {
    try {
      v = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pt-PT', { ...o, timeZone: tz });
    } catch {
      v = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pt-PT', o);
    }
    cache.set(k, v);
  }
  return v;
}

/** "14:05" */
export const hm = (iso: string, lang: Lang, tz?: string) =>
  f(lang, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

/** "14h" (PT) / "14:00" (EN) */
export function hourLabel(iso: string, lang: Lang, tz?: string) {
  const h = f(lang, tz, { hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  return lang === 'en' ? `${h}:00` : `${h}h`;
}

/** Short weekday of a 'YYYY-MM-DD' date ("qui." → "qui"). */
export const weekday = (date: string, lang: Lang, long = false) =>
  f(lang, 'UTC', { weekday: long ? 'long' : 'short' })
    .format(new Date(`${date}T12:00:00Z`))
    .replace(/\.$/, '');

/** "qui 15:00" — weekday and time of an instant. */
export const dayTime = (iso: string, lang: Lang, tz?: string) =>
  f(lang, tz, { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date(iso))
    .replace(/\.,?/, '');

/** "10h 42min" */
export const duration = (ms: number) => {
  const m = Math.round(ms / 60000);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}min`;
};

/** A small stroke icon (24-unit grid), like the rest of the app's inline icons. */
export const ICON = {
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.5"></circle>',
  chevron: '<path d="M6 9l6 6 6-6"></path>',
  left: '<path d="M15 6l-6 6 6 6"></path>',
  right: '<path d="M9 6l6 6-6 6"></path>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"></path><path d="M20 4v7h-7"></path>',
  warn: '<path d="M12 3l10 18H2z"></path><path d="M12 10v5"></path><path d="M12 18h.01"></path>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3"></path><path d="M3 12h16a3 3 0 1 1-3 3"></path><path d="M3 16h7"></path>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"></path>',
  sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>',
  gauge: '<path d="M4 18a8 8 0 1 1 16 0"></path><path d="M12 18l4-6"></path>',
  hum: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"></path><path d="M9 14a3 3 0 0 0 3 3"></path>',
  uv: '<circle cx="12" cy="12" r="3.5"></circle><path d="M12 3v2M12 19v2M3 12h2M19 12h2"></path>',
  rise: '<path d="M4 18h16"></path><path d="M7 14a5 5 0 0 1 10 0"></path><path d="M12 3v5M9.5 5.5L12 3l2.5 2.5"></path>',
  set: '<path d="M4 18h16"></path><path d="M7 14a5 5 0 0 1 10 0"></path><path d="M12 3v5M9.5 5.5L12 8l2.5-2.5"></path>',
  locate: '<circle cx="12" cy="12" r="3.5"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path>',
  more: '<path d="M6 9l6 6 6-6"></path>',
  umbrella: '<path d="M3 12a9 9 0 0 1 18 0z"></path><path d="M12 12v6a2 2 0 0 0 4 0"></path>',
} as const;
