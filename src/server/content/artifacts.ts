import 'server-only';
import { and, asc, desc, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import { artifacts, artifactVersions, folders } from '@/db/schema';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { asSharer, asUser, type Tx } from './tenant';
import { folderError } from './folderError';

// Artifacts (prototype isArtifacts): HTML pages with a version per save.
// The server stores the HTML as-is: it is user code and only ever runs in a
// sandboxed frame with an opaque origin (see /artifacts/:id/view).

export const MAX_HTML = 2_000_000;
const KEEP_VERSIONS = 50;

export type ArtifactSummary = {
  id: string;
  folderId: string | null;
  /** the shared folder it was put in (Partilha), if any */
  sharedFolderId: string | null;
  /** false for someone else's artifact seen through a shared folder */
  mine: boolean;
  title: string;
  description: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};
export type ArtifactFull = ArtifactSummary & {
  html: string;
  versions: Array<{ id: string; createdAt: string; current: boolean }>;
};

const sumCols = {
  id: artifacts.id,
  folderId: artifacts.folderId,
  sharedFolderId: artifacts.sharedFolderId,
  ownerId: artifacts.ownerId,
  title: artifacts.title,
  description: artifacts.description,
  tags: artifacts.tags,
  pinned: artifacts.pinned,
  createdAt: artifacts.createdAt,
  updatedAt: artifacts.updatedAt,
};
type SumRow = Omit<ArtifactSummary, 'createdAt' | 'updatedAt' | 'mine'> & {
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
};
const toSummary = ({ ownerId, ...r }: SumRow, me: string): ArtifactSummary => ({
  ...r,
  mine: ownerId === me,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export const blankArtifact = (title: string) =>
  `<!doctype html>\n<html lang="pt">\n<head>\n<meta charset="utf-8">\n<style>body{margin:0;padding:40px;background:linear-gradient(180deg,rgba(255,255,255,.1),rgba(255,255,255,.04));min-height:100vh;box-sizing:border-box;color:#efe7df;font:16px/1.6 system-ui,sans-serif}</style>\n</head>\n<body>\n<h1>${title.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`)}</h1>\n</body>\n</html>`;

/** The caller's artifacts; with `shared`, the artifacts of that shared folder (every member's). */
export async function listArtifacts(
  auth: AuthContext,
  shared?: { id: string; folderId: string | null },
): Promise<ArtifactSummary[]> {
  return (shared ? asSharer : asUser)(auth, async (tx) => {
    const inShared = shared
      ? shared.folderId
        ? or(eq(artifacts.sharedFolderId, shared.id), eq(artifacts.folderId, shared.folderId))
        : eq(artifacts.sharedFolderId, shared.id)
      : undefined;
    const rows = await tx
      .select(sumCols)
      .from(artifacts)
      .where(and(isNull(artifacts.deletedAt), inShared))
      .orderBy(desc(artifacts.pinned), desc(artifacts.updatedAt))
      .limit(2000);
    return rows.map((r) => toSummary(r, auth.user.id));
  });
}

async function load(tx: Tx, id: string, me: string): Promise<ArtifactFull> {
  const [r] = await tx
    .select({ ...sumCols, html: artifacts.html })
    .from(artifacts)
    .where(and(eq(artifacts.id, id), isNull(artifacts.deletedAt)));
  if (!r) throw new ApiError(404, 'not_found');
  const vs = await tx
    .select({ id: artifactVersions.id, createdAt: artifactVersions.createdAt })
    .from(artifactVersions)
    .where(eq(artifactVersions.artifactId, id))
    .orderBy(asc(artifactVersions.createdAt), asc(artifactVersions.id));
  const { html, ...sum } = r;
  return {
    ...toSummary(sum, me),
    html,
    // the newest version is always the current HTML (every save/restore adds one)
    versions: vs.map((v, i) => ({
      id: v.id,
      createdAt: v.createdAt.toISOString(),
      current: i === vs.length - 1,
    })),
  };
}

export async function getArtifact(auth: AuthContext, id: string) {
  return asSharer(auth, (tx) => load(tx, id, auth.user.id));
}

/** Only the HTML, for the sandboxed viewer. */
export async function artifactHtml(auth: AuthContext, id: string) {
  return asSharer(auth, async (tx) => {
    const [r] = await tx
      .select({ html: artifacts.html, title: artifacts.title })
      .from(artifacts)
      .where(and(eq(artifacts.id, id), isNull(artifacts.deletedAt)));
    return r ?? null;
  });
}

async function checkFolder(tx: Tx, folderId: string | null | undefined) {
  if (!folderId) return null;
  const [f] = await tx
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.kind, 'artifacts'), isNull(folders.deletedAt)));
  if (!f) throw new ApiError(404, 'folder_not_found');
  return f.id;
}

async function addVersion(tx: Tx, auth: AuthContext, artifactId: string, html: string) {
  await tx
    .insert(artifactVersions)
    .values({ tenantId: auth.tenant.id, ownerId: auth.user.id, artifactId, html });
  // keep the newest KEEP_VERSIONS
  const keep = tx
    .select({ id: artifactVersions.id })
    .from(artifactVersions)
    .where(eq(artifactVersions.artifactId, artifactId))
    .orderBy(desc(artifactVersions.createdAt), desc(artifactVersions.id))
    .limit(KEEP_VERSIONS);
  await tx
    .delete(artifactVersions)
    .where(and(eq(artifactVersions.artifactId, artifactId), notInArray(artifactVersions.id, keep)));
}

export async function createArtifact(
  auth: AuthContext,
  input: { title: string; html?: string; folderId?: string | null; sharedFolderId?: string | null },
): Promise<ArtifactFull> {
  const html = input.html ?? blankArtifact(input.title);
  if (html.length > MAX_HTML) throw new ApiError(413, 'file_too_large', undefined, { max: MAX_HTML });
  return asUser(auth, async (tx) => {
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(artifacts)
      .where(isNull(artifacts.deletedAt))) as [{ n: number }];
    if (n >= 2000) throw new ApiError(400, 'too_many_items');
    const folderId = await checkFolder(tx, input.folderId);
    const [r] = await tx
      .insert(artifacts)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        folderId,
        sharedFolderId: input.sharedFolderId ?? null,
        title: input.title,
        html,
      })
      .returning({ id: artifacts.id })
      .catch(folderError);
    await addVersion(tx, auth, r!.id, html);
    return load(tx, r!.id, auth.user.id);
  });
}

export async function updateArtifact(
  auth: AuthContext,
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    tags: string[];
    pinned: boolean;
    folderId: string | null;
    sharedFolderId: string | null;
  }>,
): Promise<ArtifactSummary> {
  return asSharer(auth, async (tx) => {
    if (patch.folderId !== undefined) {
      // only the owner files an artifact in one of their own folders
      const [o] = await tx.select({ ownerId: artifacts.ownerId }).from(artifacts).where(eq(artifacts.id, id));
      if (o && o.ownerId !== auth.user.id) throw new ApiError(403, 'forbidden');
      patch.folderId = await checkFolder(tx, patch.folderId);
    }
    const [r] = await tx
      .update(artifacts)
      .set({
        ...patch,
        // moving / pinning doesn't count as an edit
        ...(patch.title !== undefined || patch.description !== undefined || patch.tags !== undefined
          ? { updatedAt: new Date() }
          : {}),
      })
      .where(and(eq(artifacts.id, id), isNull(artifacts.deletedAt)))
      .returning(sumCols)
      .catch(folderError);
    if (!r) throw new ApiError(404, 'not_found');
    return toSummary(r, auth.user.id);
  });
}

/** "Guardar Versão": the new HTML becomes current and a version is added. */
export async function saveArtifactHtml(auth: AuthContext, id: string, html: string): Promise<ArtifactFull> {
  if (html.length > MAX_HTML) throw new ApiError(413, 'file_too_large', undefined, { max: MAX_HTML });
  return asSharer(auth, async (tx) => {
    const r = await tx
      .update(artifacts)
      .set({ html, updatedAt: new Date() })
      .where(and(eq(artifacts.id, id), isNull(artifacts.deletedAt)))
      .returning({ id: artifacts.id });
    if (!r.length) throw new ApiError(404, 'not_found');
    await addVersion(tx, auth, id, html);
    return load(tx, id, auth.user.id);
  });
}

/** "Repor": an older version becomes current — as a new version, history is kept. */
export async function restoreArtifactVersion(auth: AuthContext, id: string, versionId: string) {
  const v = await asSharer(auth, async (tx) => {
    const [r] = await tx
      .select({ html: artifactVersions.html })
      .from(artifactVersions)
      .where(and(eq(artifactVersions.id, versionId), eq(artifactVersions.artifactId, id)));
    return r;
  });
  if (!v) throw new ApiError(404, 'not_found');
  return saveArtifactHtml(auth, id, v.html);
}

export async function trashArtifact(auth: AuthContext, id: string) {
  await asSharer(auth, async (tx) => {
    const r = await tx
      .update(artifacts)
      .set({ deletedAt: new Date() })
      .where(and(eq(artifacts.id, id), isNull(artifacts.deletedAt)))
      .returning({ id: artifacts.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

export async function purgeArtifactsTx(tx: Tx, ids: string[]) {
  if (!ids.length) return;
  await tx.delete(artifacts).where(inArray(artifacts.id, ids));
}

// ── Folders (flat, prototype aFolders) ─────────────────────────────────────
export async function listArtifactFolders(auth: AuthContext) {
  return asUser(auth, (tx) =>
    tx
      .select({ id: folders.id, name: folders.name })
      .from(folders)
      .where(and(eq(folders.kind, 'artifacts'), isNull(folders.deletedAt)))
      .orderBy(asc(folders.sort), asc(folders.createdAt)),
  );
}

export async function createArtifactFolder(auth: AuthContext, name: string) {
  return asUser(auth, async (tx) => {
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(folders)
      .where(eq(folders.kind, 'artifacts'))) as [{ n: number }];
    if (n >= 200) throw new ApiError(400, 'too_many_folders');
    const [f] = await tx
      .insert(folders)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        kind: 'artifacts',
        name,
        color: '',
        sort: n,
      })
      .returning({ id: folders.id, name: folders.name });
    return f!;
  });
}

/** Removing a folder keeps its artifacts (back to "Todos"), as in the prototype. */
export async function deleteArtifactFolder(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .delete(folders)
      .where(and(eq(folders.id, id), eq(folders.kind, 'artifacts')))
      .returning({ id: folders.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}
