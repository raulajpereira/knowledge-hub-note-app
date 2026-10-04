import { Queue } from 'bullmq';
import { createQueueConnection } from '@/lib/redis';

// Queue names are the contract between the web app (producer) and the worker.
export const QUEUES = {
  system: 'kh-system',
} as const;

export const WORKER_HEARTBEAT_KEY = 'kh:worker:heartbeat';

const g = globalThis as unknown as { __khQueues?: Map<string, Queue> };

export function queue(name: (typeof QUEUES)[keyof typeof QUEUES]): Queue {
  g.__khQueues ??= new Map();
  let q = g.__khQueues.get(name);
  if (!q) {
    q = new Queue(name, { connection: createQueueConnection() });
    g.__khQueues.set(name, q);
  }
  return q;
}
