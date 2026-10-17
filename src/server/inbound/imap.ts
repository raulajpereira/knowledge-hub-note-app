import 'server-only';
import { ImapFlow } from 'imapflow';
import { env } from '@/lib/env';
import { redis } from '@/lib/redis';
import { inboundConfigured } from '@/server/notify/service';
import { pollMailbox, type MailboxSource } from './process';

// The inbound mailbox read by IMAP (worker job every 2 minutes). Never throws
// into the worker: when the server can't be reached it logs and backs off
// (2, 4, 8 … up to 30 minutes) so a bad password or an outage stays quiet.

const BACKOFF_KEY = 'kh:inbound:backoff';
const MAX_PER_RUN = 100;

function imapSource(client: ImapFlow): MailboxSource {
  return {
    async *messages() {
      const uids = (await client.search({ seen: false }, { uid: true })) || [];
      for (const uid of uids.slice(0, MAX_PER_RUN)) {
        const meta = await client.fetchOne(String(uid), { size: true }, { uid: true });
        if (!meta) continue;
        // too large: removed without downloading it
        if ((meta.size ?? 0) > 25 * 1024 * 1024) {
          yield { id: uid, size: meta.size, raw: Buffer.alloc(0) };
          continue;
        }
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (msg && msg.source) yield { id: uid, size: meta.size, raw: msg.source };
      }
    },
    async remove(id) {
      await client.messageFlagsAdd(String(id), ['\\Seen'], { uid: true });
      await client.messageDelete(String(id), { uid: true });
    },
  };
}

export async function runInbound(now = new Date()) {
  if (!inboundConfigured()) return { skipped: 'not_configured' };
  const r = redis();
  const until = Number((await r.get(`${BACKOFF_KEY}:until`).catch(() => null)) ?? 0);
  if (until > now.getTime()) return { skipped: 'backoff' };
  const e = env();
  const client = new ImapFlow({
    host: e.INBOUND_IMAP_HOST!,
    port: e.INBOUND_IMAP_PORT,
    secure: e.INBOUND_IMAP_PORT === 993,
    auth: { user: e.INBOUND_IMAP_USER!, pass: e.INBOUND_IMAP_PASSWORD! },
    logger: false,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 120_000,
  });
  client.on('error', (err: unknown) => console.error('[inbound] imap error', String(err)));
  try {
    await client.connect();
  } catch (err) {
    const n = await r.incr(`${BACKOFF_KEY}:n`).catch(() => 1);
    const wait = Math.min(30, 2 ** n) * 60_000;
    await r.set(`${BACKOFF_KEY}:until`, String(now.getTime() + wait), 'PX', wait).catch(() => {});
    console.error(`[inbound] IMAP unreachable (attempt ${n}, next in ${wait / 60_000} min):`, String(err));
    return { error: 'unreachable' };
  }
  await r.del(`${BACKOFF_KEY}:n`, `${BACKOFF_KEY}:until`).catch(() => {});
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      return await pollMailbox(imapSource(client), e.INBOUND_ADDRESS!, now);
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error('[inbound] poll failed:', String(err));
    return { error: 'poll_failed' };
  } finally {
    await client.logout().catch(() => client.close());
  }
}
