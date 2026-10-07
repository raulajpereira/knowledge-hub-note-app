import { body, handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { addMember } from '@/server/share/folders';
import { MemberAdd } from '../../../schemas';

/**
 * POST /share/folders/:id/members {email, invite?, perm?} — adds someone with
 * an account; an email without one answers `needs_invite` until `invite: true`.
 */
export const POST = handler(async (req, ctx: IdCtx) => {
  const auth = await requireContent('share');
  const { email, invite, perm } = await body(req, MemberAdd);
  return json(await addMember(auth, await idParam(ctx), email, { invite, perm, lang: auth.user.lang }));
});
