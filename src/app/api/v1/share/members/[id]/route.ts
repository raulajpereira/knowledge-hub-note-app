import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { removeMember, updateMember } from '@/server/share/folders';
import { MemberPatch } from '../../schemas';

/** PATCH /share/members/:id {perm?, paused?} — folder owner only (RLS). */
export const PATCH = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('share');
  await updateMember(auth, await idParam(ctx), await body(req, MemberPatch));
  return json({ ok: true });
});

export const DELETE = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('share');
  await removeMember(auth, await idParam(ctx));
  return json({ ok: true });
});
