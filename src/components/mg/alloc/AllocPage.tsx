'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  dnOf,
  isoOf,
  monthStart,
  sumDays,
  type Absence,
  type Booking,
  type Dn,
  type Zoom,
} from '@/lib/alloc';
import { Popover, usePersistentState } from '@/components/ui';
import { OPT } from '../css';
import type { Mg } from '../store';
import { AbsencePop, BookingPop, Fld } from './Popovers';
import { Timeline, type GroupBy, type Nav, type Unit } from './Timeline';
import { Grid, type GUnit } from './Grid';
import { ProjectsView } from './ProjectsView';
import { CapacityView } from './CapacityView';
import { PhoneAlloc } from './Phone';
import { GZOOMS, ZOOMS, defaultWindow, monthRange, newBooking, rangeLabel, type TZoom } from './shared';
import './alloc.css';

export type View = 'tl' | 'grid' | 'proj' | 'cap';
export type Filters = {
  proj?: string;
  client?: string;
  area?: string;
  /** only people over capacity / with room in the period in view */
  over?: boolean;
  free?: boolean;
  hideTent?: boolean;
  hidePh?: boolean;
  hideAbs?: boolean;
};
type Pop = { kind: 'bk'; b: Booking; isNew: boolean } | { kind: 'ab'; a: Absence; isNew: boolean };

const SearchIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
const FilterIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden
  >
    <path d="M4 5h16l-6 8v6l-4-2v-4z" />
  </svg>
);

