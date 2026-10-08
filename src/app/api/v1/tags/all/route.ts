import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { getEntitlements } from '@/server/licensing/entitlements';
import { listAllTags } from '@/server/content/tags';

// GET /tags/all — every tag in the caller's notes, artifacts, snippets and SAP
// objects (modules in the plan only), most used first: autocomplete source.
export const GET = handler(async () => {
  const auth = await requireAuth();
  const { modules } = await getEntitlements(auth.tenant.id);
  return json({ tags: await listAllTags(auth, modules) });
});
