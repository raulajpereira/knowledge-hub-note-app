import 'server-only';
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import {
  itemLinks,
  mgClients,
  mgPeople,
  sharedFolders,
  ticketAttachments,
  ticketEvents,
  tickets,
  ticketTypes,
} from '@/db/schema';
import { env } from '@/lib/env';
import { s3 } from '@/lib/storage';
import { redis } from '@/lib/redis';
import { randomToken } from '@/lib/crypto';
import { cleanName, UPLOAD_PART } from '@/lib/drive';
import {
  cleanNumber,
  DEFAULT_TYPES,
  RESOLVED_STATUSES,
  TICKET_LIMITS,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/tickets';
import { ApiError } from '@/server/errors';
import { sniffImage } from '@/server/assets';
import { safeFetchBytes } from '@/server/net/safeFetch';
import type { AuthContext } from '@/server/auth/session';
import { asSharer, asUser, removeFilesAfterCommit, type Tx } from './tenant';
import { checkKindFolder, listKindFolders, type KindFolder } from './kindFolders';
import { limitsTx, readObject } from './drive';
import { docText, validateDoc, type PMNode } from './doc';

// Tickets (SAP › Tickets): a person's support tickets. The owner's own rows
// run under asUser; a ticket of a shared folder is read and edited by its
// members under asSharer (RLS decides: 'read' members only read, 'edit'
// members change fields, comment and attach). Moving, trashing and linking
// stay the owner's. Every status / priority / responsible change is logged in
// the history with who did it.

export type TicketType = { id: string; name: string; sort: number };
export type Ticket = {
  id: string;
  folderId: string | null;
  sharedFolderId: string | null;
  /** false for a ticket of someone else seen through a shared folder */
  mine: boolean;
  number: string;
  summary: string;
  parentNumber: string;
  parentSummary: string;
  clientId: string | null;
  clientName: string;
  priority: TicketPriority;
  typeId: string | null;
  status: TicketStatus;
  responsibleId: string | null;
  responsibleName: string;
  openedAt: string;
  dueOn: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type TicketEvent = {
  id: string;
  kind: 'created' | 'comment' | 'status' | 'priority' | 'responsible';
  from: string;
  to: string;
  body: string;
  author: string;
  mine: boolean;
  at: string;
};
export type TicketFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
  author: string;
  mine: boolean;
  createdAt: string;
};
export type TicketPerm = 'owner' | 'edit' | 'read';
export type TicketFull = Ticket & {
  notesDoc: PMNode | null;
  events: TicketEvent[];
  files: TicketFile[];
  perm: TicketPerm;
  /** the owner's type list (what applies to this ticket) */
  types: TicketType[];
};

const cols = {
  id: tickets.id,
  tenantId: tickets.tenantId,
  ownerId: tickets.ownerId,
  folderId: tickets.folderId,
  sharedFolderId: tickets.sharedFolderId,
  number: tickets.number,
  summary: tickets.summary,
  parentNumber: tickets.parentNumber,
  parentSummary: tickets.parentSummary,
  clientId: tickets.clientId,
  clientName: tickets.clientName,
  priority: tickets.priority,
  typeId: tickets.typeId,
  status: tickets.status,
  responsibleId: tickets.responsibleId,
  responsibleName: tickets.responsibleName,
  openedAt: tickets.openedAt,
  dueOn: tickets.dueOn,
  resolvedAt: tickets.resolvedAt,
  createdAt: tickets.createdAt,
  updatedAt: tickets.updatedAt,
};
type Row = typeof tickets.$inferSelect;
type ListRow = Pick<Row, keyof typeof cols>;
const toTicket = (r: ListRow, me: string): Ticket => ({
  id: r.id,
  folderId: r.folderId,
  sharedFolderId: r.sharedFolderId,
  mine: r.ownerId === me,
  number: r.number,
  summary: r.summary,
  parentNumber: r.parentNumber,
  parentSummary: r.parentSummary,
  clientId: r.clientId,
  clientName: r.clientName,
  priority: r.priority,
  typeId: r.typeId,
  status: r.status,
  responsibleId: r.responsibleId,
  responsibleName: r.responsibleName,
  openedAt: r.openedAt.toISOString(),
  dueOn: r.dueOn,
  resolvedAt: r.resolvedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

/** A unique-index refusal on the number → the friendly error of the form. */
function numberTaken(e: unknown): never {
  const x = e as { code?: string; cause?: { code?: string } };
  if ((x.code ?? x.cause?.code) === '23505') throw new ApiError(409, 'ticket_number_taken');
  throw e;
}
const notMine = (auth: AuthContext, r: Pick<Row, 'tenantId' | 'ownerId'>) =>
  r.ownerId !== auth.user.id || r.tenantId !== auth.tenant.id;

// ── Types ("Tipo") ─────────────────────────────────────────────────────────
const typeCols = { id: ticketTypes.id, name: ticketTypes.name, sort: ticketTypes.sort };

/** The caller's own list; started with the default types the first time. */
async function ownTypes(tx: Tx, auth: AuthContext): Promise<TicketType[]> {
  const rows = await tx
    .select(typeCols)
    .from(ticketTypes)
    .where(eq(ticketTypes.ownerId, auth.user.id))
    .orderBy(asc(ticketTypes.sort), asc(ticketTypes.createdAt));
  if (rows.length) return rows;
  await tx
    .insert(ticketTypes)
    .values(
      DEFAULT_TYPES[auth.user.lang].map((name, i) => ({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        name,
        sort: i,
      })),
    )
    .onConflictDoNothing();
  return tx
    .select(typeCols)
    .from(ticketTypes)
    .where(eq(ticketTypes.ownerId, auth.user.id))
    .orderBy(asc(ticketTypes.sort), asc(ticketTypes.createdAt));
}

export const listTypes = (auth: AuthContext) => asUser(auth, (tx) => ownTypes(tx, auth));

export async function createType(auth: AuthContext, name: string): Promise<TicketType> {
  return asUser(auth, async (tx) => {
    const cur = await ownTypes(tx, auth);
    if (cur.length >= TICKET_LIMITS.types) throw new ApiError(400, 'too_many_items');
    if (cur.some((x) => x.name.toLowerCase() === name.toLowerCase()))
      throw new ApiError(409, 'ticket_type_taken');
    const [r] = await tx
      .insert(ticketTypes)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        name,
        sort: Math.max(-1, ...cur.map((x) => x.sort)) + 1,
      })
      .returning(typeCols);
    return r!;
  });
}

export async function renameType(auth: AuthContext, id: string, name: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(ticketTypes)
      .set({ name })
      .where(eq(ticketTypes.id, id))
      .returning({ id: ticketTypes.id })
      .catch((e: { code?: string; cause?: { code?: string } }) => {
        if ((e.code ?? e.cause?.code) === '23505') throw new ApiError(409, 'ticket_type_taken');
        throw e;
      });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

/** Removing a type leaves its tickets without one; the last type stays (the list is never empty). */
export async function deleteType(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const cur = await ownTypes(tx, auth);
    if (!cur.some((x) => x.id === id)) throw new ApiError(404, 'not_found');
    if (cur.length <= 1) throw new ApiError(400, 'ticket_type_last');
    await tx.delete(ticketTypes).where(eq(ticketTypes.id, id));
  });
}

