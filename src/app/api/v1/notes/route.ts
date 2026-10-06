import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createNote, listNotes } from '@/server/content/notes';

// GET /notes?folder=&fav=1&q=  ·  POST /notes { folderId?, title? }
export const GET = handler(async (req) => {
  const auth = await requireContent('notes');
  const sp = new URL(req.url).searchParams;
  const folder = sp.get('folder');
  return json({
    notes: await listNotes(auth, {
      folder: folder ? z.uuid().parse(folder) : undefined,
      fav: sp.get('fav') === '1',
      search: sp.get('q')?.trim().slice(0, 200) || undefined,
    }),
  });
});

export const POST = handler(async (req) => {
  const auth = await requireContent('notes');
  const input = await body(
    req,
    z.object({ folderId: z.uuid().nullable().optional(), title: z.string().max(300).optional() }),
  );
  return json({ note: await createNote(auth, input) }, { status: 201 });
});
