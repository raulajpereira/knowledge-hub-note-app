// Alocações v2 — shared pieces of the screens: zoom levels and their columns,
// labels, colours and the booking helpers that the timeline, grid, project
// and capacity views all use.
import {
  AL_MASK_WK,
  AL_STD_WEEK,
  buckets,
  dnOf,
  holidayOf,
  isoOf,
  isoWeek,
  monthOf,
  monthStart,
  todayIso,
  wdOf,
  yearOf,
  type Booking,
  type Bucket,
  type Dn,
  type Zoom,
} from '@/lib/alloc';

export type TZoom = 'day' | 'week' | 'month';
/** Pixels per day of each timeline zoom. */
export const PPD: Record<TZoom, number> = { day: 34, week: 13, month: 3.4 };
export const ZOOMS: Array<[TZoom, string]> = [
  ['day', 'Dias'],
  ['week', 'Semanas'],
  ['month', 'Meses'],
];
export const GZOOMS: Array<[Zoom, string]> = [
  ['day', 'Dia'],
  ['week', 'Semana'],
  ['month', 'Mês'],
  ['quarter', 'Trimestre'],
];

export const loc = (lang: string) => (lang === 'en' ? 'en-GB' : 'pt-PT');
const fmtCache = new Map<string, Intl.DateTimeFormat>();
const df = (lang: string, o: Intl.DateTimeFormatOptions) => {
  const k = `${lang}|${JSON.stringify(o)}`;
  let f = fmtCache.get(k);
  if (!f) fmtCache.set(k, (f = new Intl.DateTimeFormat(loc(lang), { timeZone: 'UTC', ...o })));
  return f;
};
const dt = (n: Dn) => new Date(n * 86_400_000);
/** "seg", "ter" … / "Mon", "Tue" … */
export const wdShort = (n: Dn, lang: string) =>
  df(lang, { weekday: 'short' }).format(dt(n)).replace('.', '').slice(0, 3).toLowerCase();
/** "out", "nov" … */
export const monShort = (n: Dn, lang: string) =>
  df(lang, { month: 'short' }).format(dt(n)).replace('.', '').toLowerCase();
/** "outubro 2026" / "October 2026" */
export const monLong = (n: Dn, lang: string) => {
  const m = df(lang, { month: 'long' }).format(dt(n));
  return `${lang === 'en' ? m : m.toLowerCase()} ${yearOf(n)}`;
};
/** "26 out" */
export const dayMon = (n: Dn, lang: string) => `${dt(n).getUTCDate()} ${monShort(n, lang)}`;
/** "26 out – 4 dez 2026" */
export function rangeLabel(a: Dn, b: Dn, lang: string) {
  const ya = yearOf(a);
  const yb = yearOf(b);
  return `${dayMon(a, lang)}${ya !== yb ? ` ${ya}` : ''} – ${dayMon(b, lang)} ${yb}`;
}
/** "nov 2026 – out 2027" */
export const monthRange = (a: Dn, b: Dn, lang: string) =>
  `${monShort(a, lang)} ${yearOf(a)} – ${monShort(b, lang)} ${yearOf(b)}`;

export type Col = Bucket & {
  /** label in the pill */
  lbl: string;
  /** small line under it (weekday, working days, holiday) */
  sub: string;
  /** label at the start of a new group (week number · month / year) */
  top: string;
  /** the group the column belongs to (week · month · year), shown in the header's top band */
  band: string;
  today: boolean;
  hol: string | null;
  weekend: boolean;
};
/** Header columns of a zoom between F and T. */
export function columns(zoom: Zoom, F: Dn, T: Dn, lang: string, holLbl: (k: string) => string): Col[] {
  const t = dnOf(todayIso());
  return buckets(zoom, F, T).map((b, i, all) => {
    const prev = all[i - 1];
    if (zoom === 'day') {
      const h = holidayOf(b.a);
      const wd = wdOf(b.a);
      const w = isoWeek(b.a);
      return {
        ...b,
        lbl: String(dt(b.a).getUTCDate()),
        sub: h ? holLbl(h) : wdShort(b.a, lang),
        top: wd === 0 || !prev ? `S${w.w} · ${monShort(b.a, lang)}` : '',
        band: `${lang === 'en' ? 'W' : 'S'}${w.w} · ${dayMon(b.a - wd, lang)} – ${dayMon(b.a - wd + 6, lang)}`,
        today: b.a === t,
        hol: h,
        weekend: wd >= 5,
      };
    }
    if (zoom === 'week') {
      const w = isoWeek(b.a);
      let hol: string | null = null;
      for (let n = b.a; n < b.a + 5; n++) hol = hol ?? holidayOf(n);
      const newM = !prev || monthOf(prev.a) !== monthOf(b.a);
      return {
        ...b,
        lbl: `${String(dt(b.a).getUTCDate()).padStart(2, '0')}/${String(monthOf(b.a) + 1).padStart(2, '0')}`,
        sub: `S${w.w}`,
        top: newM
          ? `${monShort(b.a, lang)}${!prev || yearOf(prev.a) !== yearOf(b.a) ? ` ${yearOf(b.a)}` : ''}`
          : '',
        band: monLong(b.a, lang),
        today: t >= b.a && t <= b.b,
        hol,
        weekend: false,
      };
    }
    const newY = !prev || yearOf(prev.a) !== yearOf(b.a);
    const lbl = zoom === 'quarter' ? `T${Math.floor(monthOf(b.a) / 3) + 1}` : monShort(b.a, lang);
    return {
      ...b,
      lbl,
      sub: '',
      top: newY ? String(yearOf(b.a)) : '',
      band: String(yearOf(b.a)),
      today: t >= b.a && t <= b.b,
      hol: null,
      weekend: false,
    };
  });
}
/** The header's top band: runs of consecutive columns of the same group, with their label. */
export function bands<C extends { a: Dn; b: Dn; band: string }>(cols: C[]) {
  const out: Array<{ a: Dn; b: Dn; label: string; i: number; n: number }> = [];
  cols.forEach((c, i) => {
    const last = out.at(-1);
    if (last && last.label === c.band) {
      last.b = c.b;
      last.n++;
    } else out.push({ a: c.a, b: c.b, label: c.band, i, n: 1 });
  });
  return out;
}
/** Default window: 6 months before and 6 after today (whole months). */
export function defaultWindow(): [Dn, Dn] {
  const t = dnOf(todayIso());
  return [monthStart(t, -6), monthStart(t, 7) - 1];
}

