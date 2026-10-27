import 'server-only';
import { isNull, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { sapNotes, sapSystems, sapTcodes } from '@/db/schema';
import type { AuthContext } from '@/server/auth/session';
import { asUser } from '@/server/content/tenant';
import { accentRegex, excerpt, MAX_QUERY, searchTerms } from '@/lib/search/fold';
import type { SearchGroup, SearchResponse } from '@/lib/search/global';
import { KINDS } from './sources';

// The header's global search: every module the plan has, matched while the
// person types. Each word of the query must appear (AND), accent- and
// case-insensitive, anywhere in a word — so "reu", "reuniao" and "Reunião"
// all find "Reunião semanal". Short words (1–2 characters) only match the
// start of a word of the title (searching every body for "re" is noise and
// slow). Ranking per group: title equal to / starting with the query, words
// at the start of a title word, in the title, then in the text; newest first.
// One round trip (UNION ALL of one small query per module), under RLS.

/** The KINDS of semantic search plus a few kinds only the global search reads. */
type Source = {
  type: string;
  module: string | null;
  table: PgTable;
  id: AnyPgColumn;
  title: SQL;
  body: SQL;
  at: SQL | AnyPgColumn;
  alive: SQL;
};

/** Plan module of each kind (a kind can name its own with `module`). */
export const GLOBAL_MODULE_OF: Record<string, string> = {
  note: 'notes',
  meeting: 'meetings',
  task: 'tasks',
  issue: 'issues',
  voice: 'voice',
  artifact: 'artifacts',
  email: 'emails',
  snippet: 'devlib',
  code: 'codelib',
  transport: 'transports',
  file: 'files',
  ticket: 'tickets',
};

const EXTRA: Source[] = [
  {
    type: 'system',
    module: 'systems',
    table: sapSystems,
    id: sapSystems.id,
    title: sql`${sapSystems.name} || case when ${sapSystems.sid} <> '' then ' · ' || ${sapSystems.sid} else '' end`,
    body: sql`${sapSystems.name} || ' ' || ${sapSystems.sid} || ' ' || ${sapSystems.env} || ' ' || ${sapSystems.host} || ' ' || ${sapSystems.track} || ' ' || ${sapSystems.notes}`,
    at: sapSystems.updatedAt,
    alive: isNull(sapSystems.deletedAt)!,
  },
  {
    type: 'tcode',
    module: 'tcodes',
    table: sapTcodes,
    id: sapTcodes.id,
    title: sql`${sapTcodes.code} || case when ${sapTcodes.description} <> '' then ' — ' || ${sapTcodes.description} else '' end`,
    body: sql`${sapTcodes.code} || ' ' || ${sapTcodes.description} || ' ' || ${sapTcodes.program} || ' ' || ${sapTcodes.module} || ' ' || ${sapTcodes.notes}`,
    at: sql`coalesce(${sapTcodes.updatedAt}, ${sapTcodes.createdAt})`,
    alive: isNull(sapTcodes.deletedAt)!,
  },
  {
    type: 'sapnote',
    module: 'sapnotes',
    table: sapNotes,
    id: sapNotes.id,
    title: sql`${sapNotes.number}::text || ' — ' || ${sapNotes.title}`,
    body: sql`${sapNotes.number}::text || ' ' || ${sapNotes.title} || ' ' || ${sapNotes.component} || ' ' || array_to_string(${sapNotes.tags}, ' ')`,
    at: sapNotes.updatedAt,
    alive: isNull(sapNotes.deletedAt)!,
  },
];

export function globalSources(): Source[] {
  return [
    ...KINDS.map((k) => ({
      type: k.type,
      module: k.module ?? GLOBAL_MODULE_OF[k.type] ?? null,
      table: k.table,
      id: k.id,
      title: k.title,
      body: k.body,
      at: k.at,
      alive: k.alive,
    })),
    ...EXTRA,
  ];
}

const SHORT = 3;

/**
 * One module's best `limit` matches. Matching is a case-insensitive regex per
 * word with the accented forms of each letter (accentRegex): Postgres scans
 * the text as stored, nothing is folded per row (see lib/search/fold.ts).
 */
export function sourceQuery(s: Source, q: string, terms: string[], limit: number): SQL {
  const re = (w: string) => accentRegex(w);
  // a word of the title starting with w
  const start = (w: string) => `\\m${re(w)}`;
  // title and text computed once per row (offset 0 keeps the subquery)
  const rows = sql`select ${s.id} as id, coalesce(${s.title}, '') as title, coalesce(${s.body}, '') as body,
      ${s.at} as at from ${s.table} where ${s.alive} offset 0`;
  const match = sql.join(
    terms.map((w) =>
      w.length < SHORT && !/\d/.test(w)
        ? sql`title ~* ${start(w)}`
        : sql`(title ~* ${re(w)} or body ~* ${re(w)})`,
    ),
    sql` and `,
  );
  const full = re(q.trim());
  const score = sql.join(
    [
      sql`case when title ~* ${`^\\s*${full}\\s*$`} then 1000 when title ~* ${`^\\s*${full}`} then 400 else 0 end`,
      ...terms.map(
        (w) => sql`case when title ~* ${start(w)} then 30 when title ~* ${re(w)} then 15 else 3 end`,
      ),
    ],
    sql` + `,
  );
  // text around the first match of the longest word, when the title lacks some
  // word — only for the rows kept
  const allInTitle = sql.join(
    terms.map((w) => sql`title ~* ${re(w)}`),
    sql` and `,
  );
  return sql`(select ${s.type}::text as type, id::text as id, title, at, total, score,
      case when ${allInTitle} then ''
        else substr(body, greatest(1, regexp_instr(body, ${re(terms[0]!)}, 1, 1, 0, 'i') - 80), 260) end as snip
    from (select id, title, body, at, count(*) over () as total, ${score} as score
      from (${rows}) s where ${match}
      order by score desc, at desc nulls last limit ${limit}) m)`;
}

type Row = {
  type: string;
  id: string;
  title: string;
  at: Date | string | null;
  snip: string;
  total: number | string;
  score: number | string;
};

/** Text of an item kept as JSON (code nodes, files, meeting reviews) made readable. */
const readable = (s: string) =>
  !/"[A-Za-z_]+":/.test(s)
    ? s
    : s
        .replace(/\\[nrt]/g, ' ')
        .replace(/"[A-Za-z_]+":/g, ' ')
        .replace(/[{}[\]"]+/g, ' ');

/**
 * The matches of `q` in each module of `modules` (or only `type`), best first:
 * groups ordered by their best match, at most `perGroup` items each.
 */
export async function globalSearch(
  auth: AuthContext,
  q: string,
  { modules, perGroup, type }: { modules: readonly string[]; perGroup: number; type?: string },
): Promise<SearchResponse> {
  const query = q.slice(0, MAX_QUERY).trim();
  const terms = searchTerms(query);
  if (!terms.length) return { q: query, groups: [] };
  const sources = globalSources().filter(
    (s) => (s.module === null || modules.includes(s.module)) && (!type || s.type === type),
  );
  if (!sources.length) return { q: query, groups: [] };
  const rows = await asUser(
    auth,
    async (tx) =>
      (await tx.execute(
        sql.join(
          sources.map((s) => sourceQuery(s, query, terms, perGroup)),
          sql` union all `,
        ),
      )) as unknown as Row[],
  );
  type Ranked = { score: number; time: number; item: SearchGroup['items'][number] };
  const groups = new Map<string, Omit<SearchGroup, 'items'> & { ranked: Ranked[]; order: number }>();
  for (const r of rows) {
    const order = sources.findIndex((s) => s.type === r.type);
    let g = groups.get(r.type);
    if (!g) {
      g = {
        type: r.type,
        module: sources[order]?.module ?? r.type,
        count: Number(r.total),
        ranked: [],
        order,
      };
      groups.set(r.type, g);
    }
    const at = r.at ? new Date(r.at) : null;
    g.ranked.push({
      score: Number(r.score),
      time: at?.getTime() ?? 0,
      item: {
        id: r.id,
        title: r.title.trim() || '—',
        snippet: r.snip ? excerpt(readable(r.snip), terms, 140) : '',
        at: at?.toISOString() ?? '',
      },
    });
  }
  const best = (g: { ranked: Ranked[] }) => Math.max(...g.ranked.map((x) => x.score));
  return {
    q: query,
    groups: [...groups.values()]
      .sort((a, b) => best(b) - best(a) || a.order - b.order)
      .map(({ ranked, order: _o, ...g }) => ({
        ...g,
        items: ranked.sort((a, b) => b.score - a.score || b.time - a.time).map((x) => x.item),
      })),
  };
}
