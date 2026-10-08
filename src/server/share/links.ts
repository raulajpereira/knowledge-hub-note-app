import 'server-only';
import { createHmac } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { db } from '@/db/client';
import { withTenant } from '@/db/tenant';
import { artifacts, driveFiles, noteAttachments, notes, publicLinks } from '@/db/schema';
import { readObject } from '@/server/content/drive';
import { decryptSecret, encryptSecret, randomToken, safeEqual, sha256 } from '@/lib/crypto';
import { env } from '@/lib/env';
import { s3 } from '@/lib/storage';
import { ApiError } from '@/server/errors';
import { audit } from '@/server/audit';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import type { AuthContext } from '@/server/auth/session';
import { asUser, type Tx } from '@/server/content/tenant';
import { docFileIds, type PMNode } from '@/server/content/doc';

// Public links (prototype Sharing mode "link"): a read-only page for one note
// or artifact. The token (192 bits) is only ever stored hashed for lookup and
// encrypted for the owner to copy again; a password is hashed like account
// passwords; a revoked or expired link is gone for good.

export type LinkItem = 'note' | 'artifact' | 'file';
export type PublicLink = {
  id: string;
  itemType: LinkItem;
  itemId: string;
  title: string;
  url: string;
  hasPassword: boolean;
  expiresOn: string | null;
  views: number;
  createdAt: string;
};

const hashOf = (token: string) => sha256(token).toString('hex');
export const publicUrl = (token: string) => `${env().APP_URL.replace(/\/$/, '')}/p/${token}`;

async function itemTitle(tx: Tx, type: LinkItem, id: string) {
  if (type === 'file') {
    const [f] = await tx
      .select({ title: driveFiles.name, ownerId: driveFiles.ownerId })
      .from(driveFiles)
      .where(and(eq(driveFiles.id, id), isNull(driveFiles.deletedAt)));
    return f;
  }
  const t = type === 'note' ? notes : artifacts;
  const [r] = await tx
    .select({ title: t.title, ownerId: t.ownerId })
    .from(t)
    .where(and(eq(t.id, id), isNull(t.deletedAt)));
  return r;
}

function toLink(r: typeof publicLinks.$inferSelect, title: string): PublicLink {
  return {
    id: r.id,
    itemType: r.itemType,
    itemId: r.itemId,
    title,
    url: publicUrl(decryptSecret(r.tokenCt)),
    hasPassword: !!r.passwordHash,
    expiresOn: r.expiresOn,
    views: r.views,
    createdAt: r.createdAt.toISOString(),
  };
}

/** The caller's active links (Definições › Partilhas), newest first, with the item titles. */
export async function listLinks(auth: AuthContext): Promise<PublicLink[]> {
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select()
      .from(publicLinks)
      .where(isNull(publicLinks.revokedAt))
      .orderBy(desc(publicLinks.createdAt));
    const out: PublicLink[] = [];
    for (const r of rows) {
      const it = await itemTitle(tx, r.itemType, r.itemId);
      if (it) out.push(toLink(r, it.title));
    }
    return out;
  });
}

export async function linkFor(auth: AuthContext, type: LinkItem, id: string): Promise<PublicLink | null> {
  return asUser(auth, async (tx) => {
    const [r] = await tx
      .select()
      .from(publicLinks)
      .where(and(eq(publicLinks.itemType, type), eq(publicLinks.itemId, id), isNull(publicLinks.revokedAt)));
    const it = r && (await itemTitle(tx, type, id));
    return r && it ? toLink(r, it.title) : null;
  });
}

