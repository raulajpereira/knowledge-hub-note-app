import 'server-only';
import { and, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db/client';
import { auditLog, users } from '@/db/schema';

// Auditoria: every action of the console and of the app's security events,
// with who, when, area and what. The area comes from the action's prefix
// (stored actions are codes like `code.revoke`; the console translates them).

export const AUDIT_AREAS = ['codes', 'clients', 'users', 'plans', 'admins', 'system'] as const;
export type AuditArea = (typeof AUDIT_AREAS)[number];

const AREA_PREFIX: Record<Exclude<AuditArea, 'system'>, string[]> = {
  codes: ['code.'],
  clients: ['tenant.', 'request.'],
  users: ['user.', 'auth.', 'account.', 'vault.', 'share.'],
  plans: ['plan.'],
  admins: ['admin.'],
};
export const areaOf = (action: string): AuditArea =>
  (Object.entries(AREA_PREFIX).find(([, ps]) => ps.some((p) => action.startsWith(p)))?.[0] as
    AuditArea | undefined) ?? 'system';

export type AuditRow = {
  id: number;
  at: string;
  actor: { id: string | null; name: string; email: string } | null;
  area: AuditArea;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
};

export type AuditQuery = {
  from: Date;
  to: Date;
  actor?: string;
  area?: AuditArea;
  q?: string;
  tenantId?: string;
  limit?: number;
};

export async function queryAudit(f: AuditQuery): Promise<AuditRow[]> {
  const conds: SQL[] = [gte(auditLog.at, f.from), lt(auditLog.at, f.to)];
  if (f.actor === 'system') conds.push(sql`${auditLog.actorUserId} is null`);
  else if (f.actor) conds.push(eq(auditLog.actorUserId, f.actor));
  if (f.tenantId) conds.push(eq(auditLog.tenantId, f.tenantId));
  if (f.area && f.area !== 'system')
    conds.push(or(...AREA_PREFIX[f.area].map((p) => ilike(auditLog.action, `${p}%`)))!);
  else if (f.area === 'system')
    conds.push(
      sql`not (${or(
        ...Object.values(AREA_PREFIX)
          .flat()
          .map((p) => ilike(auditLog.action, `${p}%`)),
      )})`,
    );
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(
      or(
        ilike(auditLog.action, like),
        ilike(auditLog.targetId, like),
        sql`${auditLog.details}::text ilike ${like}`,
        sql`exists (select 1 from users u where u.id = ${auditLog.actorUserId} and (u.email ilike ${like} or u.name ilike ${like}))`,
      )!,
    );
  }
  const rows = await db()
    .select()
    .from(auditLog)
    .where(and(...conds))
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(Math.min(f.limit ?? 2000, 5000));
  const ids = [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x))];
  const people = ids.length
    ? await db()
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, ids))
    : [];
  return rows.map((r) => {
    const p = people.find((x) => x.id === r.actorUserId);
    return {
      id: r.id,
      at: r.at.toISOString(),
      actor: r.actorUserId ? { id: r.actorUserId, name: p?.name ?? '', email: p?.email ?? '' } : null,
      area: areaOf(r.action),
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      details: (r.details as Record<string, unknown> | null) ?? null,
      ip: r.ip,
    };
  });
}

/** "Quem": everyone who appears in the log (and "Sistema"). */
export async function auditActors() {
  return db()
    .selectDistinct({ id: users.id, name: users.name, email: users.email })
    .from(auditLog)
    .innerJoin(users, eq(users.id, auditLog.actorUserId))
    .orderBy(users.name);
}

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** "Exportar CSV": `;`-separated, quoted, UTF-8 with BOM (opens in Excel PT). */
export function auditCsv(rows: AuditRow[], label: (r: AuditRow) => { area: string; action: string }) {
  const head = ['Quando (ISO)', 'Quem', 'Área', 'Ação', 'Detalhe', 'IP'];
  const lines = rows.map((r) => {
    const l = label(r);
    const who = r.actor ? `${r.actor.name} <${r.actor.email}>` : 'Sistema';
    const det = [r.targetId, r.details ? JSON.stringify(r.details) : ''].filter(Boolean).join(' · ');
    return [r.at, who, l.area, l.action, det, r.ip ?? ''].map(csvCell).join(';');
  });
  return '﻿' + [head.map(csvCell).join(';'), ...lines].join('\r\n') + '\r\n';
}
