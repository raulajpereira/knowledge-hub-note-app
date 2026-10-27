import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

// /api/v1/weather* against recorded-format provider responses: fetch is
// mocked (no real provider is ever called), Redis is real (cache, rate limit).
const enabled = !!process.env.TEST_DATABASE_URL;
const fx = (f: string) => fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'weather', f), 'utf8');
const T0 = Date.parse('2026-10-27T10:20:00Z');
const USER = 'wx-int-user';

vi.mock('@/server/auth/request', () => ({
  requireAuth: async () => ({ user: { id: USER }, tenant: { id: 't', status: 'active' } }),
}));

type Reply = { status?: number; body?: string; headers?: Record<string, string> } | 'throw';
let routes: Array<[RegExp, (url: URL, init: RequestInit) => Reply]> = [];
const calls: Array<{ url: string; headers: Record<string, string> }> = [];
const fetchMock = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
  const url = new URL(String(input));
  calls.push({ url: url.toString(), headers: (init.headers ?? {}) as Record<string, string> });
  const r = routes.find(([re]) => re.test(url.toString()));
  const reply = r ? r[1](url, init) : { status: 404, body: '{}' };
  if (reply === 'throw') throw new TypeError('fetch failed');
  return new Response(reply.status === 304 ? null : (reply.body ?? '{}'), {
    status: reply.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...reply.headers },
  });
});
const ok =
  (f: string, headers: Record<string, string> = {}) =>
  () => ({ body: fx(f), headers });
const MET = /^https:\/\/api\.met\.no\/weatherapi\/locationforecast\/2\.0\/complete\?/;
const IPMA = /^https:\/\/api\.ipma\.pt\/open-data\/forecast\/warnings\/warnings_www\.json$/;
const OM = /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/;
const OSM = /^https:\/\/nominatim\.openstreetmap\.org\//;
const OMGEO = /^https:\/\/geocoding-api\.open-meteo\.com\/v1\/search\?/;
const metHeaders = () => ({
  Expires: new Date(Date.now() + 30 * 60_000).toUTCString(),
  'Last-Modified': 'Tue, 27 Oct 2026 09:41:22 GMT',
});

