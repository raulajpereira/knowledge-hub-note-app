import 'server-only';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { helpdeskChanges, helpdeskItems, helpdeskSources, type HdSnapshot } from '@/db/schema';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { createSession, resolveSession } from '@/server/auth/session';
import { assertWritable } from '@/server/auth/request';
import { asUser, type Tx } from '@/server/content/tenant';
import { addNotification } from '@/server/notify/service';
import { entitlementsFor, requireModuleFor } from '@/server/workspaces';
import { createTicket } from '@/server/content/tickets';
import {
  guessHdMapping,
  HD_FIELDS,
  HD_INTERVALS,
  HD_MAX_CELL,
  HD_MAX_COLS,
  HD_MAX_ROWS,
  HD_ON_MISSING,
  HD_TRACKED,
  readRow,
  type HdMapping,
  type HdRow,
} from '@/lib/helpdesk';

// "Helpdesk" (SAP). The browser extension reads the linked helpdesk page with
// the person's own login there and sends the table; here it becomes tickets
// (helpdesk_items) and, against the previous read, "modificações"
// (helpdesk_changes): new tickets, changed fields, a new comment, tickets
// that left the page or came back. Each read with changes is one notification
// (bell + push) and one popup in the app.

const EXT_TTL_MS = 180 * 24 * 3600 * 1000;

const cell = z.string().max(HD_MAX_CELL * 4);
const header = z.string().trim().max(120);
export const SnapshotZ = z
  .object({
    url: z.url().max(2000),
    title: z.string().max(300).optional(),
    headers: z.array(header).min(1).max(HD_MAX_COLS),
    rows: z.array(z.array(cell).max(HD_MAX_COLS)).max(HD_MAX_ROWS),
    links: z
      .array(z.array(z.string().max(2000).nullable()).max(HD_MAX_COLS))
      .max(HD_MAX_ROWS)
      .optional(),
  })
  .refine((s) => /^https?:/i.test(s.url), 'url');
export const SyncZ = z.union([
  SnapshotZ,
  z.object({ error: z.enum(['session', 'no_table']), url: z.string().max(2000).optional() }),
]);
export const MappingZ = z.record(header, z.enum(HD_FIELDS));
export const SourcePatch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  intervalMin: z
    .number()
    .int()
    .refine((n) => (HD_INTERVALS as readonly number[]).includes(n), 'interval')
    .optional(),
  onMissing: z.enum(HD_ON_MISSING).optional(),
  mapping: MappingZ.optional(),
  paused: z.boolean().optional(),
});

export type HdSource = {
  id: string;
  name: string;
  url: string;
  intervalMin: number;
  onMissing: 'notify' | 'nothing';
  mapping: HdMapping;
  active: boolean;
  paused: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  syncRequestedAt: string | null;
  headers: string[];
  sample: string[][];
  rowCount: number;
};
export type HdItem = Omit<HdRow, 'cells'> & {
  id: string;
  sourceId: string;
  cells: Record<string, string>;
  inList: boolean;
  firstSeenAt: string;
  goneAt: string | null;
  ticketId: string | null;
};
export type HdChange = {
  id: string;
  sourceId: string;
  itemId: string;
  number: string;
  summary: string;
  kind: 'new' | 'field' | 'comment' | 'gone' | 'back';
  field: string;
  from: string;
  to: string;
  syncAt: string;
  seen: boolean;
};

type SRow = typeof helpdeskSources.$inferSelect;
type IRow = typeof helpdeskItems.$inferSelect;
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const sourceOut = (r: SRow): HdSource => ({
  id: r.id,
  name: r.name,
  url: r.url,
  intervalMin: r.intervalMin,
  onMissing: r.onMissing,
  mapping: r.mapping,
  active: r.active,
  paused: r.paused,
  lastSyncAt: iso(r.lastSyncAt),
  lastError: r.lastError,
  lastErrorAt: iso(r.lastErrorAt),
  syncRequestedAt: iso(r.syncRequestedAt),
  headers: r.snapshot?.headers ?? [],
  sample: r.snapshot?.rows.slice(0, 3) ?? [],
  rowCount: r.snapshot?.rows.length ?? 0,
});
const itemOut = (r: IRow): HdItem => ({
  id: r.id,
  sourceId: r.sourceId,
  number: r.number,
  summary: r.summary,
  parent: r.parent,
  assignee: r.assignee,
  status: r.status,
  priority: r.priority,
  type: r.type,
  client: r.client,
  reportedBy: r.reportedBy,
  reportedAt: r.reportedAt,
  commentBy: r.commentBy,
  commentAt: r.commentAt,
  url: r.url,
  cells: r.cells,
  inList: r.inList,
  firstSeenAt: r.firstSeenAt.toISOString(),
  goneAt: iso(r.goneAt),
  ticketId: r.ticketId,
});
const changeOut = (r: typeof helpdeskChanges.$inferSelect): HdChange => ({
  id: r.id,
  sourceId: r.sourceId,
  itemId: r.itemId,
  number: r.number,
  summary: r.summary,
  kind: r.kind,
  field: r.field,
  from: r.fromValue,
  to: r.toValue,
  syncAt: r.syncAt.toISOString(),
  seen: !!r.seenAt,
});

