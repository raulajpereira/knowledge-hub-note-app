import { cookies, headers } from 'next/headers';
import { ApiError, currentRequest } from '@/server/http';
import { SESSION_COOKIE, resolveSession, type AuthContext } from './session';

/** Session of the current request (route handlers / server components), or null. */
/** Ambientes: the active workspace of this device (docs/AMBIENTES.md). */
export const WORKSPACE_COOKIE = 'kh_ws';
/** kh_ws value of the combined view ("Todos os ambientes") */
export const ALL_WORKSPACES = 'all';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getAuth(): Promise<AuthContext | null> {
  const jar = await cookies();
  const auth = await resolveSession(jar.get(SESSION_COOKIE)?.value);
  if (!auth) return null;
  const ws = jar.get(WORKSPACE_COOKIE)?.value;
  // "Todos os ambientes" (fase 5): the combined view, read-only, every workspace of the person
  const combined = ws === ALL_WORKSPACES;
  const workspaceId = ws && UUID.test(ws) ? ws : null;
  const device = combined ? ALL_WORKSPACES : workspaceId;
  // the page that sent this request shows another workspace (switched in another tab)
  const page = (await headers()).get('x-kh-ws');
  if (page && device && (UUID.test(page) || page === ALL_WORKSPACES) && page !== device)
    throw new ApiError(409, 'workspace_changed');
  if (combined) return { ...auth, workspaceId: null, wsScope: false, combined: true };
  return { ...auth, workspaceId, wsScope: true };
}

export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw new ApiError(401, 'unauthenticated');
  assertWritable(auth);
  assertNotCombined(auth);
  return auth;
}

/**
 * The combined view only shows: nothing is created or changed "in every
 * workspace". Switching workspace, the account, prefs and notifications stay
 * usable.
 */
export function assertNotCombined(auth: AuthContext) {
  if (!auth.combined) return;
  const r = currentRequest.getStore();
  if (!r || r.method === 'GET' || r.method === 'HEAD') return;
  if (/\/api\/v1\/(auth|me|workspaces|notifications|plan-requests)(\/|$)/.test(r.path)) return;
  throw new ApiError(409, 'combined_readonly');
}

/**
 * A suspended client (expired license or suspended in the Admin Console) keeps
 * reading its data but can't change it (ROADMAP CA: "suspended (só leitura)").
 * Signing in/out, the account itself, plan requests and the console stay usable.
 */
export function assertWritable(auth: AuthContext) {
  if (auth.tenant.status !== 'suspended') return;
  const r = currentRequest.getStore();
  if (!r || r.method === 'GET' || r.method === 'HEAD') return;
  if (/\/api\/(v1\/(auth|me|plan-requests)(\/|$)|admin\/)/.test(r.path)) return;
  throw new ApiError(403, 'tenant_suspended');
}

/** Sensitive actions need a password re-entry within the last N minutes (lock screen). */
export function requireRecentReauth(auth: AuthContext, minutes = 15) {
  if (Date.now() - auth.reauthAt.getTime() > minutes * 60_000) throw new ApiError(403, 'reauth_required');
}