describe.skipIf(!enabled)('weather API', () => {
  let wx: typeof import('@/app/api/v1/weather/route');
  let geo: typeof import('@/app/api/v1/weather/geocode/route');
  let rev: typeof import('@/app/api/v1/weather/reverse/route');
  let redis: typeof import('@/lib/redis').redis;
  const get = (mod: { GET: (r: NextRequest, c: unknown) => Promise<Response> }, q: string) =>
    mod.GET(new NextRequest(`http://localhost/v2/api/v1/weather${q}`), {});
  const clear = async () => {
    const keys = [...(await redis().keys('kh:wx2:*')), ...(await redis().keys(`kh:rl:hit:*${USER}`))];
    if (keys.length) await redis().del(...keys);
  };

  beforeAll(async () => {
    vi.stubGlobal('fetch', fetchMock);
    [wx, geo, rev] = await Promise.all([
      import('@/app/api/v1/weather/route'),
      import('@/app/api/v1/weather/geocode/route'),
      import('@/app/api/v1/weather/reverse/route'),
    ]);
    ({ redis } = await import('@/lib/redis'));
  });
  beforeEach(async () => {
    vi.useFakeTimers({ now: T0, toFake: ['Date'] });
    routes = [
      [MET, () => ({ body: fx('met-lisboa.json'), headers: metHeaders() })],
      [IPMA, ok('ipma-warnings.json')],
      [OM, ok('openmeteo-lisboa.json')],
    ];
    calls.length = 0;
    await clear();
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    await clear();
    vi.unstubAllGlobals();
  });

  it('serves MET Norway + IPMA warnings, identifies itself, rounds the coordinates', async () => {
    const res = await get(wx, '?lat=38.72231&lon=-9.13934');
    expect(res.status).toBe(200);
    const body = (await res.json()) as import('@/lib/weather').Wx;
    expect(body.source).toBe('met');
    expect(body.tz).toBe('Europe/Lisbon');
    expect(body.now.time).toBe('2026-10-27T10:00:00.000Z');
    expect(body.hours).toHaveLength(48);
    expect(body.warnArea).toBe('Lisboa');
    expect(body.warnings?.map((w) => w.type)).toEqual(['sea', 'rain', 'wind']);
    const met = calls.find((c) => MET.test(c.url))!;
    expect(new URL(met.url).searchParams.get('lat')).toBe('38.72');
    expect(new URL(met.url).searchParams.get('lon')).toBe('-9.14');
    expect(met.headers['User-Agent']).toMatch(/^KnowledgeHub\/2\.0 \(\+https?:\/\/\S+\)$/);
  });

  it('caches until Expires, then revalidates with If-Modified-Since (304)', async () => {
    await get(wx, '?lat=38.72&lon=-9.14');
    await get(wx, '?lat=38.72&lon=-9.14');
    expect(calls.filter((c) => MET.test(c.url))).toHaveLength(1);
    expect(calls.filter((c) => IPMA.test(c.url))).toHaveLength(1);

    vi.setSystemTime(T0 + 40 * 60_000);
    routes[0] = [MET, () => ({ status: 304, headers: metHeaders() })];
    const res = await get(wx, '?lat=38.72&lon=-9.14');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { source: string; stale: boolean }).stale).toBe(false);
    const metCalls = calls.filter((c) => MET.test(c.url));
    expect(metCalls).toHaveLength(2);
    expect(metCalls[1]!.headers['If-Modified-Since']).toBe('Tue, 27 Oct 2026 09:41:22 GMT');
  });

  it('serves the cached forecast (stale) when MET Norway fails after expiry', async () => {
    await get(wx, '?lat=38.72&lon=-9.14');
    vi.setSystemTime(T0 + 50 * 60_000);
    routes[0] = [MET, () => ({ status: 503 })];
    const body = (await (await get(wx, '?lat=38.72&lon=-9.14')).json()) as { source: string; stale: boolean };
    expect(body).toMatchObject({ source: 'met', stale: true });
    expect(calls.filter((c) => OM.test(c.url))).toHaveLength(0);
  });

  it('falls back to Open-Meteo when MET Norway is down and nothing is cached', async () => {
    routes[0] = [MET, () => 'throw'];
    const body = (await (await get(wx, '?lat=38.72&lon=-9.14')).json()) as {
      source: string;
      hours: unknown[];
    };
    expect(body.source).toBe('openmeteo');
    expect(body.hours).toHaveLength(48);
    // MET is marked down for a while: the next place goes straight to the fallback
    await get(wx, '?lat=41.15&lon=-8.61');
    expect(calls.filter((c) => MET.test(c.url))).toHaveLength(1);
    expect(calls.filter((c) => OM.test(c.url))).toHaveLength(2);
  });

  it('answers 502 when every provider fails, and keeps warnings optional', async () => {
    routes = [
      [MET, () => ({ status: 500 })],
      [OM, () => ({ status: 500 })],
      [IPMA, () => 'throw'],
    ];
    const res = await get(wx, '?lat=38.72&lon=-9.14');
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('weather_unavailable');

    routes = [
      [MET, () => ({ body: fx('met-lisboa.json'), headers: metHeaders() })],
      [IPMA, () => 'throw'],
    ];
    await redis().del('kh:wx2:down:met', 'kh:wx2:ipma:warnings');
    const ok200 = (await (await get(wx, '?lat=38.72&lon=-9.14')).json()) as { warnings: unknown[] };
    expect(ok200.warnings).toEqual([]);
  });

  it('has no warnings source outside Portugal', async () => {
    const body = (await (await get(wx, '?lat=40.42&lon=-3.7')).json()) as { warnings: null; tz: string };
    expect(body.warnings).toBeNull();
    expect(body.tz).toBe('Europe/Madrid');
    expect(calls.some((c) => IPMA.test(c.url))).toBe(false);
  });

  it('validates input and rate-limits', async () => {
    expect((await get(wx, '?lat=200&lon=0')).status).toBe(400);
    expect((await get(wx, '?lat=x')).status).toBe(400);
    await redis().set(`kh:rl:hit:wx:${USER}`, '60', 'EX', 60);
    expect((await get(wx, '?lat=38.72&lon=-9.14')).status).toBe(429);
  });

  it('geocodes with Nominatim (cached), falls back to Open-Meteo, 404 when nothing', async () => {
    routes = [
      [
        OSM,
        (u) => ({ body: u.searchParams.get('q') === 'nowhere' ? '[]' : fx('nominatim-search-porto.json') }),
      ],
    ];
    const res = await get(geo, '/geocode?q=Porto&lang=pt');
    expect(res.status).toBe(200);
    const { places } = (await res.json()) as { places: Array<{ city: string; region: string; lat: number }> };
    expect(places.map((p) => p.city)).toEqual(['Porto', 'Porto Santo', 'Porto Alegre']);
    expect(places[0]).toMatchObject({ region: 'Norte, Portugal', lat: 41.1495 });
    const q = new URL(calls[0]!.url).searchParams;
    expect(q.get('featureType')).toBe('settlement');
    expect(q.get('accept-language')).toBe('pt');
    expect(calls[0]!.headers['User-Agent']).toMatch(/^KnowledgeHub/);
    await get(geo, '/geocode?q=porto&lang=pt');
    expect(calls).toHaveLength(1); // cached (case-insensitive)

    await redis().del('kh:wx2:osm:slot');
    expect((await get(geo, '/geocode?q=nowhere')).status).toBe(404);

    await redis().del('kh:wx2:osm:slot');
    routes = [
      [OSM, () => ({ status: 503 })],
      [
        OMGEO,
        () => ({
          body: JSON.stringify({
            results: [
              { name: 'Braga', latitude: 41.55, longitude: -8.42, admin1: 'Braga', country: 'Portugal' },
            ],
          }),
        }),
      ],
    ];
    const fb = (await (await get(geo, '/geocode?q=Braga')).json()) as {
      places: Array<{ city: string; region: string }>;
    };
    expect(fb.places).toEqual([{ lat: 41.55, lon: -8.42, city: 'Braga', region: 'Portugal' }]);
    expect((await get(geo, '/geocode?q=')).status).toBe(400);
  });

  it('names the device’s location (reverse geocoding), null when unknown', async () => {
    routes = [[OSM, ok('nominatim-reverse.json')]];
    const r = (await (await get(rev, '/reverse?lat=38.7077&lon=-9.1365&lang=pt')).json()) as {
      place: unknown;
    };
    expect(r.place).toEqual({
      lat: 38.71,
      lon: -9.14,
      city: 'Lisboa',
      region: 'Área Metropolitana de Lisboa, Portugal',
    });
    expect(new URL(calls[0]!.url).searchParams.get('lat')).toBe('38.71');
    await redis().del('kh:wx2:osm:slot');
    routes = [[OSM, () => ({ body: JSON.stringify({ error: 'Unable to geocode' }) })]];
    const none = (await (await get(rev, '/reverse?lat=0&lon=-30')).json()) as { place: unknown };
    expect(none.place).toBeNull();
  });
});