// ------------------------------------------------------------ the extension

/** "Ligar a extensão": a sign-in only the extension's routes accept (listed in the account's sessions). */
export async function pairExtension(auth: AuthContext, meta: { ip: string | null }) {
  const s = await createSession(auth.user.id, {
    remember: true,
    scope: 'ext',
    ttlMs: EXT_TTL_MS,
    ip: meta.ip,
    userAgent: 'KnowledgeHub — extensão do browser (Helpdesk)',
  });
  return { token: s.token, expiresAt: s.expiresAt.toISOString() };
}

/** The person behind the extension's token (Authorization: Bearer …), with Helpdesk in their plan. */
export async function extAuth(req: Request): Promise<AuthContext> {
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,100})$/.exec(req.headers.get('authorization') ?? '');
  const auth = m ? await resolveSession(m[1], 'ext') : null;
  if (!auth) throw new ApiError(401, 'unauthenticated');
  assertWritable(auth);
  await requireModuleFor(auth, 'helpdesk');
  return auth;
}

const snap = (s: z.infer<typeof SnapshotZ>): HdSnapshot => {
  const n = s.headers.length;
  const fit = <T>(r: T[], fill: T) => Array.from({ length: n }, (_, i) => r[i] ?? fill);
  return {
    headers: s.headers.map((h, i) => h || `Coluna ${i + 1}`),
    rows: s.rows.map((r) => fit(r, '').map((c) => c.replace(/\s+/g, ' ').trim().slice(0, HD_MAX_CELL))),
    links: (s.links ?? s.rows.map(() => [])).map((r) => fit(r, null)),
    at: new Date().toISOString(),
  };
};

/** "Ligar esta lista": the page as read; a new link (to set up in the app) or the same one again. */
export function receiveSnapshot(auth: AuthContext, input: z.infer<typeof SnapshotZ>) {
  const sn = snap(input);
  return asUser(auth, async (tx) => {
    const [cur] = await tx.select().from(helpdeskSources).where(eq(helpdeskSources.url, input.url));
    if (cur) {
      const mapping = Object.keys(cur.mapping).length ? cur.mapping : guessHdMapping(sn.headers);
      await tx
        .update(helpdeskSources)
        .set({ snapshot: sn, mapping, updatedAt: new Date() })
        .where(eq(helpdeskSources.id, cur.id));
      return { id: cur.id, active: cur.active };
    }
    const name = (input.title || new URL(input.url).host).slice(0, 120);
    const [r] = await tx
      .insert(helpdeskSources)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        name,
        url: input.url,
        mapping: guessHdMapping(sn.headers),
        snapshot: sn,
      })
      .returning({ id: helpdeskSources.id });
    return { id: r!.id, active: false };
  });
}

/** What the extension reads, and when. */
export function extSources(auth: AuthContext) {
  return asUser(auth, async (tx) =>
    (
      await tx
        .select()
        .from(helpdeskSources)
        .where(and(eq(helpdeskSources.active, true), eq(helpdeskSources.paused, false)))
    ).map((r) => ({
      id: r.id,
      name: r.name,
      url: r.url,
      intervalMin: r.intervalMin,
      lastSyncAt: iso(r.lastSyncAt),
      syncRequestedAt: iso(r.syncRequestedAt),
    })),
  );
}

// ---------------------------------------------------------------- the diff

type Plan = {
  rows: HdRow[];
  fresh: HdRow[];
  changed: Array<{
    row: HdRow;
    item: IRow;
    fields: Array<[string, string, string]>;
    comment: boolean;
    back: boolean;
  }>;
  same: number;
  gone: IRow[];
};

function readAll(sn: HdSnapshot, mapping: HdMapping): HdRow[] {
  const seen = new Set<string>();
  const out: HdRow[] = [];
  sn.rows.forEach((r, i) => {
    const row = readRow(sn.headers, r, mapping, sn.links[i]);
    if (row && !seen.has(row.number)) {
      seen.add(row.number);
      out.push(row);
    }
  });
  return out;
}

