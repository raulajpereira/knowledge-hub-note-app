import 'server-only';
import { sql } from 'drizzle-orm';
import type { AuthContext } from '@/server/auth/session';
import { asUser } from '@/server/content/tenant';

// "Atividade" (header button): what the person created, completed or changed
// in a period — their own items of the modules the active workspace shows
// (RLS keeps it to the person and, for the separated modules, to the active
// workspace). Items in the Trash are left out.

export type ActivityAction = 'created' | 'done' | 'updated';
export type ActivityItem = {
  type: string;
  id: string;
  title: string;
  action: ActivityAction;
  at: string;
  /** the item's page in the app (without the base path) */
  href: string;
};

type Source = {
  type: string;
  module: string;
  table: string;
  title: string;
  done?: string;
  href: string;
};
const SOURCES: Source[] = [
  { type: 'task', module: 'tasks', table: 'tasks', title: 'title', done: 'done_at', href: '/app/tasks?t=' },
  { type: 'note', module: 'notes', table: 'notes', title: 'title', href: '/app/notes?n=' },
  { type: 'meeting', module: 'meetings', table: 'meetings', title: 'title', href: '/app/meetings?m=' },
  { type: 'file', module: 'files', table: 'drive_files', title: 'name', href: '/app/files?f=' },
  { type: 'voice', module: 'voice', table: 'voice_notes', title: 'title', href: '/app/voice?v=' },
  {
    type: 'issue',
    module: 'issues',
    table: 'issues',
    title: 'title',
    done: 'done_at',
    href: '/app/issues?i=',
  },
  { type: 'artifact', module: 'artifacts', table: 'artifacts', title: 'title', href: '/app/artifacts?a=' },
  {
    type: 'ticket',
    module: 'tickets',
    table: 'tickets',
    title: "number || ' · ' || summary",
    done: 'resolved_at',
    href: '/app/tickets?k=',
  },
];

const MAX = 500;
/** an edit within this long of the creation is part of creating it */
const SAME_EDIT = "interval '2 minutes'";

export async function activityOf(
  auth: AuthContext,
  range: { from: Date; to: Date },
  modules: ReadonlySet<string>,
): Promise<ActivityItem[]> {
  const sources = SOURCES.filter((s) => modules.has(s.module));
  if (!sources.length) return [];
  const from = sql`${range.from.toISOString()}::timestamptz`;
  const to = sql`${range.to.toISOString()}::timestamptz`;
  const parts = sources.flatMap((s) => {
    const t = sql.identifier(s.table);
    const title = sql.raw(`coalesce(${s.title}, '')`);
    const base = sql`from ${t} where owner_id = kh_user_id() and deleted_at is null`;
    const q = [
      sql`select ${s.type}::text as type, id, ${title} as title, 'created'::text as action, created_at as at ${base} and created_at >= ${from} and created_at < ${to}`,
      sql`select ${s.type}::text, id, ${title}, 'updated', updated_at ${base} and updated_at >= ${from} and updated_at < ${to}
            and updated_at > created_at + ${sql.raw(SAME_EDIT)}${
              s.done
                ? sql.raw(` and (${s.done} is null or abs(extract(epoch from updated_at - ${s.done})) > 120)`)
                : sql``
            }`,
    ];
    if (s.done)
      q.push(
        sql`select ${s.type}::text, id, ${title}, 'done', ${sql.raw(s.done)} ${base} and ${sql.raw(s.done)} >= ${from} and ${sql.raw(s.done)} < ${to}`,
      );
    return q;
  });
  const rows = await asUser(auth, (tx) =>
    tx.execute(sql`${sql.join(parts, sql` union all `)} order by at desc limit ${MAX}`),
  );
  const href = new Map(SOURCES.map((s) => [s.type, s.href]));
  return [
    ...(rows as unknown as Array<{
      type: string;
      id: string;
      title: string;
      action: ActivityAction;
      at: Date | string;
    }>),
  ].map((r) => ({
    type: r.type,
    id: r.id,
    title: r.title,
    action: r.action,
    at: new Date(r.at).toISOString(),
    href: `${href.get(r.type)}${r.id}`,
  }));
}
