import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createNote, listNotes } from '@/server/content/notes';
import { reachableFolder } from '@/server/share/folders';
import { noteViewParams } from '@/server/content/views';

// GET /notes?folder=&fav=1&q=&shared=&tag=a&tag=b&tm=all&days=30  ·  POST /notes { folderId?, title?, sharedFolderId? }
export const GET = handler(async (req) => {
  const auth = await requireContent('notes');
  const sp = new URL(req.url).searchParams;
  const folder = sp.get('folder');
  const sh = sp.get('shared');
  const shared = sh ? await reachableFolder(auth, z.uuid().parse(sh)) : undefined;
  if (shared && shared.kind !== 'notes') return json({ notes: [], next: null });
  // pages of 200, newest first; `next` is the cursor for the following page
  const PAGE = 200;
  const list = await listNotes(auth, {
    shared,
    folder: folder ? z.uuid().parse(folder) : undefined,
    fav: sp.get('fav') === '1',
    search: sp.get('q')?.trim().slice(0, 200) || undefined,
    ...noteViewParams(sp),
    after: sp.get('after')?.slice(0, 80) || undefined,
    limit: PAGE + 1,
  });
  const more = list.length > PAGE;
  const notes = more ? list.slice(0, PAGE) : list;
  const last = notes.at(-1);
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
