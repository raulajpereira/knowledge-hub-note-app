import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createTicket, listTickets } from '@/server/content/tickets';
import { TicketCreate } from './schemas';

/**
 * GET /tickets — the caller's tickets, folders and types; ?shared=<id>: the
 * tickets of a shared folder (with its owner's types) · POST creates one.
 */
export const GET = handler(async (req) => {
  const auth = await requireContent('tickets');
  const shared = new URL(req.url).searchParams.get('shared');
  return json(await listTickets(auth, shared ? z.uuid().parse(shared) : undefined));
});

/** POST — 409 ticket_number_taken when the caller already has a ticket with that number (any case). */
export const POST = handler(async (req) => {
  const auth = await requireContent('tickets');
  const input = await body(req, TicketCreate);
  return json({ ticket: await createTicket(auth, input) }, { status: 201 });
});
