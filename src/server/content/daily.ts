import 'server-only';
import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';
import { folders, meetings, notes, tasks } from '@/db/schema';
import type { AuthContext } from '@/server/auth/session';
import { translate, type Lang } from '@/i18n';
import { asUser } from './tenant';
import { createFolder, createNote, updateNote } from './notes';

// "Nota do dia": one note per day in the "Diário" notebook, made the first
// time it is opened, starting with that day's meetings and pending tasks (as
// links) and room for free notes. The Início shows the day in a popup.

export type DailyInfo = {
  day: string;
  meetings: Array<{ id: string; title: string; start: string }>;
  tasks: Array<{ id: string; title: string; dueOn: string | null }>;
  noteId: string | null;
};

const dailyOf = (day: string) => sql`${notes.meta}->>'daily' = ${day}`;

export async function dailyInfo(
  auth: AuthContext,
  day: string,
  mods: ReadonlySet<string>,
): Promise<DailyInfo> {
  return asUser(auth, async (tx) => {
    const ms = mods.has('meetings')
      ? await tx
          .select({ id: meetings.id, title: meetings.title, start: meetings.startTime })
          .from(meetings)
          .where(and(eq(meetings.heldOn, day), isNull(meetings.deletedAt)))
          .orderBy(asc(meetings.startTime))
          .limit(20)
      : [];
    const ts = mods.has('tasks')
      ? await tx
          .select({ id: tasks.id, title: tasks.title, dueOn: tasks.dueOn })
          .from(tasks)
          .where(
            and(
              eq(tasks.ownerId, auth.user.id),
              isNull(tasks.deletedAt),
              isNull(tasks.doneAt),
              lte(tasks.dueOn, day),
            ),
          )
          .orderBy(asc(tasks.dueOn))
          .limit(20)
      : [];
    const [n] = await tx
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.ownerId, auth.user.id), isNull(notes.deletedAt), dailyOf(day)))
      .limit(1);
    return { day, meetings: ms, tasks: ts, noteId: n?.id ?? null };
  });
}

const link = (text: string, href: string) => ({
  type: 'text',
  text,
  marks: [{ type: 'link', attrs: { href } }],
});

/** The day's note (made now when there is none). */
export async function openDaily(
  auth: AuthContext,
  day: string,
  mods: ReadonlySet<string>,
  lang: Lang,
): Promise<{ id: string; created: boolean }> {
  const info = await dailyInfo(auth, day, mods);
  if (info.noteId) return { id: info.noteId, created: false };
  const t = (k: string) => translate(lang, k);
  const name = t('dn_folder');
  const folderId = await asUser(auth, async (tx) => {
    const [f] = await tx
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.kind, 'notes'), eq(folders.name, name), isNull(folders.deletedAt)))
      .limit(1);
    return f?.id ?? null;
  });
  const fid = folderId ?? (await createFolder(auth, name)).id;
  const when = new Date(`${day}T12:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  const title = `${t('dn_title')} · ${when.charAt(0).toUpperCase()}${when.slice(1)}`;
  const note = await createNote(auth, { folderId: fid, title });
  const content = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: t('dn_meetings') }] },
      info.meetings.length
        ? {
            type: 'bulletList',
            content: info.meetings.map((m) => ({
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    ...(m.start ? [{ type: 'text', text: `${m.start} · ` }] : []),
                    link(m.title || '—', `/app/meetings?m=${m.id}`),
                  ],
                },
              ],
            })),
          }
        : { type: 'paragraph', content: [{ type: 'text', text: t('dn_noMeetings') }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: t('dn_tasks') }] },
      info.tasks.length
        ? {
            type: 'taskList',
            content: info.tasks.map((x) => ({
              type: 'taskItem',
              attrs: { checked: false },
              content: [{ type: 'paragraph', content: [link(x.title || '—', `/app/tasks?t=${x.id}`)] }],
            })),
          }
        : { type: 'paragraph', content: [{ type: 'text', text: t('dn_noTasks') }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: t('dn_notes') }] },
      { type: 'paragraph' },
    ],
  };
  await updateNote(auth, note.id, { content });
  await asUser(auth, (tx) =>
    tx
      .update(notes)
      .set({ meta: sql`${notes.meta} || ${JSON.stringify({ daily: day })}::jsonb` })
      .where(eq(notes.id, note.id)),
  );
  return { id: note.id, created: true };
}
