import { body, clientIp, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { idParam, type IdCtx } from '@/server/content/guard';
import { requireAdmin } from '@/server/admin/guard';
import { listClients } from '@/server/admin/clients';
import { listCodes } from '@/server/admin/codes';
import { clientUsers, updateClient } from '@/server/admin/tenants';
import { ClientPatchZ } from '../../schemas';

/** GET /clients/:id — the client page: subscription, people and codes. */
export const GET = handler(async (_req, ctx: IdCtx) => {
  await requireAdmin('clients');
  const id = await idParam(ctx);
  const { clients, plans, prices } = await listClients({ ids: [id] });
  if (!clients[0]) throw new ApiError(404, 'not_found');
  const codes = (await listCodes()).filter((c) => c.holder?.tenantId === id);
  return json({ client: clients[0], plans, prices, users: await clientUsers([id]), codes });
});

/** PATCH /clients/:id — "Subscrição" fields and Suspender / Reativar. */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const a = await requireAdmin('clients', true);
  await updateClient(a, await idParam(ctx), await body(req, ClientPatchZ), clientIp(req));
  return json({ ok: true });
});
