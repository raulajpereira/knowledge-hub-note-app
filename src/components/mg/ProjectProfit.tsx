'use client';

import { useMemo, useState } from 'react';
import { mgEur, type MgProject } from '@/lib/mg';
import { bookingSum, dnOf, isoOf, mondayOf, todayIso, type Dn } from '@/lib/alloc';
import { css } from './css';
import type { Mg } from './store';

// Project profitability: what was sold and what it cost so far (timesheets ×
// each person's sell rate / internal cost), and the same at the end with the
// confirmed allocations still to come; a burn-up of the revenue against the
// budget (real to date, then forecast; the plan = every confirmed allocation
// from the start). Tentative allocations never count (D78 rule).

type Pt = { d: Dn; real: number | null; fc: number | null; plan: number };

const W = 640;
const H = 190;
const PAD = { l: 8, r: 8, t: 14, b: 22 };

export function ProjectProfit({ mg, sel }: { mg: Mg; sel: MgProject }) {
  const { tr } = mg;
  const [hover, setHover] = useState<number | null>(null);

  const r = useMemo(() => {
    const today = dnOf(todayIso());
    const pStart = mondayOf(dnOf(sel.from));
    const end = mondayOf(dnOf(sel.to)) + 6;
    // timesheets: hours, revenue and cost per week (Monday)
    let realH = 0;
    let realRev = 0;
    let realCost = 0;
    const realByWeek = new Map<Dn, number>();
    for (const e of mg.D.ts) {
      const row = e.rows[sel.id];
      if (!row) continue;
      const h = row.reduce((x, y) => x + (+y || 0), 0);
      if (!h) continue;
      const p = mg.pById[e.person];
      realH += h;
      realRev += h * (p?.rate ?? 0);
      realCost += h * (p?.cost ?? 0);
      const w = mondayOf(dnOf(e.week));
      realByWeek.set(w, (realByWeek.get(w) ?? 0) + h * (p?.rate ?? 0));
    }
    // the chart starts with the first timesheet when there are hours before the project's start
    const start = Math.min(pStart, ...realByWeek.keys());
    // confirmed allocations with a person
    const bks = mg.BK.filter((b) => b.project === sel.id && b.person && b.status === 'confirmed');
    let fcH = 0;
    let fcRev = 0;
    let fcCost = 0;
    for (const b of bks) {
      const h = bookingSum(b, mg.env, today, end);
      const p = mg.pById[b.person];
      fcH += h;
      fcRev += h * (p?.rate ?? 0);
      fcCost += h * (p?.cost ?? 0);
    }
    // weekly burn-up (cumulative revenue)
    const pts: Pt[] = [];
    let cumReal = 0;
    let cumPlan = 0;
    let cumFc = 0;
    for (let w = start; w <= end; w += 7) {
      for (const b of bks) cumPlan += bookingSum(b, mg.env, w, w + 6) * (mg.pById[b.person]?.rate ?? 0);
      const ahead = (a: Dn) =>
        bks.reduce((t, b) => t + bookingSum(b, mg.env, a, w + 6) * (mg.pById[b.person]?.rate ?? 0), 0);
      if (w <= today) {
        cumReal += realByWeek.get(w) ?? 0;
        // this week: what is booked from today on is still to come
        cumFc = cumReal + ahead(today);
      } else cumFc += ahead(w);
      pts.push({
        d: w,
        real: w <= today ? cumReal : null,
        fc: w + 6 >= today ? cumFc : null,
        plan: cumPlan,
      });
    }
    return {
      realH,
      realRev,
      realCost,
      endRev: realRev + fcRev,
      endCost: realCost + fcCost,
      endH: realH + fcH,
      pts,
      today,
    };
  }, [mg.D.ts, mg.BK, mg.env, mg.pById, sel.id, sel.from, sel.to]);

  const margin = (rev: number, cost: number) => ({
    v: rev - cost,
    p: rev > 0 ? Math.round(((rev - cost) / rev) * 100) : null,
  });
  const now = margin(r.realRev, r.realCost);
  const fin = margin(r.endRev, r.endCost);
  const tone = (p: number | null) =>
    p === null
      ? 'var(--ink)'
      : p < 0
        ? 'oklch(0.8 0.14 30)'
        : p < 15
          ? 'oklch(0.86 0.13 75)'
          : 'oklch(0.86 0.12 150)';

  // chart scale
  const max = Math.max(sel.budget, ...r.pts.map((p) => Math.max(p.plan, p.fc ?? 0, p.real ?? 0)), 1) * 1.08;
  const n = Math.max(1, r.pts.length - 1);
  const x = (i: number) => PAD.l + (i / n) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const path = (k: 'real' | 'fc' | 'plan') =>
    r.pts
      .map((p, i) => [i, p[k]] as const)
      .filter(([, v]) => v !== null)
      .map(([i, v], j) => `${j ? 'L' : 'M'}${x(i).toFixed(1)},${y(v!).toFixed(1)}`)
      .join('');
  const ti = r.pts.findIndex((p) => p.d <= r.today && r.today <= p.d + 6);
  const fmtW = (d: Dn) => {
    const s = isoOf(d);
    return `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  };
  const lbls = r.pts.length
    ? [0, Math.round(n / 2), n]
        .filter((v, i, a) => a.indexOf(v) === i)
        .map((i) => [i, fmtW(r.pts[i]!.d)] as const)
    : [];
  const hp = hover !== null ? r.pts[hover] : null;

  const tiles: Array<[string, string, string, string?]> = [
    [tr('Receita até hoje'), mgEur(r.realRev), 'var(--ink)', `${Math.round(r.realH)}h`],
    [tr('Custo até hoje'), mgEur(r.realCost), 'var(--ink)'],
    [tr('Margem até hoje'), mgEur(now.v), tone(now.p), now.p === null ? '—' : `${now.p}%`],
    [tr('Receita no fim'), mgEur(r.endRev), 'var(--ink)', `${Math.round(r.endH)}h`],
    [tr('Custo no fim'), mgEur(r.endCost), 'var(--ink)'],
    [tr('Margem no fim'), mgEur(fin.v), tone(fin.p), fin.p === null ? '—' : `${fin.p}%`],
  ];

  const C_REAL = sel.color;
  const C_PLAN = 'rgb(var(--w) / .55)';
  const C_BUD = 'oklch(0.82 0.13 60)';

  return (
    <div style={css('display:flex;flex-direction:column;gap:12px;')}>
      <span style={css('font-size:16px;font-weight:600;')}>{tr('Rentabilidade')}</span>
      <div style={css('display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;')}>
        {tiles.map(([l, v, c, sub]) => (
          <div
            key={l}
            style={css(
              'display:flex;flex-direction:column;gap:4px;padding:12px 14px;border-radius:16px;background:rgb(var(--w) / .07);border:1px solid rgb(var(--w) / .1);min-width:0;',
            )}
          >
            <span style={css('font-size:12px;color:rgb(var(--t) / calc(.68 * var(--t-k)));')}>{l}</span>
            <span style={css('display:flex;align-items:baseline;gap:8px;min-width:0;')}>
              <span
                style={css(
                  `font-family:'Geist Mono',monospace;font-size:18px;font-weight:600;color:${c};white-space:nowrap;`,
                )}
              >
                {v}
              </span>
              {sub && (
                <span
                  style={css('font-size:12px;font-weight:600;color:rgb(var(--t) / calc(.7 * var(--t-k)));')}
                >
                  {sub}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      {r.pts.length > 1 && (
        <div
          style={css(
            'position:relative;padding:12px 14px 10px;border-radius:18px;background:rgb(var(--w) / .06);border:1px solid rgb(var(--w) / .1);',
          )}
        >
          <div style={css('display:flex;flex-wrap:wrap;gap:14px;font-size:12px;margin-bottom:6px;')}>
            <span style={css('font-weight:600;margin-right:auto;')}>{tr('Receita acumulada')}</span>
            {[
              [tr('Real'), C_REAL, ''],
              [tr('Previsão'), C_REAL, '4 3'],
              [tr('Plano'), C_PLAN, '2 3'],
              [tr('Orçamento'), C_BUD, '6 4'],
            ].map(([l, c, dash]) => (
              <span key={l} style={css('display:inline-flex;align-items:center;gap:6px;')}>
                <svg width="18" height="6" aria-hidden="true">
                  <line
                    x1="0"
                    y1="3"
                    x2="18"
                    y2="3"
                    stroke={c}
                    strokeWidth="2.5"
                    strokeDasharray={dash || undefined}
                  />
                </svg>
                {l}
              </span>
            ))}
          </div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height={H}
            preserveAspectRatio="none"
            role="img"
            aria-label={tr('Receita acumulada')}
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const b = e.currentTarget.getBoundingClientRect();
              const fx = ((e.clientX - b.left) / b.width) * W;
              setHover(Math.max(0, Math.min(n, Math.round(((fx - PAD.l) / (W - PAD.l - PAD.r)) * n))));
            }}
            style={css('display:block;overflow:visible;')}
          >
            <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="rgb(var(--w) / .15)" />
            {sel.budget > 0 && (
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y(sel.budget)}
                y2={y(sel.budget)}
                stroke={C_BUD}
                strokeWidth="1.5"
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {ti >= 0 && (
              <line
                x1={x(ti)}
                x2={x(ti)}
                y1={PAD.t}
                y2={H - PAD.b}
                stroke="rgb(var(--w) / .3)"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <path
              d={path('plan')}
              fill="none"
              stroke={C_PLAN}
              strokeWidth="2"
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={path('fc')}
              fill="none"
              stroke={C_REAL}
              strokeWidth="2.5"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={path('real')}
              fill="none"
              stroke={C_REAL}
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
            {hover !== null && (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.t}
                y2={H - PAD.b}
                stroke="rgb(var(--w) / .5)"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {lbls.map(([i, l]) => (
              <text
                key={i}
                x={x(i)}
                y={H - 4}
                textAnchor={i === 0 ? 'start' : i === n ? 'end' : 'middle'}
                fontSize="11"
                fill="rgb(var(--t) / calc(.6 * var(--t-k)))"
              >
                {l}
              </text>
            ))}
          </svg>
          {hp && (
            <div
              style={css(
                `position:absolute;top:44px;${hover! > n / 2 ? 'left:18px' : 'right:18px'};padding:8px 12px;border-radius:12px;background:rgb(var(--sf) / calc(.3 * var(--sf-k)));backdrop-filter:blur(var(--kh-blur-modal));border:1px solid rgb(var(--w) / .2);font-size:12px;display:grid;grid-template-columns:auto auto;gap:3px 12px;pointer-events:none;`,
              )}
            >
              <span style={css('grid-column:1 / 3;font-weight:600;')}>
                {tr('Semana de')} {fmtW(hp.d)}
              </span>
              {hp.real !== null && (
                <>
                  <span>{tr('Real')}</span>
                  <b style={css("font-family:'Geist Mono',monospace;text-align:right;")}>{mgEur(hp.real)}</b>
                </>
              )}
              {hp.fc !== null && hp.d + 6 > r.today && (
                <>
                  <span>{tr('Previsão')}</span>
                  <b style={css("font-family:'Geist Mono',monospace;text-align:right;")}>{mgEur(hp.fc)}</b>
                </>
              )}
              <span>{tr('Plano')}</span>
              <b style={css("font-family:'Geist Mono',monospace;text-align:right;")}>{mgEur(hp.plan)}</b>
            </div>
          )}
        </div>
      )}
      <span style={css('font-size:12px;color:rgb(var(--t) / calc(.6 * var(--t-k)));')}>
        {tr(
          'Receita = horas × preço de venda; custo = horas × custo interno de cada pessoa. Só alocações confirmadas.',
        )}
      </span>
    </div>
  );
}
