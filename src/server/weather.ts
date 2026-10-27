import 'server-only';
import tzlookup from '@photostructure/tz-lookup';
import { env } from '@/lib/env';
import { redis } from '@/lib/redis';
import { ApiError } from '@/server/errors';
import {
  buildWx,
  metSymbol,
  msToKmh,
  validTz,
  wmoCond,
  zonedToUtc,
  type WarnLevel,
  type WarnType,
  type Wx,
  type WxPoint,
  type WxWarning,
} from '@/lib/weather';

// Weather for the Início card, fetched by our server — the browser never calls
// third parties and the location never leaves our server with personal data.
//
//   forecast   MET Norway Locationforecast 2.0 (api.met.no, the data behind
//              yr.no; CC BY 4.0) — free, no key, commercial use allowed.
//              Terms: identifying User-Agent, honour Expires and send
//              If-Modified-Since, ≤ 4 decimals in the coordinates, ≤ 20 req/s.
//   warnings   IPMA avisos (api.ipma.pt), only for places in Portugal.
//   fallback   Open-Meteo, only when MET Norway fails and nothing is cached.
//   geocoding  OpenStreetMap Nominatim (usage policy: ≤ 1 req/s, no
//              autocomplete, cache results, attribution), Open-Meteo's
//              geocoder as fallback. Time zones are looked up offline.

const HOSTS = {
  met: 'https://api.met.no',
  ipma: 'https://api.ipma.pt',
  om: 'https://api.open-meteo.com',
  omgeo: 'https://geocoding-api.open-meteo.com',
  osm: 'https://nominatim.openstreetmap.org',
} as const;
type Host = keyof typeof HOSTS;

/** Provider base URL (or the local fake's, in tests). */
const base = (h: Host) => {
  const t = env().WEATHER_TEST_BASE_URL;
  return t ? `${t.replace(/\/$/, '')}/${h}` : HOSTS[h];
};

export function userAgent(): string {
  const e = env();
  return e.WEATHER_USER_AGENT ?? `KnowledgeHub/2.0 (+${new URL(e.APP_URL).origin})`;
}

const MIN_S = 60;
const MET_KEEP_S = 6 * 3600; // kept past Expires: If-Modified-Since + served stale if MET is down
const DOWN_S = 2 * MIN_S; // after a failure, go straight to the fallback for a while
const OM_TTL_S = 30 * MIN_S;
const IPMA_TTL_S = 10 * MIN_S;
const GEO_TTL_S = 30 * 24 * 3600;