async function plan(tx: Tx, src: SRow, sn: HdSnapshot, mapping: HdMapping): Promise<Plan> {
  const rows = readAll(sn, mapping);
  const items = await tx.select().from(helpdeskItems).where(eq(helpdeskItems.sourceId, src.id));
  const by = new Map(items.map((i) => [i.number, i]));
  const p: Plan = { rows, fresh: [], changed: [], same: 0, gone: [] };
  const present = new Set(rows.map((r) => r.number));
  for (const row of rows) {
    const item = by.get(row.number);
    if (!item) {
      p.fresh.push(row);
      continue;
    }
    const fields: Array<[string, string, string]> = [];
    for (const f of HD_TRACKED) if (row[f] !== item[f]) fields.push([f, item[f], row[f]]);
    const comment =
      !!(row.commentBy || row.commentAt) &&
      (row.commentBy !== item.commentBy || row.commentAt !== item.commentAt);
    const back = !item.inList;
    if (fields.length || comment || back) p.changed.push({ row, item, fields, comment, back });
    else p.same++;
  }
  p.gone = items.filter((i) => i.inList && !present.has(i.number));
  return p;
}

const values = (r: HdRow) => ({
  summary: r.summary,
  parent: r.parent,
  assignee: r.assignee,
  status: r.status,
  priority: r.priority,
  type: r.type,
  client: r.client,
  reportedBy: r.reportedBy,
  reportedAt: r.reportedAt,
  commentBy: r.commentBy,
  commentAt: r.commentAt,
  url: r.url,
  cells: r.cells,
});

/** Applies a read: items created / updated / marked gone, and the changes kept. */
async function apply(tx: Tx, auth: AuthContext, src: SRow, sn: HdSnapshot, first: boolean) {
  const p = await plan(tx, src, sn, src.mapping);
  const now = new Date();
  const base = { tenantId: auth.tenant.id, ownerId: auth.user.id, sourceId: src.id, syncAt: now };
  const changes: Array<typeof helpdeskChanges.$inferInsert> = [];
  for (const row of p.fresh) {
    const [it] = await tx
      .insert(helpdeskItems)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        sourceId: src.id,
        number: row.number,
        ...values(row),
      })
      .onConflictDoNothing()
      .returning({ id: helpdeskItems.id });
    if (it)
      changes.push({
        ...base,
        itemId: it.id,
        number: row.number,
        summary: row.summary,
        kind: 'new',
        toValue: row.status,
        // the first import is not news
        seenAt: first ? now : null,
      });
  }
  for (const c of p.changed) {
    await tx
      .update(helpdeskItems)
      .set({ ...values(c.row), inList: true, goneAt: null, lastSeenAt: now, updatedAt: now })
      .where(eq(helpdeskItems.id, c.item.id));
    const at = {
      ...base,
      itemId: c.item.id,
      number: c.row.number,
      summary: c.row.summary,
      seenAt: first ? now : null,
    };
    if (c.back) changes.push({ ...at, kind: 'back' });
    for (const [field, from, to] of c.fields)
      changes.push({ ...at, kind: 'field', field, fromValue: from.slice(0, 600), toValue: to.slice(0, 600) });
    if (c.comment)
      changes.push({
        ...at,
        kind: 'comment',
        fromValue: c.row.commentBy.slice(0, 600),
        toValue: c.row.commentAt.slice(0, 600),
      });
  }
  if (p.same)
    await tx
      .update(helpdeskItems)
      .set({ lastSeenAt: now })
      .where(
        and(
          eq(helpdeskItems.sourceId, src.id),
          inArray(
            helpdeskItems.number,
            p.rows.map((r) => r.number),
          ),
        ),
      );
  if (p.gone.length) {
    await tx
      .update(helpdeskItems)
      .set({ inList: false, goneAt: now, updatedAt: now })
      .where(
        inArray(
          helpdeskItems.id,
          p.gone.map((g) => g.id),
        ),
      );
    if (src.onMissing === 'notify')
      for (const g of p.gone)
        changes.push({
          ...base,
          itemId: g.id,
          number: g.number,
          summary: g.summary,
          kind: 'gone',
          seenAt: first ? now : null,
        });
  }
  if (changes.length) await tx.insert(helpdeskChanges).values(changes);
  const news = changes.filter((c) => !c.seenAt);
  if (news.length && !first) {
    const items = new Set(news.map((c) => c.itemId)).size;
    await addNotification(
      tx,
      { tenantId: auth.tenant.id, userId: auth.user.id },
      {
        kind: 'helpdesk',
        itemType: 'helpdesk',
        itemId: src.id,
        title: `${src.name}: ${[...new Set(news.map((c) => `#${c.number}`))].slice(0, 3).join(', ')}${items > 3 ? '…' : ''}`,
        meta: { n: String(items), source: src.name },
        key: `hd:${src.id}:${now.toISOString()}`,
      },
    );
  }
  return {
    created: p.fresh.length,
    updated: p.changed.length,
    same: p.same,
    gone: p.gone.length,
    changes: news.length,
  };
}

