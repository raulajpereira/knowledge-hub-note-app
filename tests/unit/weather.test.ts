import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  apparentTemp,
  buildWx,
  compass,
  localParts,
  metSymbol,
  msToKmh,
  sunTimes,
  tempHue,
  uvBand,
  wmoCond,
  wxAlerts,
  zonedToUtc,
} from '@/lib/weather';
import { ipmaArea, parseIpma, parseMet, parseOpenMeteo, placeTz } from '@/server/weather';
import { condKind } from '@/components/home/weatherArt';

// Recorded-format provider responses (tests/fixtures/weather); first step 2026-10-27T10:00Z.
const fx = (f: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'weather', f), 'utf8')) as unknown;
const T0 = Date.parse('2026-10-27T10:00:00Z');
const LIS = { lat: 38.72, lon: -9.14, tz: 'Europe/Lisbon' };

describe('provider codes → conditions', () => {
  it('maps MET Norway symbol codes (with day/night variants)', () => {
    const m = (c: string) => metSymbol(c);
    expect(m('clearsky_day')).toEqual({ cond: 'clear', day: true });
    expect(m('clearsky_night')).toEqual({ cond: 'clear', day: false });
    expect(m('fair_polartwilight')).toEqual({ cond: 'fair', day: false });
    expect(m('partlycloudy_day')?.cond).toBe('partly');
    expect(m('cloudy')).toEqual({ cond: 'cloudy' });
    expect(m('fog')?.cond).toBe('fog');
    expect(m('lightrain')?.cond).toBe('lightrain');
    expect(m('rain')?.cond).toBe('rain');
    expect(m('heavyrain')?.cond).toBe('heavyrain');
    expect(m('heavyrainshowers_day')?.cond).toBe('heavyrain');
    expect(m('lightrainshowers_night')).toEqual({ cond: 'showers', day: false });
    expect(m('rainshowers_day')?.cond).toBe('showers');
    expect(m('lightsleetshowers_day')?.cond).toBe('sleet');
    expect(m('heavysnow')?.cond).toBe('snow');
    expect(m('snowshowersandthunder_day')?.cond).toBe('storm');
    expect(m('heavyrainandthunder')?.cond).toBe('storm');
    expect(m(undefined as unknown as string)).toBeNull();
  });
  it('maps WMO codes (Open-Meteo fallback)', () => {
    expect([0, 1, 2, 3, 45, 51, 61, 63, 65, 66, 71, 80, 82, 86, 95, 99].map(wmoCond)).toEqual([
      'clear',
      'fair',
      'partly',
      'cloudy',
      'fog',
      'lightrain',
      'lightrain',
      'rain',
      'heavyrain',
      'sleet',
      'snow',
      'showers',
      'heavyrain',
      'snow',
      'storm',
      'storm',
    ]);
  });
  it('gives each condition an animated sky', () => {
    expect(['fair', 'showers', 'sleet', 'storm', 'fog'].map((c) => condKind(c as never))).toEqual([
      'clear',
      'rain',
      'snow',
      'storm',
      'fog',
    ]);
  });
});

