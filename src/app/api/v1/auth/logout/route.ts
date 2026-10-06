import { handler, json } from '@/server/http';
import { getAuth } from '@/server/auth/request';
import { revokeSession } from '@/server/auth/session';
import { clearSessionCookie } from '@/server/auth/route-utils';
import { audit } from '@/server/audit';

export const POST = handler(async () => {
  const auth = await getAuth();
  if (auth) {
    await revokeSession(auth.sessionId);
    await audit({ action: 'auth.logout', actorUserId: auth.user.id, tenantId: auth.tenant.id });
  }
  const res = json({ ok: true });
  clearSessionCookie(res);
  return res;
});
