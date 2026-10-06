import { describe, expect, it } from 'vitest';
import { isoD, ptHolidays } from '@/lib/calendar';

// Phase 4.3: Portuguese holidays in the calendar (prototype ptHolidays).
describe('ptHolidays', () => {
  it('fixed holidays', () => {
    const h = ptHolidays(2026);
    expect(h['2026-10-05']).toEqual(['Implantação da República', 'Republic Day']);
    expect(h['2026-12-25']?.[0]).toBe('Natal');
    expect(Object.keys(h)).toHaveLength(15);
  });
  it('Easter-based holidays', () => {
    expect(ptHolidays(2026)['2026-04-05']?.[0]).toBe('Páscoa');
    expect(ptHolidays(2026)['2026-04-03']?.[0]).toBe('Sexta-feira Santa');
    expect(ptHolidays(2026)['2026-02-17']?.[0]).toBe('Carnaval');
    expect(ptHolidays(2026)['2026-06-04']?.[0]).toBe('Corpo de Deus');
    expect(ptHolidays(2027)['2027-03-28']?.[0]).toBe('Páscoa');
  });
  it('isoD uses the local calendar day', () => {
    expect(isoD(new Date(2026, 0, 9, 23, 30))).toBe('2026-01-09');
  });
});
