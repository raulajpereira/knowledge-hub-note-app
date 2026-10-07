import 'server-only';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { newsSaved } from '@/db/schema';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { asUser } from '@/server/content/tenant';
import { sanitizeArticle } from './article';

// "Guardadas para mais tarde" (SapNews.dc.html saved): private to the user.
// The client sends the article it has; the server keeps a re-sanitised copy.

const httpUrl = z
  .string()
  .max(2000)
  .regex(/^https?:\/\/\S+$/i);
export const SavedInput = z.object({
  title: z.string().trim().min(1).max(500),
  link: httpUrl,
  src: z.string().regex(/^[\w-]{1,40}$/),
  date: z.union([z.literal(''), z.iso.datetime()]),
  author: z.string().max(200),
  img: z.union([z.literal(''), httpUrl]),
  excerpt: z.string().max(400),
  html: z.string().max(400_000),
});
export type SavedItem = z.infer<typeof SavedInput> & { savedAt: string };
const MAX = 500;

export async function listSaved(auth: AuthContext): Promise<SavedItem[]> {
  return asUser(auth, async (tx) => {
    const rs = await tx
      .select({ item: newsSaved.item, at: newsSaved.createdAt })
      .from(newsSaved)
      .orderBy(desc(newsSaved.createdAt))
      .limit(MAX);
    return rs.map((r) => ({ ...(r.item as SavedItem), savedAt: r.at.toISOString() }));
  });
}

export async function saveItem(auth: AuthContext, input: z.infer<typeof SavedInput>) {
  const item = { ...input, html: sanitizeArticle(input.html, input.link) };
  await asUser(auth, async (tx) => {
    const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(newsSaved)) as [{ n: number }];
    if (n >= MAX) throw new ApiError(400, 'too_many_items');
    await tx
      .insert(newsSaved)
      .values({ tenantId: auth.tenant.id, ownerId: auth.user.id, link: item.link, item })
      .onConflictDoNothing();
  });
}

export async function unsaveItem(auth: AuthContext, link: string) {
  await asUser(auth, (tx) => tx.delete(newsSaved).where(eq(newsSaved.link, link)));
}

export async function countSaved(auth: AuthContext) {
  return asUser(auth, async (tx) => {
    const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(newsSaved);
    return r?.n ?? 0;
  });
}
