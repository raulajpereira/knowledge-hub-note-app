import 'server-only';
import { z } from 'zod';
import { requireAuth } from '@/server/auth/request';
import { requireModule } from '@/server/licensing/entitlements';

/** Session + entitlement for a content module (API.md: every app route needs both). */
export async function requireContent(moduleId: string) {
  const auth = await requireAuth();
  await requireModule(auth.tenant.id, moduleId);
  return auth;
}

export const idParam = async (ctx: { params: Promise<{ id: string }> }) =>
  z.uuid().parse((await ctx.params).id);
export type IdCtx = { params: Promise<{ id: string }> };

export const copySuffix = z.object({ suffix: z.string().max(24).default(' (cópia)') });
export const trashItems = z.object({
  items: z.array(z.object({ kind: z.enum(['note', 'folder', 'task', 'voice']), id: z.uuid() })).max(500),
});
export const itemRef = z.object({ type: z.enum(['note', 'task', 'voice']), id: z.uuid() });
/** Module that owns an item type (links need the module of the item they start from). */
export const moduleOfType = (type: 'note' | 'task' | 'voice') =>
  type === 'task' ? 'tasks' : type === 'voice' ? 'voice' : 'notes';
