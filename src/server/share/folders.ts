import 'server-only';
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  folders,
  mgPeople,
  shareMembers,
  sharePeople,
  sharedFolders,
  users,
  type ShareKind,
} from '@/db/schema';
import { ApiError } from '@/server/errors';
import { audit } from '@/server/audit';
import { allow } from '@/server/auth/rateLimit';
import type { AuthContext } from '@/server/auth/session';
import { asUser, type Tx } from '@/server/content/tenant';
import { notifyShared } from './mail';

// Shared folders (prototype Sharing, modes "folder" and "settings"). The owner
// manages folders, members (read/edit, pause, remove) and people (pause or
// remove someone from all their folders). Members see the folders shared with
// them (RLS: kh_share_member) and reach their items through the share scope.

export type Member = {
  id: string;
  email: string;
  name: string;
  perm: 'read' | 'edit';
  status: 'invited' | 'active';
  paused: boolean;
  /** paused for this owner's folders as a whole ("Pessoas com Acesso") */
  personPaused: boolean;
};
export type SharedFolder = {
  id: string;
  kind: ShareKind;
  name: string;
  /** the owner's own folder this shared folder stands for (notes/artifacts), if any */
  folderId: string | null;
  paused: boolean;
  mine: boolean;
  /** members (owner view) */
  members: Member[];
  /** owner name and the caller's permission (member view) */
  owner: { name: string; email: string } | null;
  perm: 'read' | 'edit';
};
export type Person = { email: string; name: string; folders: number; paused: boolean };

const nameOf = (e: string, names: Map<string, string>) => names.get(e.toLowerCase()) ?? e.split('@')[0]!;

async function userNames(emails: string[]) {
  if (!emails.length) return new Map<string, string>();
  const rows = await db()
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(inArray(users.email, emails));
  return new Map(rows.map((r) => [r.email.toLowerCase(), r.name]));
}

/** The caller's shared folders (owned, with members) and the ones shared with them. */
export async function listSharedFolders(auth: AuthContext, kind?: ShareKind): Promise<SharedFolder[]> {
  const { own, mem, incoming, people } = await asUser(auth, async (tx) => {
    const kindCond = kind ? eq(sharedFolders.kind, kind) : undefined;
    const all = await tx.select().from(sharedFolders).where(kindCond).orderBy(asc(sharedFolders.createdAt));
    const own = all.filter((f) => f.ownerId === auth.user.id);
    const incoming = all.filter((f) => f.ownerId !== auth.user.id);
    const mem = own.length
      ? await tx
          .select()
          .from(shareMembers)
          .where(
            inArray(
              shareMembers.folderId,
              own.map((f) => f.id),
            ),
          )
          .orderBy(asc(shareMembers.invitedAt))
      : [];
    const people = await tx.select().from(sharePeople);
    return { own, mem, incoming, people };
  });
  // incoming: the caller's own membership (permission) and the owner's name
  const myPerm = incoming.length
    ? await asUser(auth, (tx) =>
        tx
          .select({ folderId: shareMembers.folderId, perm: shareMembers.perm })
          .from(shareMembers)
          .where(eq(shareMembers.userId, auth.user.id)),
      )
    : [];
  const owners = incoming.length
    ? await db()
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(
          inArray(
            users.id,
            incoming.map((f) => f.ownerId),
          ),
        )
    : [];
  const names = await userNames([...new Set(mem.map((m) => m.email))]);
  const paused = new Set(people.filter((p) => p.paused).map((p) => p.email.toLowerCase()));
  const out: SharedFolder[] = own.map((f) => ({
    id: f.id,
    kind: f.kind,
    name: f.name,
    folderId: f.folderId,
    paused: f.paused,
    mine: true,
    members: mem
      .filter((m) => m.folderId === f.id)
      .map((m) => ({
        id: m.id,
        email: m.email,
        name: nameOf(m.email, names),
        perm: m.perm,
        status: m.status,
        paused: m.paused,
        personPaused: paused.has(m.email.toLowerCase()),
      })),
    owner: null,
    perm: 'edit',
  }));
  for (const f of incoming) {
    const o = owners.find((x) => x.id === f.ownerId);
    out.push({
      id: f.id,
      kind: f.kind,
      name: f.name,
      folderId: null,
      paused: false,
      mine: false,
      members: [],
      owner: o ? { name: o.name, email: o.email } : null,
      perm: myPerm.find((m) => m.folderId === f.id)?.perm ?? 'read',
    });
  }
  return out;
}

