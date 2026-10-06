import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { folders, notes, tasks } from '@/db/schema';
import type { AuthContext } from '@/server/auth/session';
import { asUser } from './tenant';

// Data for the Início cards (prototype isHome): only what the plan includes.

export type HomeData = {
  tasks?: Array<{
    id: string;
    title: string;
    type: 'tech' | 'mgmt';
    priority: 'low' | 'medium' | 'high';
    dueOn: string | null;
    pinned: boolean;
  }>;
  recentNotes?: Array<{
    id: string;
    title: string;
    folder: string | null;
    color: string | null;
    updatedAt: string;
  }>;
  favNotes?: Array<{ id: string; title: string }>;
};

export async function homeData(auth: AuthContext, modules: ReadonlySet<string>): Promise<HomeData> {
  return asUser(auth, async (tx) => {
    const out: HomeData = {};
    if (modules.has('tasks'))
      out.tasks = await tx
        .select({
          id: tasks.id,
          title: tasks.title,
          type: tasks.type,
          priority: tasks.priority,
          dueOn: tasks.dueOn,
          pinned: tasks.pinned,
        })
        .from(tasks)
        .where(and(isNull(tasks.deletedAt), isNull(tasks.doneAt)))
        .limit(1000);
    if (modules.has('notes')) {
      const rows = await tx
        .select({
          id: notes.id,
          title: notes.title,
          favorite: notes.favorite,
          updatedAt: notes.updatedAt,
          folder: folders.name,
          color: folders.color,
        })
        .from(notes)
        .leftJoin(folders, and(eq(folders.id, notes.folderId), isNull(folders.deletedAt)))
        .where(isNull(notes.deletedAt))
        .orderBy(desc(notes.updatedAt))
        .limit(500);
      out.recentNotes = rows.slice(0, 5).map((r) => ({
        id: r.id,
        title: r.title,
        folder: r.folder,
        color: r.color,
        updatedAt: r.updatedAt.toISOString(),
      }));
      out.favNotes = rows.filter((r) => r.favorite).map((r) => ({ id: r.id, title: r.title }));
    }
    return out;
  });
}
