// Local fake of the weather/geocoding providers for tests and screenshots
// (never used in production): serves the recorded-format samples in
// tests/fixtures/weather, with the forecast shifted so it starts this hour.
//   node tests/stubs/fakeWeather.mjs [port]      → WEATHER_TEST_BASE_URL=http://127.0.0.1:<port>
// Latitude ≥ 80 makes MET Norway fail (to see the Open-Meteo fallback);
// a search for "nowhere" finds nothing.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'weather');
const load = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const H = 3600e3;
const pad = (n) => String(n).padStart(2, '0');
const localIso = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;
};

/** Whole days that move the samples to today (the first step at or before now, day/night kept). */
const shift = () => {
  const d = Date.now() - Date.parse('2026-10-27T10:00:00Z');
  return Math.floor(d / (24 * H)) * 24 * H;
};

function met() {
  const j = load('met-lisboa.json');
  const d = shift();
  for (const s of j.properties.timeseries)
    s.time = new Date(Date.parse(s.time) + d).toISOString().replace('.000', '');
  j.properties.meta.updated_at = new Date(Date.now() - 25 * 60e3).toISOString().replace(/\.\d+/, '');
  return j;
}
function openMeteo() {
  const j = load('openmeteo-lisboa.json');
  const d = shift() / 1000;
  j.hourly.time = j.hourly.time.map((t) => t + d);
  return j;
}
function ipma() {
  const d = shift();
  return load('ipma-warnings.json').map((w) => ({
    ...w,
    startTime: localIso(Date.parse(`${w.startTime}Z`) + d),
    endTime: localIso(Date.parse(`${w.endTime}Z`) + d),
  }));
}

export function startFakeWeather(port = 4011) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const send = (code, body, headers = {}) => {
      res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    if (!/\S+\/\S+/.test(req.headers['user-agent'] ?? '')) return send(403, { error: 'identify yourself' });
    const p = u.pathname;
    if (p === '/met/weatherapi/locationforecast/2.0/complete') {
      if (Number(u.searchParams.get('lat')) >= 80) return send(500, { error: 'down' });
      return send(200, met(), {
        Expires: new Date(Date.now() + 30 * 60e3).toUTCString(),
        'Last-Modified': new Date(Date.now() - 25 * 60e3).toUTCString(),
      });
    }
    if (p === '/om/v1/forecast') return send(200, openMeteo());
    if (p === '/ipma/open-data/forecast/warnings/warnings_www.json') return send(200, ipma());
    if (p === '/osm/search') {
      const q = (u.searchParams.get('q') ?? '').toLowerCase();
      return send(200, q === 'nowhere' ? [] : load('nominatim-search-porto.json'));
    }
    if (p === '/osm/reverse') return send(200, load('nominatim-reverse.json'));
    if (p === '/omgeo/v1/search') return send(200, { results: [] });
    send(404, { error: 'not found' });
  });
  server.listen(port, '127.0.0.1');
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || 4011);
  startFakeWeather(port);
  console.log(`fake weather providers on http://127.0.0.1:${port}`);
}
