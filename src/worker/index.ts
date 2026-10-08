// Background worker (BullMQ). Runs as its own container from the same
// codebase: `node dist/worker.mjs`. Heartbeat, the daily license job and the
// transactional email queue.
import { Worker } from 'bullmq';
import { QUEUES, WORKER_HEARTBEAT_KEY, queue } from '@/lib/queue';
import { createQueueConnection, redis } from '@/lib/redis';
import { env } from '@/lib/env';
import { deliverMail } from '@/server/mail/send';
import type { MailMessage } from '@/server/mail/templates';
import { runLicenseJob } from '@/server/jobs/licenses';
import { sweepStorage } from '@/server/jobs/storage';

type JobHandler = () => Promise<unknown>;

const handlers: Record<string, JobHandler> = {
  heartbeat: async () => {
    await redis().set(WORKER_HEARTBEAT_KEY, String(Date.now()), 'EX', 600);
  },
  // trials and renewals → suspended, reminders, expired codes, purge of revoked data (30 days),
  // then files nothing points to any more
  licenses: async () => {
    const r = await runLicenseJob();
    const files = await sweepStorage().catch((e: unknown) => ({ error: String(e) }));
    console.log('[worker] licenses', JSON.stringify({ ...r, files }));
    return { ...r, files };
  },
};

async function main() {
  env(); // fail fast on bad configuration

  await queue(QUEUES.system).upsertJobScheduler(
    'heartbeat',
    { every: 60_000 },
    { name: 'heartbeat', opts: { removeOnComplete: 100, removeOnFail: 500 } },
  );

  // every day at 03:17 (server time)
  await queue(QUEUES.system).upsertJobScheduler(
    'licenses',
    { pattern: '17 3 * * *' },
    { name: 'licenses', opts: { removeOnComplete: 30, removeOnFail: 100 } },
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

  // Transactional email (verify, reset, password changed, setup). BullMQ
  // retries with backoff when the SMTP server hiccups.
  const mailWorker = new Worker<MailMessage>(QUEUES.mail, (job) => deliverMail(job.data), {
    connection: createQueueConnection(),
    concurrency: 2,
  });
  mailWorker.on('failed', (job, err) =>
    console.error(`[worker] mail to ${job?.data.to} failed:`, err.message),
  );

  await handlers.heartbeat!();
  console.log('[worker] started');

  const shutdown = async () => {
    console.log('[worker] shutting down');
    await Promise.all([worker.close(), mailWorker.close()]);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
