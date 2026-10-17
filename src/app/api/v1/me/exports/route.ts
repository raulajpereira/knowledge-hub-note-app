import { handler, json } from '@/server/http';
import { requireAuth } from '@/server/auth/request';
import { listExports, requestExport } from '@/server/dataExport';

// "Exportar os meus dados": GET /me/exports (latest + status) · POST /me/exports (ask for a new ZIP)
export const GET = handler(async () => {
  const auth = await requireAuth();
  return json(await listExports(auth));
});

export const POST = handler(async () => {
  const auth = await requireAuth();
  return json({ export: await requestExport(auth) }, { status: 202 });
});
