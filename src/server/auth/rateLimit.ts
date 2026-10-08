import type { Redis } from 'ioredis';
import { redis } from '@/lib/redis';

// Failed-attempt lockout (SECURITY.md §2 + Login prototype): 5 failures
// within 15 min lock the key for 30 s; each further lockout doubles
// (60 s, 120 s, …) up to 15 min. A success clears the counters.
const MAX_FAILS = 5;
const FAIL_WINDOW_S = 15 * 60;
const BASE_LOCK_S = 30;
const MAX_LOCK_S = 15 * 60;

export class Lockout {
  constructor(
    private readonly scope: string,
    private readonly r: () => Redis = redis,
  ) {}

  private k(kind: 'fail' | 'lock' | 'n', key: string) {
    return `kh:rl:${this.scope}:${kind}:${key}`;
  }

  /** Seconds until the key may try again (0 = not locked). */
  async lockedFor(key: string): Promise<number> {
    const ttl = await this.r().ttl(this.k('lock', key));
    return ttl > 0 ? ttl : 0;
  }

  /** Records a failure; returns the lock duration if this one triggered a lock. */
  async fail(key: string): Promise<number> {
    const r = this.r();
    const fails = await r.incr(this.k('fail', key));
    if (fails === 1) await r.expire(this.k('fail', key), FAIL_WINDOW_S);
    if (fails < MAX_FAILS) return 0;
    const n = await r.incr(this.k('n', key));
    await r.expire(this.k('n', key), 24 * 3600);
    const secs = Math.min(MAX_LOCK_S, BASE_LOCK_S * 2 ** (n - 1));
    await r.multi().set(this.k('lock', key), '1', 'EX', secs).del(this.k('fail', key)).exec();
    return secs;
  }

  /** Failures in the current window and lockouts in the last 24 h. */
  async state(key: string): Promise<{ fails: number; lockouts: number }> {
    const [f, n] = await this.r().mget(this.k('fail', key), this.k('n', key));
    return { fails: Number(f ?? 0), lockouts: Number(n ?? 0) };
  }

  async success(key: string): Promise<void> {
    await this.r().del(this.k('fail', key), this.k('n', key), this.k('lock', key));
  }
}

/** Fixed-window counter for request floods (forgot, register…). True = allowed. */
export async function allow(key: string, max: number, windowS: number, r: Redis = redis()): Promise<boolean> {
  const k = `kh:rl:hit:${key}`;
  const n = await r.incr(k);
  if (n === 1) await r.expire(k, windowS);
  return n <= max;
}
