import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('storage sweep brake', () => {
  it('deletes only when the database knows the files and few would go', async () => {
    const { sweepVerdict } = await import('@/server/jobs/storage');
    expect(sweepVerdict(500, 520, 20, false)).toBe('ok');
    expect(sweepVerdict(500, 520, 0, false)).toBe('ok');
    // an empty / wrong database pointed at the real bucket
    expect(sweepVerdict(0, 520, 520, false)).toBe('blocked_no_keys');
    // more than a quarter of the bucket at once
    expect(sweepVerdict(100, 520, 420, false)).toBe('blocked_too_many');
    // a few strays in a small bucket are fine
    expect(sweepVerdict(10, 40, 30, false)).toBe('ok');
    expect(sweepVerdict(500, 520, 20, true)).toBe('dry_run');
  });
});
