import 'server-only';
import { desc, eq, sql } from 'drizzle-orm';
import { userTemplates } from '@/db/schema';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { tplBodySchema, type Tpl, type TplBody, type TplKind } from '@/lib/templates';
import { asUser } from './tenant';

// Modelos: the templates a person saves (the ready-made ones live in
// src/lib/templates.ts). Private to their owner (RLS).

const MAX = 200;

export async function listTemplates(auth: AuthContext, kind: TplKind): Promise<Tpl[]> {
  const rows = await asUser(auth, (tx) =>
    tx
      .select({ id: userTemplates.id, name: userTemplates.name, body: userTemplates.body })
      .from(userTemplates)
      .where(eq(userTemplates.kind, kind))
      .orderBy(desc(userTemplates.createdAt))
      .limit(MAX),
  );
  return rows.map((r) => ({ id: r.id, kind, name: r.name, body: r.body as TplBody, own: true }));
}

export async function saveTemplate(
  auth: AuthContext,
  input: { kind: TplKind; name: string; body: unknown },
): Promise<Tpl> {
  const parsed = tplBodySchema(input.kind).safeParse(input.body);
  if (!parsed.success) throw new ApiError(400, 'invalid_input', 'invalid template');
  return asUser(auth, async (tx) => {
    const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(userTemplates)) as [
      { n: number },
    ];
    if (n >= MAX) throw new ApiError(400, 'too_many_items');
    const [r] = await tx
      .insert(userTemplates)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        kind: input.kind,
        name: input.name,
        body: parsed.data,
      })
      .returning({ id: userTemplates.id });
    return { id: r!.id, kind: input.kind, name: input.name, body: parsed.data, own: true };
  });
}

export async function deleteTemplate(auth: AuthContext, id: string) {
  await asUser(auth, async (tx) => {
    const r = await tx
      .delete(userTemplates)
      .where(eq(userTemplates.id, id))
      .returning({ id: userTemplates.id });
    if (!r.length) throw new ApiError(404, 'not_found');
  });
}
