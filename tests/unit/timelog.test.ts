import { describe, expect, it } from 'vitest';
import { fmtClock, fmtMinutes, roundUp15, tsSlot } from '@/lib/timelog';

describe('timelog rules', () => {
  it('rounds always up to 15 minutes, at least 15', () => {
    expect(roundUp15(0)).toBe(15);
    expect(roundUp15(10)).toBe(15);
    expect(roundUp15(15 * 60)).toBe(15);
    expect(roundUp15(15 * 60 + 1)).toBe(30);
    expect(roundUp15(61 * 60)).toBe(75);
    expect(roundUp15(2 * 3600)).toBe(120);
  });
  it('formats', () => {
    expect(fmtMinutes(135)).toBe('2h 15m');
    expect(fmtClock(5025)).toBe('01:23:45');
  });
  it('puts a moment in its local week and weekday', () => {
    // Tuesday 11/11/2026 09:00 Lisbon
    expect(tsSlot(new Date('2026-11-11T09:00:00Z'), 'Europe/Lisbon')).toEqual({ week: '2026-11-09', day: 2 });
    // Sunday 23:30 UTC is already Monday in Tokyo
    expect(tsSlot(new Date('2026-11-15T23:30:00Z'), 'Asia/Tokyo')).toEqual({ week: '2026-11-16', day: 0 });
    expect(tsSlot(new Date('2026-11-15T12:00:00Z'), 'Europe/Lisbon').day).toBe(6);
  });
});