/** New order of the caller's types (ids in order; unknown ids are ignored). */
export async function orderTypes(auth: AuthContext, ids: string[]) {
  await asUser(auth, async (tx) => {
    for (const [i, id] of ids.entries())
      await tx.update(ticketTypes).set({ sort: i }).where(eq(ticketTypes.id, id));
  });
}

// ── List / read ────────────────────────────────────────────────────────────
export type TicketList = { tickets: Ticket[]; folders: KindFolder[]; types: TicketType[] };

/**
 * The caller's own tickets, folders and types; or (`sharedId`) the tickets of
 * a shared folder of someone else, with that owner's types.
 */
export async function listTickets(auth: AuthContext, sharedId?: string): Promise<TicketList> {
  if (!sharedId)
    return asUser(auth, async (tx) => {
      const rows = await tx
        .select(cols)
        .from(tickets)
        .where(isNull(tickets.deletedAt))
        .orderBy(desc(tickets.openedAt))
        .limit(TICKET_LIMITS.tickets);
      return {
        tickets: rows.map((r) => toTicket(r, auth.user.id)),
        folders: await listKindFolders(tx, 'tickets'),
        types: await ownTypes(tx, auth),
      };
    });
  return asSharer(auth, async (tx) => {
    const [sf] = await tx
      .select({ id: sharedFolders.id, ownerId: sharedFolders.ownerId, folderId: sharedFolders.folderId })
      .from(sharedFolders)
      .where(and(eq(sharedFolders.id, sharedId), eq(sharedFolders.kind, 'tickets')));
    if (!sf) throw new ApiError(404, 'not_found');
    const inFolder = sf.folderId
      ? or(eq(tickets.sharedFolderId, sf.id), eq(tickets.folderId, sf.folderId))
      : eq(tickets.sharedFolderId, sf.id);
    const rows = await tx
      .select(cols)
      .from(tickets)
      .where(and(isNull(tickets.deletedAt), inFolder))
      .orderBy(desc(tickets.openedAt))
      .limit(TICKET_LIMITS.tickets);
    const types =
      sf.ownerId === auth.user.id
        ? await ownTypes(tx, auth)
        : await tx
            .select(typeCols)
            .from(ticketTypes)
            .where(eq(ticketTypes.ownerId, sf.ownerId))
            .orderBy(asc(ticketTypes.sort), asc(ticketTypes.createdAt));
    return { tickets: rows.map((r) => toTicket(r, auth.user.id)), folders: [], types };
  });
}