/** A read from the extension (every few minutes): the diff, or the problem it met. */
export function syncSource(auth: AuthContext, id: string, input: z.infer<typeof SyncZ>) {
  return asUser(auth, async (tx) => {
    const [src] = await tx.select().from(helpdeskSources).where(eq(helpdeskSources.id, id));
    if (!src || !src.active) throw new ApiError(404, 'not_found');
    const now = new Date();
    if ('error' in input) {
      // one notification per problem until it goes away
      if (src.lastError !== input.error && input.error === 'session')
        await addNotification(
          tx,
          { tenantId: auth.tenant.id, userId: auth.user.id },
          {
            kind: 'helpdesk',
            itemType: 'helpdesk',
            itemId: src.id,
            title: src.name,
            meta: { error: 'session', source: src.name },
            key: `hd:${src.id}:session:${now.toISOString().slice(0, 10)}`,
          },
        );
      await tx
        .update(helpdeskSources)
        .set({ lastError: input.error, lastErrorAt: now, syncRequestedAt: null })
        .where(eq(helpdeskSources.id, id));
      return { ok: false as const, error: input.error };
    }
    const sn = snap(input);
    // an empty page where there were tickets: most likely not loaded, never "everything left"
    const inList = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(helpdeskItems)
      .where(and(eq(helpdeskItems.sourceId, id), eq(helpdeskItems.inList, true)));
    if (!sn.rows.length && (inList[0]?.n ?? 0) > 0) {
      await tx
        .update(helpdeskSources)
        .set({ lastError: 'no_table', lastErrorAt: now, syncRequestedAt: null })
        .where(eq(helpdeskSources.id, id));
      return { ok: false as const, error: 'no_table' };
    }
    const r = await apply(tx, auth, src, sn, false);
    await tx
      .update(helpdeskSources)
      .set({ snapshot: sn, lastSyncAt: now, lastError: null, lastErrorAt: null, syncRequestedAt: null })
      .where(eq(helpdeskSources.id, id));
    return { ok: true as const, ...r };
  });
}

// ------------------------------------------------------------------- the app

async function one(tx: Tx, id: string) {
  const [r] = await tx.select().from(helpdeskSources).where(eq(helpdeskSources.id, id));
  if (!r) throw new ApiError(404, 'not_found');
  return r;
}

export function overview(auth: AuthContext) {
  return asUser(auth, async (tx) => {
    const sources = await tx.select().from(helpdeskSources).orderBy(helpdeskSources.createdAt);
    const items = await tx
      .select()
      .from(helpdeskItems)
      .orderBy(desc(helpdeskItems.inList), desc(helpdeskItems.firstSeenAt))
      .limit(2000);
    const changes = await tx
      .select()
      .from(helpdeskChanges)
      .orderBy(desc(helpdeskChanges.createdAt))
      .limit(300);
    return { sources: sources.map(sourceOut), items: items.map(itemOut), changes: changes.map(changeOut) };
  });
}

export function getSource(auth: AuthContext, id: string) {
  return asUser(auth, async (tx) => sourceOut(await one(tx, id)));
}

export function updateSource(auth: AuthContext, id: string, input: z.infer<typeof SourcePatch>) {
  return asUser(auth, async (tx) => {
    await one(tx, id);
    const [r] = await tx
      .update(helpdeskSources)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(helpdeskSources.id, id))
      .returning();
    return sourceOut(r!);
  });
}

/** "Sincronizar agora": the extension reads it at its next minute. */
export function requestSync(auth: AuthContext, id: string) {
  return asUser(auth, async (tx) => {
    await one(tx, id);
    await tx.update(helpdeskSources).set({ syncRequestedAt: new Date() }).where(eq(helpdeskSources.id, id));
  });
}

/** What the last read would do with this mapping (first import / mapping changed). */
export function previewSource(auth: AuthContext, id: string, mapping: HdMapping) {
  return asUser(auth, async (tx) => {
    const src = await one(tx, id);
    if (!src.snapshot) throw new ApiError(409, 'no_snapshot');
    const p = await plan(tx, src, src.snapshot, mapping);
    return {
      fresh: p.fresh.slice(0, 200),
      changed: p.changed.slice(0, 200).map((c) => ({ row: c.row, fields: c.fields, comment: c.comment })),
      counts: { fresh: p.fresh.length, changed: p.changed.length, same: p.same, gone: p.gone.length },
      skipped: src.snapshot.rows.length - p.rows.length,
    };
  });
}

