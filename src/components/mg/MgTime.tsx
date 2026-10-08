'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { wLbl, wLblY, type MgData, type MgTs } from '@/lib/mg';
import { mgL } from '@/lib/mgText';
import { usePersistentState } from '@/components/ui';
import { CHEV, OPT, css } from './css';
import { Av, Glass, Split, uid } from './ui';
import type { Mg } from './store';

const SEG =
  'display:flex;gap:2px;padding:3px;border-radius:999px;background:rgba(18,12,9,.22);border:1px solid rgba(255,255,255,.12);';
const STICKY =
  'background:linear-gradient(90deg,rgba(255,255,255,.12),rgba(255,255,255,.07));backdrop-filter:blur(30px) saturate(150%);border-right:1px solid rgba(255,255,255,.12);';
const TSGRID = 'minmax(200px,1fr) repeat(5,72px) 72px';
const stC = (s: string) =>
  s === 'Submetido'
    ? 'oklch(0.8 0.14 150)'
    : s === 'Rascunho'
      ? 'oklch(0.84 0.13 85)'
      : 'oklch(0.72 0.15 30)';

/** The timesheet of a person for a week, created as a draft on first write. */
function entryOf(d: MgData, person: string, week: string): MgTs {
  let e = d.ts.find((x) => x.person === person && x.week === week);
  if (!e) {
    e = { id: uid(), person, week, status: 'Rascunho', rows: {} };
    d.ts.push(e);
  }
  return e;
}

