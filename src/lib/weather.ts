// Weather model shared by the server (src/server/weather.ts builds it from the
// providers) and the Início card (renders it). Pure functions only, so the
// provider mapping, unit conversions and day grouping are unit-tested.

/** Conditions the card knows (art, label, colour). */
export const CONDS = [
  'clear',
  'fair',
  'partly',
  'cloudy',
  'fog',
  'lightrain',
  'rain',
  'heavyrain',
  'showers',
  'sleet',
  'snow',
  'storm',
] as const;
export type Cond = (typeof CONDS)[number];

/** Which provider answered: MET Norway (primary) or Open-Meteo (fallback). */
export type WxSource = 'met' | 'openmeteo';

/** One forecast step, normalised from a provider (wind in km/h, temperatures in °C). */
export type WxPoint = {
  time: number;
  t: number;
  hum: number | null;
  wind: number;
  gust: number | null;
  dir: number | null;
  pres: number | null;
  uv: number | null;
  cloud: number | null;
  dew: number | null;
  /** given by the provider (Open-Meteo); computed otherwise */
  feels?: number | null;
  // the next hour …
  c1?: Cond;
  d1?: boolean;
  mm1?: number;
  pop1?: number | null;
  // … and the next 6 hours (MET Norway's steps after the first ~2.5 days)
  c6?: Cond;
  d6?: boolean;
  mm6?: number;
  pop6?: number | null;
  tmax6?: number;
  tmin6?: number;
};

export type WxHour = {
  time: string;
  /** hours this entry covers (1, or 6 further ahead) */
  step: number;
  t: number;
  feels: number;
  cond: Cond;
  day: boolean;
  pop: number | null;
  mm: number;
  wind: number;
  gust: number | null;
  dir: number | null;
  hum: number | null;
  uv: number | null;
  pres: number | null;
};

export type WxNow = WxHour & { cloud: number | null; dew: number | null };

export type WxDay = {
  date: string;
  min: number;
  max: number;
  cond: Cond;
  pop: number | null;
  mm: number;
  wind: number;
  gust: number | null;
  uv: number | null;
  sunrise: string | null;
  sunset: string | null;
  hours: WxHour[];
};

export const WARN_TYPES = ['rain', 'wind', 'storm', 'snow', 'fog', 'heat', 'cold', 'sea', 'other'] as const;
export type WarnType = (typeof WARN_TYPES)[number];
export type WarnLevel = 'yellow' | 'orange' | 'red';

/** An official warning (IPMA avisos, Portuguese districts and islands). */
export type WxWarning = {
  type: WarnType;
  /** the provider's own name for the type (shown for 'other') */
  name: string;
  level: WarnLevel;
  start: string;
  end: string;
  text: string;
};

export type Wx = {
  source: WxSource;
  /** when the provider's model run was published (null if not given) */
  updatedAt: string | null;
  fetchedAt: string;
  /** served from the cache after the provider failed */
  stale: boolean;
  tz: string;
  now: WxNow;
  /** the next 48 hours */
  hours: WxHour[];
  days: WxDay[];
  /** null outside Portugal (no official warnings source there) */
  warnings: WxWarning[] | null;
  warnArea: string | null;
};

// ── Providers' codes → conditions ─────────────────────────────────────────

/**
 * MET Norway symbol_code (e.g. "lightrainshowers_day", "heavysnowandthunder")
 * → condition + whether it is the day variant (undefined when it has none).
 */
export function metSymbol(code: string | undefined): { cond: Cond; day?: boolean } | null {
  if (!code) return null;
  const [base = '', variant] = code.toLowerCase().split('_');
  const day =
    variant === 'day' ? true : variant === 'night' || variant === 'polartwilight' ? false : undefined;
  const cond: Cond = base.includes('thunder')
    ? 'storm'
    : base.includes('sleet')
      ? 'sleet'
      : base.includes('snow')
        ? 'snow'
        : base === 'heavyrain' || base === 'heavyrainshowers'
          ? 'heavyrain'
          : base === 'lightrain'
            ? 'lightrain'
            : base.endsWith('rainshowers')
              ? 'showers'
              : base === 'rain'
                ? 'rain'
                : base === 'fog'
                  ? 'fog'
                  : base === 'clearsky'
                    ? 'clear'
                    : base === 'fair'
                      ? 'fair'
                      : base === 'partlycloudy'
                        ? 'partly'
                        : 'cloudy';
  return { cond, ...(day === undefined ? {} : { day }) };
}

