import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { folders, inboundReleasedCodes, notifications, notifySettings, NOTIFY_KINDS } from '@/db/schema';
import { env } from '@/lib/env';
import {
  inboundAddress,
  inboundCodeProblem,
  inboundToken,
  isInboundCode,
  normalizeInboundCode,
  notifyPrefs,
  validTz,
  INBOUND_RELEASE_DAYS,
  NotifyPrefs,
  type NotifyPrefs as Prefs,
} from '@/lib/notify';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { asUser, type Tx } from '@/server/content/tenant';
import { requireModule } from '@/server/licensing/entitlements';

// The notification centre (header bell) and Definições › Notificações.
// Everything runs as the caller under RLS: a person only ever sees and
// changes their own notifications and settings.

export type NotifyKind = (typeof NOTIFY_KINDS)[number];
export type Notification = {
  id: string;
  kind: NotifyKind;
  itemType: string;
  itemId: string | null;
  title: string;
  meta: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
};

export const PAGE = 30;

/**
 * Adds one notification for the transaction's user; a repeated key is a no-op.
 * With a stamp, the key names the item and the stamp its occasion (the day, a
 * reminder's instant): a new stamp refreshes that same notification (kind,
 * title, date, unread again) instead of adding a second one. True when it was
 * written or refreshed.
 */
export async function addNotification(
  tx: Tx,
  auth: { tenantId: string; userId: string },
  n: {
    kind: NotifyKind;
    itemType: string;
    itemId: string | null;
    title: string;
    meta?: object;
    key: string;
    stamp?: string;
  },
): Promise<boolean> {
  const meta = n.stamp ? { ...n.meta, stamp: n.stamp } : (n.meta ?? {});
  const row = {
    tenantId: auth.tenantId,
    userId: auth.userId,
    kind: n.kind,
    itemType: n.itemType,
    itemId: n.itemId,
    title: n.title.slice(0, 300) || '—',
    meta,
    dedupeKey: n.key.slice(0, 200),
  };
  const target = [notifications.userId, notifications.dedupeKey];
  const q = tx.insert(notifications).values(row);
  const r = await (
    n.stamp
      ? q.onConflictDoUpdate({
          target,
          set: { kind: row.kind, title: row.title, meta, createdAt: sql`now()`, readAt: null },
          setWhere: sql`${notifications.meta}->>'stamp' is distinct from ${n.stamp}`,
        })
      : q.onConflictDoNothing({ target })
  ).returning({ id: notifications.id });
  return r.length > 0;
}

export async function listNotifications(
  auth: AuthContext,
  opts: { before?: string; limit?: number } = {},
): Promise<{ items: Notification[]; unread: number; hasMore: boolean }> {
  const limit = Math.min(Math.max(opts.limit ?? PAGE, 1), 100);
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select()
      .from(notifications)
      .where(opts.before ? lt(notifications.createdAt, new Date(opts.before)) : undefined)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit + 1);
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(isNull(notifications.readAt))) as [{ n: number }];
    return {
      items: rows.slice(0, limit).map((r) => ({
        id: r.id,
        kind: r.kind,
        itemType: r.itemType,
        itemId: r.itemId,
        title: r.title,
        meta: r.meta as Record<string, unknown>,
        createdAt: r.createdAt.toISOString(),
        readAt: r.readAt?.toISOString() ?? null,
      })),
      unread: n,
      hasMore: rows.length > limit,
    };
  });
}

/** Marks the given notifications (or all) as read; returns the unread count left. */
export async function markRead(auth: AuthContext, input: { ids?: string[]; all?: boolean }) {
  return asUser(auth, async (tx) => {
    if (input.all || input.ids?.length)
      await tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            isNull(notifications.readAt),
            input.all ? undefined : inArray(notifications.id, input.ids!.slice(0, 200)),
          ),
        );
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(isNull(notifications.readAt))) as [{ n: number }];
    return n;
  });
}

// ── Settings ───────────────────────────────────────────────────────────────
/** The inbound mailbox is configured on this server (the feature shows only then). */
export function inboundConfigured(): boolean {
  const e = env();
  return !!(e.INBOUND_IMAP_HOST && e.INBOUND_IMAP_USER && e.INBOUND_IMAP_PASSWORD && e.INBOUND_ADDRESS);
}

export type InboundTarget = 'note' | 'task' | 'email';
export type NotifySettingsView = {
  prefs: Prefs;
  tz: string;
  inbound: null | {
    /** the mailbox (INBOUND_ADDRESS): the address is <local>+<code>@<domain> */
    base: string;
    code: string | null;
    address: string | null;
    enabled: boolean;
    target: InboundTarget;
    /** the notebook (target note) */
    folderId: string | null;
    /** the Emails folder (target email) */
    emailFolderId: string | null;
    taskType: 'tech' | 'mgmt';
    senders: string[];
    /** codes this person moved away from, still theirs to go back to until the date */
    reserved: Array<{ code: string; address: string; until: string }>;
  };
};