/** Working days (Mon–Fri, no national holiday) between a and b — the "5 dias" of a column. */
export function stdWorkDays(a: Dn, b: Dn) {
  let c = 0;
  for (let n = a; n <= b; n++) if (wdOf(n) < 5 && !holidayOf(n)) c++;
  return c;
}
/** Standard hours of a column (FTE 1). */
export const stdHours = (a: Dn, b: Dn) => stdWorkDays(a, b) * (AL_STD_WEEK / 5);

export const newBooking = (o: Partial<Booking> & Pick<Booking, 'project' | 'from' | 'to'>): Booking => ({
  id: crypto.randomUUID(),
  person: '',
  role: '',
  status: 'confirmed',
  mode: 'hpd',
  value: 8,
  mask: AL_MASK_WK,
  hol: false,
  note: '',
  need: [],
  days: {},
  ver: '',
  ...o,
});
/** The booking moved by k days (its typed days move with it). */
export function shiftBooking(b: Booking, k: number): Booking {
  if (!k) return b;
  const days: Record<string, number> = {};
  for (const [d, h] of Object.entries(b.days)) days[isoOf(dnOf(d) + k)] = h;
  return { ...b, from: isoOf(dnOf(b.from) + k), to: isoOf(dnOf(b.to) + k), days };
}
/** The booking with a new range (typed days outside it are dropped). */
export function rangeBooking(b: Booking, from: string, to: string): Booking {
  const days: Record<string, number> = {};
  for (const [d, h] of Object.entries(b.days)) if (d >= from && d <= to) days[d] = h;
  // a total keeps its hours per day roughly when the range changes
  return { ...b, from, to, days };
}
/** Two bookings out of one, cut before day `n` (null when n is not inside). */
export function splitBooking(b: Booking, n: Dn): [Booking, Booking] | null {
  const F = dnOf(b.from);
  const T = dnOf(b.to);
  if (n <= F || n > T) return null;
  const a = rangeBooking(b, b.from, isoOf(n - 1));
  const c = { ...rangeBooking(b, isoOf(n), b.to), id: crypto.randomUUID(), ver: '' };
  if (b.mode === 'total') {
    // the total is shared by the days of each part
    const k = (n - F) / (T - F + 1);
    a.value = Math.round(b.value * k * 2) / 2;
    c.value = Math.max(0, b.value - a.value);
  }
  return [a, c];
}

/** Lanes: each bar gets the first lane where it doesn't overlap the previous one. */
export function lanes<T extends { from: string; to: string }>(list: T[]): Array<T & { lane: number }> {
  const end: string[] = [];
  return [...list]
    .sort((a, b) => a.from.localeCompare(b.from) || b.to.localeCompare(a.to))
    .map((x) => {
      let l = end.findIndex((e) => e < x.from);
      if (l < 0) {
        end.push(x.to);
        l = end.length - 1;
      } else end[l] = x.to;
      return { ...x, lane: l };
    });
}

/** Colours of the load bands (under 90 %, 90–100 %, over). */
export const BAND_BG = ['rgb(var(--w) / .08)', 'var(--al-u1)', 'var(--al-u2)', 'var(--al-u3)'];
export const BAND_FG = ['rgb(var(--t) / calc(.6 * var(--t-k)))', '#2a1f0e', '#0f2418', '#fff'];

export const ABS_LABEL: Record<string, string> = {
  ferias: 'Férias',
  doenca: 'Doença',
  formacao: 'Formação',
  outra: 'Ausência',
};
/** The absence types as offered when marking one. */
export const ABS_TYPE_LABEL: Record<string, string> = { ...ABS_LABEL, outra: 'Outra' };

/** Skill-group of an area (the SAP area rows of the capacity view). */
export const AREA_GROUPS: Array<[string, string[]]> = [
  ['FI / CO', ['fi', 'co']],
  ['MM / WM', ['mm', 'ewm', 'pp']],
  ['SD', ['sd']],
  ['ABAP / Fiori', ['abap', 'oo', 'rap', 'fiori']],
  ['Basis / BTP', ['basis', 'btp', 'cpi', 's4']],
  ['HCM / SF', ['hcm', 'sf']],
  ['BW', ['bw']],
  ['Gestão de projeto', ['pm']],
];
export const groupOfArea = (a: string) => AREA_GROUPS.find(([, l]) => l.includes(a))?.[0] ?? a.toUpperCase();