async function permOf(tx: Tx, auth: AuthContext, r: Row): Promise<TicketPerm> {
  if (!notMine(auth, r)) return 'owner';
  const [x] = (await tx.execute(
    sql`select kh_share_perm('tickets', ${r.sharedFolderId}::uuid, ${r.folderId}::uuid) as p`,
  )) as unknown as Array<{ p: string | null }>;
  return x?.p === 'edit' ? 'edit' : 'read';
}

const eventCols = {
  id: ticketEvents.id,
  ownerId: ticketEvents.ownerId,
  kind: ticketEvents.kind,
  from: ticketEvents.fromValue,
  to: ticketEvents.toValue,
  body: ticketEvents.body,
  author: ticketEvents.authorName,
  at: ticketEvents.createdAt,
};
type EventRow = { [K in keyof typeof eventCols]: K extends 'at' ? Date : string } & {
  kind: TicketEvent['kind'];
};
const toEvent = (e: EventRow, me: string): TicketEvent => ({
  id: e.id,
  kind: e.kind,
  from: e.from,
  to: e.to,
  body: e.body,
  author: e.author,
  mine: e.ownerId === me,
  at: e.at.toISOString(),
});
const fileCols = {
  id: ticketAttachments.id,
  ownerId: ticketAttachments.ownerId,
  name: ticketAttachments.name,
  mime: ticketAttachments.mime,
  size: ticketAttachments.size,
  author: ticketAttachments.authorName,
  createdAt: ticketAttachments.createdAt,
};
const toFile = (
  f: {
    id: string;
    ownerId: string;
    name: string;
    mime: string;
    size: number;
    author: string;
    createdAt: Date;
  },
  me: string,
): TicketFile => ({
  id: f.id,
  name: f.name,
  mime: f.mime,
  size: Number(f.size),
  author: f.author,
  mine: f.ownerId === me,
  createdAt: f.createdAt.toISOString(),
});

export async function getTicket(auth: AuthContext, id: string): Promise<TicketFull> {
  return asSharer(auth, async (tx) => {
    const [r] = await tx
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, id), isNull(tickets.deletedAt)));
    if (!r) throw new ApiError(404, 'not_found');
    const events = (await tx
      .select(eventCols)
      .from(ticketEvents)
      .where(eq(ticketEvents.ticketId, id))
      .orderBy(asc(ticketEvents.createdAt), asc(ticketEvents.id))
      .limit(2000)) as EventRow[];
    const files = await tx
      .select(fileCols)
      .from(ticketAttachments)
      .where(and(eq(ticketAttachments.ticketId, id), eq(ticketAttachments.inline, false)))
      .orderBy(asc(ticketAttachments.createdAt));
    const perm = await permOf(tx, auth, r);
    const types =
      perm === 'owner'
        ? await ownTypes(tx, auth)
        : await tx
            .select(typeCols)
            .from(ticketTypes)
            .where(eq(ticketTypes.ownerId, r.ownerId))
            .orderBy(asc(ticketTypes.sort), asc(ticketTypes.createdAt));
    return {
      ...toTicket(r, auth.user.id),
      notesDoc: (r.notesDoc as PMNode | null) ?? null,
      events: events.map((e) => toEvent(e, auth.user.id)),
      files: files.map((f) => toFile(f, auth.user.id)),
      perm,
      types,
    };
  });
}

// ── Create / update ────────────────────────────────────────────────────────
export type TicketInput = {
  number: string;
  summary: string;
  folderId?: string | null;
  sharedFolderId?: string | null;
  status?: TicketStatus;
  priority?: TicketPriority;
  typeId?: string | null;
  clientId?: string | null;
  clientName?: string;
  responsibleId?: string | null;
  responsibleName?: string;
  parentNumber?: string;
  parentSummary?: string;
  openedAt?: string;
  dueOn?: string | null;
};
export type TicketPatch = Partial<Omit<TicketInput, 'folderId' | 'sharedFolderId'>> & {
  folderId?: string | null;
  sharedFolderId?: string | null;
  resolvedAt?: string | null;
  /** the notes (TipTap JSON, validated; notes_text becomes its plain text) */
  notesDoc?: unknown;
};

