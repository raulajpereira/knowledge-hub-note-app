import { sql } from 'drizzle-orm';
import type { Tx } from '@/server/content/tenant';
import { env } from '@/lib/env';
import { vecLiteral } from './embedClient';

// Nearest items by meaning, under the caller's RLS (a vector is visible only
// when its item is — migration 0043). Exact search over the caller's own
// vectors (plus the tenant-wide SAP library): small per person, always
// complete, and it uses the owner index rather than scanning everyone's.

/**
 * Cosine distance above which a "meaning" match is noise. multilingual-e5
 * puts unrelated passages at ~0.25–0.3 and related ones under ~0.2.
 */
export const SEM_MAX_DIST = 0.22;

export type VecHit = { type: string; id: string; chunk: number; dist: number };

export async function vectorItems(
  tx: Tx,
  vec: number[],
  { types, limit = 20, maxDist = SEM_MAX_DIST }: { types?: string[]; limit?: number; maxDist?: number } = {},
): Promise<VecHit[]> {
  const v = vecLiteral(vec);
  const rows = (await tx.execute(sql`
    select distinct on (item_type, item_id) item_type as type, item_id as id, chunk_no as chunk,
           (embedding <=> ${v}::vector) as dist
    from embeddings
    where tenant_id = kh_tenant_id() and (owner_id = kh_user_id() or owner_id is null)
      and model = ${env().EMBED_MODEL}
      ${
        types?.length
          ? sql`and item_type in (${sql.join(
              types.map((t) => sql`${t}`),
              sql`, `,
            )})`
          : sql``
      }
      and (embedding <=> ${v}::vector) <= ${maxDist}
    order by item_type, item_id, dist`)) as unknown as Array<{
    type: string;
    id: string;
    chunk: number;
    dist: number;
  }>;
  return rows
    .map((r) => ({ ...r, dist: Number(r.dist) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit);
}
