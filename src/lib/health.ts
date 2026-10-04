import { pingDatabase } from '@/db/client';
import { redis } from '@/lib/redis';
import { pingStorage } from '@/lib/storage';
import { WORKER_HEARTBEAT_KEY } from '@/lib/queue';

type Check = { ok: boolean; ms: number; error?: string };

async function timed(fn: () => Promise<unknown>, timeoutMs = 2000): Promise<Check> {
  const start = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return { ok: true, ms: Date.now() - start };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}

// Database, Redis and storage are required for the app to serve requests;
// the worker heartbeat is reported but doesn't fail the web health check
// (a stuck worker must not take the site down).
export async function healthReport() {
  const [database, cache, storage] = await Promise.all([
    timed(pingDatabase),
    timed(() => redis().ping()),
    timed(pingStorage),
  ]);
  let workerLastBeatSecondsAgo: number | null = null;
  try {
    const beat = await redis().get(WORKER_HEARTBEAT_KEY);
    if (beat) workerLastBeatSecondsAgo = Math.round((Date.now() - Number(beat)) / 1000);
  } catch {
    // reported through `cache` already
  }
  const ok = database.ok && cache.ok && storage.ok;
  return {
    ok,
    version: process.env.APP_VERSION || 'dev',
    checks: { database, redis: cache, storage },
    worker: { lastHeartbeatSecondsAgo: workerLastBeatSecondsAgo },
  };
}
