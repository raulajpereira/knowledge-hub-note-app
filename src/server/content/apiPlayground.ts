import 'server-only';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { apiEnvs, apiRequests, folders, type KvRow } from '@/db/schema';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { ApiError } from '@/server/errors';
import { audit } from '@/server/audit';
import type { AuthContext } from '@/server/auth/session';
import { safeRequest, SafeFetchError, type ProxyRequest, type ProxyResponse } from '@/server/net/safeFetch';
import { asUser, type Tx } from './tenant';

// API Playground (prototype isApi): saved requests in folders, environments
// with {{variables}}, and a server proxy that sends them (SECURITY.md §7).

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Auth = { token: string; user: string; pass: string };
export type ApiRequest = {
  id: string;
  folderId: string | null;
  title: string;
  method: Method;
  url: string;
  params: KvRow[];
  headers: KvRow[];
  bodyType: 'none' | 'json' | 'form' | 'xml' | 'text';
  body: string;
  authType: 'none' | 'basic' | 'bearer';
  auth: Auth;
  createdAt: string;
  updatedAt: string;
};
export type ApiEnv = { id: string; name: string; vars: KvRow[] };

const EMPTY_AUTH: Auth = { token: '', user: '', pass: '' };
const cols = {
  id: apiRequests.id,
  folderId: apiRequests.folderId,
  title: apiRequests.title,
  method: apiRequests.method,
  url: apiRequests.url,
  params: apiRequests.params,
  headers: apiRequests.headers,
  bodyType: apiRequests.bodyType,
  body: apiRequests.body,
  authType: apiRequests.authType,
  authCt: apiRequests.authCt,
  createdAt: apiRequests.createdAt,
  updatedAt: apiRequests.updatedAt,
};
type Row = {
  [K in keyof typeof cols]: (typeof cols)[K]['_']['data'];
} & { authCt: string | null };

function readAuth(ct: string | null): Auth {
  if (!ct) return { ...EMPTY_AUTH };
  try {
    return { ...EMPTY_AUTH, ...(JSON.parse(decryptSecret(ct)) as Partial<Auth>) };
  } catch {
    return { ...EMPTY_AUTH };
  }
}
const toRequest = ({ authCt, ...r }: Row): ApiRequest =>
  ({
    ...r,
    auth: readAuth(authCt),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }) as ApiRequest;

export async function listApiRequests(auth: AuthContext): Promise<ApiRequest[]> {
  return asUser(auth, async (tx) => {
    const rows = await tx
      .select(cols)
      .from(apiRequests)
      .where(isNull(apiRequests.deletedAt))
      .orderBy(desc(apiRequests.createdAt))
      .limit(3000);
    return rows.map((r) => toRequest(r as Row));
  });
}

async function checkFolder(tx: Tx, folderId: string | null | undefined) {
  if (!folderId) return null;
  const [f] = await tx
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.kind, 'api'), isNull(folders.deletedAt)));
  if (!f) throw new ApiError(404, 'folder_not_found');
  return f.id;
}

/** Prototype pNew: GET {{host}}/ with Accept: application/json. */
export async function createApiRequest(
  auth: AuthContext,
  input: { title: string; folderId?: string | null },
): Promise<ApiRequest> {
  return asUser(auth, async (tx) => {
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(apiRequests)
      .where(isNull(apiRequests.deletedAt))) as [{ n: number }];
    if (n >= 3000) throw new ApiError(400, 'too_many_items');
    const [r] = await tx
      .insert(apiRequests)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        folderId: await checkFolder(tx, input.folderId),
        title: input.title,
        url: '{{host}}/',
        headers: [{ k: 'Accept', v: 'application/json', on: true }],
      })
      .returning(cols);
    return toRequest(r as Row);
  });
}

export type ApiRequestPatch = Partial<
  Pick<
    ApiRequest,
    'folderId' | 'title' | 'method' | 'url' | 'params' | 'headers' | 'bodyType' | 'body' | 'authType' | 'auth'
  >
>;

