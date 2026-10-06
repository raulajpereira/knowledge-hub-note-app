import 'server-only';
import { redis } from '@/lib/redis';
import { ApiError } from '@/server/errors';

// Weather for the Início card (prototype wxLoad), fetched by the server from
// Open-Meteo — the browser never calls third parties and the location never
// leaves our server. Cached in Redis per ~1 km grid cell.

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const TTL_S = 30 * 60;

export type Forecast = {
  ts: number;
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    is_day: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: number[];
    wind_gusts_10m_max: number[];
    uv_index_max: number[];
  };
};

async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  try {
    const hit = await redis().get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch {
    // no cache
  }
  const v = await fn();
  try {
    await redis().set(key, JSON.stringify(v), 'EX', ttl);
  } catch {
    // ignore
  }
  return v;
}

export async function forecast(lat: number, lon: number): Promise<Forecast> {
  const la = Math.round(lat * 100) / 100;
  const lo = Math.round(lon * 100) / 100;
  return cached(`kh:wx:${la}:${lo}`, TTL_S, async () => {
    const q = new URLSearchParams({
      latitude: String(la),
      longitude: String(lo),
      current:
        'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,is_day',
      daily:
        'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,uv_index_max',
      timezone: 'auto',
      forecast_days: '5',
    });
    const res = await fetch(`${FORECAST}?${q}`, { signal: AbortSignal.timeout(6000) }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as Partial<Forecast> | null;
    if (!res?.ok || !j?.current || !j.daily) throw new ApiError(502, 'weather_unavailable');
    return { ts: Date.now(), current: j.current, daily: j.daily };
  });
}

export async function geocode(name: string, lang: 'pt' | 'en') {
  const q = name.trim().slice(0, 80);
  return cached(`kh:geo:${lang}:${q.toLowerCase()}`, 24 * 3600, async () => {
    const p = new URLSearchParams({ count: '1', language: lang, name: q });
    const res = await fetch(`${GEOCODE}?${p}`, { signal: AbortSignal.timeout(6000) }).catch(() => null);
    if (!res?.ok) throw new ApiError(502, 'weather_unavailable');
    const j = (await res.json().catch(() => null)) as {
      results?: Array<{ latitude: number; longitude: number; name: string }>;
    } | null;
    const g = j?.results?.[0];
    return g ? { lat: g.latitude, lon: g.longitude, city: g.name } : null;
  });
}
