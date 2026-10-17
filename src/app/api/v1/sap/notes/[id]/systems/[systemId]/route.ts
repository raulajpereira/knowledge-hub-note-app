import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { setNoteSystem } from '@/server/content/sapNotes';
import { NoteSystemInput } from '@/lib/sapNotes';

type Ctx = { params: Promise<{ id: string; systemId: string }> };

/** PUT /sap/notes/:id/systems/:systemId — status of the note in that system. */
export const PUT = handler(async (req, ctx: Ctx) => {
  const auth = await requireContent('sapnotes');
  const p = await ctx.params;
  const id = z.uuid().parse(p.id);
  const systemId = z.uuid().parse(p.systemId);
  return json({ system: await setNoteSystem(auth, id, systemId, await body(req, NoteSystemInput)) });
});