/** Turns the public link of one of the caller's own items on (idempotent). */
export async function createLink(auth: AuthContext, type: LinkItem, id: string): Promise<PublicLink> {
  const out = await asUser(auth, async (tx) => {
    const it = await itemTitle(tx, type, id);
    if (!it || it.ownerId !== auth.user.id) throw new ApiError(404, 'not_found');
    const [cur] = await tx
      .select()
      .from(publicLinks)
      .where(and(eq(publicLinks.itemType, type), eq(publicLinks.itemId, id), isNull(publicLinks.revokedAt)));
    if (cur) return toLink(cur, it.title);
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(publicLinks)
      .where(isNull(publicLinks.revokedAt))) as [{ n: number }];
    if (n >= 500) throw new ApiError(400, 'too_many_items');
    const token = randomToken(24);
    const [r] = await tx
      .insert(publicLinks)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        itemType: type,
        itemId: id,
        tokenHash: hashOf(token),
        tokenCt: encryptSecret(token),
      })
      .returning();
    return toLink(r!, it.title);
  });
  await audit({
    action: 'share.link.create',
    tenantId: auth.tenant.id,
    actorUserId: auth.user.id,
    targetType: type,
    targetId: id,
  });
  return out;
}

export async function updateLink(
  auth: AuthContext,
  id: string,
  patch: { expiresOn?: string | null; password?: string | null },
): Promise<PublicLink> {
  const ph =
    patch.password === undefined ? undefined : patch.password ? await hashPassword(patch.password) : null;
  return asUser(auth, async (tx) => {
    const [r] = await tx
      .update(publicLinks)
      .set({
        ...(patch.expiresOn !== undefined ? { expiresOn: patch.expiresOn } : {}),
        ...(ph !== undefined ? { passwordHash: ph } : {}),
      })
      .where(and(eq(publicLinks.id, id), isNull(publicLinks.revokedAt)))
      .returning();
    if (!r) throw new ApiError(404, 'not_found');
    const it = await itemTitle(tx, r.itemType, r.itemId);
    return toLink(r, it?.title ?? '');
  });
}

