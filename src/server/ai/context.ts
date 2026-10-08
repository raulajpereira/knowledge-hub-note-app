import 'server-only';
import { and, asc, desc, gte, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  artifacts,
  driveFiles,
  emails,
  issues,
  meetings,
  notes,
  sapObjects,
  sapTransports,
  snippets,
  tasks,
  voiceNotes,
  type AiSource,
} from '@/db/schema';
import type { AuthContext } from '@/server/auth/session';
import { asUser, type Tx } from '@/server/content/tenant';

// What the assistant reads to answer: the person's own content (everything
// but the password vault) found by the words of the question — a plain text
// search, so it works with any provider (no embeddings needed). Every query
// runs as the person under RLS, so only what they can see is ever sent.

const STOP = new Set(
  (
    'a o as os um uma uns umas de do da dos das em no na nos nas por para com sem sobre entre ' +
    'e ou mas que se como qual quais quem onde quando porque porquê ja já ainda muito muita ' +
    'é foi ser são está estão tem têm ter há isso isto esse essa este esta meu minha meus minhas ' +
    'teu tua seu sua nosso nossa me te lhe nos vos lhes eu tu ele ela nós vós eles elas ' +
    'the a an of to in on at for with by from and or but what which who where when why how ' +
    'is are was were be been do does did have has had my your our their it this that these those ' +
    'diz diga mostra mostrar lista listar sabes saber fazer feito sobre acerca tudo todos todas'
  ).split(/\s+/),
);

/** The search words of a question (accents kept; at most 8). */
export function keywords(q: string): string[] {
  const out: string[] = [];
  for (const raw of q.toLowerCase().split(/[^\p{L}\p{N}_/-]+/u)) {
    const w = raw.replace(/^[-/]+|[-/]+$/g, '');
    if (w.length < 3 && !/\d/.test(w)) continue;
    if (STOP.has(w) || out.includes(w)) continue;
    out.push(w);
    if (out.length >= 8) break;
  }
  return out;
}