// Alocações v2 (alloc2): Pessoas (timeline, concept A), Grelha (concept B),
// Projetos and Capacidade (concept C) over the same bookings; phones get a
// week view to read, confirm tentative bookings and mark absences (A5/A6).
export function AllocPage({ mg }: { mg: Mg }) {
  const { tr, lang } = mg;
  const sp = useSearchParams();
  const [view, setView] = usePersistentState<View>('mg.al2.view', 'tl');
  const [tz, setTz] = usePersistentState<TZoom>('mg.al2.zoom', 'day');
  const [gz, setGz] = usePersistentState<Zoom>('mg.al2.gzoom', 'week');
  const [unit, setUnit] = usePersistentState<Unit>('mg.al2.unit', 'hpd');
  const [gunit0, setGunit0] = usePersistentState<GUnit>('mg.al2.gunit', 'h');
  const [cunit, setCunit] = usePersistentState<GUnit>('mg.al2.cunit', 'fte');
  const [groupBy, setGroupBy] = usePersistentState<GroupBy>('mg.al2.group', 'team');
  const [fl, setFl] = usePersistentState<Filters>('mg.al2.filters', {});
  const [win, setWin] = useState<[Dn, Dn]>(defaultWindow);
  const [q, setQ] = useState('');
  const [nav, setNav] = useState<Nav>({ kind: 'today', n: 0 });
  const [vis, setVis] = useState<[Dn, Dn]>(win);
  const [pop, setPop] = useState<Pop | null>(null);
  const filtBtn = useRef<HTMLButtonElement>(null);
  const [filtOpen, setFiltOpen] = useState(false);
  const absHelpBtn = useRef<HTMLButtonElement>(null);
  const [absHelp, setAbsHelp] = useState(false);
  const want = sp.get('v');
  const wantF = sp.get('f');
  const wantPj = sp.get('pj');
  // a link from another screen (?v=grid, ?f=over, ?pj=<project>) is applied once
  const applied = useRef('');
  useEffect(() => {
    const k = `${want}|${wantF}|${wantPj}`;
    if (applied.current === k) return;
    applied.current = k;
    if (want === 'tl' || want === 'grid' || want === 'proj' || want === 'cap') setView(want);
    if (wantF === 'over' || wantPj)
      setFl({ ...(wantF === 'over' ? { over: true } : {}), ...(wantPj ? { proj: wantPj } : {}) });
  }, [want, wantF, wantPj, setView, setFl]);
  const onView = useCallback((a: Dn, b: Dn) => setVis((o) => (o[0] === a && o[1] === b ? o : [a, b])), []);
  const widen = useCallback(
    (w: [Dn, Dn]) => {
      setWin(w);
      mg.AL.ensure(w[0], w[1]);
    },
    [mg.AL],
  );

  const qq = q.trim().toLowerCase();
  const nFilters = [fl.proj, fl.client, fl.area, fl.over, fl.free, fl.hideTent, fl.hidePh, fl.hideAbs].filter(
    Boolean,
  ).length;
  const bkFilter = useCallback(
    (b: Booking) =>
      (!fl.hideTent || b.status !== 'tentative') &&
      (!fl.proj || b.project === fl.proj) &&
      (!fl.client || mg.pjById[b.project]?.client === fl.client),
    [fl.hideTent, fl.proj, fl.client, mg.pjById],
  );
  const people = useMemo(() => {
    const [a, b] = vis;
    const A = isoOf(a);
    const B = isoOf(b);
    return mg.P.filter((p) => {
      const my = mg.BK.filter((x) => x.person === p.id && x.to >= A && x.from <= B);
      if (qq) {
        const hay =
          `${p.name} ${p.role} ${my.map((x) => `${mg.pjById[x.project]?.code ?? ''} ${x.role}`).join(' ')}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      if (fl.area && p.area !== fl.area) return false;
      if ((fl.proj || fl.client) && !my.some(bkFilter)) return false;
      if (fl.over || fl.free) {
        const l = mg.loads(p.id);
        const conf = sumDays(l.conf, l, a, b);
        const cap = sumDays(l.cap, l, a, b);
        if (fl.over && conf <= cap + 0.01) return false;
        if (fl.free && conf >= cap * 0.9) return false;
      }
      return true;
    });
  }, [mg, vis, qq, fl, bkFilter]);

  // the dialogs are centred: where the click was does not matter
  const openBk = useCallback((b: Booking, isNew: boolean) => setPop({ kind: 'bk', b, isNew }), []);
  const openAb = useCallback((a: Absence, isNew: boolean) => setPop({ kind: 'ab', a, isNew }), []);
  const addNew = () => {
    const t = dnOf(isoOf(vis[0]));
    const mon = Math.max(t, dnOf(mg.wk(0)));
    openBk(
      newBooking({
        project: fl.proj || mg.PJ.find((p) => p.status !== 'Concluído')?.id || '',
        from: isoOf(mon),
        to: isoOf(mon + 4),
      }),
      true,
    );
  };

  if (mg.vp === 'phone') return <PhoneAlloc mg={mg} />;

  const VIEWS: Array<[View, string]> = [
    ['tl', 'Pessoas'],
    ['grid', 'Grelha'],
    ['proj', 'Projetos'],
    ['cap', 'Capacidade'],
  ];
  const isTl = view === 'tl';
  // the capacity view has its own unit (FTE by default)
  const gunit = view === 'cap' ? cunit : gunit0;
  const setGunit = view === 'cap' ? setCunit : setGunit0;
  const span = vis[1] - vis[0] + 1;
  const sub =
    view === 'tl'
      ? `${tr(`${people.length} pessoas`)} · ${rangeLabel(vis[0], vis[1], lang)} · ${tr('arraste numa linha vazia para criar')}`
      : view === 'grid'
        ? tr('Escreva numa célula: distribui pelos dias úteis (feriados e ausências contam 0)')
        : view === 'proj'
          ? tr('Por projeto · uma linha por função · sem pessoa = por atribuir')
          : tr('Procura vs capacidade por área SAP · férias e feriados descontados');
  const GROUPS: Array<[GroupBy, string]> = [
    ['team', 'Equipa'],
    ['project', 'Projeto'],
    ['client', 'Cliente'],
    ['module', 'Área SAP'],
    ['none', 'Nenhum'],
  ];
  const legend = (
    <div className="al-legend">
      <span className="al-lg">
        <i className="conf" />
        {tr('Confirmado')}
      </span>
      <span className="al-lg">
        <i className="tent al-stripe" />
        {tr('Tentativo')}
      </span>
      <span className="al-lg">
        <i className="abs" />
        {tr('Ausência')}
        <button
          ref={absHelpBtn}
          type="button"
          className="al-help"
          aria-label={tr('Como criar uma ausência')}
          title={tr('Como criar uma ausência')}
          aria-expanded={absHelp}
          onClick={() => setAbsHelp((v) => !v)}
        >
          ?
        </button>
      </span>
      <span className="al-lg">
        <i className="hol" />
        {tr('Feriado')}
      </span>
      {absHelp && (
        <Popover
          anchor={absHelpBtn}
          align="right"
          width={380}
          onClose={() => setAbsHelp(false)}
          className="al-pop al-help-pop"
          role="dialog"
          aria-label={tr('Como criar uma ausência')}
        >
          <div className="al-pop-hd">
            <b>{tr('Como criar uma ausência')}</b>
          </div>
          <div className="al-pop-bd">
            <ol className="al-steps">
              <li>
                <b>{tr('Shift + arrastar')}</b> {tr('na linha da pessoa, sobre os dias da ausência.')}
              </li>
              <li>
                <b>{tr('Botão direito')}</b> {tr('num dia da pessoa › Marcar ausência.')}
              </li>
              <li>
                <b>{tr('Recursos')}</b> {tr('› a pessoa › Ausências › Marcar ausência.')}
              </li>
            </ol>
            <div className="al-help-sec">
              <span className="al-f-l">{tr('Tipo')}</span>
              <div className="al-chips">
                {(['Férias', 'Doença', 'Formação', 'Outra'] as const).map((t) => (
                  <span key={t} className="al-chip" aria-pressed="false">
                    {tr(t)}
                  </span>
                ))}
              </div>
            </div>
            <div className="al-help-sec">
              <span className="al-f-l">{tr('Dia inteiro ou horas')}</span>
              <p>
                {tr(
                  'Por omissão é o dia inteiro. Para só algumas horas, escolha «Parte do dia» e indique as horas.',
                )}
              </p>
            </div>
            <div className="al-help-sec">
              <span className="al-f-l">{tr('Alterar ou eliminar')}</span>
              <p>{tr('Clique na barra às riscas da ausência: abre a ficha, com Guardar e Eliminar.')}</p>
            </div>
            <p className="al-note">{tr('Os dias de ausência não contam na capacidade.')}</p>
          </div>
        </Popover>
      )}
    </div>
  );
  const navBtns = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button
        type="button"
        className="al-pill sm"
        style={{ padding: '0 10px' }}
        aria-label={tr('Anterior')}
        title={tr('Anterior')}
        onClick={() => setNav({ kind: 'prev', n: nav.n + 1 })}
      >
        ‹
      </button>
      <button type="button" className="al-pill sm" onClick={() => setNav({ kind: 'today', n: nav.n + 1 })}>
        {tr('Hoje')}
      </button>
      <button
        type="button"
        className="al-pill sm"
        style={{ padding: '0 10px' }}
        aria-label={tr('Seguinte')}
        title={tr('Seguinte')}
        onClick={() => setNav({ kind: 'next', n: nav.n + 1 })}
      >
        ›
      </button>
    </span>
  );
  return (
    <section className="al-root" aria-label={tr('Alocações')} data-view={view}>
      <header className="al-head">
        <div className="al-head-row top">
          <div className="al-titles">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <h1>{tr('Alocações')}</h1>
              <span className="al-seg" role="tablist" aria-label={tr('Vista')}>
                {VIEWS.map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={view === k}
                    onClick={() => setView(k)}
                  >
                    {tr(l)}
                  </button>
                ))}
              </span>
            </div>
            <span className="al-sub" title={sub}>
              {sub}
            </span>
          </div>
          <label
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              flex: '0 1 212px',
              minWidth: 140,
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 13,
                color: 'rgb(var(--t) / calc(.55 * var(--t-k)))',
                display: 'flex',
              }}
            >
              <SearchIcon />
            </span>
            <input
              className="al-search"
              placeholder={tr('Pesquisar pessoa, projeto…')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={tr('Pesquisar pessoa, projeto…')}
            />
          </label>
          <button
            type="button"
            ref={filtBtn}
            className={`al-pill${nFilters ? ' on' : ''}`}
            onClick={() => setFiltOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={filtOpen}
          >
            <FilterIcon />
            {tr('Filtros')}
            {nFilters > 0 && <span className="n">{nFilters}</span>}
          </button>
          {(view === 'tl' || view === 'grid') && (
            <label className="al-pill" style={{ paddingRight: 8 }}>
              {tr('Agrupar')}:
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                aria-label={tr('Agrupar')}
                style={{
                  background: 'transparent',
                  border: 0,
                  color: 'inherit',
                  font: 'inherit',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {GROUPS.map(([k, l]) => (
                  <option key={k} value={k} style={OPT}>
                    {tr(l)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="al-btn" onClick={addNew}>
            + {tr('Alocação')}
          </button>
        </div>
        <div className="al-head-row">
          {isTl || view === 'proj' ? (
            <span className="al-seg" role="group" aria-label={tr('Zoom')}>
              {ZOOMS.filter(([k]) => isTl || k !== 'day').map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={tz === k || (!isTl && tz === 'day' && k === 'week')}
                  onClick={() => setTz(k)}
                >
                  {tr(l)}
                </button>
              ))}
            </span>
          ) : view === 'grid' ? (
            <span className="al-seg" role="group" aria-label={tr('Período')}>
              {GZOOMS.map(([k, l]) => (
                <button key={k} type="button" aria-pressed={gz === k} onClick={() => setGz(k)}>
                  {tr(l)}
                </button>
              ))}
            </span>
          ) : (
            <span className="al-seg" role="group" aria-label={tr('Período')}>
              <button type="button" aria-pressed>
                {tr('Meses')}
              </button>
            </span>
          )}
          {navBtns}
          <span className="al-range">
            {view === 'cap'
              ? monthRange(monthStart(vis[0]), monthStart(vis[0], 12) - 1, lang)
              : span > 70
                ? monthRange(vis[0], vis[1], lang)
                : rangeLabel(vis[0], vis[1], lang)}
          </span>
          <span style={{ flex: 1 }} />
          {(isTl || view === 'proj') && legend}
          {isTl && (
            <span className="al-seg" role="group" aria-label={tr('Unidade')}>
              {(
                [
                  ['hpd', 'h/dia'],
                  ['pct', '%'],
                  ['total', 'Total'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={unit === k} onClick={() => setUnit(k)}>
                  {tr(l)}
                </button>
              ))}
            </span>
          )}
          {(view === 'grid' || view === 'cap' || view === 'proj') && (
            <span className="al-seg" role="group" aria-label={tr('Unidade')}>
              {(
                (view === 'cap'
                  ? [
                      ['fte', 'FTE'],
                      ['h', 'h'],
                    ]
                  : [
                      ['h', view === 'grid' ? 'Horas' : 'h/sem'],
                      ['pct', '%'],
                      ['fte', 'FTE'],
                    ]) as Array<[GUnit, string]>
              ).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={gunit === k} onClick={() => setGunit(k)}>
                  {tr(l)}
                </button>
              ))}
            </span>
          )}
        </div>
      </header>
      {view === 'tl' && (
        <div className="al-body">
          <Timeline
            mg={mg}
            zoom={tz}
            win={win}
            setWin={widen}
            people={people}
            groupBy={groupBy}
            unit={unit}
            showPh={!fl.hidePh}
            showAbs={!fl.hideAbs}
            bkFilter={bkFilter}
            nav={nav}
            onView={onView}
            openBk={openBk}
            openAb={openAb}
          />
        </div>
      )}
      {view === 'grid' && (
        <Grid
          mg={mg}
          zoom={gz}
          unit={gunit}
          win={win}
          setWin={widen}
          people={people}
          groupBy={groupBy}
          bkFilter={bkFilter}
          showPh={!fl.hidePh}
          nav={nav}
          onView={onView}
          openBk={openBk}
        />
      )}
      {view === 'proj' && (
        <ProjectsView
          mg={mg}
          zoom={tz}
          unit={gunit}
          win={win}
          setWin={widen}
          q={qq}
          fl={fl}
          nav={nav}
          onView={onView}
          openBk={openBk}
        />
      )}
      {view === 'cap' && <CapacityView mg={mg} unit={gunit} nav={nav} fl={fl} onView={onView} />}
      {pop?.kind === 'bk' && (
        <BookingPop
          key={pop.b.id}
          mg={mg}
          draft={pop.b}
          isNew={pop.isNew}
          onClose={() => setPop(null)}
          onSave={(b) => {
            mg.AL.change({ bk: [b] });
            setPop(null);
          }}
          onDelete={
            pop.isNew
              ? undefined
              : () => {
                  mg.AL.change({ delBk: [pop.b.id] });
                  setPop(null);
                }
          }
        />
      )}
      {pop?.kind === 'ab' && (
        <AbsencePop
          key={pop.a.id}
          mg={mg}
          draft={pop.a}
          isNew={pop.isNew}
          onClose={() => setPop(null)}
          onSave={(a) => {
            mg.AL.change({ ab: [a] });
            setPop(null);
          }}
          onDelete={
            pop.isNew
              ? undefined
              : () => {
                  mg.AL.change({ delAb: [pop.a.id] });
                  setPop(null);
                }
          }
        />
      )}
      {filtOpen && (
        <FilterPop mg={mg} fl={fl} setFl={setFl} anchor={filtBtn} onClose={() => setFiltOpen(false)} />
      )}
    </section>
  );
}

function FilterPop({
  mg,
  fl,
  setFl,
  anchor,
  onClose,
}: {
  mg: Mg;
  fl: Filters;
  setFl: (f: Filters) => void;
  anchor: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const { tr } = mg;
  const set = (p: Partial<Filters>) => setFl({ ...fl, ...p });
  const chip = (on: boolean | undefined, l: string, f: () => void) => (
    <button type="button" className="al-chip" aria-pressed={!!on} onClick={f}>
      {tr(l)}
    </button>
  );
  return (
    <Popover
      anchor={anchor}
      align="right"
      width={360}
      onClose={onClose}
      className="al-pop al-filters"
      role="dialog"
      aria-label={tr('Filtros')}
    >
      <div className="al-pop-hd">
        <b>{tr('Filtros')}</b>
      </div>
      <div className="al-pop-bd">
        <Fld label={tr('Projeto')}>
          <select
            className="al-in"
            value={fl.proj ?? ''}
            onChange={(e) => set({ proj: e.target.value || undefined })}
          >
            <option value="">{tr('Todos os Projetos')}</option>
            {mg.PJ.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
        </Fld>
        <Fld label={tr('Cliente')}>
          <select
            className="al-in"
            value={fl.client ?? ''}
            onChange={(e) => set({ client: e.target.value || undefined })}
          >
            <option value="">{tr('Todos os clientes')}</option>
            {mg.D.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Fld>
        <Fld label={tr('Área principal')}>
          <select
            className="al-in"
            value={fl.area ?? ''}
            onChange={(e) => set({ area: e.target.value || undefined })}
          >
            <option value="">{tr('Todas as áreas')}</option>
            {Object.keys(mg.ROLE).map((k) => (
              <option key={k} value={k}>
                {tr(mg.SKN[k] ?? k)}
              </option>
            ))}
          </select>
        </Fld>
        <Fld as="div" label={tr('Ocupação')}>
          <div className="al-chips">
            {chip(fl.over, 'Só sobre-alocados', () => set({ over: !fl.over || undefined, free: undefined }))}
            {chip(fl.free, 'Só com disponibilidade', () =>
              set({ free: !fl.free || undefined, over: undefined }),
            )}
          </div>
        </Fld>
        <Fld as="div" label={tr('Mostrar')}>
          <div className="al-chips">
            {chip(!fl.hideTent, 'Tentativos', () => set({ hideTent: !fl.hideTent || undefined }))}
            {chip(!fl.hidePh, 'Por atribuir', () => set({ hidePh: !fl.hidePh || undefined }))}
            {chip(!fl.hideAbs, 'Ausências', () => set({ hideAbs: !fl.hideAbs || undefined }))}
          </div>
        </Fld>
      </div>
      <div className="al-pop-ft">
        <button
          type="button"
          className="al-btn ghost"
          onClick={() => setFl({})}
          disabled={!Object.keys(fl).length}
        >
          {tr('Limpar filtros')}
        </button>
        <button type="button" className="al-btn" onClick={onClose}>
          {tr('Fechar')}
        </button>
      </div>
    </Popover>
  );
}
