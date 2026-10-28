import { describe, expect, it } from 'vitest';
import {
  AL_MASK_ALL,
  AL_MASK_WK,
  BookingSchema,
  bookingSeries,
  bookingSum,
  buckets,
  conflictOf,
  convertValue,
  dayCap,
  dnOf,
  easterDn,
  equivalents,
  holidayOf,
  isoOf,
  isoWeek,
  loadBand,
  personLoads,
  ptHolidays,
  spread,
  sumDays,
  wdOf,
  workingDays,
  type Absence,
  type Booking,
  type CalcEnv,
} from '@/lib/alloc';

const P = '00000000-0000-4000-8000-000000000001';
const Q = '00000000-0000-4000-8000-000000000002';
const PJ = '00000000-0000-4000-8000-0000000000aa';
const bk = (o: Partial<Booking>): Booking => ({
  id: crypto.randomUUID(),
  person: P,
  project: PJ,
  role: '',
  status: 'confirmed',
  from: '2026-11-02',
  to: '2026-11-06',
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
const env = (weekly: Record<string, number> = {}, abs: Absence[] = []): CalcEnv => ({
  weekly: (p) => weekly[p] ?? 40,
  absences: (p) => abs.filter((a) => a.person === p),
});
const ab = (o: Partial<Absence>): Absence => ({
  id: crypto.randomUUID(),
  person: P,
  type: 'ferias',
  from: '2026-11-03',
  to: '2026-11-03',
  hours: null,
  note: '',
  ver: '',
  ...o,
});
const days = (b: Booking, e = env()) => Array.from(bookingSeries(b, e).h);

describe('days and weeks', () => {
  it('day numbers, weekdays and ISO weeks', () => {
    expect(isoOf(dnOf('2026-10-28'))).toBe('2026-10-28');
    expect(wdOf(dnOf('2026-10-26'))).toBe(0); // Monday
    expect(wdOf(dnOf('2026-11-01'))).toBe(6); // Sunday
    expect(wdOf(dnOf('1969-12-29'))).toBe(0); // before 1970 too
    expect(isoWeek(dnOf('2026-10-28'))).toEqual({ y: 2026, w: 44 });
    expect(isoWeek(dnOf('2027-01-01'))).toEqual({ y: 2026, w: 53 });
    expect(isoWeek(dnOf('2027-01-04'))).toEqual({ y: 2027, w: 1 });
  });
  it('buckets: days, ISO weeks, months and quarters', () => {
    const F = dnOf('2026-10-28');
    const T = dnOf('2027-01-10');
    expect(buckets('day', F, F + 2)).toHaveLength(3);
    const w = buckets('week', F, T);
    expect(isoOf(w[0]!.a)).toBe('2026-10-26');
    expect(isoOf(w.at(-1)!.b)).toBe('2027-01-10');
    expect(buckets('month', F, T).map((b) => isoOf(b.a))).toEqual([
      '2026-10-01',
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
    ]);
    expect(buckets('quarter', F, T).map((b) => [isoOf(b.a), isoOf(b.b)])).toEqual([
      ['2026-10-01', '2026-12-31'],
      ['2027-01-01', '2027-03-31'],
    ]);
  });
});

describe('Portuguese national holidays', () => {
  it('Easter and the holidays that follow it', () => {
    expect(isoOf(easterDn(2026))).toBe('2026-04-05');
    expect(isoOf(easterDn(2027))).toBe('2027-03-28');
    expect(isoOf(easterDn(2025))).toBe('2025-04-20');
    const y = [...ptHolidays(2026).entries()].map(([d, k]) => `${isoOf(d)} ${k}`);
    expect(y).toEqual([
      '2026-01-01 ano',
      '2026-04-03 sexta',
      '2026-04-05 pascoa',
      '2026-04-25 liberdade',
      '2026-05-01 trabalhador',
      '2026-06-10 portugal',
      '2026-06-04 corpo',
      '2026-08-15 assuncao',
      '2026-10-05 republica',
      '2026-11-01 todos',
      '2026-12-01 restauracao',
      '2026-12-08 imaculada',
      '2026-12-25 natal',
    ]);
    expect(holidayOf(dnOf('2027-05-27'))).toBe('corpo');
    expect(holidayOf(dnOf('2026-12-02'))).toBeNull();
  });
});

describe('capacity', () => {
  it('weekly hours / 5 on weekdays, 0 on weekends and holidays, minus absences', () => {
    expect(dayCap(40, dnOf('2026-11-02'), [])).toBe(8);
    expect(dayCap(32, dnOf('2026-11-02'), [])).toBe(6.4);
    expect(dayCap(40, dnOf('2026-11-07'), [])).toBe(0); // Saturday
    expect(dayCap(40, dnOf('2026-12-01'), [])).toBe(0); // holiday
    expect(dayCap(40, dnOf('2026-11-03'), [ab({})])).toBe(0); // vacation
    expect(dayCap(40, dnOf('2026-11-03'), [ab({ hours: 3, type: 'formacao' })])).toBe(5);
    expect(workingDays(40, [ab({})], dnOf('2026-11-30'), dnOf('2026-12-06'))).toBe(4);
  });
});

describe('hours of a booking per day', () => {
  it('h/dia on the weekdays of the mask, typed days win', () => {
    expect(days(bk({}))).toEqual([8, 8, 8, 8, 8]);
    expect(days(bk({ mask: 0b0010101 }))).toEqual([8, 0, 8, 0, 8]);
    expect(days(bk({ days: { '2026-11-04': 2.5, '2026-11-09': 4 } }))).toEqual([8, 8, 2.5, 8, 8]);
  });
  it('holidays count 0 unless the booking works on holidays; a typed day still counts', () => {
    const b = bk({ from: '2026-11-30', to: '2026-12-04' });
    expect(days(b)).toEqual([8, 0, 8, 8, 8]);
    expect(days({ ...b, hol: true })).toEqual([8, 8, 8, 8, 8]);
    expect(days({ ...b, days: { '2026-12-01': 3 } })).toEqual([8, 3, 8, 8, 8]);
  });
  it('weekends: only when the mask has them (cutovers)', () => {
    const b = bk({ from: '2026-11-06', to: '2026-11-09' });
    expect(days(b)).toEqual([8, 0, 0, 8]);
    expect(days({ ...b, mask: AL_MASK_ALL })).toEqual([8, 8, 8, 8]);
  });
  it('a whole-day absence takes the day out, a partial one leaves the rule alone', () => {
    expect(days(bk({}), env({}, [ab({})]))).toEqual([8, 0, 8, 8, 8]);
    expect(days(bk({}), env({}, [ab({ hours: 4 })]))).toEqual([8, 8, 8, 8, 8]);
    // an absence of someone else changes nothing
    expect(days(bk({}), env({}, [ab({ person: Q })]))).toEqual([8, 8, 8, 8, 8]);
  });
  it('h/semana in half-hour steps that keep the week total (no 6,4h days)', () => {
    expect(days(bk({ mode: 'hpw', value: 32 }))).toEqual([6.5, 6.5, 6.5, 6.5, 6]);
    expect(days(bk({ mode: 'hpw', value: 16 }))).toEqual([3.5, 3.5, 3, 3, 3]);
    expect(days(bk({ mode: 'hpw', value: 7.3 }))).toEqual([1.8, 1.5, 1.5, 1.5, 1]);
    // a holiday inside the week: its share is lost (the week totals 32 instead of 40)
    const w = bk({ mode: 'hpw', value: 40, from: '2026-11-30', to: '2026-12-04' });
    expect(days(w)).toEqual([8, 0, 8, 8, 8]);
    // a booking starting on a Thursday only gets Thursday and Friday of that week
    expect(days(bk({ mode: 'hpw', value: 40, from: '2026-11-05', to: '2026-11-10' }))).toEqual([
      8, 8, 0, 0, 8, 8,
    ]);
  });
  it('% of capacity and FTE', () => {
    expect(days(bk({ mode: 'pct', value: 50 }))).toEqual([4, 4, 4, 4, 4]);
    // 32 h a week at 100 %: 6,4h a day, 32h in the week in half-hour steps
    const s = days(bk({ mode: 'pct', value: 100 }), env({ [P]: 32 }));
    expect(s).toEqual([6.5, 6.5, 6.5, 6.5, 6]);
    expect(days(bk({ mode: 'fte', value: 0.5 }), env({ [P]: 32 }))).toEqual([4, 4, 4, 4, 4]);
    // a partial absence lowers the reference of %
    expect(days(bk({ mode: 'pct', value: 100 }), env({}, [ab({ hours: 4 })]))).toEqual([8, 4, 8, 8, 8]);
  });
  it('total distributed over the working days, in half hours, typed days kept', () => {
    expect(days(bk({ mode: 'total', value: 20 }))).toEqual([4, 4, 4, 4, 4]);
    expect(days(bk({ mode: 'total', value: 21 }))).toEqual([4.5, 4.5, 4, 4, 4]);
    // holidays and absences are not working days
    expect(days(bk({ mode: 'total', value: 24, from: '2026-11-30', to: '2026-12-04' }))).toEqual([
      6, 0, 6, 6, 6,
    ]);
    // the typed days come out of the total
    expect(days(bk({ mode: 'total', value: 20, days: { '2026-11-02': 8 } }))).toEqual([8, 3, 3, 3, 3]);
  });
  it('sum of a booking', () => {
    const e = env();
    expect(bookingSum(bk({ mode: 'total', value: 61, from: '2026-11-02', to: '2026-11-13' }), e)).toBe(61);
    expect(bookingSum(bk({}), e, dnOf('2026-11-04'), dnOf('2026-11-30'))).toBe(24);
  });
});

describe('spread', () => {
  it('keeps the total, half-hour steps, larger remainders first', () => {
    expect(spread([6.4, 6.4, 6.4, 6.4, 6.4])).toEqual([6.5, 6.5, 6.5, 6.5, 6]);
    expect(spread([1.2, 0.9])).toEqual([1.1, 1]); // 2,1h: a tenth left over goes to the first day
    expect(spread([0, 0])).toEqual([0, 0]);
    const r = spread([3.3, 3.3, 3.3]);
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(9.9, 6);
  });
});

describe('loads of a person', () => {
  it('confirmed and tentative apart, capacity per day, sums by bucket', () => {
    const e = env({}, [ab({ from: '2026-11-05', to: '2026-11-06' })]);
    const list = [
      bk({ value: 6 }),
      bk({ value: 4, status: 'tentative' }),
      bk({ value: 4, person: Q }),
      bk({ value: 2, from: '2026-11-09', to: '2026-11-13' }),
    ];
    const F = dnOf('2026-11-02');
    const l = personLoads(P, list, e, F, F + 13);
    expect(Array.from(l.conf.slice(0, 7))).toEqual([6, 6, 6, 0, 0, 0, 0]);
    expect(Array.from(l.tent.slice(0, 5))).toEqual([4, 4, 4, 0, 0]);
    expect(Array.from(l.cap.slice(0, 7))).toEqual([8, 8, 8, 0, 0, 0, 0]);
    expect(sumDays(l.conf, l, F, F + 13)).toBe(28);
    expect(sumDays(l.cap, l, F, F + 13)).toBe(64);
  });
  it('load bands', () => {
    expect([loadBand(0, 40), loadBand(20, 40), loadBand(36, 40), loadBand(41, 40), loadBand(2, 0)]).toEqual([
      0, 1, 2, 3, 3,
    ]);
  });
});

describe('linked fields and conversions', () => {
  it('h/dia ↔ % ↔ total ↔ h/semana ↔ FTE', () => {
    const e = env();
    const b = { person: P, from: '2026-11-16', to: '2026-11-27', mask: AL_MASK_WK, hol: false } as const;
    expect(equivalents({ ...b, mode: 'hpd', value: 6 }, e)).toEqual({
      hpd: 6,
      hpw: 30,
      pct: 75,
      fte: 0.75,
      total: 60,
      days: 10,
    });
    expect(convertValue({ ...b, mode: 'total', value: 60 }, 'hpd', e)).toBe(6);
    expect(convertValue({ ...b, mode: 'pct', value: 50 }, 'total', e)).toBe(40);
    expect(convertValue({ ...b, mode: 'hpd', value: 6 }, 'fte', e)).toBe(0.75);
    // a 32 h person: 100 % = 6,4 h a day
    expect(equivalents({ ...b, mode: 'pct', value: 100 }, env({ [P]: 32 })).hpd).toBe(6.4);
    // the holiday is not a working day of the total
    expect(equivalents({ ...b, from: '2026-11-30', to: '2026-12-04', mode: 'hpd', value: 8 }, e).total).toBe(
      32,
    );
  });
});

describe('conflicts', () => {
  it('days over capacity with the other confirmed bookings, and the one-click fixes', () => {
    const e = env();
    const other = bk({ from: '2026-11-02', to: '2026-11-18', value: 8 });
    const tent = bk({ from: '2026-11-02', to: '2026-11-30', value: 8, status: 'tentative' });
    const b = bk({ from: '2026-11-16', to: '2026-11-27', value: 6 });
    const c = conflictOf(b, [other, tent, b], e)!;
    expect(c.days.map(isoOf)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18']);
    expect([c.peak, c.peakCap, c.fits, c.startFree]).toEqual([14, 8, 0, '2026-11-19']);
    // tentative bookings never conflict, and don't count as load
    expect(conflictOf({ ...b, status: 'tentative' }, [other], e)).toBeNull();
    expect(conflictOf(bk({ from: '2026-11-19', to: '2026-11-27' }), [other, tent], e)).toBeNull();
    // what fits: 8h − 6h already there = 2h a day
    const half = bk({ from: '2026-11-02', to: '2026-11-06', value: 6 });
    expect(conflictOf(bk({ from: '2026-11-02', to: '2026-11-06', value: 4 }), [half], e)?.fits).toBe(2);
  });
});

describe('validation', () => {
  it('ranges, units and limits', () => {
    const ok = bk({ person: '', role: 'Consultor FI', need: [{ k: 'fi', l: 3 }] });
    expect(BookingSchema.safeParse(ok).success).toBe(true);
    expect(BookingSchema.safeParse({ ...ok, to: '2026-10-01' }).success).toBe(false);
    expect(BookingSchema.safeParse({ ...ok, mask: 0 }).success).toBe(false);
    expect(BookingSchema.safeParse({ ...ok, value: 25 }).success).toBe(false);
    expect(BookingSchema.safeParse({ ...ok, mode: 'pct', value: 250 }).success).toBe(true);
    expect(BookingSchema.safeParse({ ...ok, from: '2020-01-01', to: '2026-01-01' }).success).toBe(false);
    expect(BookingSchema.safeParse({ ...ok, days: { '2026-11-02': 30 } }).success).toBe(false);
  });
});
