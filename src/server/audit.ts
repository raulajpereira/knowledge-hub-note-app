import { db } from '@/db/client';
import { auditLog } from '@/db/schema';

export type AuditEntry = {
  action: string;
  actorUserId?: string | null;
  actorKind?: 'user' | 'system';
  tenantId?: string | null;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ip?: string | null;
};

/** Append-only audit trail (SECURITY.md §3). Never throws into the caller. */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db()
      .insert(auditLog)
      .values({
        action: entry.action,
        actorUserId: entry.actorUserId ?? null,
        actorKind: entry.actorKind ?? (entry.actorUserId ? 'user' : 'system'),
        tenantId: entry.tenantId ?? null,
        targetType: entry.targetType,
        targetId: entry.targetId,
        details: entry.details,
        ip: entry.ip ?? null,
      });
  } catch (err) {
    console.error('[audit] failed to write', entry.action, err);
  }
}
