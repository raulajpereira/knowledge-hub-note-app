import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { allow } from '@/server/auth/rateLimit';
import { requireContent } from '@/server/content/guard';
import { importSapNotes } from '@/server/content/sapNotes';
import { parseNoteNumbers } from '@/lib/sapNotes';

/** POST /sap/notes/import { text } — a pasted list of note numbers; existing ones are skipped. */
export const POST = handler(async (req) => {
  const auth = await requireContent('sapnotes');
  if (!(await allow(`sapnotes-import:${auth.user.id}`, 30, 600)))
    throw new ApiError(429, 'too_many_requests');
  const { text } = await body(req, z.object({ text: z.string().max(50_000) }));
  const numbers = parseNoteNumbers(text);
  if (!numbers.length) throw new ApiError(400, 'invalid_input', 'no note numbers');
  return json(await importSapNotes(auth, numbers), { status: 201 });
});
