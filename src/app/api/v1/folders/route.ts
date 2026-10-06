import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { requireContent } from '@/server/content/guard';
import { createFolder, listFolders } from '@/server/content/notes';

// GET|POST /folders?kind=notes — other kinds join with their modules.
const kindOf = (url: string) => {
  const kind = new URL(url).searchParams.get('kind') ?? 'notes';
  if (kind !== 'notes') throw new ApiError(400, 'invalid_input');
  return kind;
};

export const GET = handler(async (req) => {
  kindOf(req.url);
  const auth = await requireContent('notes');
  return json(await listFolders(auth));
});

export const POST = handler(async (req) => {
  kindOf(req.url);
  const auth = await requireContent('notes');
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(80) }));
  return json({ folder: await createFolder(auth, name) }, { status: 201 });
});
