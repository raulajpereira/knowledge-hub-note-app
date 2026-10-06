import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { parsePrefsPatch } from '@/lib/prefs';
import { defaultWidgets, pack, resizeRow, widgetAllowed } from '@/components/home/homeModel';
import { wxAlerts, wxKind, wxLabelKey } from '@/components/home/weatherArt';
import { DOMAIN_RE, iconType } from '@/server/favicon';

describe('dashboard layout', () => {
  it('packs cards into 12-column rows by size (prototype hPack)', () => {
    const rows = pack([
      { id: 'a', type: 'today', size: 'L' },
      { id: 'b', type: 'capture', size: 'S' },
      { id: 'c', type: 'shortcuts', size: 'M' },
      { id: 'd', type: 'focus', size: 'M' },
      { id: 'e', type: 'favs', size: 'XL' },
    ]);
    expect(rows.map((r) => r.items.map((i) => i.w.id))).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
    expect(rows[0]!.items.map((i) => i.f)).toEqual([8 / 12, 4 / 12]);
  });

  it('a saved fraction overrides the size inside its row', () => {
    const rows = pack([
      { id: 'a', type: 'today', size: 'M', fr: 0.7 },
      { id: 'b', type: 'capture', size: 'M', fr: 0.3 },
    ]);
    expect(rows[0]!.items.map((i) => +i.f.toFixed(2))).toEqual([0.7, 0.3]);
  });

  it('resizing keeps the row at 100% and every card above the minimum', () => {
    const nf = resizeRow([0.5, 0.25, 0.25], 0, 0.95, 0.2);
    expect(nf.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    expect(Math.min(...nf)).toBeGreaterThanOrEqual(0.2 - 1e-3);
    expect(nf[0]).toBeCloseTo(0.6, 3);
  });

  it('cards of modules outside the plan are not offered', () => {
    const free = new Set(['notes', 'tasks']);
    const types = defaultWidgets(free).map((w) => w.type);
    expect(types).toContain('tasks');
    expect(types).toContain('focus');
    expect(types).not.toContain('transports');
    expect(widgetAllowed('emails', free)).toBe(false);
  });

  it('validates the saved dashboard', () => {
    expect(
      parsePrefsPatch({
        home: {
          widgets: [{ id: 'w1', type: 'focus', size: 'S' }],
          shortcuts: [{ id: 's1', title: 'X', url: 'https://x.pt' }],
        },
      }),
    ).toBeTruthy();
    expect(() => parsePrefsPatch({ home: { widgets: [{ id: 'w1', type: 'evil', size: 'S' }] } })).toThrow(
      ZodError,
    );
    expect(() =>
      parsePrefsPatch({
        home: { widgets: [], shortcuts: [{ id: 's', title: '', url: 'javascript:alert(1)' }] },
      }),
    ).toThrow(ZodError);
    expect(() => parsePrefsPatch({ weatherLoc: { lat: 200, lon: 0, city: 'x' } })).toThrow(ZodError);
  });
});

describe('weather', () => {
  it('maps WMO codes like the prototype', () => {
    expect([0, 2, 3, 45, 61, 73, 81, 95].map(wxKind)).toEqual([
      'clear',
      'partly',
      'cloudy',
      'fog',
      'rain',
      'snow',
      'rain',
      'storm',
    ]);
    expect(wxLabelKey(65)).toBe('c65');
    expect(wxLabelKey(53)).toBe('c51');
  });
  it('derives alerts from the forecast', () => {
    const t = (k: string) => k;
    const a = wxAlerts(
      {
        weather_code: [95, 3],
        precipitation_sum: [25, 0],
        wind_gusts_10m_max: [70, 0],
        temperature_2m_max: [36, 20],
        temperature_2m_min: [-1, 5],
        uv_index_max: [9],
      },
      10,
      t,
    ).map(([x]) => x.split(' ·')[0]);
    expect(a).toEqual(['wx_a_storm', 'wx_a_rain', 'wx_a_wind', 'wx_a_heat', 'wx_a_cold', 'wx_a_uv']);
  });
});

describe('shortcut icons', () => {
  it('accepts only real raster icons and plain domains', () => {
    expect(iconType(new Uint8Array([0, 0, 1, 0, 1]))).toBe('image/x-icon');
    expect(iconType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    expect(DOMAIN_RE.test('help.sap.com')).toBe(true);
    for (const bad of ['localhost', '127.0.0.1', 'a..b', 'x.com/evil', 'http://x.com', '-a.com'])
      expect(DOMAIN_RE.test(bad)).toBe(false);
  });
});
