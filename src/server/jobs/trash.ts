import { sql } from 'drizzle-orm';
import { users } from '@/db/schema';
import { db } from '@/db/client';
import type { AuthContext } from '@/server/auth/session';
import { listTrash, purgeTrash } from '@/server/content/notes';

// The Trash keeps things for 30 days (the Trash page counts them down): after
// that they are deleted for good, as each person would with "Eliminar".
// Runs as each person under RLS, so it reaches exactly what their Trash shows.

export async function expireTrash() {
  const people = await db().select({ id: users.id, tenantId: users.tenantId }).from(users);
  let purged = 0;
  let failed = 0;
  for (const p of people) {
    const auth = { user: { id: p.id }, tenant: { id: p.tenantId } } as AuthContext;
    try {
      const due = (await listTrash(auth)).filter((x) => x.daysLeft <= 0);
      if (!due.length) continue;
      await purgeTrash(
        auth,
        due.map((x) => ({ kind: x.kind, id: x.id })),
        { system: true },
      );
      purged += due.length;
    } catch (e) {
      failed++;
      console.error('[trash] expire failed for user', p.id, e);
    }
  }
  return { purged, failed };
}

/** Note images no note points to any more (a day after they were added). */
export async function pruneNoteImages() {
  const [r] = await db().execute<{ n: number }>(sql`select kh_prune_note_attachments() as n`);
  return r?.n ?? 0;
}