describe('units and derived values', () => {
  it('converts and derives', () => {
    expect(msToKmh(10)).toBe(36);
    expect(msToKmh(3.3)).toBe(11.9);
    // still air, average humidity: close to the air temperature
    expect(apparentTemp(20, 50, 0)).toBeCloseTo(19.9, 0);
    // wind makes it feel colder, humid heat warmer
    expect(apparentTemp(10, 70, 36)).toBeLessThan(6);
    expect(apparentTemp(32, 80, 5)).toBeGreaterThan(36);
    expect([0, 22, 45, 200, 248, 359].map((d) => compass(d, 'pt'))).toEqual([
      'N',
      'NNE',
      'NE',
      'SSO',
      'OSO',
      'N',
    ]);
    expect(compass(225, 'en')).toBe('SW');
    expect([0, 3, 6, 8, 11].map(uvBand)).toEqual([0, 1, 2, 3, 4]);
    // the temperature scale runs violet → blue → green → orange → red
    expect(tempHue(-15)).toBe(290);
    expect(tempHue(0)).toBe(255);
    expect(tempHue(19)).toBe(110);
    expect(tempHue(45)).toBe(25);
    expect(tempHue(10)).toBeLessThan(tempHue(5));
  });
  it('handles time zones and the sun', () => {
    // 28 Oct (winter time, UTC+0) and 15 Jul (summer time, UTC+1) in Lisbon
    expect(new Date(zonedToUtc('2026-10-28T12:00:00', 'Europe/Lisbon')).toISOString()).toBe(
      '2026-10-28T12:00:00.000Z',
    );
    expect(new Date(zonedToUtc('2026-07-15T12:00:00', 'Europe/Lisbon')).toISOString()).toBe(
      '2026-07-15T11:00:00.000Z',
    );
    expect(new Date(zonedToUtc('2026-07-15T12:00', 'Atlantic/Azores')).toISOString()).toBe(
      '2026-07-15T12:00:00.000Z',
    );
    expect(zonedToUtc('garbage', 'Europe/Lisbon')).toBeNaN();
    expect(localParts(Date.parse('2026-07-15T23:30:00Z'), 'Europe/Lisbon')).toEqual({
      date: '2026-07-16',
      hour: 0,
      minute: 30,
    });
    // Lisbon, 27 Oct 2026: sunrise ≈ 06:59, sunset ≈ 17:42 (UTC = local)
    const s = sunTimes('2026-10-27', 38.72, -9.14);
    expect(Math.abs(s.rise! - Date.parse('2026-10-27T06:59:00Z'))).toBeLessThan(4 * 60_000);
    expect(Math.abs(s.set! - Date.parse('2026-10-27T17:42:00Z'))).toBeLessThan(4 * 60_000);
    // polar night in Tromsø in December
    expect(sunTimes('2026-12-21', 69.65, 18.96)).toEqual({ rise: null, set: null });
    expect(placeTz(38.72, -9.14)).toBe('Europe/Lisbon');
    expect(placeTz(32.65, -16.91)).toBe('Atlantic/Madeira');
    expect(placeTz(40.42, -3.7)).toBe('Europe/Madrid');
  });
});

describe('MET Norway → card model', () => {
  const met = parseMet(fx('met-lisboa.json'))!;
  it('parses the steps (m/s → km/h, 1 h then 6 h periods)', () => {
    expect(met.updatedAt).toBe('2026-10-27T09:41:22Z');
    expect(met.points.length).toBe(90);
    const p = met.points[0]!;
    expect(p.time).toBe(T0);
    expect(p.c1).toBeDefined();
    expect(p.c6).toBeDefined();
    expect(p.wind).toBeGreaterThan(10); // 3+ m/s in the sample
    expect(met.points[70]!.c1).toBeUndefined(); // no next_1_hours that far ahead
    expect(met.points[70]!.tmax6).toBeDefined();
    expect(parseMet({ properties: { timeseries: [] } })).toBeNull();
    expect(parseMet({ nope: 1 })).toBeNull();
  });
  it('builds now, 48 hours and the days in the place’s time zone', () => {
    const wx = buildWx(met.points, {
      ...LIS,
      now: T0 + 20 * 60_000,
      source: 'met',
      updatedAt: met.updatedAt,
      warnings: [],
      warnArea: 'Lisboa',
    })!;
    expect(wx.now.time).toBe('2026-10-27T10:00:00.000Z');
    expect(wx.hours).toHaveLength(48);
    expect(wx.hours.every((h) => h.step === 1)).toBe(true);
    expect(wx.days[0]!.date).toBe('2026-10-27');
    expect(wx.days.length).toBeGreaterThanOrEqual(8);
    expect(wx.days.length).toBeLessThanOrEqual(9);
    for (const d of wx.days) {
      expect(d.min).toBeLessThanOrEqual(d.max);
      expect(d.sunrise! < d.sunset!).toBe(true);
      expect(d.hours.length).toBeGreaterThan(0);
    }
    // the front on the 28th: the wettest, windiest day
    const d1 = wx.days[1]!;
    expect(['rain', 'heavyrain', 'storm']).toContain(d1.cond);
    expect(d1.mm).toBe(Math.max(...wx.days.map((d) => d.mm)));
    expect(d1.pop).toBeGreaterThanOrEqual(80);
    // far days come in 6-hour steps, their rain summed per step
    const far = wx.days[6]!;
    expect(far.hours.every((h) => h.step === 6)).toBe(true);
    // feels-like computed (MET gives none), wind in km/h
    expect(wx.now.feels).not.toBe(wx.now.t);
    expect(wx.now.pres).toBeGreaterThan(990);
  });
  it('starts at the step that contains "now" and keeps only the future', () => {
    const wx = buildWx(met.points, {
      ...LIS,
      now: T0 + 5.5 * 3600_000,
      source: 'met',
      updatedAt: null,
      warnings: null,
      warnArea: null,
    })!;
    expect(wx.now.time).toBe('2026-10-27T15:00:00.000Z');
    expect(
      buildWx(met.points, {
        ...LIS,
        now: T0 + 30 * 86_400_000,
        source: 'met',
        updatedAt: null,
        warnings: null,
        warnArea: null,
      }),
    ).toBeNull();
  });
});

