import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { listClients, listSystems } from '@/server/content/sap';
import { createTransport, listTransports } from '@/server/content/transports';
import { TransportInput } from '../schemas';

/** GET /sap/transports — the requests, plus the systems and clients they refer to (route DEV → QAS → PRD). */
export const GET = handler(async () => {
  const auth = await requireContent('transports');
  const [transports, systems, clients] = await Promise.all([
    listTransports(auth),
    listSystems(auth),
    listClients(auth),
  ]);
  return json({
    transports,
    systems: systems.map(({ id, name, sid, env, clientId }) => ({ id, name, sid, env, clientId })),
    clients,
  });
});

export const POST = handler(async (req) => {
  const auth = await requireContent('transports');
  return json({ transport: await createTransport(auth, await body(req, TransportInput)) }, { status: 201 });
});