export async function updateApiRequest(
  auth: AuthContext,
  id: string,
  patch: ApiRequestPatch,
): Promise<ApiRequest> {
  return asUser(auth, async (tx) => {
    const { auth: secrets, ...rest } = patch;
    if (rest.folderId !== undefined) rest.folderId = await checkFolder(tx, rest.folderId);
    const [r] = await tx
      .update(apiRequests)
      .set({
        ...rest,
        ...(secrets ? { authCt: encryptSecret(JSON.stringify({ ...EMPTY_AUTH, ...secrets })) } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(apiRequests.id, id), isNull(apiRequests.deletedAt)))
      .returning(cols);
    if (!r) throw new ApiError(404, 'not_found');
    return toRequest(r as Row);
  });
}

export async function duplicateApiRequest(
  auth: AuthContext,
  id: string,
  suffix: string,
): Promise<ApiRequest> {
  return asUser(auth, async (tx) => {
    const [r] = await tx
      .select(cols)
      .from(apiRequests)
      .where(and(eq(apiRequests.id, id), isNull(apiRequests.deletedAt)));
    if (!r) throw new ApiError(404, 'not_found');
    const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = r;
    const [n] = await tx
      .insert(apiRequests)
      .values({
        ...copy,
        title: `${r.title}${suffix}`.slice(0, 300),
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
      })
      .returning(cols);
    return toRequest(n as Row);
  });
}

export async function trashApiRequest(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .update(apiRequests)
      .set({ deletedAt: new Date() })
      .where(and(eq(apiRequests.id, id), isNull(apiRequests.deletedAt)))
      .returning({ id: apiRequests.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

export async function purgeApiRequestsTx(tx: Tx, ids: string[]) {
  if (ids.length) await tx.delete(apiRequests).where(inArray(apiRequests.id, ids));
}

// ── Folders ────────────────────────────────────────────────────────────────
export async function listApiFolders(auth: AuthContext) {
  return asUser(auth, (tx) =>
    tx
      .select({ id: folders.id, name: folders.name })
      .from(folders)
      .where(and(eq(folders.kind, 'api'), isNull(folders.deletedAt)))
      .orderBy(asc(folders.sort), asc(folders.createdAt)),
  );
}

export async function createApiFolder(auth: AuthContext, name: string) {
  return asUser(auth, async (tx) => {
    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(folders)
      .where(eq(folders.kind, 'api'))) as [{ n: number }];
    if (n >= 200) throw new ApiError(400, 'too_many_folders');
    const [f] = await tx
      .insert(folders)
      .values({ tenantId: auth.tenant.id, ownerId: auth.user.id, kind: 'api', name, color: '', sort: n })
      .returning({ id: folders.id, name: folders.name });
    return f!;
  });
}

/** Removing a folder keeps its requests ("Sem Pasta"), as in the prototype. */
export async function deleteApiFolder(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .delete(folders)
      .where(and(eq(folders.id, id), eq(folders.kind, 'api')))
      .returning({ id: folders.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}

// ── Environments (DEV / QAS / PRD as in the prototype) ─────────────────────
const DEFAULT_ENVS = ['DEV', 'QAS', 'PRD'];
const readVars = (ct: string): KvRow[] => {
  try {
    return JSON.parse(decryptSecret(ct)) as KvRow[];
  } catch {
    return [];
  }
};

export async function listApiEnvs(auth: AuthContext): Promise<ApiEnv[]> {
  return asUser(auth, async (tx) => {
    let rows = await tx
      .select({ id: apiEnvs.id, name: apiEnvs.name, varsCt: apiEnvs.varsCt })
      .from(apiEnvs)
      .orderBy(asc(apiEnvs.sort));
    if (!rows.length) {
      rows = await tx
        .insert(apiEnvs)
        .values(
          DEFAULT_ENVS.map((name, sort) => ({
            tenantId: auth.tenant.id,
            ownerId: auth.user.id,
            name,
            sort,
            varsCt: encryptSecret(JSON.stringify([{ k: 'host', v: '', on: true }])),
          })),
        )
        .returning({ id: apiEnvs.id, name: apiEnvs.name, varsCt: apiEnvs.varsCt });
    }
    return rows.map((r) => ({ id: r.id, name: r.name, vars: readVars(r.varsCt) }));
  });
}

export async function updateApiEnv(auth: AuthContext, id: string, vars: KvRow[]): Promise<ApiEnv> {
  return asUser(auth, async (tx) => {
    const [r] = await tx
      .update(apiEnvs)
      .set({ varsCt: encryptSecret(JSON.stringify(vars)) })
      .where(eq(apiEnvs.id, id))
      .returning({ id: apiEnvs.id, name: apiEnvs.name });
    if (!r) throw new ApiError(404, 'not_found');
    return { ...r, vars };
  });
}

// ── Send ───────────────────────────────────────────────────────────────────
/**
 * The browser resolves {{variables}} and auth; the server only makes the call,
 * safely. Failures are returned as data so the panel can say why.
 */
export async function sendApiRequest(
  auth: AuthContext,
  req: ProxyRequest,
): Promise<{ ok: true; response: ProxyResponse } | { ok: false; reason: string; message?: string }> {
  try {
    return { ok: true, response: await safeRequest(req) };
  } catch (e) {
    const reason = e instanceof SafeFetchError ? e.message : 'network_error';
    if (reason === 'blocked_address' || reason === 'bad_port') {
      let host = '';
      try {
        host = new URL(req.url).host;
      } catch {
        // unparsable URL: nothing to record
      }
      await audit({
        action: 'api.blocked',
        actorUserId: auth.user.id,
        tenantId: auth.tenant.id,
        details: { host },
      });
    }
    const message = e instanceof Error && !(e instanceof SafeFetchError) ? e.message : undefined;
    return { ok: false, reason, message };
  }
}
