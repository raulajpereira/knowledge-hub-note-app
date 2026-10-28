// Alocações v2: the one calculation shared by the screens and the server.
// An allocation ("booking") is a date range plus an effort rule; the hours of
// each day are computed from the rule, and a day typed by hand is kept as an
// exception. Capacity comes from the person's weekly hours, Portuguese
// national holidays and absences. Days are counted as UTC day numbers
// (days since 1970-01-01), weekday 0 = Monday … 6 = Sunday; a weekday mask has
// bit i set when weekday i is worked.
import { z } from 'zod';

export const AL_DAY_MS = 86_400_000;
/** Standard full-time week (FTE 1 = 8 h a day, Monday to Friday). */
export const AL_STD_WEEK = 40;
/** Monday to Friday. */
export const AL_MASK_WK = 0b0011111;
export const AL_MASK_ALL = 0b1111111;
/** The smallest step typed in hours (half an hour). */
export const AL_STEP = 0.5;
/** Longest allocation / absence, in days (about 4 years). */
export const AL_MAX_DAYS = 1500;

// ── Days ─────────────────────────────────────────────────────────────────────
export type Dn = number;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDay = (s: unknown): s is string => typeof s === 'string' && ISO_RE.test(s);
/** 'YYYY-MM-DD' → day number. */
export const dnOf = (s: string): Dn =>
  Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / AL_DAY_MS;
/** Day number → 'YYYY-MM-DD'. */
export const isoOf = (n: Dn) => new Date(n * AL_DAY_MS).toISOString().slice(0, 10);
/** 0 = Monday … 6 = Sunday. */
export const wdOf = (n: Dn) => (((n + 3) % 7) + 7) % 7;
export const mondayOf = (n: Dn) => n - wdOf(n);
export const addDays = (s: string, k: number) => isoOf(dnOf(s) + k);
/** Today in the browser's / server's local time. */
export const todayIso = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const yearOf = (n: Dn) => new Date(n * AL_DAY_MS).getUTCFullYear();
export const monthOf = (n: Dn) => new Date(n * AL_DAY_MS).getUTCMonth();
/** First day of the month of `n`, and of the month `k` months later. */
export const monthStart = (n: Dn, k = 0) => {
  const d = new Date(n * AL_DAY_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1) / AL_DAY_MS;
};
/** ISO 8601 week number (S44) and its year. */
export function isoWeek(n: Dn): { y: number; w: number } {
  const th = n - wdOf(n) + 3; // the Thursday of the week decides the year
  const y = yearOf(th);
  const jan4 = Date.UTC(y, 0, 4) / AL_DAY_MS;
  return { y, w: 1 + Math.round((th - (jan4 - wdOf(jan4) + 3)) / 7) };
}
export const popcount = (m: number) => {
  let c = 0;
  for (let i = 0; i < 7; i++) if (m & (1 << i)) c++;
  return c;
};
export const inMask = (mask: number, n: Dn) => (mask & (1 << wdOf(n))) !== 0;

// ── Portuguese national holidays ─────────────────────────────────────────────
export const AL_HOLIDAYS: Record<string, [string, string]> = {
  ano: ['Ano Novo', "New Year's Day"],
  sexta: ['Sexta-feira Santa', 'Good Friday'],
  pascoa: ['Páscoa', 'Easter'],
  liberdade: ['Dia da Liberdade', 'Freedom Day'],
  trabalhador: ['Dia do Trabalhador', 'Labour Day'],
  portugal: ['Dia de Portugal', 'Portugal Day'],
  corpo: ['Corpo de Deus', 'Corpus Christi'],
  assuncao: ['Assunção de Nossa Senhora', 'Assumption Day'],
  republica: ['Implantação da República', 'Republic Day'],
  todos: ['Todos os Santos', "All Saints' Day"],
  restauracao: ['Restauração da Independência', 'Restoration of Independence'],
  imaculada: ['Imaculada Conceição', 'Immaculate Conception'],
  natal: ['Natal', 'Christmas Day'],
};
/** Easter Sunday (Gregorian, anonymous algorithm). */
export function easterDn(y: number): Dn {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, month - 1, day) / AL_DAY_MS;
}
const holCache = new Map<number, Map<Dn, string>>();
/** National holidays of a year: day number → key of AL_HOLIDAYS. */
export function ptHolidays(y: number): Map<Dn, string> {
  const hit = holCache.get(y);
  if (hit) return hit;
  const e = easterDn(y);
  const fx = (m: number, d: number) => Date.UTC(y, m - 1, d) / AL_DAY_MS;
  const out = new Map<Dn, string>([
    [fx(1, 1), 'ano'],
    [e - 2, 'sexta'],
    [e, 'pascoa'],
    [fx(4, 25), 'liberdade'],
    [fx(5, 1), 'trabalhador'],
    [fx(6, 10), 'portugal'],
    [e + 60, 'corpo'],
    [fx(8, 15), 'assuncao'],
    [fx(10, 5), 'republica'],
    [fx(11, 1), 'todos'],
    [fx(12, 1), 'restauracao'],
    [fx(12, 8), 'imaculada'],
    [fx(12, 25), 'natal'],
  ]);
  holCache.set(y, out);
  return out;
}
/** The holiday key of a day, or null. */
export const holidayOf = (n: Dn): string | null => ptHolidays(yearOf(n)).get(n) ?? null;
export const holidayName = (k: string, lang: string) => AL_HOLIDAYS[k]?.[lang === 'en' ? 1 : 0] ?? k;

