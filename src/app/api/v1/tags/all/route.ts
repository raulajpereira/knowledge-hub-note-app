import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { listAllTags } from '@/server/content/tags';
import { entitlementsFor } from '@/server/workspaces';

// GET /tags/all — every tag in the caller's notes, artifacts, snippets and SAP
// objects (modules in the plan only), most used first: autocomplete source.
export const GET = handler(async () => {
  const auth = await requireAuth();
  const { modules } = await entitlementsFor(auth);
  return json({ tags: await listAllTags(auth, modules) });
});
