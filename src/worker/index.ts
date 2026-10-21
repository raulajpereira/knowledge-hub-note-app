// Background worker (BullMQ). Runs as its own container from the same
// codebase: `node dist/worker.mjs`. Heartbeat, the daily license job, the
// transactional email queue, the data exports, and search: embeddings (semantic
// search) and OCR, with the internal endpoint that turns a search query into a vector.
import { Worker } from 'bullmq';
import { QUEUES, WORKER_HEARTBEAT_KEY, queue } from '@/lib/queue';
import { createQueueConnection, redis } from '@/lib/redis';
import { env } from '@/lib/env';
import { deliverMail } from '@/server/mail/send';
import type { MailMessage } from '@/server/mail/templates';
import { runLicenseJob } from '@/server/jobs/licenses';
import { sweepStorage } from '@/server/jobs/storage';
import { runMonitor } from '@/server/jobs/monitor';
import { expireTrash, pruneNoteImages, pruneOtherImages } from '@/server/jobs/trash';
import { pruneNotifications, runNotify } from '@/server/notify/generate';
import { runInbound } from '@/server/inbound/imap';
import { inboundConfigured, pruneReleasedInboundCodes } from '@/server/notify/service';
import { expireExports, runExport } from '@/server/jobs/export';
import { backfill, startIndexer } from './search/indexer';
import { startEmbedServer } from './search/server';
import { stopOcr } from './search/ocr';
import { unloadModel } from './search/embedder';

type JobHandler = () => Promise<unknown>;

const handlers: Record<string, JobHandler> = {
  heartbeat: async () => {
    await redis().set(WORKER_HEARTBEAT_KEY, String(Date.now()), 'EX', 600);
  },
  // services, public address, email queue and server errors → email the console admins
  monitor: async () => runMonitor(),
  // the header bell: due / overdue tasks, reminders, meetings, invitations (+ emails, daily summary)
  notify: async () => runNotify(),
  // "Email para a app": the inbound mailbox (only scheduled when configured)
  inbound: async () => runInbound(),
  // trials and renewals → suspended, reminders, expired codes, purge of revoked data (30 days),
  // then files nothing points to any more
  licenses: async () => {
    // each step on its own: one failing must not stop the others
    const step = <T>(f: () => Promise<T>) => f().catch((e: unknown) => ({ error: String(e) }));
    const r = await step(runLicenseJob);
    const trash = await step(expireTrash);
    const noteImages = await step(pruneNoteImages);
    const otherImages = await step(pruneOtherImages);
    const exports = await step(() => expireExports());
    const files = await step(() => sweepStorage());
    const notifications = await step(pruneNotifications);
    const inboundCodes = await step(pruneReleasedInboundCodes);
    const out = { licenses: r, trash, noteImages, otherImages, exports, files, notifications, inboundCodes };
    console.log('[worker] licenses', JSON.stringify(out));
    return out;
  },
};

async function main() {
  env(); // fail fast on bad configuration

  await queue(QUEUES.system).upsertJobScheduler(
    'heartbeat',
    { every: 60_000 },
    { name: 'heartbeat', opts: { removeOnComplete: 100, removeOnFail: 500 } },
  );

  await queue(QUEUES.system).upsertJobScheduler(
    'monitor',
    { every: 5 * 60_000 },
    { name: 'monitor', opts: { removeOnComplete: 50, removeOnFail: 200 } },
  );

  await queue(QUEUES.system).upsertJobScheduler(
    'notify',
    { every: 60_000 },
    { name: 'notify', opts: { removeOnComplete: 50, removeOnFail: 200 } },
  );

  if (inboundConfigured()) {
    await queue(QUEUES.system).upsertJobScheduler(
      'inbound',
      { every: 2 * 60_000 },
      { name: 'inbound', opts: { removeOnComplete: 50, removeOnFail: 200 } },
    );
    console.log('[inbound] on: mailbox checked every 2 minutes');
  } else {
    await queue(QUEUES.system).removeJobScheduler('inbound');
    console.log('[inbound] off: INBOUND_IMAP_HOST / _USER / _PASSWORD / INBOUND_ADDRESS not all set');
  }

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
    { connection: createQueueConnection(), concurrency: 3 },
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

  // "Exportar os meus dados": one ZIP at a time (they stream, but are long and heavy)
  const exportWorker = new Worker<{ exportId: string; tenantId: string; userId: string }>(
    QUEUES.export,
    (job) => runExport(job.data),
    { connection: createQueueConnection(), concurrency: 1, lockDuration: 5 * 60_000 },
  );
  exportWorker.on('failed', (job, err) => console.error(`[worker] export ${job?.id} failed:`, err.message));

  // Search (docs/DEPLOY.md §6c): one job at a time from the search_jobs queue;
  // the model and tesseract load on first use. A failure here never stops the
  // rest of the worker (search just stays keyword-only).
  const e = env();
  const embedServer = e.SEMANTIC_SEARCH
    ? await startEmbedServer().catch((err: unknown) => {
        console.error('[search] embedding endpoint failed to start:', err);
        return null;
      })
    : null;
  const stopIndexer = e.SEMANTIC_SEARCH || e.OCR ? startIndexer() : async () => {};
  // what existed before (or was missed while the worker was down), a minute after start
  setTimeout(
    () =>
      void backfill()
        .then((n) => n && console.log(`[search] backfill queued ${n} jobs`))
        .catch((err: unknown) => console.error('[search] backfill failed:', err)),
    60_000,
  ).unref();

  await handlers.heartbeat!();
  console.log('[worker] started');

  const shutdown = async () => {
    console.log('[worker] shutting down');
    embedServer?.close();
    await Promise.all([worker.close(), mailWorker.close(), exportWorker.close(), stopIndexer()]);
    await Promise.all([stopOcr(), unloadModel()]);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
