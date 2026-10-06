import { describe, expect, it } from 'vitest';
import { fmtDue, nextDue } from '@/lib/tasks';

// Phase 4.2: next occurrence of a repeating task.
describe('nextDue', () => {
  const today = new Date(2026, 9, 6); // 6 Oct 2026
  it('daily / weekly move by the interval, across month and year ends', () => {
    expect(nextDue('2026-09-30', 'daily', today)).toBe('2026-10-01');
    expect(nextDue('2026-12-28', 'weekly', today)).toBe('2027-01-04');
  });
  it('monthly keeps the day, clamped to the month length', () => {
    expect(nextDue('2026-01-31', 'monthly', today)).toBe('2026-02-28');
    expect(nextDue('2028-01-31', 'monthly', today)).toBe('2028-02-29');
    expect(nextDue('2026-12-15', 'monthly', today)).toBe('2027-01-15');
  });
  it('without a due date starts from today; none keeps it', () => {
    expect(nextDue(null, 'daily', today)).toBe('2026-10-07');
    expect(nextDue('2026-10-01', 'none', today)).toBe('2026-10-01');
  });
  it('fmtDue shows dd/mm/yyyy', () => {
    expect(fmtDue('2026-09-22')).toBe('22/09/2026');
    expect(fmtDue(null)).toBe('');
  });
});