// Folhas de Tempos (prototype isTime): weekly timesheet per person (planned
// projects, hours per day, submit/reopen) and the grouped views by project,
// client, role or team with planned vs. logged hours.
export function MgTime({ mg }: { mg: Mg }) {
  const sp = useSearchParams();
  const { D, tr, lang, P, wk, wi, dIso } = mg;
  const L = (i: number) => mgL(i, lang);
  const en = lang === 'en';
  const [w, setW] = useState(-1);
  const [vm0, setVM] = usePersistentState<string>('mg.tsView', 'person');
  const VM = vm0 === 'area' ? 'team' : vm0; // saved before "Por Equipa" grouped by team
  const [RG, setRG] = usePersistentState<string>('mg.tsRange', 'w');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const wIso = wk(w);
  const DN = en ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] : ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
  const days = DN.map((d, i) => `${d} ${+dIso(w, i).slice(8, 10)}`);
  const entry = (pid: string, wkIso = wIso) => mg.tsBy[`${pid}|${wkIso}`];
  const planned = (pid: string) =>
    D.allocs.filter((a) => a.person === pid && wi(a.from) <= w && wi(a.to) >= w);
  const sum = (e?: MgTs) =>
    e ? Object.values(e.rows).reduce((s, r) => s + r.reduce((a, b) => a + (+b || 0), 0), 0) : 0;
  const team = P.filter((p) => planned(p.id).length || entry(p.id));
  const sub = team.filter((p) => entry(p.id)?.status === 'Submetido').length;
  const sel = team.find((p) => p.id === sp.get('p')) ?? team[0];
  const isPerson = VM === 'person';
  const seg = (cur: string, list: Array<[string, string]>, set: (v: string) => void) => (
    <div role="tablist" style={css(SEG)}>
      {list.map(([k, l]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={cur === k}
          onClick={() => {
            set(k);
            setOpen({});
          }}
          style={css(
            `height:28px;padding:0 12px;border-radius:999px;border:0;font:inherit;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;background:${cur === k ? '#fbf8f5' : 'transparent'};color:${cur === k ? '#2a211c' : 'rgba(255,248,240,.8)'};`,
          )}
        >
          {tr(l)}
        </button>
      ))}
    </div>
  );
  const weekLbl =
    RG === '4w' && !isPerson ? `${wLbl(wk(w - 3))} → ${wLblY(wIso)}` : tr(`Semana de ${wLblY(wIso)}`);

  let summary = tr(`${sub} de ${team.length} submetidos`);
  let body: React.ReactNode;
  if (isPerson) {
    body = (
      <PersonSheet
        mg={mg}
        sel={sel}
        team={team}
        wIso={wIso}
        days={days}
        weekLbl={weekLbl}
        entry={entry}
        planned={planned}
        sum={sum}
      />
    );
  } else {
    const weeks = RG === '4w' ? [w - 3, w - 2, w - 1, w] : [w];
    const cols = RG === '4w' ? weeks.map((x) => tr(`Sem ${wLbl(wk(x))}`)) : days;
    const N = cols.length;
    const gOf = (pid: string, pr: string) => {
      const p = mg.pById[pid];
      const pj = mg.pjById[pr];
      return VM === 'project'
        ? pr
        : VM === 'client'
          ? pj?.client || '_'
          : VM === 'role'
            ? p?.role || '—'
            : p?.team || '_';
    };
    type B = { cells: number[]; plan: number };
    const G: Record<string, B & { kids: Record<string, B> }> = {};
    const bucket = (g: string, pid: string): [B, B] => {
      const x = (G[g] ??= { cells: Array(N).fill(0), plan: 0, kids: {} });
      return [x, (x.kids[pid] ??= { cells: Array(N).fill(0), plan: 0 })];
    };
    weeks.forEach((wv, wiI) => {
      for (const p of P) {
        const e = entry(p.id, wk(wv));
        if (e)
          for (const [pr, r] of Object.entries(e.rows)) {
            const [g, k] = bucket(gOf(p.id, pr), p.id);
            r.forEach((x, di) => {
              const c = RG === '4w' ? wiI : di;
              g.cells[c]! += +x || 0;
              k.cells[c]! += +x || 0;
            });
          }
      }
      for (const a of D.allocs)
        if (wi(a.from) <= wv && wi(a.to) >= wv && mg.pById[a.person] && P.includes(mg.pById[a.person]!)) {
          const [g, k] = bucket(gOf(a.person, a.project), a.person);
          g.plan += +a.hours || 0;
          k.plan += +a.hours || 0;
        }
    });
    const stOf = (pid: string) => {
      const ss = weeks.map((x) => entry(pid, wk(x))?.status ?? 'Em falta');
      return ss.every((s) => s === 'Submetido')
        ? 'Submetido'
        : ss.some((s) => s === 'Rascunho' || s === 'Submetido')
          ? 'Rascunho'
          : 'Em falta';
    };
    const fmt = (v: number) => (v ? `${Math.round(v * 10) / 10}h` : '·');
    const varC = (l: number, pl: number) =>
      !pl
        ? 'rgba(255,248,240,.6)'
        : l > pl * 1.05
          ? 'oklch(0.84 0.13 30)'
          : l < pl * 0.9
            ? 'oklch(0.86 0.12 85)'
            : 'oklch(0.86 0.12 150)';
    const row = (x: B, last: { t: string; c: string }) => {
      const l = x.cells.reduce((a, b) => a + b, 0);
      const d = l - x.plan;
      return [
        ...x.cells.map((v) => ({ t: fmt(v), c: v ? '#fbf8f5' : 'rgba(255,248,240,.35)' })),
        { t: fmt(l), c: '#fbf8f5' },
        { t: fmt(x.plan), c: 'rgba(255,248,240,.75)' },
        { t: x.plan || l ? `${d > 0 ? '+' : ''}${Math.round(d * 10) / 10}h` : '·', c: varC(l, x.plan) },
        last,
      ];
    };
    const meta = (g: string) => {
      if (VM === 'project') {
        const pj = mg.pjById[g];
        return { name: `${pj?.code ?? '—'} · ${pj?.name ?? ''}`, dot: pj?.color ?? 'rgba(255,255,255,.4)' };
      }
      if (VM === 'client')
        return { name: mg.cById[g]?.name ?? tr('Sem cliente'), dot: 'rgba(255,255,255,.55)' };
      if (VM === 'role') return { name: tr(g), dot: `oklch(0.78 0.1 ${(g.length * 37) % 360})` };
      // Por Equipa: the person's team (the prototype grouped by main area)
      return {
        name: mg.tById[g]?.name ?? tr('Sem equipa'),
        dot: mg.tById[g]?.color ?? 'rgba(255,255,255,.4)',
      };
    };
    const groups = Object.entries(G)
      .map(([g, x]) => ({ g, x, l: x.cells.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.l - a.l || b.x.plan - a.x.plan);
    const T: B = { cells: Array(N).fill(0), plan: 0 };
    const allP = new Set<string>();
    for (const x of Object.values(G)) {
      x.cells.forEach((v, i) => (T.cells[i]! += v));
      T.plan += x.plan;
      Object.keys(x.kids).forEach((k) => allP.add(k));
    }
    const subAll = [...allP].filter((pid) => stOf(pid) === 'Submetido').length;
    summary = tr(`${groups.length} grupos · ${allP.size} pessoas · ${subAll} de ${allP.size} submetidos`);
    const gcols = `minmax(240px,1.6fr) repeat(${N}, minmax(64px,1fr)) repeat(3, 88px) 104px`;
    const head = [...cols, tr('Total'), tr('Planeado'), tr('Desvio'), tr('Submetidos')];
    const gLabel = tr({ project: 'Projeto', client: 'Cliente', role: 'Função', team: 'Equipa' }[VM] ?? '');
    const cellsOf = (cs: Array<{ t: string; c: string }>, kid?: boolean) =>
      cs.map((c, i) => (
        <span
          key={i}
          role="gridcell"
          style={css(
            `text-align:center;font-family:'Geist Mono',monospace;font-size:${kid ? 12 : 12.5}px;${kid ? '' : 'font-weight:600;'}color:${c.c};white-space:nowrap;`,
          )}
        >
          {c.t === 'Submetido' || c.t === 'Rascunho' || c.t === 'Em falta' ? tr(c.t) : c.t}
        </span>
      ));
    body = (
      <div
        style={css(
          'flex:1;min-height:0;overflow:auto;margin:12px;border-radius:22px;background:rgba(18,12,9,.18);border:1px solid rgba(255,255,255,.1);',
        )}
      >
        <div role="treegrid" aria-label={L(48)} style={css(`min-width:${240 + N * 64 + 3 * 88 + 104}px;`)}>
          <div
            role="row"
            style={css(
              `position:sticky;top:0;z-index:3;display:grid;grid-template-columns:${gcols};align-items:center;height:44px;background:linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,.1));backdrop-filter:blur(30px) saturate(160%);border-bottom:1px solid rgba(255,255,255,.16);font-size:12px;font-weight:600;color:rgba(255,248,240,.88);`,
            )}
          >
            <span
              role="columnheader"
              style={css(
                `position:sticky;left:0;height:100%;display:flex;align-items:center;padding:0 16px;${STICKY}`,
              )}
            >
              {gLabel}
            </span>
            {head.map((c) => (
              <span key={c} role="columnheader" style={css('text-align:center;white-space:nowrap;')}>
                {c}
              </span>
            ))}
          </div>
          {groups.map(({ g, x }) => {
            const kids = Object.entries(x.kids)
              .map(([pid, k]) => ({ pid, k, p: mg.pById[pid] }))
              .filter((o) => o.p)
              .sort((a, b) => b.k.cells.reduce((q, r) => q + r, 0) - a.k.cells.reduce((q, r) => q + r, 0));
            const subm = kids.filter((o) => stOf(o.pid) === 'Submetido').length;
            const m = meta(g);
            const isOpen = !!open[g];
            return (
              <div
                key={g}
                style={css(
                  'display:flex;flex-direction:column;border-bottom:1px solid rgba(255,255,255,.07);',
                )}
              >
                <div
                  role="row"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  className="mg-h4"
                  onClick={() => setOpen({ ...open, [g]: !isOpen })}
                  onKeyDown={(e) => e.key === 'Enter' && setOpen({ ...open, [g]: !isOpen })}
                  style={css(
                    `display:grid;grid-template-columns:${gcols};align-items:center;min-height:50px;cursor:pointer;`,
                  )}
                >
                  <span
                    role="rowheader"
                    style={css(
                      `position:sticky;left:0;z-index:1;height:100%;display:flex;align-items:center;gap:10px;padding:0 14px;min-width:0;${STICKY}`,
                    )}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      style={css(
                        `flex:none;transform:${isOpen ? 'rotate(90deg)' : 'none'};transition:transform .15s;opacity:.75;`,
                      )}
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                    <span
                      style={css(`width:9px;height:9px;flex:none;border-radius:50%;background:${m.dot};`)}
                    />
                    <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;')}>
                      <span
                        style={css(
                          'font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                        )}
                      >
                        {m.name}
                      </span>
                      <span style={css('font-size:11.5px;color:rgba(255,248,240,.62);white-space:nowrap;')}>
                        {tr(`${kids.length} pessoas`)}
                      </span>
                    </span>
                  </span>
                  {cellsOf(
                    row(x, {
                      t: `${subm}/${kids.length}`,
                      c: subm === kids.length ? 'oklch(0.86 0.13 150)' : 'oklch(0.86 0.12 85)',
                    }),
                  )}
                </div>
                {isOpen &&
                  kids.map((o) => {
                    const st = stOf(o.pid);
                    const go = () => {
                      setVM('person');
                      mg.nav('mg_time', { p: o.pid });
                    };
                    return (
                      <div
                        key={o.pid}
                        role="row"
                        tabIndex={0}
                        className="mg-h6"
                        onClick={go}
                        onKeyDown={(e) => e.key === 'Enter' && go()}
                        style={css(
                          `display:grid;grid-template-columns:${gcols};align-items:center;min-height:40px;cursor:pointer;border-top:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.02);`,
                        )}
                      >
                        <span
                          role="rowheader"
                          style={css(
                            `position:sticky;left:0;z-index:1;height:100%;display:flex;align-items:center;gap:9px;padding:0 14px 0 44px;min-width:0;${STICKY}`,
                          )}
                        >
                          <Av
                            p={o.p}
                            size={24}
                            fs={9.5}
                            tc={mg.tOf(o.p).tc}
                            s="border:1px solid rgba(255,255,255,.2);"
                          />
                          <span
                            style={css(
                              'flex:1;min-width:0;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                            )}
                          >
                            {o.p!.name}
                          </span>
                        </span>
                        {cellsOf(row(o.k, { t: st, c: stC(st) }), true)}
                      </div>
                    );
                  })}
              </div>
            );
          })}
          <div
            role="row"
            style={css(
              `position:sticky;bottom:0;z-index:2;display:grid;grid-template-columns:${gcols};align-items:center;height:44px;background:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,.09));backdrop-filter:blur(30px);border-top:1px solid rgba(255,255,255,.16);`,
            )}
          >
            <span
              role="rowheader"
              style={css(
                `position:sticky;left:0;height:100%;display:flex;align-items:center;padding:0 16px;font-size:12.5px;font-weight:600;${STICKY}`,
              )}
            >
              {tr('Total')}
            </span>
            {row(T, {
              t: `${subAll}/${allP.size}`,
              c: subAll === allP.size ? 'oklch(0.86 0.13 150)' : 'oklch(0.86 0.12 85)',
            }).map((c, i) => (
              <span
                key={i}
                role="gridcell"
                style={css(
                  `text-align:center;font-family:'Geist Mono',monospace;font-size:12.5px;font-weight:700;color:${c.c};`,
                )}
              >
                {c.t}
              </span>
            ))}
          </div>
        </div>
        {!groups.length && (
          <div style={css('padding:24px;font-size:13px;color:rgba(255,248,240,.62);')}>
            {tr('Sem horas registadas ou planeadas neste período.')}
          </div>
        )}
      </div>
    );
  }

  return (
    <Glass label={L(48)}>
      <div
        style={css(
          'flex-shrink:0;display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:20px 22px 14px;border-bottom:1px solid rgba(255,255,255,.1);',
        )}
      >
        <div style={css('display:flex;flex-direction:column;gap:3px;margin-right:auto;min-width:0;')}>
          <h1 style={css('margin:0;font-size:26px;font-weight:600;letter-spacing:-.02em;')}>
            {en ? 'Timesheets' : 'Folhas de Tempos'}
          </h1>
          <span style={css('font-size:12.5px;color:rgba(255,248,240,.68);')}>{summary}</span>
        </div>
        <div style={css('display:flex;align-items:center;gap:6px;')}>
          <button
            type="button"
            title={L(73)}
            aria-label={L(73)}
            onClick={() => setW(w - 1)}
            style={css(
              'width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fbf8f5;cursor:pointer;padding:0;',
            )}
          >
            ‹
          </button>
          <span
            style={css(
              'min-width:150px;text-align:center;font-size:13.5px;font-weight:600;white-space:nowrap;',
            )}
          >
            {weekLbl}
          </span>
          <button
            type="button"
            title={L(74)}
            aria-label={L(74)}
            onClick={() => setW(w + 1)}
            style={css(
              'width:32px;height:32px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fbf8f5;cursor:pointer;padding:0;',
            )}
          >
            ›
          </button>
        </div>
        {!isPerson &&
          seg(
            RG,
            [
              ['w', 'Semana'],
              ['4w', '4 semanas'],
            ],
            setRG,
          )}
        {seg(
          VM,
          [
            ['person', 'Por Pessoa'],
            ['project', 'Por Projeto'],
            ['client', 'Por Cliente'],
            ['role', 'Por Função'],
            ['team', 'Por Equipa'],
          ],
          setVM,
        )}
      </div>
      {body}
    </Glass>
  );
}

function PersonSheet({
  mg,
  sel,
  team,
  wIso,
  days,
  weekLbl,
  entry,
  planned,
  sum,
}: {
  mg: Mg;
  sel: Mg['P'][number] | undefined;
  team: Mg['P'];
  wIso: string;
  days: string[];
  weekLbl: string;
  entry: (pid: string) => MgTs | undefined;
  planned: (pid: string) => Mg['D']['allocs'];
  sum: (e?: MgTs) => number;
}) {
  const { tr, lang } = mg;
  const L = (i: number) => mgL(i, lang);
  const list = (
    <div
      style={css(
        'flex:1;min-height:0;overflow:auto;padding:10px 8px 12px;display:flex;flex-direction:column;gap:2px;',
      )}
    >
      {team.map((p) => {
        const e = entry(p.id);
        const st = e ? e.status : 'Em falta';
        const on = sel && p.id === sel.id;
        return (
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            aria-current={on || undefined}
            className="mg-h8"
            onClick={() => mg.nav('mg_time', { p: p.id })}
            onKeyDown={(ev) => ev.key === 'Enter' && mg.nav('mg_time', { p: p.id })}
            style={css(
              `flex-shrink:0;display:flex;align-items:center;gap:10px;min-height:46px;padding:0 10px;border-radius:14px;cursor:pointer;background:${on ? 'rgba(255,255,255,.14)' : 'transparent'};border:1px solid ${on ? 'rgba(255,255,255,.2)' : 'transparent'};`,
            )}
          >
            <Av p={p} size={30} fs={11} tc={mg.tOf(p).tc} />
            <span
              style={css(
                'flex:1;min-width:0;font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
              )}
            >
              {p.name}
            </span>
            <span style={css("font-family:'Geist Mono',monospace;font-size:12px;")}>{sum(e)}h</span>
            <span
              title={tr(st)}
              aria-label={tr(st)}
              style={css(`width:8px;height:8px;flex:none;border-radius:50%;background:${stC(st)};`)}
            />
          </div>
        );
      })}
    </div>
  );
  if (!sel)
    return (
      <Split page="mg_time" list={list} bare>
        {null}
      </Split>
    );
  const e = entry(sel.id) ?? { status: 'Em falta', rows: {} as MgTs['rows'] };
  const pl = planned(sel.id);
  const locked = e.status === 'Submetido';
  const ids = [...new Set([...pl.map((a) => a.project), ...Object.keys(e.rows)])].filter(
    (id) => mg.pjById[id],
  );
  const setCell = (pr: string, i: number) => (v: string) =>
    mg.upd((d) => {
      const en = entryOf(d, sel.id, wIso);
      const r = (en.rows[pr] ??= [0, 0, 0, 0, 0]);
      r[i] = v === '' ? 0 : Math.min(24, Math.max(0, +v));
    });
  const dayT = [0, 1, 2, 3, 4].map((i) => ids.reduce((s, pr) => s + (+(e.rows[pr]?.[i] ?? 0) || 0), 0));
  const tot = dayT.reduce((a, b) => a + b, 0);
  const cap = +sel.cap || 40;
  const addOpts = mg.PJ.filter((p) => !ids.includes(p.id));
  const st = e.status;
  return (
    <Split page="mg_time" list={list} bare>
      <div style={css('display:flex;flex-direction:column;gap:16px;padding:24px 26px 30px;')}>
        <div style={css('display:flex;flex-wrap:wrap;align-items:center;gap:12px;')}>
          <div style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;')}>
            <span style={css('font-size:24px;font-weight:600;letter-spacing:-.02em;')}>{sel.name}</span>
            <span style={css('font-size:13px;color:rgba(255,248,240,.7);')}>
              {weekLbl} ·{' '}
              <span
                style={css(
                  `color:${st === 'Submetido' ? 'oklch(0.86 0.13 150)' : st === 'Rascunho' ? 'oklch(0.86 0.12 85)' : 'oklch(0.8 0.14 30)'};`,
                )}
              >
                {tr(st)}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              mg.upd((d) => {
                const en = entryOf(d, sel.id, wIso);
                en.status = en.status === 'Submetido' ? 'Rascunho' : 'Submetido';
              })
            }
            style={css(
              'height:36px;padding:0 16px;border-radius:999px;border:0;background:#fbf8f5;color:#2a211c;font:inherit;font-size:13px;font-weight:600;cursor:pointer;',
            )}
          >
            {locked ? L(42) : tr('Submeter Semana')}
          </button>
        </div>
        <div
          style={css(
            'border-radius:20px;border:1px solid rgba(255,255,255,.12);background:rgba(18,12,9,.16);overflow:auto;',
          )}
        >
          <div role="table" aria-label={`${L(48)} · ${sel.name}`} style={css('min-width:640px;')}>
            <div
              role="row"
              style={css(
                `display:grid;grid-template-columns:${TSGRID};align-items:center;height:42px;background:linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,.1));border-bottom:1px solid rgba(255,255,255,.16);font-size:12px;font-weight:600;color:rgba(255,248,240,.85);`,
              )}
            >
              <span role="columnheader" style={css('padding:0 14px;')}>
                {L(49)}
              </span>
              {days.map((d) => (
                <span key={d} role="columnheader" style={css('text-align:center;')}>
                  {d}
                </span>
              ))}
              <span role="columnheader" style={css('text-align:center;')}>
                {L(50)}
              </span>
            </div>
            {ids.map((pr) => {
              const pj = mg.pjById[pr]!;
              const r = e.rows[pr] ?? [0, 0, 0, 0, 0];
              const a = pl.find((x) => x.project === pr);
              return (
                <div
                  key={pr}
                  role="row"
                  style={css(
                    `display:grid;grid-template-columns:${TSGRID};align-items:center;min-height:46px;border-bottom:1px solid rgba(255,255,255,.07);`,
                  )}
                >
                  <span
                    role="rowheader"
                    style={css('display:flex;align-items:center;gap:8px;padding:0 14px;min-width:0;')}
                  >
                    <span
                      style={css(
                        `width:4px;height:22px;flex:none;border-radius:999px;background:${pj.color};`,
                      )}
                    />
                    <span style={css('min-width:0;display:flex;flex-direction:column;')}>
                      <span
                        style={css("font-family:'Geist Mono',monospace;font-size:12.5px;font-weight:600;")}
                      >
                        {pj.code}
                      </span>
                      <span
                        style={css(
                          'font-size:11.5px;color:rgba(255,248,240,.62);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                        )}
                      >
                        {pj.name} {L(51)} {a ? a.hours : 0}h
                      </span>
                    </span>
                  </span>
                  {r.map((v, i) => (
                    <span key={i} role="cell" style={{ display: 'contents' }}>
                      <input
                        type="number"
                        min={0}
                        max={24}
                        step={0.5}
                        className="mg-in"
                        aria-label={`${pj.code} · ${days[i]}`}
                        value={v || ''}
                        disabled={locked}
                        onChange={(ev) => setCell(pr, i)(ev.target.value)}
                        style={css(
                          "justify-self:center;width:58px;height:32px;padding:0 6px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:rgba(18,12,9,.2);color:#fbf8f5;font-family:'Geist Mono',monospace;font-size:13px;text-align:center;outline:none;box-sizing:border-box;",
                        )}
                      />
                    </span>
                  ))}
                  <span
                    role="cell"
                    style={css(
                      "text-align:center;font-family:'Geist Mono',monospace;font-size:13px;font-weight:600;",
                    )}
                  >
                    {r.reduce((x, y) => x + (+y || 0), 0)}h
                  </span>
                </div>
              );
            })}
            <div
              role="row"
              style={css(
                `display:grid;grid-template-columns:${TSGRID};align-items:center;height:42px;background:rgba(255,255,255,.06);font-family:'Geist Mono',monospace;font-size:12.5px;font-weight:600;`,
              )}
            >
              <span style={css('padding:0 14px;font-family:inherit;')}>
                {L(52)} {cap}h
              </span>
              {dayT.map((v, i) => (
                <span
                  key={i}
                  style={css(`text-align:center;color:${v > 8 ? 'oklch(0.84 0.13 30)' : '#fbf8f5'};`)}
                >
                  {v}h
                </span>
              ))}
              <span
                style={css(
                  `text-align:center;color:${tot > cap ? 'oklch(0.84 0.13 30)' : tot >= cap * 0.9 ? 'oklch(0.86 0.13 150)' : '#fbf8f5'};`,
                )}
              >
                {tot}h
              </span>
            </div>
          </div>
        </div>
        {!locked && (
          <select
            value=""
            aria-label={L(53)}
            onChange={(ev) => {
              const pr = ev.target.value;
              if (pr) mg.upd((d) => void (entryOf(d, sel.id, wIso).rows[pr] ??= [0, 0, 0, 0, 0]));
            }}
            style={{
              ...css(
                'align-self:flex-start;height:32px;padding:0 28px 0 12px;border-radius:999px;border:1.5px dashed rgba(255,255,255,.28);background-color:transparent;color:rgba(255,248,240,.85);font:inherit;font-size:12.5px;cursor:pointer;appearance:none;-webkit-appearance:none;color-scheme:dark;',
              ),
              backgroundImage: CHEV,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 10px center',
              backgroundSize: '10px',
            }}
          >
            <option value="" style={OPT}>
              {L(53)}
            </option>
            {addOpts.map((p) => (
              <option key={p.id} value={p.id} style={OPT}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </Split>
  );
}