/** A Management client / resource of the caller's tenant: its id and current name. */
async function mgName(tx: Tx, kind: 'client' | 'person', id: string) {
  const [r] =
    kind === 'client'
      ? await tx
          .select({ id: mgClients.id, name: mgClients.name })
          .from(mgClients)
          .where(and(eq(mgClients.id, id), isNull(mgClients.deletedAt)))
      : await tx.select({ id: mgPeople.id, name: mgPeople.name }).from(mgPeople).where(eq(mgPeople.id, id));
  if (!r) throw new ApiError(404, kind === 'client' ? 'client_not_found' : 'person_not_found');
  return { id: r.id, name: r.name.slice(0, TICKET_LIMITS.name) };
}

/** A type of the ticket owner's list (what applies in their shared folders too), or null. */
async function checkType(tx: Tx, ownerId: string, id: string | null | undefined) {
  if (!id) return null;
  const [r] = await tx
    .select({ id: ticketTypes.id })
    .from(ticketTypes)
    .where(and(eq(ticketTypes.id, id), eq(ticketTypes.ownerId, ownerId)));
  if (!r) throw new ApiError(404, 'type_not_found');
  return r.id;
}

/**
 * Client / Responsável: a Management record (only of the ticket's own tenant —
 * a member of another tenant can only type a name) or a free name.
 */
async function party(
  tx: Tx,
  kind: 'client' | 'person',
  sameTenant: boolean,
  id: string | null | undefined,
  name: string | undefined,
): Promise<{ id: string | null; name: string } | null> {
  if (id === undefined && name === undefined) return null;
  if (id && sameTenant) return mgName(tx, kind, id);
  return { id: null, name: (name ?? '').trim().slice(0, TICKET_LIMITS.name) };
}

const event = (
  auth: AuthContext,
  ticketId: string,
  kind: TicketEvent['kind'],
  v: { from?: string; to?: string; body?: string } = {},
) => ({
  tenantId: auth.tenant.id,
  ownerId: auth.user.id,
  ticketId,
  kind,
  fromValue: (v.from ?? '').slice(0, 200),
  toValue: (v.to ?? '').slice(0, 200),
  body: v.body ?? '',
  authorName: auth.user.name.slice(0, 120),
  // per row, so changes saved together keep their order (now() is the same for the whole transaction)
  createdAt: sql`clock_timestamp()`,
});

export async function createTicket(auth: AuthContext, input: TicketInput): Promise<Ticket> {
  const number = cleanNumber(input.number);
  if (!number) throw new ApiError(400, 'invalid_input');
  return asUser(auth, async (tx) => {
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(tickets)
      .where(isNull(tickets.deletedAt))) as [{ n: number }];
    if (n >= TICKET_LIMITS.tickets) throw new ApiError(400, 'too_many_items');
    const client = await party(tx, 'client', true, input.clientId, input.clientName);
    const resp = await party(tx, 'person', true, input.responsibleId, input.responsibleName);
    const status = input.status ?? 'open';
    let folderId: string | null = null;
    let sharedFolderId: string | null = null;
    if (input.sharedFolderId) {
      // only the owner's own shared ticket folders (the row trigger checks it again)
      const [sf] = await tx
        .select({ id: sharedFolders.id })
        .from(sharedFolders)
        .where(
          and(
            eq(sharedFolders.id, input.sharedFolderId),
            eq(sharedFolders.kind, 'tickets'),
            eq(sharedFolders.ownerId, auth.user.id),
          ),
        );
      if (!sf) throw new ApiError(404, 'folder_not_found');
      sharedFolderId = sf.id;
    } else folderId = await checkKindFolder(tx, 'tickets', input.folderId);
    const [r] = await tx
      .insert(tickets)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        folderId,
        sharedFolderId,
        number,
        summary: input.summary.trim().slice(0, TICKET_LIMITS.summary),
        parentNumber: (input.parentNumber ?? '').trim().slice(0, 40),
        parentSummary: (input.parentSummary ?? '').trim().slice(0, 300),
        clientId: client?.id ?? null,
        clientName: client?.name ?? '',
        priority: input.priority ?? 'medium',
        typeId: await checkType(tx, auth.user.id, input.typeId),
        status,
        responsibleId: resp?.id ?? null,
        responsibleName: resp?.name ?? '',
        ...(input.openedAt ? { openedAt: new Date(input.openedAt) } : {}),
        dueOn: input.dueOn ?? null,
        resolvedAt: RESOLVED_STATUSES.includes(status) ? new Date() : null,
      })
      .returning(cols)
      .catch(numberTaken);
    await tx.insert(ticketEvents).values(event(auth, r!.id, 'created', { to: status }));
    return toTicket(r!, auth.user.id);
  });
}

