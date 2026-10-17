import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { requireContent } from '@/server/content/guard';
import { getEntitlements } from '@/server/licensing/entitlements';
import { createView, listViews, viewInput } from '@/server/content/views';

// "Vistas guardadas": GET /views (with live counts; ?counts=0 without) · POST /views { kind, name, filter }
export const GET = handler(async (req) => {
  const auth = await requireAuth();
  const { modules } = await getEntitlements(auth.tenant.id);
  const counts = new URL(req.url).searchParams.get('counts') !== '0';
  return json({ views: await listViews(auth, new Set(modules), { counts }) });
});

export const POST = handler(async (req) => {
  const input = await body(req, viewInput);
  const auth = await requireContent(input.kind);
  return json({ view: await createView(auth, input) }, { status: 201 });
});
