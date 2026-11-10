import { z } from 'zod';
import { handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { restoreNoteVersion } from '@/server/content/noteVersions';
import { requireModuleFor } from '@/server/workspaces';

type Ctx = { params: Promise<{ id: string; vid: string }> };

/** POST /notes/:id/versions/:vid/restore — keeps the current state as a version, then restores that one. */
export const POST = handler(async (_req, ctx: Ctx) => {
  const auth = await requireContent('notes');
  await requireModuleFor(auth, 'history');
  const p = await ctx.params;
  return json({ note: await restoreNoteVersion(auth, z.uuid().parse(p.id), z.uuid().parse(p.vid)) });
});
