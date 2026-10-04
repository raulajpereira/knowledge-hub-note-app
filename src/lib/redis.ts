import { Redis } from 'ioredis';
import { env } from '@/lib/env';

const g = globalThis as unknown as { __khRedis?: Redis };

// Shared connection for cache / rate limiting. BullMQ needs
// maxRetriesPerRequest: null on the connections it uses (see queue.ts).
export function redis(): Redis {
  g.__khRedis ??= new Redis(env().REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
  return g.__khRedis;
}

export function createQueueConnection(): Redis {
  return new Redis(env().REDIS_URL, { maxRetriesPerRequest: null });
}