// ── Data ─────────────────────────────────────────────────────────────────────
export const BK_MODES = ['hpd', 'hpw', 'pct', 'fte', 'total'] as const;
export type BkMode = (typeof BK_MODES)[number];
export const BK_STATUS = ['confirmed', 'tentative'] as const;
export type BkStatus = (typeof BK_STATUS)[number];
export const ABS_TYPES = ['ferias', 'doenca', 'formacao', 'outra'] as const;
export type AbsType = (typeof ABS_TYPES)[number];
export type BkNeed = { k: string; l: number };

/** One allocation: a person (or none = "Por atribuir"), a project, a range and an effort rule. */
export type Booking = {
  id: string;
  /** '' = a role still without a person ("Por atribuir") */
  person: string;
  project: string;
  /** role / função in the project (the label of a placeholder) */
  role: string;
  status: BkStatus;
  from: string;
  to: string;
  mode: BkMode;
  /** h/day, h/week, % of capacity, FTE or total hours, by mode */
  value: number;
  /** worked weekdays (bit 0 = Monday) */
  mask: number;
  /** also counts on national holidays (cutovers, go-lives) */
  hol: boolean;
  note: string;
  /** skills a placeholder asks for (for "Quem pode ir?") */
  need: BkNeed[];
  /** days typed by hand: 'YYYY-MM-DD' → hours */
  days: Record<string, number>;
  /** version (updated_at, ms) — '' until the server has it */
  ver: string;
};
export type Absence = {
  id: string;
  person: string;
  type: AbsType;
  from: string;
  to: string;
  /** hours off a day; null = the whole day */
  hours: number | null;
  note: string;
  ver: string;
};

// ── Validation (server edge) ─────────────────────────────────────────────────
const day = z.iso.date();
const line = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[^\r\n]*$/);
const skey = z.string().regex(/^[a-z][\w-]{0,39}$/i);
const ver = z.string().max(40);
const span = (o: { from: string; to: string }) => o.from <= o.to && dnOf(o.to) - dnOf(o.from) < AL_MAX_DAYS;
export const BookingSchema = z
  .strictObject({
    id: z.uuid(),
    person: z.union([z.literal(''), z.uuid()]),
    project: z.uuid(),
    role: line(120),
    status: z.enum(BK_STATUS),
    from: day,
    to: day,
    mode: z.enum(BK_MODES),
    value: z.number().min(0).max(100000),
    mask: z.number().int().min(1).max(AL_MASK_ALL),
    hol: z.boolean(),
    note: z.string().max(2000),
    need: z.array(z.strictObject({ k: skey, l: z.number().int().min(0).max(20) })).max(10),
    days: z.record(day, z.number().min(0).max(24)).refine((m) => Object.keys(m).length <= AL_MAX_DAYS),
    ver,
  })
  .refine(span, 'range')
  .refine((b) => b.mode !== 'hpd' || b.value <= 24, 'hpd')
  .refine((b) => b.mode !== 'hpw' || b.value <= 168, 'hpw')
  .refine((b) => b.mode !== 'pct' || b.value <= 300, 'pct')
  .refine((b) => b.mode !== 'fte' || b.value <= 3, 'fte');