const newToken = () => inboundToken(randomBytes(16));
const RELEASE_MS = INBOUND_RELEASE_DAYS * 86_400_000;

async function ensureRow(tx: Tx, auth: AuthContext) {
  await tx
    .insert(notifySettings)
    .values({ userId: auth.user.id, tenantId: auth.tenant.id })
    .onConflictDoNothing();
  const [row] = await tx.select().from(notifySettings).where(eq(notifySettings.userId, auth.user.id));
  return row!;
}

/** This person's codes still reserved for them (RLS: only their own rows), newest first. */
async function ownReserved(tx: Tx) {
  return tx
    .select({ code: inboundReleasedCodes.code, releasedAt: inboundReleasedCodes.releasedAt })
    .from(inboundReleasedCodes)
    .where(gt(inboundReleasedCodes.releasedAt, sql`now() - make_interval(days => ${INBOUND_RELEASE_DAYS})`))
    .orderBy(desc(inboundReleasedCodes.releasedAt))
    .limit(20);
}

function view(
  row: typeof notifySettings.$inferSelect | undefined,
  auth: AuthContext,
  reserved: Array<{ code: string; releasedAt: Date }>,
): NotifySettingsView {
  if (!inboundConfigured())
    return { prefs: notifyPrefs(row?.prefs ?? {}), tz: row?.tz ?? 'Europe/Lisbon', inbound: null };
  const base = env().INBOUND_ADDRESS!;
  return {
    prefs: notifyPrefs(row?.prefs ?? {}),
    tz: row?.tz ?? 'Europe/Lisbon',
    inbound: {
      base,
      code: row?.inboundToken ?? null,
      address: row?.inboundToken ? inboundAddress(base, row.inboundToken) : null,
      enabled: row?.inboundEnabled ?? false,
      target: row?.inboundTarget ?? 'note',
      folderId: row?.inboundFolderId ?? null,
      emailFolderId: row?.inboundEmailFolderId ?? null,
      taskType: row?.inboundTaskType ?? 'tech',
      senders: row?.inboundSenders.length ? row.inboundSenders : [auth.user.email],
      reserved: reserved
        .filter((r) => r.code !== row?.inboundToken)
        .map((r) => ({
          code: r.code,
          address: inboundAddress(base, r.code),
          until: new Date(r.releasedAt.getTime() + RELEASE_MS).toISOString(),
        })),
    },
  };
}

async function viewTx(tx: Tx, auth: AuthContext) {
  const [row] = await tx.select().from(notifySettings).where(eq(notifySettings.userId, auth.user.id));
  return view(row, auth, inboundConfigured() ? await ownReserved(tx) : []);
}

export async function getNotifySettings(auth: AuthContext): Promise<NotifySettingsView> {
  return asUser(auth, (tx) => viewTx(tx, auth));
}

export type NotifySettingsPatch = {
  prefs?: Partial<Prefs>;
  tz?: string;
  inbound?: Partial<{
    enabled: boolean;
    target: InboundTarget;
    folderId: string | null;
    emailFolderId: string | null;
    taskType: 'tech' | 'mgmt';
    senders: string[];
  }>;
};

export async function updateNotifySettings(auth: AuthContext, patch: NotifySettingsPatch) {
  if (patch.tz !== undefined && !validTz(patch.tz)) throw new ApiError(400, 'invalid_tz');
  const prefsPatch = patch.prefs ? NotifyPrefs.partial().parse(patch.prefs) : undefined;
  if (patch.inbound && !inboundConfigured()) throw new ApiError(404, 'inbound_not_configured');
  if (patch.inbound?.target === 'email') await requireModule(auth.tenant.id, 'emails');
  return asUser(auth, async (tx) => {
    const cur = await ensureRow(tx, auth);
    const set: Partial<typeof notifySettings.$inferInsert> = { updatedAt: new Date() };
    if (prefsPatch) set.prefs = { ...notifyPrefs(cur.prefs), ...prefsPatch };
    if (patch.tz !== undefined) set.tz = patch.tz;
    const ib = patch.inbound;
    if (ib) {
      if (ib.enabled !== undefined) set.inboundEnabled = ib.enabled;
      if (ib.enabled && !cur.inboundToken) await setCode(tx, newToken());
      if (ib.target !== undefined) set.inboundTarget = ib.target;
      if (ib.taskType !== undefined) set.inboundTaskType = ib.taskType;
      if (ib.folderId !== undefined) {
        if (ib.folderId) {
          const [f] = await tx
            .select({ id: folders.id })
            .from(folders)
            .where(and(eq(folders.id, ib.folderId), eq(folders.kind, 'notes'), isNull(folders.deletedAt)));
          if (!f) throw new ApiError(404, 'folder_not_found');
        }
        set.inboundFolderId = ib.folderId;
      }
      if (ib.emailFolderId !== undefined) {
        if (ib.emailFolderId) {
          const [f] = await tx
            .select({ id: folders.id })
            .from(folders)
            .where(
              and(eq(folders.id, ib.emailFolderId), eq(folders.kind, 'emails'), isNull(folders.deletedAt)),
            );
          if (!f) throw new ApiError(404, 'folder_not_found');
        }
        set.inboundEmailFolderId = ib.emailFolderId;
      }
      if (ib.senders !== undefined)
        set.inboundSenders = [
          ...new Set(ib.senders.map((s) => s.trim().toLowerCase()).filter(Boolean)),
        ].slice(0, 20);
    }
    await tx.update(notifySettings).set(set).where(eq(notifySettings.userId, auth.user.id));
    return viewTx(tx, auth);
  });
}

