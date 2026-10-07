import { z } from 'zod';
import { handler, json } from '@/server/http';
import { ApiError } from '@/server/errors';
import { requireContent } from '@/server/content/guard';
import { peekItem } from '@/server/content/whiteboards';
import { LINK_TYPES } from '@/lib/whiteboard';
import { linkTypes } from '../types';

/** GET /whiteboards/peek?type=&id= — what the popup shows for an app item on a board. */
export const GET = handler(async (req) => {
  const auth = await requireContent('whiteboard');
  const sp = new URL(req.url).searchParams;
  const { type, id } = z
    .object({ type: z.enum(LINK_TYPES), id: z.uuid() })
    .parse({ type: sp.get('type'), id: sp.get('id') });
  if (!(await linkTypes(auth.tenant.id)).includes(type)) throw new ApiError(404, 'not_found');
  return json({ item: await peekItem(auth, type, id) });
});
