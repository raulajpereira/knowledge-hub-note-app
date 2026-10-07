import { body, handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { requireContent } from '@/server/content/guard';
import { getEntitlements, requireModule } from '@/server/licensing/entitlements';
import { createSharedFolder, listSharedFolders } from '@/server/share/folders';
import { FolderCreate, KIND_MODULE, ShareKindZ } from '../schemas';

/**
 * GET /share/folders?kind= — the caller's shared folders and the ones shared
 * with them; only kinds whose module is in the caller's plan (decision: a
 * folder of a module you don't have stays hidden).
 */
export const GET = handler(async (req) => {
  const auth = await requireAuth();
  const k = new URL(req.url).searchParams.get('kind');
  const kind = k ? ShareKindZ.parse(k) : undefined;
  const { modules } = await getEntitlements(auth.tenant.id);
  const list = (await listSharedFolders(auth, kind)).filter((f) => modules.includes(KIND_MODULE[f.kind]));
  return json({ folders: list });
});

/** POST /share/folders {kind, name, folderId?} — "Nova pasta partilhada" / "Partilhar pasta". */
export const POST = handler(async (req) => {
  const input = await body(req, FolderCreate);
  const auth = await requireContent(KIND_MODULE[input.kind]);
  await requireModule(auth.tenant.id, 'share');
  return json({ id: await createSharedFolder(auth, input) }, { status: 201 });
});
