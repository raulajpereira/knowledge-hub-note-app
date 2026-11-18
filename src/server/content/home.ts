import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  driveFiles,
  emails,
  folders,
  issues,
  mgClients,
  notes,
  sapFnRecords,
  sapNoteSystems,
  sapNotes,
  sapSystemFavs,
  sapSystems,
  sapTcodeUsage,
  sapTcodes,
  sapTransports,
  tasks,
  voiceNotes,
} from '@/db/schema';
import type { AuthContext } from '@/server/auth/session';
import { asUser } from './tenant';
import { openTicketsTx, type HomeTicket } from './tickets';

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
  /** Ordens em Curso: requests not yet in PRD (and not junk). */
  transports?: Array<{
    id: string;
    trkorr: string;
    description: string;
    released: boolean;
    qas: boolean;
    createdAt: string;
  }>;
  /** Tickets abertos: the open tickets (not Resolvido / Fechado / Cancelado). */
  tickets?: HomeTicket[];
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
  /** Notas SAP: the notes still to implement in some system (and how many are done). */
  sapNotes?: {
    todo: number;
    done: number;
    list: Array<{ id: string; number: number; title: string; systems: string[] }>;
  };
  /** Cutover e Testes: progress of the cutover, the tests and the data migration. */
  fn?: Partial<Record<'cut' | 'test' | 'mig', { total: number; done: number; bad: number }>>;
  /** Ficheiros recentes */
  files?: Array<{ id: string; name: string; folder: string | null; updatedAt: string }>;
  /** Notas de voz recentes */
  voice?: Array<{ id: string; title: string; durationMs: number; transcribed: boolean; createdAt: string }>;
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
    if (modules.has('tickets')) out.tickets = await openTicketsTx(tx);
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
    if (modules.has('transports'))
      out.transports = (
        await tx
          .select({
            id: sapTransports.id,
            trkorr: sapTransports.trkorr,
            description: sapTransports.description,
            releasedAt: sapTransports.releasedAt,
            qasAt: sapTransports.qasAt,
            createdAt: sapTransports.createdAt,
          })
          .from(sapTransports)
          .where(
            and(isNull(sapTransports.deletedAt), isNull(sapTransports.prdAt), isNull(sapTransports.junkAt)),
          )
          .orderBy(desc(sapTransports.createdAt))
          .limit(2000)
      ).map((r) => ({
        id: r.id,
        trkorr: r.trkorr,
        description: r.description,
        released: !!r.releasedAt,
        qas: !!r.qasAt,
        createdAt: r.createdAt.toISOString(),
      }));
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
    if (modules.has('sapnotes')) {
      const rows = (await tx.execute(sql`
        select n.id::text as id, n.number, n.title,
          coalesce(array_agg(coalesce(s.sid, s.name)) filter (where ns.status = 'todo'), '{}') as systems,
          bool_or(ns.status = 'todo') as todo, bool_and(ns.status in ('done','nrel','obs')) as done
        from ${sapNotes} n
        join ${sapNoteSystems} ns on ns.note_id = n.id
        left join ${sapSystems} s on s.id = ns.system_id
        where n.deleted_at is null
        group by n.id, n.number, n.title, n.updated_at
        order by n.updated_at desc
        limit 500`)) as unknown as Array<{
        id: string;
        number: number;
        title: string;
        systems: string[];
        todo: boolean;
        done: boolean;
      }>;
      out.sapNotes = {
        todo: rows.filter((r) => r.todo).length,
        done: rows.filter((r) => r.done).length,
        list: rows
          .filter((r) => r.todo)
          .slice(0, 5)
          .map((r) => ({ id: r.id, number: r.number, title: r.title, systems: r.systems.filter(Boolean) })),
      };
    }
    const fnPages = (
      [
        ['cut', 'fn_cut', ['done'], []],
        ['test', 'fn_test', ['pass'], ['fail', 'block']],
        ['mig', 'fn_mig', ['ok'], []],
      ] as const
    ).filter(([, m]) => modules.has(m));
    if (fnPages.length) {
      out.fn = {};
      for (const [k, page, done, bad] of fnPages) {
        const rows = await tx
          .select({ st: sapFnRecords.st })
          .from(sapFnRecords)
          .where(and(eq(sapFnRecords.page, page), isNull(sapFnRecords.deletedAt)))
          .limit(5000);
        out.fn[k] = {
          total: rows.length,
          done: rows.filter((r) => (done as readonly string[]).includes(r.st)).length,
          bad: rows.filter((r) => (bad as readonly string[]).includes(r.st)).length,
        };
      }
    }
    if (modules.has('files'))
      out.files = (
        await tx
          .select({
            id: driveFiles.id,
            name: driveFiles.name,
            updatedAt: driveFiles.updatedAt,
            folder: folders.name,
          })
          .from(driveFiles)
          .leftJoin(folders, and(eq(folders.id, driveFiles.folderId), isNull(folders.deletedAt)))
          .where(isNull(driveFiles.deletedAt))
          .orderBy(desc(driveFiles.updatedAt))
          .limit(5)
      ).map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
    if (modules.has('voice'))
      out.voice = (
        await tx
          .select({
            id: voiceNotes.id,
            title: voiceNotes.title,
            durationMs: voiceNotes.durationMs,
            transcript: voiceNotes.transcript,
            createdAt: voiceNotes.createdAt,
          })
          .from(voiceNotes)
          .where(isNull(voiceNotes.deletedAt))
          .orderBy(desc(voiceNotes.createdAt))
          .limit(5)
      ).map((r) => ({
        id: r.id,
        title: r.title,
        durationMs: r.durationMs,
        transcribed: !!r.transcript.trim(),
        createdAt: r.createdAt.toISOString(),
      }));
    return out;
  });
}
