import { z } from 'zod';
import { handler, json } from '@/server/http';
import { requireAdmin } from '@/server/admin/guard';
import { AUDIT_AREAS, auditCsv, queryAudit } from '@/server/admin/audit';
import { actionLabel, areaLabel } from '@/lib/adminLabels';

const Q = z.object({
  period: z.enum(['1', '7', '30', '90', 'range']).default('7'),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  actor: z.union([z.uuid(), z.literal('system')]).optional(),
  area: z.enum(AUDIT_AREAS).optional(),
  q: z.string().trim().max(200).optional(),
  tenant: z.uuid().optional(),
  format: z.enum(['json', 'csv']).default('json'),
  lang: z.enum(['pt', 'en']).default('pt'),
});

/** GET /audit?period|from&to&actor&area&q[&format=csv] — "Mostrar atividades" / "Exportar CSV". */
export const GET = handler(async (req) => {
  await requireAdmin('audit');
  const f = Q.parse(Object.fromEntries(new URL(req.url).searchParams));
  const now = Date.now();
  const range =
    f.period === 'range'
      ? {
          from: f.from ? new Date(`${f.from}T00:00:00Z`) : new Date(0),
          // "Até" is inclusive
          to: f.to ? new Date(Date.parse(`${f.to}T00:00:00Z`) + 86_400_000) : new Date(now + 60_000),
        }
      : { from: new Date(now - Number(f.period) * 86_400_000), to: new Date(now + 60_000) };
  const rows = await queryAudit({
    ...range,
    actor: f.actor,
    area: f.area,
    q: f.q || undefined,
    tenantId: f.tenant,
  });
  if (f.format === 'csv')
    return new Response(
      auditCsv(rows, (r) => ({ area: areaLabel(r.area, f.lang), action: actionLabel(r.action, f.lang) })),
      {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="auditoria.csv"',
          'Cache-Control': 'no-store',
        },
      },
    );
  return json({ rows });
});