/**
 * Saves a change; status, priority and responsible changes go to the history
 * (returned as `events`). The resolution date is set when the status becomes
 * Resolvido/Fechado and cleared when it is reopened (or set by hand).
 */
export async function updateTicket(
  auth: AuthContext,
  id: string,
  patch: TicketPatch,
): Promise<{ ticket: Ticket; events: TicketEvent[] }> {
  return asSharer(auth, async (tx) => {
    // FOR UPDATE: two saves at once log their changes one after the other
    const [cur] = await tx
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, id), isNull(tickets.deletedAt)))
      .for('update');
    if (!cur) {
      // FOR UPDATE only reaches rows the caller may change: a 'read' member sees it, without the lock
      const [seen] = await tx
        .select({ id: tickets.id })
        .from(tickets)
        .where(and(eq(tickets.id, id), isNull(tickets.deletedAt)));
      throw new ApiError(seen ? 403 : 404, seen ? 'forbidden' : 'not_found');
    }
    const owner = !notMine(auth, cur);
    const set: Partial<typeof tickets.$inferInsert> = { updatedAt: new Date() };
    if (patch.number !== undefined) {
      const number = cleanNumber(patch.number);
      if (!number) throw new ApiError(400, 'invalid_input');
      set.number = number;
    }
    if (patch.summary !== undefined) set.summary = patch.summary.trim().slice(0, TICKET_LIMITS.summary);
    if (patch.parentNumber !== undefined) set.parentNumber = patch.parentNumber.trim().slice(0, 40);
    if (patch.parentSummary !== undefined) set.parentSummary = patch.parentSummary.trim().slice(0, 300);
    if (patch.priority !== undefined) set.priority = patch.priority;
    if (patch.typeId !== undefined) set.typeId = await checkType(tx, cur.ownerId, patch.typeId);
    if (patch.openedAt !== undefined) set.openedAt = new Date(patch.openedAt);
    if (patch.dueOn !== undefined) set.dueOn = patch.dueOn;
    const sameTenant = cur.tenantId === auth.tenant.id;
    const client = await party(tx, 'client', sameTenant, patch.clientId, patch.clientName);
    if (client) {
      set.clientId = client.id;
      set.clientName = client.name;
    }
    const resp = await party(tx, 'person', sameTenant, patch.responsibleId, patch.responsibleName);
    if (resp) {
      set.responsibleId = resp.id;
      set.responsibleName = resp.name;
    }
    if (patch.notesDoc !== undefined) {
      const d = validateDoc(patch.notesDoc, { images: 'tickets' });
      set.notesDoc = d;
      set.notesText = docText(d).slice(0, 200_000);
    }
    if (patch.status !== undefined && patch.status !== cur.status) {
      set.status = patch.status;
      const was = RESOLVED_STATUSES.includes(cur.status);
      const is = RESOLVED_STATUSES.includes(patch.status);
      if (is && !was) set.resolvedAt = new Date();
      if (!is) set.resolvedAt = null;
    }
    if (patch.resolvedAt !== undefined)
      set.resolvedAt =
        patch.resolvedAt && RESOLVED_STATUSES.includes(set.status ?? cur.status)
          ? new Date(patch.resolvedAt)
          : null;
    // where it lives is the owner's (members edit the ticket itself)
    if (patch.folderId !== undefined || patch.sharedFolderId !== undefined) {
      if (!owner) throw new ApiError(403, 'forbidden');
      if (patch.sharedFolderId) {
        set.sharedFolderId = patch.sharedFolderId;
        set.folderId = null;
      } else {
        set.sharedFolderId = null;
        set.folderId = await checkKindFolder(tx, 'tickets', patch.folderId ?? null);
      }
    }
    const [r] = await tx
      .update(tickets)
      .set(set)
      .where(eq(tickets.id, id))
      .returning(cols)
      .catch((e: { code?: string; cause?: { code?: string } }) => {
        if ((e.code ?? e.cause?.code) === '42501') throw new ApiError(403, 'forbidden');
        return numberTaken(e);
      });
    // a 'read' member: RLS updates nothing
    if (!r) throw new ApiError(403, 'forbidden');
    const log = [];
    if (set.status && set.status !== cur.status)
      log.push(event(auth, id, 'status', { from: cur.status, to: set.status }));
    if (set.priority && set.priority !== cur.priority)
      log.push(event(auth, id, 'priority', { from: cur.priority, to: set.priority }));
    if (resp && resp.name !== cur.responsibleName)
      log.push(event(auth, id, 'responsible', { from: cur.responsibleName, to: resp.name }));
    const events = log.length
      ? ((await tx.insert(ticketEvents).values(log).returning(eventCols)) as EventRow[])
      : [];
    return { ticket: toTicket(r, auth.user.id), events: events.map((e) => toEvent(e, auth.user.id)) };
  });
}