export async function revokeLink(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(publicLinks)
      .set({ revokedAt: new Date() })
      .where(and(eq(publicLinks.id, id), isNull(publicLinks.revokedAt)))
      .returning({ id: publicLinks.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
  await audit({
    action: 'share.link.revoke',
    tenantId: auth.tenant.id,
    actorUserId: auth.user.id,
    targetType: 'public_link',
    targetId: id,
  });
}

// ── The public side (no session) ─────────────────────────────────────────────
type Found = {
  id: string;
  tenant_id: string;
  owner_id: string;
  item_type: LinkItem;
  item_id: string;
  password_hash: string | null;
  expires_on: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);

/** The live link of a token, or null (unknown, revoked, expired). */
export async function findLink(token: string): Promise<Found | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const rows = (await db().execute(sql`select * from kh_public_link(${hashOf(token)})`)) as unknown as
    { rows: Found[] } | Found[];
  const f = (Array.isArray(rows) ? rows : rows.rows)[0];
  if (!f) return null;
  if (f.expires_on && String(f.expires_on).slice(0, 10) < today()) return null;
  return { ...f, expires_on: f.expires_on ? String(f.expires_on).slice(0, 10) : null };
}

/** Cookie value proving the visitor gave the password (bound to the current password hash). */
export const unlockProof = (f: Found) =>
  createHmac('sha256', Buffer.from(env().ENCRYPTION_KEY, 'hex'))
    .update(`kh-pl:${f.id}:${f.password_hash ?? ''}`)
    .digest('base64url');
export const unlockCookie = (f: Found) => `kh_pl_${f.id.replace(/-/g, '').slice(0, 16)}`;
export const isUnlocked = (f: Found, cookie: string | undefined) =>
  !f.password_hash || (!!cookie && safeEqual(Buffer.from(cookie), Buffer.from(unlockProof(f))));

export async function checkPassword(f: Found, password: string) {
  return verifyPassword(f.password_hash, password);
}

const asOwner = <T>(f: Found, fn: (tx: Tx) => Promise<T>) =>
  withTenant(db(), { tenantId: f.tenant_id, userId: f.owner_id }, fn);

export type PublicItem =
  | { type: 'note'; title: string; doc: PMNode; updatedAt: string }
  | { type: 'artifact'; title: string; description: string; updatedAt: string }
  | { type: 'file'; title: string; size: number; updatedAt: string };

/** The item behind a link, read as its owner (RLS), or null when it was deleted. */
export async function publicItem(f: Found, countView: boolean): Promise<PublicItem | null> {
  const item = await asOwner<PublicItem | null>(f, async (tx) => {
    if (f.item_type === 'note') {
      const [n] = await tx
        .select({ title: notes.title, content: notes.content, updatedAt: notes.updatedAt })
        .from(notes)
        .where(and(eq(notes.id, f.item_id), isNull(notes.deletedAt)));
      return n
        ? { type: 'note', title: n.title, doc: n.content as PMNode, updatedAt: n.updatedAt.toISOString() }
        : null;
    }
    if (f.item_type === 'file') {
      const [d] = await tx
        .select({ name: driveFiles.name, size: driveFiles.size, updatedAt: driveFiles.updatedAt })
        .from(driveFiles)
        .where(and(eq(driveFiles.id, f.item_id), isNull(driveFiles.deletedAt)));
      return d
        ? { type: 'file', title: d.name, size: Number(d.size), updatedAt: d.updatedAt.toISOString() }
        : null;
    }
    const [a] = await tx
      .select({ title: artifacts.title, description: artifacts.description, updatedAt: artifacts.updatedAt })
      .from(artifacts)
      .where(and(eq(artifacts.id, f.item_id), isNull(artifacts.deletedAt)));
    return a
      ? { type: 'artifact', title: a.title, description: a.description, updatedAt: a.updatedAt.toISOString() }
      : null;
  });
  if (item && countView) await db().execute(sql`select kh_public_link_view(${f.id})`);
  return item;
}

/** The artifact's HTML for its sandboxed public view. */
export async function publicArtifactHtml(f: Found): Promise<string | null> {
  if (f.item_type !== 'artifact') return null;
  return asOwner<string | null>(f, async (tx) => {
    const [a] = await tx
      .select({ html: artifacts.html })
      .from(artifacts)
      .where(and(eq(artifacts.id, f.item_id), isNull(artifacts.deletedAt)));
    return a?.html ?? null;
  });
}

/** The linked file itself (streamed; byte ranges for audio/video). */
export async function publicDriveFile(f: Found, range: string | null) {
  if (f.item_type !== 'file') return null;
  const d = await asOwner(f, async (tx) => {
    const [r] = await tx
      .select({ name: driveFiles.name, size: driveFiles.size, key: driveFiles.storageKey })
      .from(driveFiles)
      .where(and(eq(driveFiles.id, f.item_id), isNull(driveFiles.deletedAt)));
    return r ?? null;
  });
  return d ? readObject(d.key, Number(d.size), d.name, range) : null;
}

/** An image of the linked note (only one its document shows). */
export async function publicFile(f: Found, fileId: string) {
  if (f.item_type !== 'note') return null;
  const row = await asOwner<{ storageKey: string; mime: string } | null>(f, async (tx) => {
    const [n] = await tx
      .select({ content: notes.content })
      .from(notes)
      .where(and(eq(notes.id, f.item_id), isNull(notes.deletedAt)));
    if (!n || !docFileIds(n.content as PMNode).includes(fileId)) return null;
    const [a] = await tx
      .select({ storageKey: noteAttachments.storageKey, mime: noteAttachments.mime })
      .from(noteAttachments)
      .where(and(eq(noteAttachments.id, fileId), eq(noteAttachments.noteId, f.item_id)));
    return a ?? null;
  });
  if (!row) return null;
  const obj = await s3().send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: row.storageKey }));
  const body = await obj.Body?.transformToByteArray();
  return body ? { body, mime: row.mime } : null;
}