/** WMO weather interpretation code (Open-Meteo) → condition. */
export function wmoCond(c: number): Cond {
  if (c === 0) return 'clear';
  if (c === 1) return 'fair';
  if (c === 2) return 'partly';
  if (c === 45 || c === 48) return 'fog';
  if ((c >= 51 && c <= 57) || c === 61) return 'lightrain';
  if (c === 63) return 'rain';
  if (c === 65 || c === 82) return 'heavyrain';
  if (c === 66 || c === 67) return 'sleet';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  if (c === 80 || c === 81) return 'showers';
  if (c >= 95) return 'storm';
  return 'cloudy';
}

/** Rough sky from the cloud cover, for a step that came without a symbol. */
export const cloudCond = (cloud: number | null): Cond =>
  cloud === null ? 'cloudy' : cloud < 12 ? 'clear' : cloud < 35 ? 'fair' : cloud < 70 ? 'partly' : 'cloudy';

/** How bad a condition is (to pick the one that matters). */
export const SEVERITY: Record<Cond, number> = {
  clear: 0,
  fair: 1,
  partly: 2,
  cloudy: 3,
  fog: 4,
  lightrain: 5,
  showers: 6,
  rain: 7,
  sleet: 8,
  heavyrain: 9,
  snow: 10,
  storm: 11,
};

// ── Units and derived values ──────────────────────────────────────────────

export const msToKmh = (ms: number) => Math.round(ms * 3.6 * 10) / 10;

/**
 * Apparent ("feels like") temperature, Australian Bureau of Meteorology
 * formula (Steadman): air temperature, humidity (vapour pressure) and wind.
 */
export function apparentTemp(t: number, rh: number | null, windKmh: number): number {
  const e = ((rh ?? 60) / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t));
  return Math.round((t + 0.33 * e - 0.7 * (windKmh / 3.6) - 4) * 10) / 10;
}

const COMPASS = {
  pt: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'],
  en: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'],
};
/** Wind "from" direction in degrees → 16-point compass. */
export const compass = (deg: number, lang: 'pt' | 'en') =>
  COMPASS[lang][Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]!;

/** UV index → WHO band (0 low … 4 extreme). */
export const uvBand = (uv: number) => (uv < 3 ? 0 : uv < 6 ? 1 : uv < 8 ? 2 : uv < 11 ? 3 : 4);

// ── Colours with a meaning ────────────────────────────────────────────────

// temperature → hue: violet (frost) · blue (cold) · teal · green · yellow · orange · red (heat)
const T_STOPS: Array<[number, number]> = [
  [-10, 290],
  [0, 255],
  [8, 220],
  [14, 165],
  [19, 110],
  [24, 80],
  [30, 50],
  [38, 25],
];
export function tempHue(t: number): number {
  if (t <= T_STOPS[0]![0]) return T_STOPS[0]![1];
  for (let i = 1; i < T_STOPS.length; i++) {
    const [t1, h1] = T_STOPS[i]!;
    const [t0, h0] = T_STOPS[i - 1]!;
    if (t <= t1) return Math.round(h0 + ((t - t0) / (t1 - t0)) * (h1 - h0));
  }
  return T_STOPS[T_STOPS.length - 1]![1];
}
/** A temperature's colour for a bar/dot (reads on both themes). */
export const tempColor = (t: number) => `oklch(0.78 0.14 ${tempHue(t)})`;
/** …and for text (darker in the light theme). */
export const tempInk = (t: number) => `oklch(calc(0.86 * var(--lk)) 0.12 ${tempHue(t)})`;
/** CSS gradient of the temperatures from lo to hi (range bars). */
export function tempGradient(lo: number, hi: number): string {
  if (hi - lo < 0.5) return tempColor(lo);
  const n = 4;
  const stops = Array.from({ length: n + 1 }, (_, i) => tempColor(lo + ((hi - lo) * i) / n));
  return `linear-gradient(90deg,${stops.join(',')})`;
}

// ── Time in the location's time zone ──────────────────────────────────────

const fmts = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    fmts.set(tz, f);
  }
  return f;
}

/** Whether the runtime knows this IANA time zone. */
export function validTz(tz: string): boolean {
  try {
    fmt(tz);
    return true;
  } catch {
    return false;
  }
}

/** Local date ('YYYY-MM-DD'), hour and minute of an instant in a time zone. */
export function localParts(ms: number, tz: string): { date: string; hour: number; minute: number } {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute) };
}

