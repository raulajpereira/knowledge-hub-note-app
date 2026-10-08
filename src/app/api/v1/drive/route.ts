import { z } from 'zod';
import { handler, json } from '@/server/http';
import { requireContent } from '@/server/content/guard';
import { reachableFolder } from '@/server/share/folders';
import { listDrive } from '@/server/content/drive';

/** GET /drive — files, folders and the space used · ?shared=<folder> the files of a shared folder. */
export const GET = handler(async (req) => {
  const auth = await requireContent('files');
  const sh = new URL(req.url).searchParams.get('shared');
  const shared = sh ? await reachableFolder(auth, z.uuid().parse(sh)) : undefined;
  return json(await listDrive(auth, shared));
});