describe('Open-Meteo fallback → same model', () => {
  it('parses hourly arrays and keeps the provider’s feels-like', () => {
    const pts = parseOpenMeteo(fx('openmeteo-lisboa.json'))!;
    expect(pts.length).toBe(9 * 24);
    const wx = buildWx(pts, {
      ...LIS,
      now: T0,
      source: 'openmeteo',
      updatedAt: null,
      warnings: null,
      warnArea: null,
    })!;
    expect(wx.source).toBe('openmeteo');
    expect(wx.now.time).toBe('2026-10-27T10:00:00.000Z');
    expect(wx.now.feels).toBe(pts[10]!.feels);
    expect(wx.hours).toHaveLength(48);
    expect(wx.days[0]!.date).toBe('2026-10-27');
    expect(parseOpenMeteo({ hourly: {} })).toBeNull();
  });
});

describe('IPMA warnings', () => {
  it('finds the warning area of Portuguese places only', () => {
    const a = (lat: number, lon: number) => ipmaArea(lat, lon, placeTz(lat, lon))?.id ?? null;
    expect(a(38.72, -9.14)).toBe('LSB');
    expect(a(41.15, -8.61)).toBe('PTO');
    expect(a(37.02, -7.93)).toBe('FAR');
    expect(a(32.65, -16.91)).toBe('MCS');
    expect(a(37.74, -25.67)).toBe('AOC');
    expect(a(38.88, -6.97)).toBeNull(); // Badajoz (Spain), inside the box but not Portugal
    expect(a(48.85, 2.35)).toBeNull();
  });
  it('keeps the active yellow/orange/red warnings of the area, worst first', () => {
    const now = Date.parse('2026-10-27T10:00:00Z');
    const w = parseIpma(fx('ipma-warnings.json'), 'LSB', 'Europe/Lisbon', now);
    expect(w.map((x) => [x.type, x.level])).toEqual([
      ['sea', 'orange'],
      ['rain', 'yellow'],
      ['wind', 'yellow'],
    ]);
    expect(w[1]!.start).toBe('2026-10-28T12:00:00.000Z');
    expect(w[1]!.text).toMatch(/chuva/);
    // once over, gone
    expect(
      parseIpma(fx('ipma-warnings.json'), 'LSB', 'Europe/Lisbon', Date.parse('2026-10-29T13:00:00Z')),
    ).toEqual([]);
    expect(parseIpma({ not: 'a list' }, 'LSB', 'Europe/Lisbon', now)).toEqual([]);
    expect(
      parseIpma(
        [
          {
            idAreaAviso: 'LSB',
            awarenessTypeName: 'Coisa nova',
            awarenessLevelID: 'red',
            startTime: '2026-10-27T09:00:00',
            endTime: '2026-10-27T20:00:00',
          },
        ],
        'LSB',
        'Europe/Lisbon',
        now,
      )[0],
    ).toMatchObject({ type: 'other', name: 'Coisa nova' });
  });
});

describe('heads-up from the forecast', () => {
  it('flags notable weather where there are no official warnings', () => {
    const day = (o: object) => ({
      date: '2026-10-27',
      min: 5,
      max: 20,
      cond: 'cloudy',
      pop: 0,
      mm: 0,
      wind: 10,
      gust: 20,
      uv: 2,
      sunrise: null,
      sunset: null,
      hours: [],
      ...o,
    });
    const a = wxAlerts(
      [day({ cond: 'storm', mm: 25, gust: 70, max: 36, min: -1, uv: 9 }), day({ cond: 'snow' })] as never,
      { gust: 10 },
    );
    expect(a.map((x) => x.key)).toEqual(['storm', 'rain', 'wind', 'heat', 'cold', 'snow', 'uv']);
    expect(wxAlerts([day({})] as never, { gust: null })).toEqual([]);
  });
});