async function getJson<T>(key: string): Promise<T | null> {
  try {
    const v = await redis().get(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
async function setJson(key: string, v: unknown, ttl: number) {
  try {
    await redis().set(key, JSON.stringify(v), 'EX', ttl);
  } catch {
    // no cache: the next request asks again
  }
}

function wxFetch(url: string, headers: Record<string, string> = {}) {
  return fetch(url, {
    headers: { 'User-Agent': userAgent(), Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
}

/** Coordinates as sent to the providers and used as cache keys (~1 km). */
export const cell = (v: number) => Math.round(v * 100) / 100;

/** IANA time zone of a place (offline lookup), 'UTC' if unknown. */
export function placeTz(lat: number, lon: number): string {
  try {
    const tz = tzlookup(lat, lon);
    return validTz(tz) ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}

// ── MET Norway ────────────────────────────────────────────────────────────

type MetDetails = Record<string, number | undefined>;
type MetPeriod = { summary?: { symbol_code?: string }; details?: MetDetails };
type MetJson = {
  properties?: {
    meta?: { updated_at?: string };
    timeseries?: Array<{
      time: string;
      data?: {
        instant?: { details?: MetDetails };
        next_1_hours?: MetPeriod;
        next_6_hours?: MetPeriod;
        next_12_hours?: MetPeriod;
      };
    }>;
  };
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Locationforecast 2.0 "complete" JSON → steps (m/s → km/h). */
export function parseMet(j: unknown): { points: WxPoint[]; updatedAt: string | null } | null {
  const ts = (j as MetJson | null)?.properties?.timeseries;
  if (!Array.isArray(ts) || !ts.length) return null;
  const points: WxPoint[] = [];
  for (const s of ts) {
    const time = Date.parse(s.time);
    const d = s.data?.instant?.details;
    const t = num(d?.air_temperature);
    if (!Number.isFinite(time) || !d || t === null) continue;
    const n1 = s.data?.next_1_hours;
    const n6 = s.data?.next_6_hours;
    const n12 = s.data?.next_12_hours;
    const s1 = metSymbol(n1?.summary?.symbol_code);
    const s6 = metSymbol(n6?.summary?.symbol_code ?? n12?.summary?.symbol_code);
    const wind = num(d.wind_speed);
    const gust = num(d.wind_speed_of_gust);
    const p: WxPoint = {
      time,
      t,
      hum: num(d.relative_humidity),
      wind: wind === null ? 0 : msToKmh(wind),
      gust: gust === null ? null : msToKmh(gust),
      dir: num(d.wind_from_direction),
      pres: num(d.air_pressure_at_sea_level),
      uv: num(d.ultraviolet_index_clear_sky),
      cloud: num(d.cloud_area_fraction),
      dew: num(d.dew_point_temperature),
    };
    if (s1) {
      p.c1 = s1.cond;
      if (s1.day !== undefined) p.d1 = s1.day;
    }
    if (n1?.details) {
      p.mm1 = num(n1.details.precipitation_amount) ?? 0;
      p.pop1 = num(n1.details.probability_of_precipitation);
    }
    if (s6) {
      p.c6 = s6.cond;
      if (s6.day !== undefined) p.d6 = s6.day;
    }
    if (n6?.details) {
      const mm6 = num(n6.details.precipitation_amount);
      if (mm6 !== null) p.mm6 = mm6;
      p.pop6 =
        num(n6.details.probability_of_precipitation) ?? num(n12?.details?.probability_of_precipitation);
      const mx = num(n6.details.air_temperature_max);
      const mn = num(n6.details.air_temperature_min);
      if (mx !== null) p.tmax6 = mx;
      if (mn !== null) p.tmin6 = mn;
    }
    points.push(p);
  }
  if (!points.length) return null;
  return { points, updatedAt: (j as MetJson).properties?.meta?.updated_at ?? null };
}

type MetEntry = { points: WxPoint[]; updatedAt: string | null; lastModified: string | null; expires: number };

/** MET's Expires header, kept between 10 minutes and 2 hours from now. */
function expiresAt(res: Response, now: number) {
  const e = Date.parse(res.headers.get('expires') ?? '');
  const v = Number.isFinite(e) ? e : now + 30 * MIN_S * 1000;
  return Math.min(Math.max(v, now + 10 * MIN_S * 1000), now + 2 * 3600_000);
}

async function metPoints(
  la: number,
  lo: number,
  now: number,
): Promise<{ points: WxPoint[]; updatedAt: string | null; stale: boolean } | null> {
  const key = `kh:wx2:met:${la}:${lo}`;
  const hit = await getJson<MetEntry>(key);
  if (hit && hit.expires > now) return { ...hit, stale: false };
  if (await getJson<number>('kh:wx2:down:met')) return hit ? { ...hit, stale: true } : null;
  try {
    const res = await wxFetch(
      `${base('met')}/weatherapi/locationforecast/2.0/complete?lat=${la}&lon=${lo}`,
      hit?.lastModified ? { 'If-Modified-Since': hit.lastModified } : {},
    );
    if (res.status === 304 && hit) {
      const entry = { ...hit, expires: expiresAt(res, now) };
      await setJson(key, entry, MET_KEEP_S);
      return { ...entry, stale: false };
    }
    if (res.status === 203) console.warn('[weather] MET Norway: this Locationforecast version is deprecated');
    if (!res.ok) throw new Error(`MET Norway HTTP ${res.status}`);
    const parsed = parseMet(await res.json());
    if (!parsed) throw new Error('MET Norway: unexpected response');
    const entry: MetEntry = {
      ...parsed,
      lastModified: res.headers.get('last-modified'),
      expires: expiresAt(res, now),
    };
    await setJson(key, entry, MET_KEEP_S);
    return { ...entry, stale: false };
  } catch (err) {
    console.warn('[weather] MET Norway failed:', err instanceof Error ? err.message : err);
    await setJson('kh:wx2:down:met', 1, DOWN_S);
    return hit ? { ...hit, stale: true } : null;
  }
}

// ── Open-Meteo (fallback) ─────────────────────────────────────────────────

const OM_HOURLY = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'dew_point_2m',
  'precipitation_probability',
  'precipitation',
  'weather_code',
  'cloud_cover',
  'pressure_msl',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'uv_index',
  'is_day',
] as const;
type OmJson = { hourly?: Partial<Record<(typeof OM_HOURLY)[number] | 'time', Array<number | null>>> };

/** Open-Meteo hourly arrays (unixtime, km/h) → steps. */
export function parseOpenMeteo(j: unknown): WxPoint[] | null {
  const h = (j as OmJson | null)?.hourly;
  if (!h?.time?.length || !h.temperature_2m) return null;
  const at = (k: (typeof OM_HOURLY)[number], i: number) => num(h[k]?.[i]);
  const out: WxPoint[] = [];
  h.time.forEach((sec, i) => {
    const t = at('temperature_2m', i);
    if (typeof sec !== 'number' || t === null) return;
    const code = at('weather_code', i);
    const isDay = at('is_day', i);
    out.push({
      time: sec * 1000,
      t,
      feels: at('apparent_temperature', i),
      hum: at('relative_humidity_2m', i),
      wind: at('wind_speed_10m', i) ?? 0,
      gust: at('wind_gusts_10m', i),
      dir: at('wind_direction_10m', i),
      pres: at('pressure_msl', i),
      uv: at('uv_index', i),
      cloud: at('cloud_cover', i),
      dew: at('dew_point_2m', i),
      ...(code === null ? {} : { c1: wmoCond(code) }),
      ...(isDay === null ? {} : { d1: isDay === 1 }),
      mm1: at('precipitation', i) ?? 0,
      pop1: at('precipitation_probability', i),
    });
  });
  return out.length ? out : null;
}

async function openMeteoPoints(la: number, lo: number): Promise<WxPoint[] | null> {
  const key = `kh:wx2:om:${la}:${lo}`;
  const hit = await getJson<WxPoint[]>(key);
  if (hit) return hit;
  try {
    const q = new URLSearchParams({
      latitude: String(la),
      longitude: String(lo),
      hourly: OM_HOURLY.join(','),
      timezone: 'GMT',
      timeformat: 'unixtime',
      forecast_days: '9',
    });
    const res = await wxFetch(`${base('om')}/v1/forecast?${q}`);
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const pts = parseOpenMeteo(await res.json());
    if (!pts) throw new Error('Open-Meteo: unexpected response');
    await setJson(key, pts, OM_TTL_S);
    return pts;
  } catch (err) {
    console.warn('[weather] Open-Meteo failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ── IPMA warnings (Portugal) ──────────────────────────────────────────────

// Warning areas (idAreaAviso) with reference points: the district capitals on
// the mainland, a few towns on the islands. A place gets the area of the
// nearest point; only places whose time zone is Portuguese are looked up.
const IPMA_AREAS: Array<[id: string, name: string, lat: number, lon: number]> = [
  ['AVR', 'Aveiro', 40.641, -8.654],
  ['BJA', 'Beja', 38.015, -7.863],
  ['BRG', 'Braga', 41.548, -8.423],
  ['BGC', 'Bragança', 41.808, -6.761],
  ['CBO', 'Castelo Branco', 39.822, -7.496],
  ['CBR', 'Coimbra', 40.208, -8.419],
  ['EVR', 'Évora', 38.57, -7.91],
  ['FAR', 'Faro', 37.015, -7.933],
  ['GDA', 'Guarda', 40.538, -7.265],
  ['LRA', 'Leiria', 39.747, -8.807],
  ['LSB', 'Lisboa', 38.766, -9.129],
  ['PTG', 'Portalegre', 39.29, -7.423],
  ['PTO', 'Porto', 41.158, -8.629],
  ['STM', 'Santarém', 39.2, -8.74],
  ['STB', 'Setúbal', 38.525, -8.886],
  ['VCT', 'Viana do Castelo', 41.695, -8.837],
  ['VRL', 'Vila Real', 41.305, -7.744],
  ['VIS', 'Viseu', 40.659, -7.912],
  ['MCS', 'Madeira — costa sul', 32.649, -16.908],
  ['MCS', 'Madeira — costa sul', 32.68, -17.06],
  ['MCS', 'Madeira — costa sul', 32.72, -16.77],
  ['MCN', 'Madeira — costa norte', 32.8, -16.88],
  ['MCN', 'Madeira — costa norte', 32.86, -17.17],
  ['MPS', 'Porto Santo', 33.07, -16.34],
  ['AOR', 'Açores — grupo ocidental', 39.45, -31.13],
  ['ACE', 'Açores — grupo central', 38.54, -28.63],
  ['ACE', 'Açores — grupo central', 38.66, -27.22],
  ['ACE', 'Açores — grupo central', 38.65, -28.08],
  ['AOC', 'Açores — grupo oriental', 37.74, -25.67],
  ['AOC', 'Açores — grupo oriental', 36.97, -25.1],
];
const PT_TZ = new Set(['Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores']);

/** IPMA warning area of a place in Portugal (null elsewhere). */
export function ipmaArea(lat: number, lon: number, tz: string): { id: string; name: string } | null {
  if (!PT_TZ.has(tz)) return null;
  let best: (typeof IPMA_AREAS)[number] | null = null;
  let bd = Infinity;
  const k = Math.cos(lat * (Math.PI / 180));
  for (const a of IPMA_AREAS) {
    const d = (a[2] - lat) ** 2 + ((a[3] - lon) * k) ** 2;
    if (d < bd) [best, bd] = [a, d];
  }
  // ~150 km: further than that it's sea, not a warning area
  return best && Math.sqrt(bd) < 1.4 ? { id: best[0], name: best[1] } : null;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const IPMA_TYPES: Record<string, WarnType> = {
  precipitacao: 'rain',
  vento: 'wind',
  trovoada: 'storm',
  neve: 'snow',
  nevoeiro: 'fog',
  'tempo quente': 'heat',
  'tempo frio': 'cold',
  'agitacao maritima': 'sea',
};
const LEVELS: Record<string, WarnLevel> = { yellow: 'yellow', orange: 'orange', red: 'red' };
const LEVEL_RANK: Record<WarnLevel, number> = { red: 0, orange: 1, yellow: 2 };

type IpmaRaw = {
  idAreaAviso?: string;
  awarenessTypeName?: string;
  awarenessLevelID?: string;
  startTime?: string;
  endTime?: string;
  text?: string;
};

/**
 * IPMA's warnings_www.json → the active (not green, not over) warnings of an
 * area in the next 3 days, the most severe first. Times are local wall-clock.
 */
export function parseIpma(j: unknown, area: string, tz: string, now: number): WxWarning[] {
  if (!Array.isArray(j)) return [];
  const out: WxWarning[] = [];
  for (const w of j as IpmaRaw[]) {
    if (w?.idAreaAviso !== area) continue;
    const level = LEVELS[fold(w.awarenessLevelID ?? '')];
    if (!level) continue;
    const start = zonedToUtc(w.startTime ?? '', tz);
    const end = zonedToUtc(w.endTime ?? '', tz);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= now || start > now + 3 * 86_400_000)
      continue;
    const name = (w.awarenessTypeName ?? '').trim().slice(0, 60);
    out.push({
      type: IPMA_TYPES[fold(name)] ?? 'other',
      name,
      level,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      text: (w.text ?? '').trim().slice(0, 400),
    });
  }
  return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.start.localeCompare(b.start));
}

async function ipmaWarnings(area: string, tz: string, now: number): Promise<WxWarning[]> {
  const key = 'kh:wx2:ipma:warnings';
  let raw = await getJson<IpmaRaw[]>(key);
  if (!raw) {
    try {
      const res = await wxFetch(`${base('ipma')}/open-data/forecast/warnings/warnings_www.json`);
      if (!res.ok) throw new Error(`IPMA HTTP ${res.status}`);
      const j = (await res.json()) as unknown;
      // only what can matter (the file lists every area, green ones too)
      raw = Array.isArray(j)
        ? (j as IpmaRaw[]).filter((w) => fold(w?.awarenessLevelID ?? '') !== 'green')
        : [];
      await setJson(key, raw, IPMA_TTL_S);
    } catch (err) {
      console.warn('[weather] IPMA warnings failed:', err instanceof Error ? err.message : err);
      await setJson(key, [], DOWN_S);
      raw = [];
    }
  }
  return parseIpma(raw, area, tz, now);
}

// ── The card's data ───────────────────────────────────────────────────────

/** Current conditions, 48 hours and 9 days for a place (MET Norway, Open-Meteo if it fails). */
export async function weather(lat: number, lon: number, now = Date.now()): Promise<Wx> {
  const la = cell(lat);
  const lo = cell(lon);
  const tz = placeTz(la, lo);
  const area = ipmaArea(la, lo, tz);
  const [met, warnings] = await Promise.all([
    metPoints(la, lo, now),
    area ? ipmaWarnings(area.id, tz, now) : Promise.resolve(null),
  ]);
  const common = { lat: la, lon: lo, tz, now, warnings, warnArea: area?.name ?? null };
  let wx = met
    ? buildWx(met.points, { ...common, source: 'met', updatedAt: met.updatedAt, stale: met.stale })
    : null;
  if (!wx) {
    const om = await openMeteoPoints(la, lo);
    wx = om ? buildWx(om, { ...common, source: 'openmeteo', updatedAt: null }) : null;
  }
  if (!wx) throw new ApiError(502, 'weather_unavailable');
  return wx;
}

// ── Places ────────────────────────────────────────────────────────────────

export type Place = { lat: number; lon: number; city: string; region: string };

/** Nominatim's policy: at most 1 request per second for the whole app. */
async function osmSlot(): Promise<boolean> {
  for (let i = 0; i < 2; i++) {
    try {
      if (await redis().set('kh:wx2:osm:slot', '1', 'PX', 1100, 'NX')) return true;
    } catch {
      return true;
    }
    if (i === 0) await new Promise((r) => setTimeout(r, 1100));
  }
  return false;
}

type OsmPlace = {
  lat?: string;
  lon?: string;
  name?: string;
  address?: Record<string, string | undefined>;
};
const coord = (v: unknown) => Math.round(Number(v) * 1e4) / 1e4;

function osmToPlace(r: OsmPlace): Place | null {
  const a = r.address ?? {};
  const city = (r.name || a.city || a.town || a.village || a.municipality || a.hamlet || '').trim();
  const lat = coord(r.lat);
  const lon = coord(r.lon);
  if (!city || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // the first administrative level that isn't the town itself, then the country
  const admin = [a.county, a.state_district, a.state, a.region].find((x) => !!x && x !== city);
  const region = [admin, a.country].filter((x): x is string => !!x && x !== city).join(', ');
  return { lat, lon, city: city.slice(0, 80), region: region.slice(0, 120) };
}

async function osmSearch(q: string, lang: 'pt' | 'en'): Promise<Place[]> {
  if (!(await osmSlot())) throw new Error('Nominatim: busy');
  const p = new URLSearchParams({
    q,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '6',
    featureType: 'settlement',
    'accept-language': lang,
  });
  const res = await wxFetch(`${base('osm')}/search?${p}`);
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const j = (await res.json()) as unknown;
  return Array.isArray(j) ? (j as OsmPlace[]).map(osmToPlace).filter((x): x is Place => !!x) : [];
}

async function omSearch(q: string, lang: 'pt' | 'en'): Promise<Place[]> {
  const p = new URLSearchParams({ name: q, count: '6', language: lang, format: 'json' });
  const res = await wxFetch(`${base('omgeo')}/v1/search?${p}`);
  if (!res.ok) throw new Error(`Open-Meteo geocoding HTTP ${res.status}`);
  const j = (await res.json()) as {
    results?: Array<{ latitude: number; longitude: number; name: string; admin1?: string; country?: string }>;
  };
  return (j.results ?? []).map((g) => ({
    lat: coord(g.latitude),
    lon: coord(g.longitude),
    city: g.name.slice(0, 80),
    region: [g.admin1, g.country]
      .filter((x) => !!x && x !== g.name)
      .join(', ')
      .slice(0, 120),
  }));
}

/** City name → up to 6 places (Nominatim; Open-Meteo's geocoder if it fails). Cached 30 days. */
export async function geocode(name: string, lang: 'pt' | 'en'): Promise<Place[]> {
  const q = name.trim().replace(/\s+/g, ' ').slice(0, 80);
  const key = `kh:wx2:geo:${lang}:${q.toLowerCase()}`;
  const hit = await getJson<Place[]>(key);
  if (hit) return hit;
  let list: Place[];
  try {
    list = await osmSearch(q, lang);
  } catch (err) {
    console.warn('[weather] Nominatim failed:', err instanceof Error ? err.message : err);
    list = await omSearch(q, lang).catch(() => {
      throw new ApiError(502, 'weather_unavailable');
    });
  }
  const seen = new Set<string>();
  list = list.filter((p) => {
    const k = `${p.city}|${p.region}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  await setJson(key, list, list.length ? GEO_TTL_S : 3600);
  return list;
}

/** Coordinates (the device's location) → the place's name, or null. Cached 30 days per ~1 km. */
export async function reverseGeocode(lat: number, lon: number, lang: 'pt' | 'en'): Promise<Place | null> {
  const la = cell(lat);
  const lo = cell(lon);
  const key = `kh:wx2:rev:${lang}:${la}:${lo}`;
  const hit = await getJson<Place | { none: true }>(key);
  if (hit) return 'none' in hit ? null : hit;
  try {
    if (!(await osmSlot())) return null;
    const p = new URLSearchParams({
      lat: String(la),
      lon: String(lo),
      format: 'jsonv2',
      zoom: '10',
      addressdetails: '1',
      'accept-language': lang,
    });
    const res = await wxFetch(`${base('osm')}/reverse?${p}`);
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const r = (await res.json()) as OsmPlace & { error?: string };
    const a = r.address ?? {};
    // the settlement, not the road/feature Nominatim may name at this zoom
    const city = a.city || a.town || a.village || a.municipality || r.name;
    const place = r.error ? null : osmToPlace({ ...r, name: city, lat: String(la), lon: String(lo) });
    await setJson(key, place ?? { none: true }, GEO_TTL_S);
    return place;
  } catch (err) {
    console.warn('[weather] Nominatim reverse failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