export const AbsenceSchema = z
  .strictObject({
    id: z.uuid(),
    person: z.uuid(),
    type: z.enum(ABS_TYPES),
    from: day,
    to: day,
    hours: z.number().min(0.5).max(24).nullable(),
    note: z.string().max(500),
    ver,
  })
  .refine(span, 'range');
/** A batch of changes (POST /mg/alloc/ops); `base` = the version the change was made on ('' = new). */
export const AlOp = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('put'),
    c: z.literal('bk'),
    v: z.unknown(),
    base: ver,
    /** the booking moved by this many days: its typed days move with it */
    shift: z.number().int().min(-AL_MAX_DAYS).max(AL_MAX_DAYS).optional(),
  }),
  z.strictObject({ op: z.literal('put'), c: z.literal('ab'), v: z.unknown(), base: ver }),
  z.strictObject({ op: z.literal('del'), c: z.enum(['bk', 'ab']), id: z.uuid(), base: ver }),
]);
export type AlOpT = z.infer<typeof AlOp>;

// ── Capacity ─────────────────────────────────────────────────────────────────
export type CalcEnv = {
  /** weekly hours of a person ('' = a placeholder: the standard week) */
  weekly: (person: string) => number;
  /** absences of a person */
  absences: (person: string) => readonly Absence[];
};
export const weeklyOf = (cap: unknown) => {
  const c = typeof cap === 'number' ? cap : Number(cap);
  return Number.isFinite(c) && c >= 0 ? c : AL_STD_WEEK;
};
/** The day's normal hours from the weekly hours (weekdays only). */
export const baseDayCap = (weekly: number, n: Dn) => (wdOf(n) < 5 ? weekly / 5 : 0);
const absCovers = (a: Absence, n: Dn) => dnOf(a.from) <= n && n <= dnOf(a.to);
/** Hours off on a day (Infinity = the whole day). */
export function absenceOff(abs: readonly Absence[], n: Dn): number {
  let off = 0;
  for (const a of abs)
    if (absCovers(a, n)) {
      if (a.hours == null) return Infinity;
      off += a.hours;
    }
  return off;
}
/** Capacity of a day: weekday hours, 0 on holidays and weekends, minus absences. */
export function dayCap(weekly: number, n: Dn, abs: readonly Absence[]): number {
  if (holidayOf(n)) return 0;
  const c = baseDayCap(weekly, n);
  if (!c) return 0;
  return Math.max(0, c - absenceOff(abs, n));
}

// ── Hours of a booking ───────────────────────────────────────────────────────
const EPS = 1e-9;
const r2 = (x: number) => Math.round(x * 1000) / 1000;
/** Round to the half hour (typed values). */
export const roundStep = (x: number) => Math.max(0, Math.round(x / AL_STEP) * AL_STEP);
/**
 * Raw hours → half-hour steps keeping their sum: each day gets its value
 * rounded down, the missing half hours go to the days with the largest
 * remainder (earlier first), and a remainder under half an hour (a total that
 * is not a multiple of 0.5) is added to the first day.
 */
