import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { idParam, type IdCtx } from '@/server/content/guard';
import { MappingZ, previewSource } from '@/server/helpdesk';
import { helpdeskAuth } from '@/server/helpdesk/http';

/** POST /helpdesk/sources/:id/preview — { mapping }: what the last read would create / update. */
export const POST = handler(async (req, ctx: IdCtx) => {
  const { mapping } = await body(req, z.object({ mapping: MappingZ }));
  const auth = await helpdeskAuth();
  return json(await previewSource(auth, await idParam(ctx), mapping));
});
