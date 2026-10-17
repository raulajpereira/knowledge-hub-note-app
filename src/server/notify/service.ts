import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { folders, notifications, notifySettings, NOTIFY_KINDS } from '@/db/schema';
import { env } from '@/lib/env';
import {
  inboundAddress,
  inboundToken,
  notifyPrefs,
  validTz,
  NotifyPrefs,
  type NotifyPrefs as Prefs,
} from '@/lib/notify';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { asUser, type Tx } from '@/server/content/tenant';

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

/** Adds one notification for the transaction's user; a repeated key is a no-op. True when it was new. */
export async function addNotification(
  tx: Tx,
  auth: { tenantId: string; userId: string },
  n: { kind: NotifyKind; itemType: string; itemId: string | null; title: string; meta?: object; key: string },
): Promise<boolean> {
  const r = await tx
    .insert(notifications)
    .values({
      tenantId: auth.tenantId,
      userId: auth.userId,
      kind: n.kind,
      itemType: n.itemType,
      itemId: n.itemId,
      title: n.title.slice(0, 300) || '—',
      meta: n.meta ?? {},
      dedupeKey: n.key.slice(0, 200),
    })
    .onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] })
    .returning({ id: notifications.id });
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

export type NotifySettingsView = {
  prefs: Prefs;
  tz: string;
  inbound: null | {
    address: string | null;
    enabled: boolean;
    target: 'note' | 'task';
    folderId: string | null;
    taskType: 'tech' | 'mgmt';
    senders: string[];
  };
};

const newToken = () => inboundToken(randomBytes(16));

async function ensureRow(tx: Tx, auth: AuthContext) {
  await tx
    .insert(notifySettings)
    .values({ userId: auth.user.id, tenantId: auth.tenant.id })
    .onConflictDoNothing();
  const [row] = await tx.select().from(notifySettings).where(eq(notifySettings.userId, auth.user.id));
  return row!;
}

function view(row: typeof notifySettings.$inferSelect, auth: AuthContext): NotifySettingsView {
  return {
    prefs: notifyPrefs(row.prefs),
    tz: row.tz,
    inbound: inboundConfigured()
      ? {
          address: row.inboundToken ? inboundAddress(env().INBOUND_ADDRESS!, row.inboundToken) : null,
          enabled: row.inboundEnabled,
          target: row.inboundTarget,
          folderId: row.inboundFolderId,
          taskType: row.inboundTaskType,
          senders: row.inboundSenders.length ? row.inboundSenders : [auth.user.email],
        }
      : null,
  };
}

export async function getNotifySettings(auth: AuthContext): Promise<NotifySettingsView> {
  const row = await asUser(auth, async (tx) => {
    const [r] = await tx.select().from(notifySettings).where(eq(notifySettings.userId, auth.user.id));
    return r;
  });
  if (row) return view(row, auth);
  return {
    prefs: notifyPrefs({}),
    tz: 'Europe/Lisbon',
    inbound: inboundConfigured()
      ? {
          address: null,
          enabled: false,
          target: 'note',
          folderId: null,
          taskType: 'tech',
          senders: [auth.user.email],
        }
      : null,
  };
}

export type NotifySettingsPatch = {
  prefs?: Partial<Prefs>;
  tz?: string;
  inbound?: Partial<{
    enabled: boolean;
    target: 'note' | 'task';
    folderId: string | null;
    taskType: 'tech' | 'mgmt';
    senders: string[];
  }>;
};

export async function updateNotifySettings(auth: AuthContext, patch: NotifySettingsPatch) {
  if (patch.tz !== undefined && !validTz(patch.tz)) throw new ApiError(400, 'invalid_tz');
  const prefsPatch = patch.prefs ? NotifyPrefs.partial().parse(patch.prefs) : undefined;
  if (patch.inbound && !inboundConfigured()) throw new ApiError(404, 'inbound_not_configured');
  return asUser(auth, async (tx) => {
    const cur = await ensureRow(tx, auth);
    const set: Partial<typeof notifySettings.$inferInsert> = { updatedAt: new Date() };
    if (prefsPatch) set.prefs = { ...notifyPrefs(cur.prefs), ...prefsPatch };
    if (patch.tz !== undefined) set.tz = patch.tz;
    const ib = patch.inbound;
    if (ib) {
      if (ib.enabled !== undefined) set.inboundEnabled = ib.enabled;
      if (ib.enabled && !cur.inboundToken) set.inboundToken = newToken();
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
      if (ib.senders !== undefined)
        set.inboundSenders = [
          ...new Set(ib.senders.map((s) => s.trim().toLowerCase()).filter(Boolean)),
        ].slice(0, 20);
    }
    const [row] = await tx
      .update(notifySettings)
      .set(set)
      .where(eq(notifySettings.userId, auth.user.id))
      .returning();
    return view(row!, auth);
  });
}

/** A new inbound address: the old one stops working at once. */
export async function regenerateInboundToken(auth: AuthContext) {
  if (!inboundConfigured()) throw new ApiError(404, 'inbound_not_configured');
  return asUser(auth, async (tx) => {
    await ensureRow(tx, auth);
    const [row] = await tx
      .update(notifySettings)
      .set({ inboundToken: newToken(), updatedAt: new Date() })
      .where(eq(notifySettings.userId, auth.user.id))
      .returning();
    return view(row!, auth);
  });
}
