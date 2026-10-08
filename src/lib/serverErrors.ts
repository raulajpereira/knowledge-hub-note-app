import { redis } from '@/lib/redis';

// Server errors per hour, read by the monitor job (src/server/jobs/monitor.ts).
export const errorsKey = (d = new Date()) => `kh:mon:5xx:${d.toISOString().slice(0, 13)}`;

/** Counts a 5xx answered by the API (best effort, never throws). */
export function countServerError() {
  const k = errorsKey();
  try {
    void redis()
      .multi()
      .incr(k)
      .expire(k, 7200)
      .exec()
      .catch(() => {});
  } catch {
    // no Redis configured (unit tests)
  }
}
