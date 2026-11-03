'use client';

import { useRef, useState } from 'react';
import { dnOf, isoOf, monthStart, todayIso, type Booking, type Dn } from '@/lib/alloc';
import type { MgPerson } from '@/lib/mg';
import { Modal, Segmented, useToast } from '@/components/ui';
import type { Mg } from '../store';
import type { Filters, View } from './AllocPage';
import type { GroupBy } from './Timeline';
import { DateField, Fld } from './Popovers';
import { rangeLabel } from './shared';

export const DownloadIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden
  >
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </svg>
);

type Per = 'view' | 'month' | 'next3' | 'custom';

/**
 * "Exportar para Excel": the period and a summary of what goes into the file —
 * the current team, view, grouping, filters and search. The workbook (3 sheets:
 * Dias, Semanas, Meses, see ./xlsx.ts) is built here, in the browser, with
 * exceljs loaded on click.
 */
export function ExportDialog({
  mg,
  view,
  vis,
  groupLabel,
  groupBy,
  people,
  bkFilter,
  fl,
  q,
  onClose,
}: {
  mg: Mg;
  view: View;
  vis: [Dn, Dn];
  groupLabel: string | null;
  groupBy: GroupBy;
  people: MgPerson[];
  bkFilter: (b: Booking) => boolean;
  fl: Filters;
  q: string;
  onClose: () => void;
}) {
  const { tr, lang } = mg;
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // the store after the range has loaded (read once the fetch is done)
  const latest = useRef(mg);
  latest.current = mg;
  const [per, setPer] = useState<Per>('view');
  const t = dnOf(todayIso());
  const [from, setFrom] = useState(isoOf(vis[0]));
  const [to, setTo] = useState(isoOf(vis[1]));
  const range: [Dn, Dn] =
    per === 'view'
      ? vis
      : per === 'month'
        ? [monthStart(t), monthStart(t, 1) - 1]
        : per === 'next3'
          ? [monthStart(t), monthStart(t, 3) - 1]
          : [dnOf(from), dnOf(to)];
  const ok = range[0] <= range[1];
  const weeks = Math.max(1, Math.round((range[1] - range[0] + 1) / 7));

  const team = mg.D.teams.find((x) => x.id === mg.team);
  const VIEW: Record<View, string> = { tl: 'Pessoas', grid: 'Grelha', proj: 'Projetos', cap: 'Capacidade' };
  const filters = [
    fl.proj && `${tr('Projeto')}: ${mg.pjById[fl.proj]?.code ?? '—'}`,
    fl.client && `${tr('Cliente')}: ${mg.D.clients.find((c) => c.id === fl.client)?.name ?? '—'}`,
    fl.area && `${tr('Área')}: ${tr(mg.SKN[fl.area] ?? fl.area)}`,
    fl.over && tr('Só sobre-alocados'),
    fl.free && tr('Só com disponibilidade'),
  ].filter(Boolean) as string[];
  const inc = [
    [!fl.hideTent, 'Tentativos'],
    [!fl.hidePh, 'Por atribuir'],
    [!fl.hideAbs, 'Ausências'],
  ] as const;

  const filterText = [
    team ? team.name : tr('Todas as equipas'),
    `${tr(VIEW[view])}${groupLabel ? ` · ${tr('agrupado por')} ${tr(groupLabel).toLowerCase()}` : ''}`,
    ...filters,
    q ? `${tr('Pesquisa')} «${q}»` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const run = async () => {
    setBusy(true);
    try {
      const [F, T] = range;
      await latest.current.AL.ensure(F, T);
      // one render for the merged range to reach the store
      await new Promise((r) => setTimeout(r, 60));
      const m = latest.current;
      const qq = q.toLowerCase();
      const proj = view === 'proj';
      const bookings = m.BK.filter(
        (b) =>
          bkFilter(b) &&
          (!proj ||
            !qq ||
            `${m.pjById[b.project]?.code ?? ''} ${m.pjById[b.project]?.name ?? ''} ${b.role} ${m.pById[b.person]?.name ?? ''}`
              .toLowerCase()
              .includes(qq)),
      );
      const [mod, { buildAllocWorkbook, exportFileName }] = await Promise.all([
        import('exceljs'),
        import('./xlsx'),
      ]);
      const ExcelJS = ((mod as { default?: unknown }).default ?? mod) as Parameters<
        typeof buildAllocWorkbook
      >[0];
      const wb = buildAllocWorkbook(ExcelJS, {
        lang,
        tr: m.tr,
        from: F,
        to: T,
        people: proj ? m.P : people,
        bookings,
        absences: m.AB,
        projects: m.PJ,
        clients: m.D.clients,
        teams: m.TEAMS,
        levels: m.LV,
        env: m.env,
        groupBy: proj ? 'byProject' : groupBy,
        showPh: !fl.hidePh,
        showAbs: !fl.hideAbs,
        filterText,
        now: new Date(),
      });
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFileName(team ? team.name : tr('todas'), F, T);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      onClose();
    } catch {
      toast({ message: tr('Não foi possível exportar. Tente de novo.'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={tr('Exportar para Excel')}
      subtitle={tr('O que está no ecrã, com as cores da app')}
      closeLabel={tr('Fechar')}
      className="al-dlg al-dlg--exp"
      footer={
        <>
          <button type="button" className="al-btn ghost" onClick={onClose}>
            {tr('Cancelar')}
          </button>
          <button
            type="button"
            className="al-btn"
            disabled={!ok || busy}
            aria-busy={busy || undefined}
            data-autofocus=""
            onClick={() => void run()}
          >
            {busy ? <span className="al-spin" aria-hidden /> : <DownloadIcon />}
            {busy ? tr('A exportar…') : tr('Exportar .xlsx')}
          </button>
        </>
      }
    >
      <div className="al-form">
        <Fld
          as="div"
          label={tr('Período')}
          hint={ok ? `${rangeLabel(range[0], range[1], lang)} · ${tr(`${weeks} semanas`)}` : undefined}
        >
          <Segmented
            label={tr('Período')}
            value={per}
            onChange={setPer}
            options={[
              { value: 'view', label: tr('Vista atual') },
              { value: 'month', label: tr('Este mês') },
              { value: 'next3', label: tr('Próximos 3 meses') },
              { value: 'custom', label: tr('Personalizado') },
            ]}
          />
        </Fld>
        {per === 'custom' && (
          <div className="al-grid2">
            <Fld label={tr('De')}>
              <DateField
                value={from}
                onChange={setFrom}
                label={tr('De')}
                pickLabel={tr('Escolher no calendário')}
              />
            </Fld>
            <Fld label={tr('Até')}>
              <DateField
                value={to}
                min={from}
                onChange={setTo}
                label={tr('Até')}
                pickLabel={tr('Escolher no calendário')}
              />
            </Fld>
          </div>
        )}
        <Fld as="div" label={tr('O que vai no ficheiro')}>
          <dl className="al-exp-sum">
            <dt>{tr('Equipa')}</dt>
            <dd>{team ? team.name : tr('Todas as equipas')}</dd>
            <dt>{tr('Vista')}</dt>
            <dd>
              {tr(VIEW[view])}
              {groupLabel ? ` · ${tr('agrupado por')} ${tr(groupLabel).toLowerCase()}` : ''}
            </dd>
            <dt>{tr('Filtros')}</dt>
            <dd>{filters.length ? filters.join(' · ') : tr('nenhum')}</dd>
            <dt>{tr('Pesquisa')}</dt>
            <dd>{q ? `«${q}»` : '—'}</dd>
            <dt>{tr('Inclui')}</dt>
            <dd className="al-exp-inc">
              {inc.map(([on, l]) => (
                <span key={l} className={on ? 'on' : ''}>
                  {on ? '✓' : '✕'} {tr(l)}
                </span>
              ))}
            </dd>
          </dl>
        </Fld>
        <div className="al-exp-sheets">
          <span className="al-f-l">{tr('3 folhas')}</span>
          {['Dias', 'Semanas', 'Meses'].map((s) => (
            <span key={s} className="al-chip">
              {tr(s)}
            </span>
          ))}
          <span className="al-note">
            {tr('horas por dia, semana e mês · legenda dos projetos e feriados')}
          </span>
        </div>
      </div>
    </Modal>
  );
}
