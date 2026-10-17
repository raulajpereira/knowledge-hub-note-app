import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createNote, listNotes } from '@/server/content/notes';
import { reachableFolder } from '@/server/share/folders';
import { semanticQuery } from '@/lib/search/text';
import { embedQuery } from '@/server/search/embedClient';

// GET /notes?folder=&fav=1&q=&shared=  ·  POST /notes { folderId?, title?, sharedFolderId? }
export const GET = handler(async (req) => {
  const auth = await requireContent('notes');
  const sp = new URL(req.url).searchParams;
  const folder = sp.get('folder');
  const sh = sp.get('shared');
  const shared = sh ? await reachableFolder(auth, z.uuid().parse(sh)) : undefined;
  if (shared && shared.kind !== 'notes') return json({ notes: [], next: null });
  // pages of 200, newest first; `next` is the cursor for the following page
  const PAGE = 200;
  const search = sp.get('q')?.trim().slice(0, 200) || undefined;
  const after = sp.get('after')?.slice(0, 80) || undefined;
  // meaning matches only on the first page (a quick vector from the worker, or none)
  const sq = search && !after ? semanticQuery(search) : null;
  const list = await listNotes(auth, {
    shared,
    folder: folder ? z.uuid().parse(folder) : undefined,
    fav: sp.get('fav') === '1',
    search,
    after,
    limit: PAGE + 1,
    vector: sq ? await embedQuery(sq) : null,
  });
  const words = list.filter((n) => !n.semantic);
  const more = words.length > PAGE;
  const notes = [...words.slice(0, PAGE), ...list.filter((n) => n.semantic)];
  const last = words.slice(0, PAGE).at(-1);
  return json({ notes, next: more && last ? `${last.updatedAt}|${last.id}` : null });
});

export const POST = handler(async (req) => {
  const auth = await requireContent('notes');
  const input = await body(
    req,
    z.object({
      folderId: z.uuid().nullable().optional(),
      title: z.string().max(300).optional(),
      sharedFolderId: z.uuid().nullable().optional(),
    }),
  );
  return json({ note: await createNote(auth, input) }, { status: 201 });
});