async function loadOwn(auth: AuthContext, tx: Tx, id: string) {
  const [f] = await tx
    .select()
    .from(sharedFolders)
    .where(and(eq(sharedFolders.id, id), eq(sharedFolders.ownerId, auth.user.id)));
  if (!f) throw new ApiError(404, 'not_found');
  return f;
}

/**
 * New shared folder: standalone ("Nova pasta partilhada") or standing for one
 * of the caller's folders ("Partilhar pasta"); sharing a folder twice returns the same one.
 */
export async function createSharedFolder(
  auth: AuthContext,
  input: { kind: ShareKind; name: string; folderId?: string | null },
): Promise<string> {
  return asUser(auth, async (tx) => {
    if (input.folderId) {
      if (input.kind === 'tasks') throw new ApiError(400, 'invalid_input');
      const [f] = await tx
        .select({ id: folders.id })
        .from(folders)
        .where(and(eq(folders.id, input.folderId), eq(folders.kind, input.kind), isNull(folders.deletedAt)));
      if (!f) throw new ApiError(404, 'folder_not_found');
      const [cur] = await tx
        .select({ id: sharedFolders.id })
        .from(sharedFolders)
        .where(eq(sharedFolders.folderId, input.folderId));
      if (cur) return cur.id;
    }
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(sharedFolders)
      .where(eq(sharedFolders.ownerId, auth.user.id))) as [{ n: number }];
    if (n >= 200) throw new ApiError(400, 'too_many_items');
    const [r] = await tx
      .insert(sharedFolders)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        kind: input.kind,
        name: input.name,
        folderId: input.folderId ?? null,
      })
      .returning({ id: sharedFolders.id });
    return r!.id;
  });
}

export async function updateSharedFolder(
  auth: AuthContext,
  id: string,
  patch: { name?: string; paused?: boolean },
) {
  await asUser(auth, async (tx) => {
    await loadOwn(auth, tx, id);
    await tx.update(sharedFolders).set(patch).where(eq(sharedFolders.id, id));
  });
}

/** "Eliminar pasta": the sharing ends; the items stay with their owners (shared_folder_id cleared). */
export async function deleteSharedFolder(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    await loadOwn(auth, tx, id);
    await tx.delete(sharedFolders).where(eq(sharedFolders.id, id));
  });
  await audit({
    action: 'share.folder.delete',
    actorUserId: auth.user.id,
    tenantId: auth.tenant.id,
    targetType: 'shared_folder',
    targetId: id,
  });
}

export type AddResult = { status: 'added' | 'exists' | 'needs_invite' | 'invited'; member?: Member };

/**
 * "Partilhar" with an email. An existing account is added at once (and told
 * by email); an email without an account needs `invite` (prototype: "não tem
 * conta no KnowledgeHub. Enviar convite por email?").
 */
export async function addMember(
  auth: AuthContext,
  folderId: string,
  rawEmail: string,
  opts: { invite?: boolean; perm?: 'read' | 'edit'; lang: 'pt' | 'en' },
): Promise<AddResult> {
  const email = rawEmail.trim().toLowerCase();
  if (email === auth.user.email.toLowerCase()) throw new ApiError(400, 'share_self');
  // looking an email up says whether it has an account: bounded per user
  if (!(await allow(`share-add:${auth.user.id}`, 60, 3600))) throw new ApiError(429, 'too_many_requests');
  const [u] = await db()
    .select({ id: users.id, name: users.name, lang: users.lang, status: users.status })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const account = u && u.status !== 'disabled' ? u : undefined;
  if (!account && !opts.invite) return { status: 'needs_invite' };
  const res = await asUser(auth, async (tx) => {
    const f = await loadOwn(auth, tx, folderId);
    const [cur] = await tx
      .select()
      .from(shareMembers)
      .where(and(eq(shareMembers.folderId, folderId), eq(shareMembers.email, email)));
    if (cur) return { f, m: cur, created: false };
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(shareMembers)
      .where(eq(shareMembers.folderId, folderId))) as [{ n: number }];
    if (n >= 100) throw new ApiError(400, 'too_many_items');
    const [m] = await tx
      .insert(shareMembers)
      .values({
        folderId,
        email,
        userId: account?.id ?? null,
        status: account ? 'active' : 'invited',
        perm: opts.perm ?? 'read',
      })
      .returning();
    return { f, m: m!, created: true };
  });
  const member: Member = {
    id: res.m.id,
    email,
    name: account?.name ?? email.split('@')[0]!,
    perm: res.m.perm,
    status: res.m.status,
    paused: res.m.paused,
    personPaused: false,
  };
  if (!res.created) return { status: 'exists', member };
  await notifyShared({
    to: email,
    lang: account?.lang ?? opts.lang,
    who: auth.user.name,
    folder: res.f.name,
    kind: res.f.kind,
    hasAccount: !!account,
  });
  await audit({
    action: account ? 'share.member.add' : 'share.member.invite',
    actorUserId: auth.user.id,
    tenantId: auth.tenant.id,
    targetType: 'shared_folder',
    targetId: folderId,
    details: { email },
  });
  return { status: account ? 'added' : 'invited', member };
}

