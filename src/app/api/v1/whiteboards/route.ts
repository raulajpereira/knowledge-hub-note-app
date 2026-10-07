import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { createBoard, listBoards } from '@/server/content/whiteboards';
import { linkTypes } from './types';

/** GET /whiteboards — the user's boards with their elements, and the titles of the app items on them. */
export const GET = handler(async () => {
  const auth = await requireContent('whiteboard');
  return json(await listBoards(auth, await linkTypes(auth.tenant.id)));
});

export const POST = handler(async (req) => {
  const auth = await requireContent('whiteboard');
  const { name } = await body(req, z.object({ name: z.string().trim().max(200) }));
  return json({ board: await createBoard(auth, name) }, { status: 201 });
});
