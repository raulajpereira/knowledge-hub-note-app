import { cookies } from 'next/headers';
import { ApiError, currentRequest } from '@/server/http';
import { SESSION_COOKIE, resolveSession, type AuthContext } from './session';

/** Session of the current request (route handlers / server components), or null. */
export async function getAuth(): Promise<AuthContext | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveSession(token);
}

export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw new ApiError(401, 'unauthenticated');
  assertWritable(auth);
  return auth;
}

/**
 * A suspended client (expired license or suspended in the Admin Console) keeps
 * reading its data but can't change it (ROADMAP CA: "suspended (só leitura)").
 * Signing in/out, the account itself and the console stay usable.
 */
export function assertWritable(auth: AuthContext) {
  if (auth.tenant.status !== 'suspended') return;
  const r = currentRequest.getStore();
  if (!r || r.method === 'GET' || r.method === 'HEAD') return;
  if (/\/api\/(v1\/(auth|me)\/|admin\/)/.test(r.path)) return;
  throw new ApiError(403, 'tenant_suspended');
}

/** Sensitive actions need a password re-entry within the last N minutes (lock screen). */
export function requireRecentReauth(auth: AuthContext, minutes = 15) {
  if (Date.now() - auth.reauthAt.getTime() > minutes * 60_000) throw new ApiError(403, 'reauth_required');
}
