import { handler, json } from '@/server/http';
import { idParam, requireContent, type IdCtx } from '@/server/content/guard';
import { requireModule } from '@/server/licensing/entitlements';
import { emailToTask } from '@/server/content/emails';
import { getLang } from '@/i18n/server';

/** POST /emails/:id/to-task — a task titled with the subject. */
export const POST = handler(async (_req, ctx: IdCtx) => {
  const auth = await requireContent('emails');
  await requireModule(auth.tenant.id, 'tasks');
  const task = await emailToTask(auth, await idParam(ctx), await getLang());
  return json({ task }, { status: 201 });
});
