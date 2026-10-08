'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/client/api';
import { actionLabel, areaLabel, AREA_LABELS } from '@/lib/adminLabels';
import { useToast } from '@/components/ui';
import { SEC_TITLE, SectionHead, Svg } from './AdminShell';
import { Avatar, Cell, Field, Table, fmtStamp, useA } from './ui';

type Row = {
  id: number;
  at: string;
  actor: { id: string | null; name: string; email: string } | null;
  area: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
};
type Filters = { period: string; from: string; to: string; actor: string; area: string; q: string };
const EMPTY: Filters = { period: '7', from: '', to: '', actor: '', area: '', q: '' };
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

const params = (f: Filters, lang: string, csv = false) => {
  const p = new URLSearchParams({ period: f.period, lang });
  if (f.period === 'range') {
    if (f.from) p.set('from', f.from);
    if (f.to) p.set('to', f.to);
  }
  if (f.actor) p.set('actor', f.actor);
  if (f.area) p.set('area', f.area);
  if (f.q.trim()) p.set('q', f.q.trim());
  if (csv) p.set('format', 'csv');
  return p.toString();
};

/** A readable line for an entry's target and details. */
function detailOf(r: Row) {
  const d = r.details ?? {};
  const bits: string[] = [];
  if (typeof d.name === 'string') bits.push(d.name);
  if (r.targetType === 'code' && r.targetId) bits.push(r.targetId);
  for (const k of ['email', 'plan', 'role', 'from', 'to', 'expiresAt', 'maxUses', 'key', 'value'] as const)
    if (d[k] !== undefined && d[k] !== null && typeof d[k] !== 'object') bits.push(`${k} ${String(d[k])}`);
  if (Array.isArray(d.to)) bits.push((d.to as string[]).join(', '));
  if (!bits.length && r.targetId) bits.push(r.targetId);
  return bits.join(' · ');
}

/** Auditoria: period, who, area and text; "Mostrar atividades" runs the query; CSV export. */
export function Audit() {
  const { A, lang } = useA();
  const toast = useToast();
  const [f, setF] = useState<Filters>(EMPTY);
  const [ran, setRan] = useState<Filters | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [actors, setActors] = useState<Array<{ id: string; name: string; email: string }>>([]);
  useEffect(() => {
    adminApi<{ actors: Array<{ id: string; name: string; email: string }> }>('/audit/actors')
      .then((r) => setActors(r.actors))
      .catch(() => {});
  }, []);
  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const show = async () => {
    try {
      const r = await adminApi<{ rows: Row[] }>(`/audit?${params(f, lang)}`);
      setRows(r.rows);
      setRan(f);
    } catch {
      toast({ message: A('Não foi possível carregar as atividades.'), tone: 'error' });
    }
  };

  return (
    <>
      <SectionHead title={A(SEC_TITLE.audit[0])} sub={A(SEC_TITLE.audit[1])} />
      <div className="kh-ad-body">
        <div className="kh-ad-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
            }}
          >
            <Field label={A('Período')}>
              <select className="kh-ad-input" value={f.period} onChange={set('period')}>
                <option value="1">{A('Últimas 24 horas')}</option>
                <option value="7">{A('Últimos 7 dias')}</option>
                <option value="30">{A('Últimos 30 dias')}</option>
                <option value="90">{A('Últimos 90 dias')}</option>
                <option value="range">{A('Intervalo personalizado')}</option>
              </select>
            </Field>
            {f.period === 'range' && (
              <>
                <Field label={A('De')}>
                  <input className="kh-ad-input" type="date" value={f.from} onChange={set('from')} />
                </Field>
                <Field label={A('Até')}>
                  <input className="kh-ad-input" type="date" value={f.to} onChange={set('to')} />
                </Field>
              </>
            )}
            <Field label={A('Quem')}>
              <select className="kh-ad-input" value={f.actor} onChange={set('actor')}>
                <option value="">{A('Todos')}</option>
                <option value="system">{A('Sistema')}</option>
                {actors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.email}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={A('Área')}>
              <select className="kh-ad-input" value={f.area} onChange={set('area')}>
                <option value="">{A('Todas as áreas')}</option>
                {Object.keys(AREA_LABELS).map((k) => (
                  <option key={k} value={k}>
                    {areaLabel(k, lang)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={A('Contém')}>
              <input
                className="kh-ad-input"
                value={f.q}
                maxLength={200}
                placeholder={A('Cliente, email, código…')}
                onChange={set('q')}
                onKeyDown={(e) => e.key === 'Enter' && void show()}
              />
            </Field>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="kh-ad-btn" data-kind="p" onClick={() => void show()}>
              <Svg
                d='<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/>'
                s={15}
                sw={2}
              />
              {A('Mostrar atividades')}
            </button>
            {ran && (
              <>
                <button
                  type="button"
                  className="kh-ad-btn"
                  onClick={() => {
                    setF(EMPTY);
                    setRan(null);
                    setRows(null);
                  }}
                >
                  {A('Limpar')}
                </button>
                <span style={{ marginLeft: 'auto', fontSize: 13 }} className="kh-ad-mono">
                  {(rows?.length ?? 0) >= 2000 ? '2000+' : (rows?.length ?? 0)}{' '}
                  {A((rows?.length ?? 0) === 1 ? 'atividade' : 'atividades')}
                </span>
                <a
                  className="kh-ad-btn"
                  href={`${BASE}/api/admin/v1/audit?${params(ran, lang, true)}`}
                  download
                >
                  {A('Exportar CSV')}
                </a>
              </>
            )}
          </div>
        </div>
        {!ran ? (
          <div className="kh-ad-card" style={{ textAlign: 'center', padding: '40px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', opacity: 0.7, marginBottom: 10 }}>
              <Svg
                d='<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>'
                s={34}
                sw={1.5}
              />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {A('Defina os filtros e clique em Mostrar atividades')}
            </div>
            <div className="kh-ad-note" style={{ marginTop: 4 }}>
              {A('Todas as ações feitas na consola ficam registadas com quem, quando e o quê.')}
            </div>
          </div>
        ) : (
          <Table<Row>
            label={A('Auditoria')}
            grid="140px minmax(200px,1.3fr) 150px minmax(180px,1.2fr) minmax(220px,2fr)"
            minW={900}
            rows={rows ?? []}
            rowKey={(r) => String(r.id)}
            cols={[
              { label: A('Quando'), cell: (r) => <Cell mono main={fmtStamp(r.at)} /> },
              {
                label: A('Quem'),
                row: true,
                cell: (r) => (
                  <>
                    <Avatar name={r.actor?.name || A('Sistema')} />
                    <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <Cell main={r.actor?.name || A('Sistema')} sub={r.actor?.email} />
                    </span>
                  </>
                ),
              },
              { label: A('Área'), cell: (r) => <Cell main={areaLabel(r.area, lang)} /> },
              { label: A('Ação'), cell: (r) => <Cell main={actionLabel(r.action, lang)} /> },
              {
                label: A('Detalhe'),
                cell: (r) => (
                  <Cell
                    main={<span style={{ fontWeight: 400 }}>{detailOf(r) || '—'}</span>}
                    sub={r.ip ?? ''}
                  />
                ),
              },
            ]}
          />
        )}
      </div>
    </>
  );
}