export async function updateMember(
  auth: AuthContext,
  memberId: string,
  patch: { perm?: 'read' | 'edit'; paused?: boolean },
) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(shareMembers)
      .set(patch)
      .where(eq(shareMembers.id, memberId))
      .returning({ id: shareMembers.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

export async function removeMember(auth: AuthContext, memberId: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .delete(shareMembers)
      .where(eq(shareMembers.id, memberId))
      .returning({ id: shareMembers.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

/** "Pessoas com Acesso": everyone in the caller's folders, with how many folders each. */
export async function listPeople(auth: AuthContext): Promise<Person[]> {
  const { mem, people } = await asUser(auth, async (tx) => {
    const mem = await tx
      .select({ email: shareMembers.email, folderId: shareMembers.folderId })
      .from(shareMembers)
      .innerJoin(sharedFolders, eq(sharedFolders.id, shareMembers.folderId))
      .where(eq(sharedFolders.ownerId, auth.user.id));
    const people = await tx.select().from(sharePeople);
    return { mem, people };
  });
  const by = new Map<string, Set<string>>();
  for (const m of mem)
    by.set(m.email.toLowerCase(), (by.get(m.email.toLowerCase()) ?? new Set()).add(m.folderId));
  const names = await userNames([...by.keys()]);
  return [...by.entries()].map(([email, fs]) => ({
    email,
    name: nameOf(email, names),
    folders: fs.size,
    paused: people.some((p) => p.email.toLowerCase() === email && p.paused),
  }));
}

export async function pausePerson(auth: AuthContext, rawEmail: string, paused: boolean) {
  const email = rawEmail.trim().toLowerCase();
  await asUser(auth, async (tx) => {
    await tx
      .insert(sharePeople)
      .values({ ownerId: auth.user.id, tenantId: auth.tenant.id, email, paused })
      .onConflictDoUpdate({ target: [sharePeople.ownerId, sharePeople.email], set: { paused } });
  });
}

/** "Remover tudo": the person leaves every folder of the caller. */
export async function removePerson(auth: AuthContext, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  await asUser(auth, async (tx) => {
    const mine = tx
      .select({ id: sharedFolders.id })
      .from(sharedFolders)
      .where(eq(sharedFolders.ownerId, auth.user.id));
    await tx
      .delete(shareMembers)
      .where(and(eq(shareMembers.email, email), inArray(shareMembers.folderId, mine)));
    await tx.delete(sharePeople).where(eq(sharePeople.email, email));
  });
}

/**
 * Suggestions while typing an email (prototype: the Management people with an
 * email); here also the colleagues of the same tenant. Never other tenants' users.
 */
export async function suggestPeople(
  auth: AuthContext,
  q: string,
): Promise<Array<{ name: string; email: string }>> {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return [];
  const like = `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const colleagues = await db()
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.tenantId, auth.tenant.id),
        ne(users.id, auth.user.id),
        sql`(${users.email} ilike ${like} or ${users.name} ilike ${like})`,
      ),
    )
    .limit(6);
  const mg = await asUser(auth, (tx) =>
    tx
      .select({ name: mgPeople.name, email: mgPeople.email })
      .from(mgPeople)
      .where(
        sql`${mgPeople.email} <> '' and (${mgPeople.email} ilike ${like} or ${mgPeople.name} ilike ${like})`,
      )
      .limit(6),
  );
  const seen = new Set<string>([auth.user.email.toLowerCase()]);
  const out: Array<{ name: string; email: string }> = [];
  for (const p of [...colleagues, ...mg]) {
    const e = p.email.toLowerCase();
    if (seen.has(e)) continue;
    seen.add(e);
    out.push({ name: p.name, email: e });
  }
  return out.slice(0, 6);
}

/** The shared folder (owned or incoming) the caller can reach, with its kind and own folder. */
export async function reachableFolder(auth: AuthContext, id: string) {
  const [f] = await asUser(auth, (tx) =>
    tx
      .select({ id: sharedFolders.id, kind: sharedFolders.kind, folderId: sharedFolders.folderId })
      .from(sharedFolders)
      .where(eq(sharedFolders.id, id)),
  );
  if (!f) throw new ApiError(404, 'not_found');
  return f;
}