/** Offset of the time zone from UTC at an instant, in ms. */
function tzOffset(ms: number, tz: string): number {
  const p: Record<string, string> = {};
  for (const x of fmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour! % 24, +p.minute!, +p.second!);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** A wall-clock time ('YYYY-MM-DDTHH:mm[:ss]') in a time zone → epoch ms (NaN if malformed). */
export function zonedToUtc(local: string, tz: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(local);
  if (!m) return NaN;
  const guess = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
  const first = guess - tzOffset(guess, tz);
  return guess - tzOffset(first, tz);
}

// ── Sun ───────────────────────────────────────────────────────────────────

const RAD = Math.PI / 180;
/**
 * Sunrise and sunset (epoch ms) of a civil date at a place — the standard
 * sunrise equation (≈1 min accuracy); null in polar day/night.
 */
export function sunTimes(
  date: string,
  lat: number,
  lon: number,
): { rise: number | null; set: number | null } {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const jd = Date.UTC(y, mo - 1, d, 12) / 86_400_000 + 2440587.5;
  const n = Math.round(jd - 2451545 + 0.0008);
  const jStar = n - lon / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const jTransit = 2451545 + jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const sinDec = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDec) / (Math.cos(lat * RAD) * cosDec);
  if (cosW < -1 || cosW > 1) return { rise: null, set: null };
  const w = Math.acos(cosW) / RAD;
  const toMs = (j: number) => Math.round((j - 2440587.5) * 86_400_000);
  return { rise: toMs(jTransit - w / 360), set: toMs(jTransit + w / 360) };
}

// ── Provider steps → what the card shows ──────────────────────────────────

const iso = (ms: number) => new Date(ms).toISOString();
const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Builds the card's model from a provider's steps: the current conditions,
 * the next 48 hours and up to 9 days grouped by the location's local date.
 */
