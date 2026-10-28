'use client';

import { useEffect, useMemo, useState } from 'react';
import { dnOf, fmtNum, monthStart, sumDays, todayIso, type Booking, type Dn } from '@/lib/alloc';
import type { Mg } from '../store';
import type { Filters } from './AllocPage';
import type { GUnit } from './Grid';
import { needOf } from './ProjectsView';
import { AREA_GROUPS, groupOfArea, monShort, stdHours } from './shared';
import type { Nav } from './Timeline';
import { yearOf } from '@/lib/alloc';

type Cell = { cap: number; conf: number; tent: number; ph: number; std: number };
type Gap = { g: string; kind: 'short' | 'free'; v: number; a: Dn; b: Dn; why: string };

// Capacidade (concept C2): demand against capacity per SAP area, month by
// month — confirmed, tentative and roles still without a person ("por
// atribuir"), with holidays and absences taken off the capacity — and the
// gaps that still need a decision.
export function CapacityView({
  mg,
  unit,
  nav,
  fl,
  onView,
}: {
  mg: Mg;
  unit: GUnit;
  nav: Nav;
  fl: Filters;
  onView: (a: Dn, b: Dn) => void;
}) {
  const { tr, lang } = mg;
  const t0 = monthStart(dnOf(todayIso()));
  const [start, setStart] = useState(t0);
  useEffect(() => {
    if (!nav.n) return;
    setStart((s) => (nav.kind === 'today' ? t0 : monthStart(s, nav.kind === 'next' ? 3 : -3)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav]);
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ a: monthStart(start, i), b: monthStart(start, i + 1) - 1 })), [start]);
  useEffect(() => {
    mg.AL.ensure(months[0]!.a, months[11]!.b);
    onView(months[0]!.a, months[11]!.b);
  }, [months, mg.AL, onView]);

  const data = useMemo(() => {
    const groups = new Map<string, { people: string[]; cells: Cell[]; phProj: Set<string> }>();
    const G = (g: string) => {
      let x = groups.get(g);
      if (!x) groups.set(g, (x = { people: [], cells: months.map((m) => ({ cap: 0, conf: 0, tent: 0, ph: 0, std: stdHours(m.a, m.b) })), phProj: new Set() }));
      return x;
    };
    for (const [g] of AREA_GROUPS) void g;
    const people = mg.P.filter((p) => (!fl.area || p.area === fl.area) && (p.status ?? 'Ativo') === 'Ativo');
    for (const p of people) {
      const x = G(groupOfArea(p.area));
      x.people.push(p.id);
      const l = mg.loads(p.id);
      months.forEach((m, i) => {
        const c = x.cells[i]!;
        c.cap += sumDays(l.cap, l, m.a, m.b);
        c.conf += sumDays(l.conf, l, m.a, m.b);
        c.tent += sumDays(l.tent, l, m.a, m.b);
      });
    }
    const keep = (b: Booking) => (!fl.proj || b.project === fl.proj) && (!fl.client || mg.pjById[b.project]?.client === fl.client);
    for (const b of mg.BK) {
      if (b.person || !keep(b) || fl.hidePh) continue;
      const pj = mg.pjById[b.project];
      const k = needOf(b, pj, mg.SKN)[0]?.k;
      if (!k) continue;
      const x = G(groupOfArea(k));
      x.phProj.add(`${pj?.code ?? '?'} · ${b.role}`);
      const s = mg.series(b);
      months.forEach((m, i) => {
        let h = 0;
        for (let n = Math.max(m.a, s.from); n <= Math.min(m.b, s.from + s.h.length - 1); n++) h += s.h[n - s.from]!;
        x.cells[i]!.ph += h;
      });
    }
    const order = AREA_GROUPS.map(([g]) => g);
    return [...groups.entries()].sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0]);
    });
  }, [mg, months, fl]);

  const val = (h: number, c: Cell) => (unit === 'fte' ? h / (c.std || 1) : unit === 'pct' ? h : h);
  const fmtV = (h: number, c: Cell) => (unit === 'fte' ? fmtNum(h / (c.std || 1), lang, 1) : `${fmtNum(h, lang, 0)}h`);
  const gaps = useMemo(() => {
    const out: Gap[] = [];
    for (const [g, x] of data) {
      let run: Gap | null = null;
      const flush = () => {
        if (run) out.push(run);
        run = null;
      };
      x.cells.forEach((c, i) => {
        const dem = c.conf + c.tent + c.ph;
        const d = (c.cap - dem) / (c.std || 1);
        const kind: Gap['kind'] | null = d < -0.25 ? 'short' : d > 1 ? 'free' : null;
        if (!kind) return flush();
        if (run && run.kind === kind) {
          run.b = months[i]!.b;
          run.v = kind === 'short' ? Math.max(run.v, -d) : Math.min(run.v, d);
        } else {
          flush();
          run = { g, kind, v: Math.abs(d), a: months[i]!.a, b: months[i]!.b, why: '' };
        }
      });
      flush();
      for (const gp of out.filter((o) => o.g === g))
        gp.why =
          gp.kind === 'short'
            ? [...x.phProj].slice(0, 2).join(' · ') || tr('procura acima da capacidade')
            : tr(`${x.people.length} pessoas com horas livres`);
    }
    return out.sort((a, b) => +(a.kind === 'free') - +(b.kind === 'free') || b.v - a.v).slice(0, 8);
  }, [data, months, tr]);

  const mon = (n: Dn) => monShort(n, lang);
  return (
    <div className="al-body">
      <div className="al-well">
        <div className="al-scroll">
          <div style={{ minWidth: 820 }}>
            <div className="al-hdr" style={{ display: 'flex', height: 54 }}>
              <div className="al-corner" style={{ width: 170, position: 'static' }}>
                {tr('Área SAP')}
              </div>
              {months.map((m, i) => (
                <div key={m.a} className={`al-hcol${m.a === t0 ? ' today' : ''}`} style={{ position: 'relative', flex: 1, minWidth: 46 }}>
                  {(i === 0 || monthStart(m.a) === Date.UTC(yearOf(m.a), 0, 1) / 86_400_000) && <span className="top">{yearOf(m.a)}</span>}
                  <span className="lbl">{mon(m.a)}</span>
                </div>
              ))}
            </div>
            {data.map(([g, x]) => {
              const capAvg = x.cells.reduce((s, c) => s + c.cap / (c.std || 1), 0) / x.cells.length;
              const phAvg = x.cells.reduce((s, c) => s + c.ph / (c.std || 1), 0) / x.cells.length;
              const mx = Math.max(1, ...x.cells.map((c) => Math.max(val(c.cap, c), val(c.conf + c.tent + c.ph, c))));
              return (
                <div key={g} className="al-cap-row" data-area={g}>
                  <div className="al-cap-name">
                    <b>{g}</b>
                    <span>
                      {tr('cap.')} {fmtNum(capAvg, lang, 1)} FTE · {tr(`${x.people.length} pessoas`)}
                    </span>
                    {phAvg > 0.05 ? (
                      <span style={{ color: 'oklch(calc(.86 * var(--lk)) .13 85)' }}>
                        {fmtNum(phAvg, lang, 1)} FTE {tr('por atribuir')}
                      </span>
                    ) : (
                      <span style={{ color: 'oklch(calc(.86 * var(--lk)) .12 150)' }}>{tr('coberto')}</span>
                    )}
                  </div>
                  {x.cells.map((c, i) => {
                    const H = 60;
                    const sc = (h: number) => (val(h, c) / mx) * H;
                    const overC = c.conf > c.cap + 0.01;
                    const diff = (c.cap - c.conf - c.tent - c.ph) / (c.std || 1);
                    return (
                      <div
                        key={i}
                        className="al-cap-cell"
                        title={`${mon(months[i]!.a)} · ${tr('capacidade')} ${fmtV(c.cap, c)} · ${tr('confirmado')} ${fmtV(c.conf, c)} · ${tr('tentativo')} ${fmtV(c.tent, c)} · ${tr('por atribuir')} ${fmtV(c.ph, c)}`}
                      >
                        <span className="col" style={{ height: H }}>
                          <i style={{ height: sc(c.conf), background: overC ? 'var(--al-u3)' : 'var(--al-u2)', borderRadius: '0 0 3px 3px' }} />
                          <i
                            className="al-stripe"
                            style={{ height: sc(c.tent), background: 'color-mix(in oklch, oklch(0.78 0.12 300) 70%, transparent)', backgroundImage: 'repeating-linear-gradient(135deg, rgb(255 255 255 / .35) 0 3px, transparent 3px 7px)' }}
                          />
                          <i style={{ height: sc(c.ph), border: c.ph ? '1.5px dashed oklch(0.85 0.13 85)' : 0, borderRadius: '3px 3px 0 0' }} />
                        </span>
                        <span className="line" style={{ bottom: 18 + sc(c.cap) }} />
                        <span
                          className="d"
                          style={{
                            color:
                              diff < -0.05 ? 'oklch(calc(.84 * var(--lk)) .14 30)' : 'rgb(var(--t) / calc(.7 * var(--t-k)))',
                          }}
                        >
                          {unit === 'fte'
                            ? `${diff > 0 ? '+' : ''}${fmtNum(diff, lang, 1)}`
                            : `${diff > 0 ? '+' : ''}${fmtNum(c.cap - c.conf - c.tent - c.ph, lang, 0)}h`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {!data.length && <div className="al-empty">{tr('Sem pessoas com estes filtros.')}</div>}
          </div>
        </div>
        <div className="al-foot" style={{ margin: 0, borderRadius: 0, border: 0, borderTop: '1px solid rgb(var(--w) / .1)' }}>
          <span className="al-lg">
            <i style={{ background: 'var(--al-u2)' }} />
            {tr('confirmado')}
          </span>
          <span className="al-lg">
            <i className="tent al-stripe" />
            {tr('tentativo')}
          </span>
          <span className="al-lg">
            <i style={{ border: '1.5px dashed oklch(0.85 0.13 85)' }} />
            {tr('por atribuir')}
          </span>
          <span className="al-lg">
            <i style={{ height: 2, background: 'var(--ink)' }} />
            {tr('capacidade')}
          </span>
        </div>
      </div>
      <aside className="al-side" aria-label={tr('O que falta decidir')}>
        <div className="al-side-hd">
          <div className="t">
            <b>{tr('O que falta decidir')}</b>
          </div>
          <small>{tr('Lacunas e folgas nos próximos 12 meses')}</small>
        </div>
        <div className="al-side-bd">
          {gaps.map((g, i) => (
            <div key={i} className="al-gap">
              <div className="h">
                <i style={{ background: g.kind === 'short' ? 'var(--al-u3)' : 'var(--al-u2)' }} />
                <b>{g.g}</b>
                <span style={{ color: 'rgb(var(--t) / calc(.6 * var(--t-k)))' }}>
                  {mon(g.a)} → {mon(g.b)}
                </span>
                <span className="v" style={{ color: g.kind === 'short' ? 'oklch(calc(.84 * var(--lk)) .14 30)' : 'oklch(calc(.86 * var(--lk)) .12 150)' }}>
                  {tr(g.kind === 'short' ? 'falta' : 'livre')} {fmtNum(g.v, lang, 1)} FTE
                </span>
              </div>
              <span style={{ color: 'rgb(var(--t) / calc(.7 * var(--t-k)))' }}>{g.why}</span>
              <div>
                <button type="button" className="al-btn ghost sm" onClick={() => mg.nav(g.kind === 'short' ? 'mg_staff' : 'mg_projects')}>
                  {tr(g.kind === 'short' ? 'Pesquisar Recursos' : 'Propor a pipeline')} →
                </button>
              </div>
            </div>
          ))}
          {!gaps.length && <div className="al-empty">{tr('Nada por decidir: a procura cabe na capacidade.')}</div>}
        </div>
      </aside>
    </div>
  );
}
