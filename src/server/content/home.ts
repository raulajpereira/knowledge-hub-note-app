import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  emails,
  folders,
  issues,
  mgClients,
  notes,
  sapSystemFavs,
  sapSystems,
  sapTcodeUsage,
  sapTcodes,
  tasks,
} from '@/db/schema';
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
  issues?: Array<{
    id: string;
    title: string;
    status: 'open' | 'progress' | 'waiting';
    priority: 'low' | 'medium' | 'high' | 'critical';
    dueOn: string | null;
  }>;
  emails?: {
    total: number;
    starred: Array<{ id: string; subject: string; from: string; sentAt: string | null }>;
    pinned: Array<{ id: string; subject: string }>;
  };
  /** Transações Favoritas: the user's favourite transactions. */
  tcodes?: Array<{ id: string; code: string; module: string; description: string }>;
  /** Acesso Rápido SAP: the user's favourite systems (enough to build the .sap shortcut). */
  systems?: Array<{
    id: string;
    name: string;
    sid: string;
    env: string;
    client: string;
    host: string;
    inst: string;
    mandt: string;
    router: string;
    lang: string;
    sapUser: string;
  }>;
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
    if (modules.has('issues'))
      out.issues = (await tx
        .select({
          id: issues.id,
          title: issues.title,
          status: issues.status,
          priority: issues.priority,
          dueOn: issues.dueOn,
        })
        .from(issues)
        .where(and(isNull(issues.deletedAt), sql`${issues.status} <> 'done'`))
        .limit(2000)) as NonNullable<HomeData['issues']>;
    if (modules.has('emails')) {
      const rows = await tx
        .select({
          id: emails.id,
          subject: emails.subject,
          fromName: emails.fromName,
          fromEmail: emails.fromEmail,
          sentAt: emails.sentAt,
          starred: emails.starred,
          pinned: emails.pinned,
        })
        .from(emails)
        .where(isNull(emails.deletedAt))
        .orderBy(desc(emails.sentAt))
        .limit(2000);
      out.emails = {
        total: rows.length,
        starred: rows
          .filter((r) => r.starred)
          .slice(0, 20)
          .map((r) => ({
            id: r.id,
            subject: r.subject,
            from: r.fromName || r.fromEmail,
            sentAt: r.sentAt?.toISOString() ?? null,
          })),
        pinned: rows.filter((r) => r.pinned).map((r) => ({ id: r.id, subject: r.subject })),
      };
    }
    if (modules.has('tcodes'))
      out.tcodes = await tx
        .select({
          id: sapTcodes.id,
          code: sapTcodes.code,
          module: sapTcodes.module,
          description: sapTcodes.description,
        })
        .from(sapTcodeUsage)
        .innerJoin(sapTcodes, eq(sapTcodes.id, sapTcodeUsage.tcodeId))
        .where(
          and(
            eq(sapTcodeUsage.userId, auth.user.id),
            eq(sapTcodeUsage.fav, true),
            isNull(sapTcodes.deletedAt),
          ),
        )
        .orderBy(sapTcodes.code)
        .limit(12);
    if (modules.has('systems'))
      out.systems = await tx
        .select({
          id: sapSystems.id,
          name: sapSystems.name,
          sid: sapSystems.sid,
          env: sapSystems.env,
          client: sql<string>`coalesce(${mgClients.name}, '')`,
          host: sapSystems.host,
          inst: sapSystems.inst,
          mandt: sapSystems.mandt,
          router: sapSystems.router,
          lang: sapSystems.lang,
          sapUser: sapSystems.sapUser,
        })
        .from(sapSystemFavs)
        .innerJoin(sapSystems, eq(sapSystems.id, sapSystemFavs.systemId))
        .leftJoin(mgClients, eq(mgClients.id, sapSystems.clientId))
        .where(and(eq(sapSystemFavs.userId, auth.user.id), isNull(sapSystems.deletedAt)))
        .orderBy(sapSystems.name)
        .limit(24);
    return out;
  });
}