export function buildWx(
  points: WxPoint[],
  o: {
    lat: number;
    lon: number;
    tz: string;
    now: number;
    source: WxSource;
    updatedAt: string | null;
    stale?: boolean;
    warnings: WxWarning[] | null;
    warnArea: string | null;
  },
): Wx | null {
  const all = [...points].sort((a, b) => a.time - b.time);
  // from the step that contains "now" (or the first one ahead)
  const from = all.findIndex((_, i) => (all[i + 1]?.time ?? Infinity) > o.now);
  // nothing left once "now" is past the last step
  if (from < 0 || o.now >= all[all.length - 1]!.time + 6 * 3600_000) return null;
  const pts = all.slice(from);
  if (!pts.length) return null;

  const sunCache = new Map<string, { rise: number | null; set: number | null }>();
  const sun = (date: string) => {
    let s = sunCache.get(date);
    if (!s) sunCache.set(date, (s = sunTimes(date, o.lat, o.lon)));
    return s;
  };
  const sunUp = (ms: number) => {
    const s = sun(localParts(ms, o.tz).date);
    if (s.rise === null || s.set === null) return polarDay(o.lat, ms);
    return ms >= s.rise && ms < s.set;
  };

  const hours: WxHour[] = pts.map((p, i) => {
    const next = pts[i + 1];
    const step = next ? Math.max(1, Math.round((next.time - p.time) / 3600_000)) : p.c6 ? 6 : 1;
    const long = step > 1;
    const cond = (long ? (p.c6 ?? p.c1) : (p.c1 ?? p.c6)) ?? cloudCond(p.cloud);
    const day = (long ? (p.d6 ?? p.d1) : (p.d1 ?? p.d6)) ?? sunUp(p.time + (long ? 0 : 1800_000));
    const pop = long ? (p.pop6 ?? p.pop1 ?? null) : (p.pop1 ?? p.pop6 ?? null);
    const mm = long ? (p.mm6 ?? (p.mm1 ?? 0) * step) : (p.mm1 ?? 0);
    return {
      time: iso(p.time),
      step,
      t: round1(p.t),
      feels: round1(p.feels ?? apparentTemp(p.t, p.hum, p.wind)),
      cond,
      day,
      pop: pop === null ? null : Math.round(pop),
      mm: round1(mm),
      wind: Math.round(p.wind),
      gust: p.gust === null ? null : Math.round(p.gust),
      dir: p.dir === null ? null : Math.round(p.dir),
      hum: p.hum === null ? null : Math.round(p.hum),
      uv: p.uv === null ? null : round1(p.uv),
      pres: p.pres === null ? null : Math.round(p.pres),
    };
  });

  const first = pts[0]!;
  const now: WxNow = {
    ...hours[0]!,
    cloud: first.cloud === null ? null : Math.round(first.cloud),
    dew: first.dew === null ? null : round1(first.dew),
  };

  const byDate = new Map<string, Array<{ h: WxHour; p: WxPoint; hour: number }>>();
  hours.forEach((h, i) => {
    const lp = localParts(pts[i]!.time, o.tz);
    const list = byDate.get(lp.date) ?? [];
    list.push({ h, p: pts[i]!, hour: lp.hour });
    byDate.set(lp.date, list);
  });
  const days: WxDay[] = [];
  let idx = 0;
  for (const [date, list] of byDate) {
    // the last day of the forecast is often a stub (one 6-hour step): leave it out
    if (idx++ > 0 && list.length < 2) continue;
    const temps = list.flatMap(({ h, p }) => [
      h.t,
      ...(h.step > 1 && p.tmax6 !== undefined ? [p.tmax6] : []),
      ...(h.step > 1 && p.tmin6 !== undefined ? [p.tmin6] : []),
    ]);
    const daytime = list.filter((x) => x.hour >= 6 && x.hour <= 18);
    const noon = (daytime.length ? daytime : list).reduce((a, b) =>
      Math.abs(b.hour - 12) < Math.abs(a.hour - 12) ? b : a,
    );
    const pops = list.map((x) => x.h.pop).filter((v): v is number => v !== null);
    const gusts = list.map((x) => x.h.gust).filter((v): v is number => v !== null);
    const uvs = list.map((x) => x.h.uv).filter((v): v is number => v !== null);
    const s = sun(date);
    days.push({
      date,
      min: round1(Math.min(...temps)),
      max: round1(Math.max(...temps)),
      cond: noon.p.c6 ?? noon.h.cond,
      pop: pops.length ? Math.max(...pops) : null,
      mm: round1(list.reduce((n, x) => n + x.h.mm, 0)),
      wind: Math.max(...list.map((x) => x.h.wind)),
      gust: gusts.length ? Math.max(...gusts) : null,
      uv: uvs.length ? Math.max(...uvs) : null,
      sunrise: s.rise === null ? null : iso(s.rise),
      sunset: s.set === null ? null : iso(s.set),
      hours: list.map((x) => x.h),
    });
    if (days.length >= 9) break;
  }

  return {
    source: o.source,
    updatedAt: o.updatedAt,
    fetchedAt: iso(o.now),
    stale: !!o.stale,
    tz: o.tz,
    now,
    hours: hours.filter((h) => Date.parse(h.time) < o.now + 48 * 3600_000).slice(0, 48),
    days,
    warnings: o.warnings,
    warnArea: o.warnArea,
  };
}

/** Polar day (sun never sets) vs polar night, for the sunrise equation's null. */
function polarDay(lat: number, ms: number): boolean {
  const m = new Date(ms).getUTCMonth();
  const summerNorth = m >= 3 && m <= 8;
  return lat > 0 ? summerNorth : !summerNorth;
}

// ── Heads-up from the forecast (where there are no official warnings) ────

export type WxAlert = { key: 'storm' | 'rain' | 'wind' | 'heat' | 'cold' | 'snow' | 'uv'; value?: number };

/** Notable weather today/tomorrow, derived from the forecast itself. */
export function wxAlerts(days: WxDay[], now: Pick<WxNow, 'gust'>): WxAlert[] {
  const out: WxAlert[] = [];
  const two = days.slice(0, 2);
  const d0 = days[0];
  if (!d0) return out;
  if (two.some((d) => d.cond === 'storm')) out.push({ key: 'storm' });
  if (two.some((d) => d.mm >= 20))
    out.push({ key: 'rain', value: Math.round(Math.max(...two.map((d) => d.mm))) });
  const gust = Math.max(d0.gust ?? 0, now.gust ?? 0);
  if (gust >= 60) out.push({ key: 'wind', value: Math.round(gust) });
  if (d0.max >= 35) out.push({ key: 'heat', value: Math.round(d0.max) });
  if (d0.min <= 0) out.push({ key: 'cold', value: Math.round(d0.min) });
  if (two.some((d) => d.cond === 'snow' || d.cond === 'sleet')) out.push({ key: 'snow' });
  if ((d0.uv ?? 0) >= 8) out.push({ key: 'uv', value: Math.round(d0.uv!) });
  return out;
}