// ── Inbound address codes ──────────────────────────────────────────────────
/**
 * Gives the transaction's user this code through kh_inbound_set_code (0047):
 * false when someone else has it or left it less than 30 days ago. Their old
 * code stops working at once and stays reserved for them.
 */
async function setCode(tx: Tx, code: string): Promise<boolean> {
  try {
    // in a savepoint: a failure leaves the surrounding transaction usable
    return await tx.transaction(async (sp) => {
      const [r] = await sp.execute<{ ok: boolean }>(sql`select kh_inbound_set_code(${code}) as ok`);
      return !!r?.ok;
    });
  } catch (e) {
    // the unique index is the last word (the function's locks make this unreachable)
    if ((e as { code?: string; cause?: { code?: string } })?.cause?.code === '23505') return false;
    if ((e as { code?: string })?.code === '23505') return false;
    throw e;
  }
}

/** A new random inbound address: the old one stops working at once (reserved for 30 days). */
export async function regenerateInboundToken(auth: AuthContext) {
  if (!inboundConfigured()) throw new ApiError(404, 'inbound_not_configured');
  return asUser(auth, async (tx) => {
    await ensureRow(tx, auth);
    // 100 random bits: a clash is next to impossible, but try again rather than fail
    for (let i = 0; i < 3 && !(await setCode(tx, newToken())); i++);
    return viewTx(tx, auth);
  });
}

export type CodeStatus = 'available' | 'taken' | 'invalid' | 'reserved';

/** Is this code this person's own (current, or one they left less than 30 days ago)? */
async function ownCode(tx: Tx, code: string) {
  // RLS: the caller's own row only
  const [cur] = await tx.select({ c: notifySettings.inboundToken }).from(notifySettings).limit(1);
  if (cur?.c === code) return true;
  return (await ownReserved(tx)).some((r) => r.code === code);
}

/**
 * Why a code can't be taken by this person, or null. A chosen code follows
 * the rules of inboundCodeProblem; an old code of their own (an old random
 * token, say) may always be taken back while it is reserved for them.
 */
async function codeStatus(tx: Tx, code: string): Promise<CodeStatus> {
  const problem = inboundCodeProblem(code);
  if (problem && !(isInboundCode(code) && (await ownCode(tx, code)))) return problem;
  const [r] = await tx.execute<{ free: boolean }>(sql`select kh_inbound_code_free(${code}) as free`);
  return r?.free ? 'available' : 'taken';
}

/** The availability check while typing: only available / taken / invalid / reserved. */
export async function checkInboundCode(auth: AuthContext, raw: string): Promise<CodeStatus> {
  if (!inboundConfigured()) throw new ApiError(404, 'inbound_not_configured');
  const code = normalizeInboundCode(raw);
  if (code.length > 64) return 'invalid';
  return asUser(auth, (tx) => codeStatus(tx, code));
}

/** The person's own code (or back to a reserved one). 409 code_taken when someone else has it. */
export async function setInboundCode(auth: AuthContext, raw: string) {
  if (!inboundConfigured()) throw new ApiError(404, 'inbound_not_configured');
  const code = normalizeInboundCode(raw);
  if (code.length > 64) throw new ApiError(400, 'invalid_code');
  return asUser(auth, async (tx) => {
    await ensureRow(tx, auth);
    const st = await codeStatus(tx, code);
    if (st === 'invalid') throw new ApiError(400, 'invalid_code');
    if (st === 'reserved') throw new ApiError(400, 'reserved_code');
    if (st === 'taken' || !(await setCode(tx, code))) throw new ApiError(409, 'code_taken');
    return viewTx(tx, auth);
  });
}

/** Retention (daily job): reservations older than 30 days become free for anyone. */
export async function pruneReleasedInboundCodes() {
  const [r] = await db().execute<{ n: number }>(sql`select kh_prune_inbound_codes() as n`);
  return r?.n ?? 0;
}
