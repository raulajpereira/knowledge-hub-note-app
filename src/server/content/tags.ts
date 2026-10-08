import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { artifacts, notes, sapObjects, snippets } from '@/db/schema';
import type { AuthContext } from '@/server/auth/session';
import { asUser } from './tenant';

// Every tag the caller can see (notes, artifacts, DevLib snippets, SAP code
// objects — only the modules in their plan), most used first: the
// suggestions of the tag inputs across the app.
const SOURCES = [
  ['notes', notes],
  ['artifacts', artifacts],
  ['devlib', snippets],
  ['codelib', sapObjects],
] as const;

export async function listAllTags(
  auth: AuthContext,
  modules: readonly string[],
): Promise<Array<{ name: string; count: number }>> {
  const parts: SQL[] = SOURCES.filter(([m]) => modules.includes(m)).map(
    ([, tb]) => sql`select unnest(${tb.tags}) as t from ${tb} where ${tb.deletedAt} is null`,
  );
  if (!parts.length) return [];
  return asUser(auth, async (tx) => {
    const rows = await tx.execute<{ name: string; count: number }>(sql`
      select t as name, count(*)::int as count
      from (${sql.join(parts, sql` union all `)}) as u
      group by t
      order by count(*) desc, lower(t), t
      limit 500`);
    return [...rows];
  });
}
