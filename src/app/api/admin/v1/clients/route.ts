import { body, clientIp, handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { listClients } from '@/server/admin/clients';
import { clientUsers, createClient } from '@/server/admin/tenants';
import { NewClientZ } from '../schemas';

/**
 * GET /clients[?users=1] — every client (packs and individuals) with plan,
 * seats in use and value, the plans, and (users=1) the people of each client.
 */
export const GET = handler(async (req) => {
  await requireAdmin('clients');
  const { clients, plans, prices } = await listClients();
  const withUsers = new URL(req.url).searchParams.get('users') === '1';
  return json({
    clients,
    plans,
    prices,
    users: withUsers ? await clientUsers(clients.map((c) => c.id)) : undefined,
  });
});

/** POST /clients — "Novo cliente": the account and a license code for its admin. */
export const POST = handler(async (req) => {
  const a = await requireAdmin('clients', true);
  return json(await createClient(a, await body(req, NewClientZ), clientIp(req)), { status: 201 });
});