/** Only who may edit the ticket gets past this (a no-op update RLS lets through or not). */
async function editable(tx: Tx, id: string) {
  const [t] = await tx
    .update(tickets)
    .set({ updatedAt: sql`now()` })
    .where(and(eq(tickets.id, id), isNull(tickets.deletedAt)))
    .returning({ id: tickets.id, tenantId: tickets.tenantId, ownerId: tickets.ownerId });
  if (t) return t;
  const [seen] = await tx.select({ id: tickets.id }).from(tickets).where(eq(tickets.id, id));
  throw new ApiError(seen ? 403 : 404, seen ? 'forbidden' : 'not_found');
}

export async function addComment(auth: AuthContext, ticketId: string, body: string): Promise<TicketEvent> {
  return asSharer(auth, async (tx) => {
    await editable(tx, ticketId);
    const [e] = (await tx
      .insert(ticketEvents)
      .values(event(auth, ticketId, 'comment', { body: body.slice(0, TICKET_LIMITS.comment) }))
      .returning(eventCols)) as EventRow[];
    return toEvent(e!, auth.user.id);
  });
}

/** One's own comment (the automatic entries stay). */
export async function deleteComment(auth: AuthContext, eventId: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .delete(ticketEvents)
      .where(and(eq(ticketEvents.id, eventId), eq(ticketEvents.kind, 'comment')))
      .returning({ id: ticketEvents.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

// ── Trash ──────────────────────────────────────────────────────────────────
export async function trashTicket(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(tickets)
      .set({ deletedAt: new Date() })
      .where(and(eq(tickets.id, id), isNull(tickets.deletedAt)))
      .returning({ id: tickets.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

/** Removes trashed tickets with their history, links and files (objects deleted after commit). */
export async function purgeTicketsTx(tx: Tx, ids0: string[]) {
  if (!ids0.length) return;
  const ids = (
    await tx
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(inArray(tickets.id, ids0), isNotNull(tickets.deletedAt)))
  ).map((r) => r.id);
  if (!ids.length) return;
  const files = await tx
    .delete(ticketAttachments)
    .where(inArray(ticketAttachments.ticketId, ids))
    .returning({ key: ticketAttachments.storageKey });
  await tx
    .delete(itemLinks)
    .where(
      sql`(${itemLinks.aType} = 'ticket' and ${inArray(itemLinks.aId, ids)}) or (${itemLinks.bType} = 'ticket' and ${inArray(itemLinks.bId, ids)})`,
    );
  await tx.delete(tickets).where(inArray(tickets.id, ids));
  removeFilesAfterCommit(
    tx,
    files.map((f) => f.key),
  );
}

// ── Attachments (chunked uploads, as in Ficheiros) ──────────────────────────
type Pending = {
  owner: string;
  tenant: string;
  ticket: string;
  key: string;
  s3: string;
  name: string;
  mime: string;
  size: number;
  parts: Record<string, string>;
};
const pendingKey = (id: string) => `kh:ticket:up:${id}`;
const nParts = (size: number) => Math.max(1, Math.ceil(size / UPLOAD_PART));

async function loadPending(auth: AuthContext, id: string): Promise<Pending> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) throw new ApiError(404, 'not_found');
  const raw = await redis().get(pendingKey(id));
  const p = raw ? (JSON.parse(raw) as Pending) : null;
  if (!p || p.owner !== auth.user.id || p.tenant !== auth.tenant.id) throw new ApiError(404, 'not_found');
  return p;
}

async function checkRoom(tx: Tx, auth: AuthContext, size: number) {
  const lim = await limitsTx(tx, auth);
  if (size > lim.maxFile) throw new ApiError(413, 'file_too_large', undefined, { max: lim.maxFile });
  if (lim.used + size > lim.quota)
    throw new ApiError(403, 'limit_reached', undefined, { resource: 'files_storage', max: lim.quota });
}

/** Opens an upload to a ticket the caller may edit, within their space. */
export async function startTicketUpload(
  auth: AuthContext,
  ticketId: string,
  input: { name: string; size: number; mime?: string },
): Promise<{ uploadId: string; partSize: number; parts: number }> {
  const name = cleanName(input.name);
  const mime = (input.mime || 'application/octet-stream').slice(0, 200);
  await asSharer(auth, async (tx) => {
    await editable(tx, ticketId);
    await checkRoom(tx, auth, input.size);
  });
  const key = `tenants/${auth.tenant.id}/tickets/${ticketId}/${randomToken(16)}`;
  const r = await s3().send(
    new CreateMultipartUploadCommand({
      Bucket: env().S3_BUCKET,
      Key: key,
      ContentType: 'application/octet-stream',
    }),
  );
  const id = randomToken(18);
  const p: Pending = {
    owner: auth.user.id,
    tenant: auth.tenant.id,
    ticket: ticketId,
    key,
    s3: r.UploadId!,
    name,
    mime,
    size: input.size,
    parts: {},
  };
  await redis().set(pendingKey(id), JSON.stringify(p), 'EX', 86_400);
  return { uploadId: id, partSize: UPLOAD_PART, parts: nParts(input.size) };
}

/** One chunk (1-based); every chunk but the last is exactly the part size. */
export async function uploadTicketPart(auth: AuthContext, id: string, n: number, body: Uint8Array) {
  const p = await loadPending(auth, id);
  const total = nParts(p.size);
  if (!Number.isInteger(n) || n < 1 || n > total) throw new ApiError(400, 'invalid_input');
  const expected = n < total ? UPLOAD_PART : p.size - UPLOAD_PART * (total - 1);
  if (body.byteLength !== expected) throw new ApiError(400, 'invalid_input', undefined, { expected });
  const r = await s3().send(
    new UploadPartCommand({ Bucket: env().S3_BUCKET, Key: p.key, UploadId: p.s3, PartNumber: n, Body: body }),
  );
  const cur = await loadPending(auth, id);
  cur.parts[String(n)] = r.ETag!;
  await redis().set(pendingKey(id), JSON.stringify(cur), 'KEEPTTL');
}

export async function abortTicketUpload(auth: AuthContext, id: string) {
  const p = await loadPending(auth, id);
  await redis().del(pendingKey(id));
  await s3()
    .send(new AbortMultipartUploadCommand({ Bucket: env().S3_BUCKET, Key: p.key, UploadId: p.s3 }))
    .catch(() => {});
}

const dropObject = (key: string) =>
  s3()
    .send(new DeleteObjectsCommand({ Bucket: env().S3_BUCKET, Delete: { Objects: [{ Key: key }] } }))
    .catch(() => {});

/** Every chunk sent: joins them, checks size and space again, and keeps the file with the ticket. */
export async function completeTicketUpload(auth: AuthContext, id: string): Promise<TicketFile> {
  const p = await loadPending(auth, id);
  const total = nParts(p.size);
  if (Object.keys(p.parts).length !== total) throw new ApiError(400, 'upload_incomplete');
  await redis().del(pendingKey(id));
  try {
    await s3().send(
      new CompleteMultipartUploadCommand({
        Bucket: env().S3_BUCKET,
        Key: p.key,
        UploadId: p.s3,
        MultipartUpload: {
          Parts: Array.from({ length: total }, (_, i) => ({
            PartNumber: i + 1,
            ETag: p.parts[String(i + 1)],
          })),
        },
      }),
    );
  } catch (e) {
    await s3()
      .send(new AbortMultipartUploadCommand({ Bucket: env().S3_BUCKET, Key: p.key, UploadId: p.s3 }))
      .catch(() => {});
    throw e;
  }
  const head = await s3().send(new HeadObjectCommand({ Bucket: env().S3_BUCKET, Key: p.key }));
  if (head.ContentLength !== p.size) {
    await dropObject(p.key);
    throw new ApiError(400, 'invalid_input');
  }
  try {
    return await asSharer(auth, async (tx) => {
      // one upload completes at a time per person (same lock as Ficheiros): the quota holds
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'kh-drive:' + auth.user.id}))`);
      await editable(tx, p.ticket);
      await checkRoom(tx, auth, p.size);
      const [f] = await tx
        .insert(ticketAttachments)
        .values({
          tenantId: auth.tenant.id,
          ownerId: auth.user.id,
          ticketId: p.ticket,
          name: p.name,
          mime: p.mime,
          size: p.size,
          storageKey: p.key,
          authorName: auth.user.name.slice(0, 120),
        })
        .returning(fileCols);
      return toFile(f!, auth.user.id);
    });
  } catch (e) {
    await dropObject(p.key);
    throw e;
  }
}

/** An attachment or an image of the notes (owner, member of the folder, or its uploader). */
export async function readTicketFile(auth: AuthContext, id: string, range?: string | null) {
  const f = await asSharer(auth, async (tx) => {
    const [a] = await tx
      .select({
        key: ticketAttachments.storageKey,
        size: ticketAttachments.size,
        name: ticketAttachments.name,
      })
      .from(ticketAttachments)
      .where(eq(ticketAttachments.id, id));
    return a;
  });
  if (!f) throw new ApiError(404, 'not_found');
  return readObject(f.key, Number(f.size), f.name, range);
}

/** Removes an attachment (its uploader or the ticket's owner); the object goes after commit. */
export async function deleteTicketFile(auth: AuthContext, id: string) {
  await asSharer(auth, async (tx) => {
    const r = await tx
      .delete(ticketAttachments)
      .where(and(eq(ticketAttachments.id, id), eq(ticketAttachments.inline, false)))
      .returning({ key: ticketAttachments.storageKey });
    if (!r.length) throw new ApiError(404, 'not_found');
    removeFilesAfterCommit(
      tx,
      r.map((x) => x.key),
    );
  });
}

// ── Images inside the notes ─────────────────────────────────────────────────
// Stored like the attachments (inline, not listed); the document keeps
// `/api/v1/tickets/files/<id>`. Images no longer in it are pruned a day later.
const MAX_IMAGE = 5 * 1024 * 1024;

export async function addTicketImage(auth: AuthContext, ticketId: string, data: Uint8Array): Promise<string> {
  if (data.length > MAX_IMAGE) throw new ApiError(413, 'file_too_large', undefined, { max: MAX_IMAGE });
  const gif = data.length >= 6 && String.fromCharCode(...data.subarray(0, 4)) === 'GIF8';
  const mime = sniffImage(data) ?? (gif ? 'image/gif' : null);
  if (!mime) throw new ApiError(415, 'unsupported_image');
  return asSharer(auth, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'kh-drive:' + auth.user.id}))`);
    await editable(tx, ticketId);
    await checkRoom(tx, auth, data.length);
    const key = `tenants/${auth.tenant.id}/tickets/${ticketId}/${randomToken(12)}`;
    await s3().send(
      new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, Body: data, ContentType: mime }),
    );
    const [a] = await tx
      .insert(ticketAttachments)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        ticketId,
        name: `image.${mime.split('/')[1]!.replace('jpeg', 'jpg')}`,
        mime,
        size: data.length,
        storageKey: key,
        inline: true,
        authorName: auth.user.name.slice(0, 120),
      })
      .returning({ id: ticketAttachments.id });
    return a!.id;
  });
}

