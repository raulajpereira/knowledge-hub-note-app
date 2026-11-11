import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { includeRange } from '@/server/content/timelog';
import { timelogAuth, tzOf } from '@/server/content/timelogHttp';

/** POST /timelog/include { from, to } — "Enviar semana para a folha de tempos". */
export const POST = handler(async (req) => {
  const input = await body(req, z.object({ from: z.iso.datetime(), to: z.iso.datetime() }));
  const { auth, mods } = await timelogAuth();
  const added = await includeRange(auth, new Date(input.from), new Date(input.to), mods, tzOf(req));
  return json({ added });
});
