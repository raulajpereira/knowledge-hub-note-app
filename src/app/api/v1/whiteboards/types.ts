import 'server-only';
import { getEntitlements } from '@/server/licensing/entitlements';
import { moduleOfLink } from '@/server/content/whiteboards';
import { LINK_TYPES, type LinkType } from '@/lib/whiteboard';

/** App item types a board can show: only those whose module is in the plan. */
export async function linkTypes(tenantId: string): Promise<LinkType[]> {
  const { modules } = await getEntitlements(tenantId);
  return LINK_TYPES.filter((t) => modules.includes(moduleOfLink(t)));
}