/** "Imagem a partir de link" and images in pasted HTML: fetched by the server (SSRF-guarded). */
export async function importTicketImage(auth: AuthContext, ticketId: string, url: string): Promise<string> {
  let data: Uint8Array;
  try {
    data = new Uint8Array((await safeFetchBytes(url, { maxBytes: MAX_IMAGE, timeoutMs: 8000 })).body);
  } catch {
    throw new ApiError(422, 'image_fetch_failed');
  }
  return addTicketImage(auth, ticketId, data);
}

// ── Sidebar count and Home card ─────────────────────────────────────────────
const openCond = () =>
  and(isNull(tickets.deletedAt), sql`${tickets.status} not in ('resolved','closed','cancelled')`);

export async function countOpenTickets(tx: Tx) {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(tickets)
    .where(openCond());
  return r?.n ?? 0;
}

export type HomeTicket = Pick<
  Ticket,
  'id' | 'number' | 'summary' | 'priority' | 'status' | 'dueOn' | 'clientName'
>;
/** Open tickets (not Resolvido / Fechado / Cancelado) for the Home card. */
export async function openTicketsTx(tx: Tx): Promise<HomeTicket[]> {
  const rows = await tx
    .select({
      id: tickets.id,
      number: tickets.number,
      summary: tickets.summary,
      priority: tickets.priority,
      status: tickets.status,
      dueOn: tickets.dueOn,
      clientName: tickets.clientName,
    })
    .from(tickets)
    .where(openCond())
    .orderBy(desc(tickets.openedAt))
    .limit(2000);
  return rows;
}
