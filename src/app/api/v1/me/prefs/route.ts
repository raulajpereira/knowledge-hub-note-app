import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { patchPrefsFor, prefsFor, entitlementsFor } from '@/server/workspaces';

// GET|PUT /me/prefs (API.md). PUT takes a merge-patch: { key: value | null }.
export const GET = handler(async () => {
  const auth = await requireAuth();
  return json({ prefs: (await prefsFor(auth)).prefs });
});

export const PUT = handler(async (req) => {
  const auth = await requireAuth();
  let patch: unknown;
  try {
    patch = await req.json();
  } catch {
    return json({ error: { code: 'invalid_json', message: 'Invalid JSON' } }, { status: 400 });
  }
  const { modules } = await entitlementsFor(auth);
  return json({ prefs: await patchPrefsFor(auth, patch, new Set(modules)) });
});
