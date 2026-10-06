import { cookies } from 'next/headers';
import { ApiError } from '@/server/http';
import { SESSION_COOKIE, resolveSession, type AuthContext } from './session';

/** Session of the current request (route handlers / server components), or null. */
export async function getAuth(): Promise<AuthContext | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return resolveSession(token);
}

export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw new ApiError(401, 'unauthenticated');
  return auth;
}

/** Sensitive actions need a password re-entry within the last N minutes (lock screen). */
export function requireRecentReauth(auth: AuthContext, minutes = 15) {
  if (Date.now() - auth.reauthAt.getTime() > minutes * 60_000) throw new ApiError(403, 'reauth_required');
}
