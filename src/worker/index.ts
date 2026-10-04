// Background worker (BullMQ). Runs as its own container from the same
// codebase: `node dist/worker.mjs`. Phase 0 only wires the scheduler and a
// heartbeat; RSS refresh, purges, expiries, emails etc. plug in here later.
import { Worker } from 'bullmq';
import { QUEUES, WORKER_HEARTBEAT_KEY, queue } from '@/lib/queue';
import { createQueueConnection, redis } from '@/lib/redis';
import { env } from '@/lib/env';

type JobHandler = () => Promise<unknown>;

const handlers: Record<string, JobHandler> = {
  heartbeat: async () => {
    await redis().set(WORKER_HEARTBEAT_KEY, String(Date.now()), 'EX', 600);
  },
};

async function main() {
  env(); // fail fast on bad configuration

  await queue(QUEUES.system).upsertJobScheduler(
    'heartbeat',
    { every: 60_000 },
    { name: 'heartbeat', opts: { removeOnComplete: 100, removeOnFail: 500 } },
  );

  const worker = new Worker(
    QUEUES.system,
    async (job) => {
      const handler = handlers[job.name];
      if (!handler) throw new Error(`No handler for job "${job.name}"`);
      return handler();
    },
    { connection: createQueueConnection(), concurrency: 2 },
  );
  worker.on('failed', (job, err) => console.error(`[worker] ${job?.name} failed:`, err));

  await handlers.heartbeat!();
  console.log('[worker] started');

  const shutdown = async () => {
    console.log('[worker] shutting down');
    await worker.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