type Hit = AiSource & { text: string; at: Date; score: number };
const esc = (w: string) => `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

async function search(tx: Tx, words: string[]): Promise<Hit[]> {
  const kinds: Array<{ type: string; table: unknown; title: SQL; body: SQL; at: AnyPgColumn; alive: SQL }> = [
    {
      type: 'note',
      table: notes,
      title: sql`${notes.title}`,
      body: sql`${notes.title} || ' ' || ${notes.contentText}`,
      at: notes.updatedAt,
      alive: isNull(notes.deletedAt)!,
    },
    {
      type: 'meeting',
      table: meetings,
      title: sql`${meetings.title} || ' (' || ${meetings.heldOn} || ')'`,
      body: sql`${meetings.title} || ' ' || ${meetings.heldOn} || ' ' || array_to_string(${meetings.participants}, ', ') || ' ' || ${meetings.topics} || ' ' || ${meetings.review}::text || ' ' || ${meetings.todos}::text`,
      at: meetings.updatedAt,
      alive: isNull(meetings.deletedAt)!,
    },
    {
      type: 'task',
      table: tasks,
      title: sql`${tasks.title}`,
      body: sql`${tasks.title} || ' ' || ${tasks.notes} || ' ' || coalesce(${tasks.dueOn}::text, '') || case when ${tasks.doneAt} is null then ' (aberta)' else ' (concluída)' end`,
      at: tasks.updatedAt,
      alive: isNull(tasks.deletedAt)!,
    },
    {
      type: 'issue',
      table: issues,
      title: sql`${issues.title}`,
      body: sql`${issues.title} || ' [' || ${issues.status} || '] ' || ${issues.description} || ' ' || ${issues.notes}`,
      at: issues.updatedAt,
      alive: isNull(issues.deletedAt)!,
    },
    {
      type: 'voice',
      table: voiceNotes,
      title: sql`${voiceNotes.title}`,
      body: sql`${voiceNotes.title} || ' ' || coalesce(${voiceNotes.transcript}, '') || ' ' || ${voiceNotes.notes}`,
      at: voiceNotes.updatedAt,
      alive: isNull(voiceNotes.deletedAt)!,
    },
    {
      type: 'artifact',
      table: artifacts,
      title: sql`${artifacts.title}`,
      body: sql`${artifacts.title} || ' ' || ${artifacts.description}`,
      at: artifacts.updatedAt,
      alive: isNull(artifacts.deletedAt)!,
    },
    {
      type: 'email',
      table: emails,
      title: sql`${emails.subject}`,
      body: sql`${emails.subject} || ' — ' || ${emails.fromName} || ' ' || ${emails.bodyText} || ' ' || ${emails.notes}`,
      at: emails.updatedAt,
      alive: isNull(emails.deletedAt)!,
    },
    {
      type: 'snippet',
      table: snippets,
      title: sql`${snippets.title}`,
      body: sql`${snippets.title} || ' ' || ${snippets.description} || ' ' || ${snippets.files}::text`,
      at: snippets.updatedAt,
      alive: isNull(snippets.deletedAt)!,
    },
    {
      type: 'code',
      table: sapObjects,
      title: sql`${sapObjects.type} || ' ' || ${sapObjects.name}`,
      body: sql`${sapObjects.type} || ' ' || ${sapObjects.name} || ' ' || ${sapObjects.description} || ' ' || ${sapObjects.nodes}::text`,
      at: sapObjects.updatedAt,
      alive: isNull(sapObjects.deletedAt)!,
    },
    {
      type: 'transport',
      table: sapTransports,
      title: sql`${sapTransports.trkorr} || ' ' || ${sapTransports.description}`,
      body: sql`${sapTransports.trkorr} || ' ' || ${sapTransports.description} || ' ' || ${sapTransports.owner} || ' ' || ${sapTransports.notes}`,
      at: sapTransports.updatedAt,
      alive: isNull(sapTransports.deletedAt)!,
    },
    {
      type: 'file',
      table: driveFiles,
      title: sql`${driveFiles.name}`,
      body: sql`${driveFiles.name}`,
      at: driveFiles.updatedAt,
      alive: isNull(driveFiles.deletedAt)!,
    },
  ];
  const hits: Hit[] = [];
  for (const k of kinds) {
    const t = k.table as typeof notes;
    const rows = (await tx
      .select({ id: t.id, title: k.title, body: k.body, at: k.at })
      .from(t)
      .where(and(k.alive, or(...words.map((w) => sql`(${k.body}) ilike ${esc(w)}`))))
      .orderBy(desc(k.at))
      .limit(25)) as Array<{ id: string; title: string; body: string; at: Date }>;
    for (const r of rows) {
      const body = (r.body ?? '').toLowerCase();
      const title = (r.title ?? '').toLowerCase();
      let score = 0;
      for (const w of words) {
        if (title.includes(w)) score += 3;
        if (body.includes(w)) score += 1 + Math.min(3, body.split(w).length - 2);
      }
      hits.push({ type: k.type, id: r.id, title: r.title || '—', text: r.body ?? '', at: r.at, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score || b.at.getTime() - a.at.getTime());
}

/** A window of the text around the first search word (or its start). */
function excerpt(text: string, words: string[], max = 1400) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const low = clean.toLowerCase();
  const at = Math.min(...words.map((w) => low.indexOf(w)).filter((i) => i >= 0), clean.length);
  const from = at === clean.length ? 0 : Math.max(0, at - 300);
  return `${from > 0 ? '…' : ''}${clean.slice(from, from + max)}…`;
}

/** Today's agenda: meetings of the next week and open tasks due soon. */
async function agenda(tx: Tx, today: string) {
  const week = new Date(`${today}T12:00:00`);
  week.setDate(week.getDate() + 7);
  const until = week.toISOString().slice(0, 10);
  const ms = await tx
    .select({ title: meetings.title, on: meetings.heldOn, start: meetings.startTime })
    .from(meetings)
    .where(and(isNull(meetings.deletedAt), gte(meetings.heldOn, today), lte(meetings.heldOn, until)))
    .orderBy(asc(meetings.heldOn), asc(meetings.startTime))
    .limit(10);
  const ts = await tx
    .select({ title: tasks.title, due: tasks.dueOn })
    .from(tasks)
    .where(and(isNull(tasks.deletedAt), isNull(tasks.doneAt), lte(tasks.dueOn, until)))
    .orderBy(asc(tasks.dueOn))
    .limit(10);
  const lines = [
    ...ms.map((m) => `- Reunião ${m.on}${m.start ? ` ${m.start}` : ''}: ${m.title}`),
    ...ts.map((t) => `- Tarefa aberta, prazo ${t.due}: ${t.title}`),
  ];
  return lines.length ? lines.join('\n') : '';
}

/** The numbered sources for a question, plus the agenda. */
export async function buildContext(auth: AuthContext, question: string, today: string, limit = 8) {
  const words = keywords(question);
  return asUser(auth, async (tx) => {
    const hits = words.length ? (await search(tx, words)).slice(0, limit) : [];
    const sources: AiSource[] = hits.map(({ type, id, title }) => ({ type, id, title }));
    const blocks = hits.map((h, i) => `[${i + 1}] (${h.type}) ${h.title}\n${excerpt(h.text, words)}`);
    return { sources, blocks, agenda: await agenda(tx, today) };
  });
}
