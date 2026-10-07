import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { listPeople, pausePerson, removePerson } from '@/server/share/folders';
import { PersonPatch } from '../schemas';

/** GET /share/people — "Pessoas com Acesso" to the caller's folders. */
export const GET = handler(async () => json({ people: await listPeople(await requireContent('share')) }));

/** PATCH /share/people {email, paused} — pause/resume someone in all the caller's folders. */
export const PATCH = handler(async (req) => {
  const auth = await requireContent('share');
  const { email, paused } = await body(req, PersonPatch);
  await pausePerson(auth, email, paused);
  return json({ ok: true });
});

/** DELETE /share/people?email= — "Remover tudo". */
export const DELETE = handler(async (req) => {
  const auth = await requireContent('share');
  const email = z.email().parse(new URL(req.url).searchParams.get('email'));
  await removePerson(auth, email);
  return json({ ok: true });
});
