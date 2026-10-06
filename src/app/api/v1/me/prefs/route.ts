import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { getPrefs, patchPrefs } from '@/server/prefs';
import { getEntitlements } from '@/server/licensing/entitlements';

// GET|PUT /me/prefs (API.md). PUT takes a merge-patch: { key: value | null }.
export const GET = handler(async () => {
  const auth = await requireAuth();
  return json({ prefs: await getPrefs(auth.user.id) });
});

export const PUT = handler(async (req) => {
  const auth = await requireAuth();
  let patch: unknown;
  try {
    patch = await req.json();
  } catch {
    return json({ error: { code: 'invalid_json', message: 'Invalid JSON' } }, { status: 400 });
  }
  const { modules } = await getEntitlements(auth.tenant.id);
  return json({ prefs: await patchPrefs(auth.user.id, patch, new Set(modules)) });
});