/** "Importar": the last read applied with the mapping; the link becomes active (the extension reads it). */
export function importSource(auth: AuthContext, id: string, input: z.infer<typeof SourcePatch>) {
  return asUser(auth, async (tx) => {
    const cur = await one(tx, id);
    if (!cur.snapshot) throw new ApiError(409, 'no_snapshot');
    const [src] = await tx
      .update(helpdeskSources)
      .set({ ...input, active: true, paused: false, updatedAt: new Date() })
      .where(eq(helpdeskSources.id, id))
      .returning();
    const r = await apply(tx, auth, src!, cur.snapshot, !cur.active);
    await tx
      .update(helpdeskSources)
      .set({ lastSyncAt: new Date(), lastError: null })
      .where(eq(helpdeskSources.id, id));
    return r;
  });
}

export function unseenChanges(auth: AuthContext) {
  return asUser(auth, async (tx) =>
    (
      await tx
        .select()
        .from(helpdeskChanges)
        .where(isNull(helpdeskChanges.seenAt))
        .orderBy(desc(helpdeskChanges.createdAt))
        .limit(100)
    ).map(changeOut),
  );
}

export function markSeen(auth: AuthContext, ids: string[] | 'all') {
  return asUser(auth, async (tx) => {
    await tx
      .update(helpdeskChanges)
      .set({ seenAt: new Date() })
      .where(
        ids === 'all'
          ? isNull(helpdeskChanges.seenAt)
          : and(isNull(helpdeskChanges.seenAt), inArray(helpdeskChanges.id, ids)),
      );
  });
}

const STATUS: Array<
  [RegExp, 'open' | 'progress' | 'pending_customer' | 'resolved' | 'closed' | 'cancelled' | 'on_hold']
> = [
  [/pendente.?cl|pending.?cust/i, 'pending_customer'],
  [/progress/i, 'progress'],
  [/resolv/i, 'resolved'],
  [/fechad|closed/i, 'closed'],
  [/cancel|anulad/i, 'cancelled'],
  [/espera|hold|suspens/i, 'on_hold'],
];
const PRIORITY: Array<[RegExp, 'very_low' | 'low' | 'medium' | 'high' | 'very_high']> = [
  [/muito baixa|very low/i, 'very_low'],
  [/muito alta|very high|cr[ií]tic|urgent/i, 'very_high'],
  [/baixa|low/i, 'low'],
  [/alta|high/i, 'high'],
  [/m[eé]dia|medium|normal/i, 'medium'],
];

/** "2026-11-16 11:20" (Lisbon) → the ticket's "Aberto em"; nothing when it isn't a date. */
function openedAt(s: string): { openedAt?: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(s);
  if (!m) return {};
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '09'}:${m[5] ?? '00'}:00Z`);
  return Number.isNaN(d.getTime()) ? {} : { openedAt: d.toISOString() };
}

/** "Criar ticket": a copy in Tickets (number, summary, client, responsible, state, priority, parent). */
export async function itemToTicket(auth: AuthContext, itemId: string) {
  if (!(await entitlementsFor(auth)).modules.includes('tickets'))
    throw new ApiError(403, 'module_not_included', undefined, { module: 'tickets' });
  const item = await asUser(auth, async (tx) => {
    const [r] = await tx.select().from(helpdeskItems).where(eq(helpdeskItems.id, itemId));
    if (!r) throw new ApiError(404, 'not_found');
    return r;
  });
  if (item.ticketId) return { ticketId: item.ticketId };
  const parent = /^#?\s*(\S+)\s*(.*)$/.exec(item.parent);
  const t = await createTicket(auth, {
    number: item.number,
    summary: item.summary.slice(0, 300) || item.number,
    status: STATUS.find(([re]) => re.test(item.status))?.[1] ?? 'open',
    priority: PRIORITY.find(([re]) => re.test(item.priority))?.[1] ?? 'medium',
    clientName: item.client.slice(0, 120),
    responsibleName: item.assignee.slice(0, 120),
    parentNumber: parent?.[1]?.slice(0, 40) ?? '',
    parentSummary: parent?.[2]?.slice(0, 300) ?? '',
    ...openedAt(item.reportedAt),
  });
  await asUser(auth, (tx) =>
    tx.update(helpdeskItems).set({ ticketId: t.id }).where(eq(helpdeskItems.id, itemId)),
  );
  return { ticketId: t.id };
}
