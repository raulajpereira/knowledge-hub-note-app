import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { userPrefs } from '@/db/schema';
import { ApiError } from '@/server/errors';
import { MAX_PREFS_BYTES, mergePrefs, parsePrefsPatch, type Prefs } from '@/lib/prefs';

export async function getPrefs(userId: string): Promise<Prefs> {
  const [row] = await db()
    .select({ data: userPrefs.data })
    .from(userPrefs)
    .where(eq(userPrefs.userId, userId))
    .limit(1);
  return (row?.data as Prefs | undefined) ?? {};
}

/** Merge-patch: only the keys sent change, so two devices editing different settings don't clobber each other. */
export async function patchPrefs(userId: string, input: unknown): Promise<Prefs> {
  let patch: Record<string, unknown>;
  try {
    patch = parsePrefsPatch(input);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('pref_')) throw new ApiError(400, e.message);
    throw e;
  }
  return db().transaction(async (tx) => {
    await tx.insert(userPrefs).values({ userId, data: {} }).onConflictDoNothing();
    const [row] = await tx
      .select({ data: userPrefs.data })
      .from(userPrefs)
      .where(eq(userPrefs.userId, userId))
      .for('update');
    const next = mergePrefs((row?.data as Prefs) ?? {}, patch);
    if (JSON.stringify(next).length > MAX_PREFS_BYTES) throw new ApiError(400, 'pref_too_large');
    await tx
      .update(userPrefs)
      .set({ data: next, updatedAt: sql`now()` })
      .where(eq(userPrefs.userId, userId));
    return next;
  });
}