export function spread(raw: readonly number[]): number[] {
  const q = raw.map((r) => Math.floor(r / AL_STEP + EPS) * AL_STEP);
  const total = raw.reduce((s, r) => s + r, 0);
  let rem = total - q.reduce((s, r) => s + r, 0);
  let steps = Math.floor(rem / AL_STEP + EPS);
  rem = r2(rem - steps * AL_STEP);
  const order = raw.map((r, i) => [r - q[i]!, i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (steps <= 0) break;
    q[i]! += AL_STEP;
    steps--;
  }
  if (rem > EPS) {
    const i = raw.findIndex((r) => r > 0);
    if (i >= 0) q[i]! += rem;
  }
  return q.map(r2);
}

/** Whether the booking's rule puts hours on day `n` (in range and mask, not a holiday/absence unless asked). */
export function eligible(b: Pick<Booking, 'mask' | 'hol' | 'person'>, n: Dn, env: CalcEnv) {
  if (!inMask(b.mask, n)) return false;
  if (!b.hol && holidayOf(n)) return false;
  if (b.person && absenceOff(env.absences(b.person), n) === Infinity) return false;
  return true;
}
/** Reference hours of a day for % and FTE (weekly / 5 on every worked day, minus partial absences). */
function refCap(b: Pick<Booking, 'person'>, weekly: number, n: Dn, env: CalcEnv) {
  const off = b.person ? absenceOff(env.absences(b.person), n) : 0;
  return Math.max(0, weekly / 5 - (Number.isFinite(off) ? off : weekly / 5));
}

/** Hours of every day of the booking, from `from` to `to` (index 0 = `from`). */
export function bookingSeries(b: Booking, env: CalcEnv): { from: Dn; h: Float64Array } {
  const F = dnOf(b.from);
  const T = dnOf(b.to);
  const len = Math.max(0, Math.min(AL_MAX_DAYS, T - F + 1));
  const h = new Float64Array(len);
  const ex = new Map<Dn, number>();
  for (const [k, v] of Object.entries(b.days ?? {})) {
    if (!isIsoDay(k)) continue;
    const n = dnOf(k);
    if (n >= F && n < F + len) ex.set(n, +v || 0);
  }
  const ok = (n: Dn) => eligible(b, n, env);
  const weekly = b.person ? weeklyOf(env.weekly(b.person)) : AL_STD_WEEK;
  const v = +b.value || 0;
  if (b.mode === 'hpd') {
    for (let i = 0; i < len; i++) if (ok(F + i)) h[i] = v;
  } else if (b.mode === 'total') {
    const idx: number[] = [];
    let fixed = 0;
    for (let i = 0; i < len; i++) {
      if (ex.has(F + i)) fixed += ex.get(F + i)!;
      else if (ok(F + i)) idx.push(i);
    }
    if (idx.length) {
      const each = Math.max(0, v - fixed) / idx.length;
      const s = spread(idx.map(() => each));
      idx.forEach((i, k) => (h[i] = s[k]!));
    }
  } else {
    // per ISO week, in half-hour steps
    const pc = popcount(b.mask) || 1;
    for (let w = mondayOf(F); w <= T; w += 7) {
      const days: Dn[] = [];
      for (let k = 0; k < 7; k++) if (b.mask & (1 << k)) days.push(w + k);
      const raw = days.map((n) => {
        if (b.mode === 'hpw') return v / pc;
        if (n < F || n > T || !ok(n)) return 0;
        return b.mode === 'pct' ? (v / 100) * refCap(b, weekly, n, env) : v * (AL_STD_WEEK / 5);
      });
      const s = spread(raw);
      days.forEach((n, k) => {
        if (n >= F && n < F + len && ok(n)) h[n - F] = s[k]!;
      });
    }
  }
  for (const [n, x] of ex) h[n - F] = x;
  return { from: F, h };
}
/** Hours of one day of a booking. */
export function bookingDay(b: Booking, n: Dn, env: CalcEnv) {
  const s = bookingSeries(b, env);
  const i = n - s.from;
  return i >= 0 && i < s.h.length ? s.h[i]! : 0;
}
/** Sum of a booking's hours from day `a` to `b` (inclusive). */
export function bookingSum(b: Booking, env: CalcEnv, a = -Infinity, bb = Infinity) {
  const s = bookingSeries(b, env);
  let t = 0;
  const lo = Math.max(0, a - s.from);
  const hi = Math.min(s.h.length - 1, bb - s.from);
  for (let i = lo; i <= hi; i++) t += s.h[i]!;
  return r2(t);
}

// ── Loads of a person over a window ──────────────────────────────────────────
export type Loads = {
  from: Dn;
  to: Dn;
  /** confirmed hours per day */
  conf: Float64Array;
  /** tentative hours per day (never part of the load) */
  tent: Float64Array;
  /** capacity per day */
  cap: Float64Array;
};
/** Confirmed / tentative hours and capacity of a person for each day from F to T. */
export function personLoads(
  person: string,
  bookings: readonly Booking[],
  env: CalcEnv,
  F: Dn,
  T: Dn,
  series: (b: Booking) => { from: Dn; h: Float64Array } = (b) => bookingSeries(b, env),
): Loads {
  const len = Math.max(0, T - F + 1);
  const conf = new Float64Array(len);
  const tent = new Float64Array(len);
  const cap = new Float64Array(len);
  const weekly = person ? weeklyOf(env.weekly(person)) : AL_STD_WEEK;
  const abs = person ? env.absences(person) : [];
  for (let i = 0; i < len; i++) cap[i] = dayCap(weekly, F + i, abs);
  for (const b of bookings) {
    if (b.person !== person) continue;
    if (dnOf(b.to) < F || dnOf(b.from) > T) continue;
    const s = series(b);
    const dst = b.status === 'tentative' ? tent : conf;
    const lo = Math.max(F, s.from);
    const hi = Math.min(T, s.from + s.h.length - 1);
    for (let n = lo; n <= hi; n++) dst[n - F]! += s.h[n - s.from]!;
  }
  return { from: F, to: T, conf, tent, cap };
}
/** Sum of a per-day array of `l` from day a to b (clipped to the window). */
export function sumDays(arr: Float64Array, l: Pick<Loads, 'from' | 'to'>, a: Dn, b: Dn) {
  let t = 0;
  for (let n = Math.max(a, l.from); n <= Math.min(b, l.to); n++) t += arr[n - l.from]!;
  return r2(t);
}

// ── Buckets (columns of the screens) ─────────────────────────────────────────
export type Bucket = { a: Dn; b: Dn };
export type Zoom = 'day' | 'week' | 'month' | 'quarter';
/** Columns from F to T: days, ISO weeks, months or quarters. */
export function buckets(zoom: Zoom, F: Dn, T: Dn): Bucket[] {
  const out: Bucket[] = [];
  if (zoom === 'day') for (let n = F; n <= T; n++) out.push({ a: n, b: n });
  else if (zoom === 'week') for (let n = mondayOf(F); n <= T; n += 7) out.push({ a: n, b: n + 6 });
  else {
    const k = zoom === 'month' ? 1 : 3;
    let m = monthStart(F);
    if (k === 3) m = monthStart(m, -(monthOf(m) % 3));
    while (m <= T) {
      const nx = monthStart(m, k);
      out.push({ a: m, b: nx - 1 });
      m = nx;
    }
  }
  return out;
}
/** Working days (capacity > 0) of a person between a and b. */
export function workingDays(weekly: number, abs: readonly Absence[], a: Dn, b: Dn) {
  let c = 0;
  for (let n = a; n <= b; n++) if (dayCap(weekly, n, abs) > 0) c++;
  return c;
}

/** Load band: 0 none, 1 under 90 %, 2 90–100 %, 3 over capacity. */
export const loadBand = (h: number, cap: number) => {
  if (h <= EPS) return 0;
  if (cap <= EPS) return 3;
  const r = h / cap;
  return r > 1.0001 ? 3 : r >= 0.9 ? 2 : 1;
};

// ── The three linked fields (h/dia · % · total) ──────────────────────────────
/** Days the rule of a booking would use (without typed days), and their reference capacity. */
export function ruleDays(b: Pick<Booking, 'person' | 'from' | 'to' | 'mask' | 'hol'>, env: CalcEnv) {
  if (!isIsoDay(b.from) || !isIsoDay(b.to) || b.from > b.to) return { n: 0, cap: 0, weeks: 0 };
  const F = dnOf(b.from);
  const T = Math.min(dnOf(b.to), F + AL_MAX_DAYS - 1);
  const weekly = b.person ? weeklyOf(env.weekly(b.person)) : AL_STD_WEEK;
  let n = 0;
  let cap = 0;
  for (let d = F; d <= T; d++)
    if (eligible(b, d, env)) {
      n++;
      cap += refCap(b, weekly, d, env);
    }
  return { n, cap: r2(cap), weeks: (T - F + 1) / 7 };
}
/** Hours a day, % of capacity, FTE, h/week and total of a rule (any mode → all of them). */
export function equivalents(
  b: Pick<Booking, 'person' | 'from' | 'to' | 'mask' | 'hol' | 'mode' | 'value'>,
  env: CalcEnv,
) {
  const { n, cap } = ruleDays(b, env);
  const weekly = b.person ? weeklyOf(env.weekly(b.person)) : AL_STD_WEEK;
  const dayRef = n ? cap / n : weekly / 5;
  const pc = popcount(b.mask) || 5;
  const v = +b.value || 0;
  let hpd: number;
  switch (b.mode) {
    case 'hpd':
      hpd = v;
      break;
    case 'hpw':
      hpd = v / pc;
      break;
    case 'pct':
      hpd = (v / 100) * dayRef;
      break;
    case 'fte':
      hpd = v * (AL_STD_WEEK / 5);
      break;
    default:
      hpd = n ? v / n : 0;
  }
  const total = b.mode === 'total' ? v : hpd * n;
  return {
    hpd: r2(hpd),
    hpw: r2(hpd * pc),
    pct: dayRef ? r2((hpd / dayRef) * 100) : 0,
    fte: r2(hpd / (AL_STD_WEEK / 5)),
    total: r2(total),
    days: n,
  };
}
/** The value of mode `to` that gives the same effort as `b` (for switching the typed field). */
export function convertValue(
  b: Pick<Booking, 'person' | 'from' | 'to' | 'mask' | 'hol' | 'mode' | 'value'>,
  to: BkMode,
  env: CalcEnv,
) {
  const e = equivalents(b, env);
  const v = { hpd: e.hpd, hpw: e.hpw, pct: e.pct, fte: e.fte, total: e.total }[to];
  return to === 'pct' ? Math.round(v) : to === 'fte' ? Math.round(v * 100) / 100 : roundStep(v);
}

// ── Conflicts ────────────────────────────────────────────────────────────────
export type Conflict = {
  /** days where the person goes over capacity with this booking */
  days: Dn[];
  /** the largest load of those days, and that day's capacity */
  peak: number;
  peakCap: number;
  /** hours a day that still fit on every day of the range (0.5 steps) */
  fits: number;
  /** first day from which the rest of the range has room for the booking ('' = none) */
  startFree: string;
};
/** Over-allocation of `b` against the person's other confirmed bookings (a warning, never a block). */
export function conflictOf(b: Booking, all: readonly Booking[], env: CalcEnv): Conflict | null {
  if (!b.person || b.status === 'tentative' || !isIsoDay(b.from) || !isIsoDay(b.to) || b.from > b.to)
    return null;
  const F = dnOf(b.from);
  const T = Math.min(dnOf(b.to), F + AL_MAX_DAYS - 1);
  const others = all.filter((x) => x.id !== b.id && x.person === b.person && x.status === 'confirmed');
  const l = personLoads(b.person, others, env, F, T);
  const s = bookingSeries(b, env);
  const days: Dn[] = [];
  let peak = 0;
  let peakCap = 0;
  let fits = Infinity;
  let lastBad = -1;
  for (let n = F; n <= T; n++) {
    const own = s.h[n - F] ?? 0;
    const cap = l.cap[n - F]!;
    const other = l.conf[n - F]!;
    if (eligible(b, n, env) && cap > 0) fits = Math.min(fits, Math.max(0, cap - other));
    if (own > EPS && other + own > cap + EPS) {
      days.push(n);
      lastBad = n;
      if (other + own > peak) {
        peak = r2(other + own);
        peakCap = cap;
      }
    }
  }
  if (!days.length) return null;
  return {
    days,
    peak,
    peakCap,
    fits: Number.isFinite(fits) ? Math.floor(fits / AL_STEP + EPS) * AL_STEP : 0,
    startFree: lastBad >= 0 && lastBad < T ? isoOf(lastBad + 1) : '',
  };
}

// ── Formatting ───────────────────────────────────────────────────────────────
/** 6,5 / 6.5 (no trailing zeros). */
export const fmtNum = (x: number, lang: string, max = 1) => {
  const p = 10 ** max;
  const s = String(Math.round(x * p) / p);
  return lang === 'en' ? s : s.replace('.', ',');
};
export const fmtH = (x: number, lang: string) => `${fmtNum(x, lang)}h`;
/** "6h/dia", "32h/sem", "50%", "0,5 FTE", "120h" — the rule as typed. */
export function effortLabel(b: Pick<Booking, 'mode' | 'value'>, lang: string) {
  const en = lang === 'en';
  const v = fmtNum(b.value, lang, 2);
  switch (b.mode) {
    case 'hpd':
      return `${v}h/${en ? 'd' : 'dia'}`;
    case 'hpw':
      return `${v}h/${en ? 'wk' : 'sem'}`;
    case 'pct':
      return `${v}%`;
    case 'fte':
      return `${v} FTE`;
    default:
      return `${v}h ${en ? 'total' : 'total'}`;
  }
}
/** dd/mm/yyyy */
export const fmtDay = (s: string) => (isIsoDay(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—');
