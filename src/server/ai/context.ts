import 'server-only';
import { and, asc, desc, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { meetings, notes, tasks, type AiSource } from '@/db/schema';
import type { AuthContext } from '@/server/auth/session';
import { asUser, type Tx } from '@/server/content/tenant';
import { chunkText, rrf, semanticQuery } from '@/lib/search/text';
import { embedQuery } from '@/server/search/embedClient';
import { vectorItems, type VecHit } from '@/server/search/semantic';
import { embedSelect, KINDS } from '@/server/search/sources';

// What the assistant reads to answer: the person's own content (everything
// but the password vault) found by the words of the question AND by meaning
// (local embeddings computed by the worker — no provider involved, so it works
// with any of them; keyword-only when semantic search is unavailable). Every
// query runs as the person under RLS, so only what they can see is ever sent.

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

type Hit = AiSource & { text: string; at: Date; score: number; chunk?: number };
const esc = (w: string) => `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

async function search(tx: Tx, words: string[]): Promise<Hit[]> {
  const hits: Hit[] = [];
  for (const k of KINDS) {
    const t = k.table as typeof notes;
    const rows = (await tx
      .select({ id: k.id, title: k.title, body: k.body, at: k.at })
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

/** Items found by meaning only: their title and the text that was embedded (chunk → excerpt). */
async function loadHits(tx: Tx, vs: VecHit[]): Promise<Hit[]> {
  const out: Hit[] = [];
  for (const k of KINDS) {
    const mine = vs.filter((v) => v.type === k.type);
    if (!mine.length) continue;
    const rows = (await tx
      .select({ id: k.id, title: k.title, body: embedSelect(k), at: k.at })
      .from(k.table as typeof notes)
      .where(
        and(
          k.alive,
          inArray(
            k.id,
            mine.map((v) => v.id),
          ),
        ),
      )) as Array<{
      id: string;
      title: string;
      body: string;
      at: Date;
    }>;
    for (const r of rows) {
      const v = mine.find((x) => x.id === r.id)!;
      out.push({
        type: k.type,
        id: r.id,
        title: r.title || '—',
        text: r.body ?? '',
        at: r.at,
        score: 0,
        chunk: v.chunk,
      });
    }
  }
  return out;
}

/**
 * Keyword and meaning together (reciprocal rank fusion): exact words still
 * rank first, and things that say the same in other words come in too.
 * Without a query vector (semantic search off, worker slow or down) this is
 * the keyword search alone.
 */
async function hybrid(tx: Tx, words: string[], vec: number[] | null, limit: number): Promise<Hit[]> {
  const kw = words.length ? await search(tx, words) : [];
  if (!vec) return kw.slice(0, limit);
  const vs = await vectorItems(tx, vec, { limit: 20 }).catch(() => [] as VecHit[]);
  if (!vs.length) return kw.slice(0, limit);
  const key = (h: { type: string; id: string }) => `${h.type}:${h.id}`;
  const merged = rrf([kw.map((h) => ({ key: key(h) })), vs.map((v) => ({ key: key(v) }))]).slice(0, limit);
  const byKey = new Map(kw.map((h) => [key(h), h]));
  const need = vs.filter((v) => merged.some((m) => m.key === key(v)) && !byKey.has(key(v)));
  for (const h of await loadHits(tx, need)) byKey.set(key(h), h);
  return merged.map((m) => byKey.get(m.key)).filter((h): h is Hit => !!h);
}

/** A window of the text around the first search word (or its start; for a meaning match, its chunk). */
function excerpt(text: string, words: string[], max = 1400, chunk?: number) {
  const clean =
    chunk !== undefined
      ? (chunkText(text)[chunk] ?? text).replace(/\s+/g, ' ').trim()
      : text.replace(/\s+/g, ' ').trim();
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
  // the query vector is fetched before the transaction (never hold one open on the network)
  const sq = semanticQuery(question);
  const vec = sq ? await embedQuery(sq, 1500) : null;
  return asUser(auth, async (tx) => {
    const hits = await hybrid(tx, words, vec, limit);
    const sources: AiSource[] = hits.map(({ type, id, title }) => ({ type, id, title }));
    const blocks = hits.map(
      (h, i) => `[${i + 1}] (${h.type}) ${h.title}\n${excerpt(h.text, words, 1400, h.chunk)}`,
    );
    return { sources, blocks, agenda: await agenda(tx, today) };
  });
}
