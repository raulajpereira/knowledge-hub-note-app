'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { isAvailable, mgIso, mgMonday, wLbl, wLblY, type MgAlloc as Alloc } from '@/lib/mg';
import { mgL } from '@/lib/mgText';
import { usePersistentState } from '@/components/ui';
import { css } from './css';
import { Av, Glass, Sel } from './ui';
import type { Mg } from './store';

const W0 = -4;
const N = 20;
const GRID = '260px repeat(20,minmax(54px,1fr)) 104px';
const STICKY =
  'background:linear-gradient(90deg,rgba(255,255,255,.09),rgba(255,255,255,.05));backdrop-filter:blur(28px) saturate(150%);border-right:1px solid rgba(255,255,255,.1);';
const CELL = [
  ['rgba(255,255,255,.05)', 'rgba(255,248,240,.35)', 'none'],
  ['oklch(0.85 0.14 85)', '#2a1f0e', 'inset 0 1px 0 rgba(255,255,255,.4),0 2px 8px rgba(0,0,0,.15)'],
  ['oklch(0.8 0.15 152)', '#0f2418', 'inset 0 1px 0 rgba(255,255,255,.4),0 2px 8px rgba(0,0,0,.15)'],
  ['oklch(0.7 0.18 27)', '#fff', 'inset 0 1px 0 rgba(255,255,255,.3),0 2px 8px rgba(0,0,0,.18)'],
] as const;
const AVG_BG = [
  'rgba(255,255,255,.06)',
  'oklch(0.86 0.12 85 / .14)',
  'oklch(0.86 0.12 150 / .16)',
  'oklch(0.82 0.14 30 / .18)',
];
const SEL_PILL =
  'height:36px;padding:0 30px 0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background-color:rgba(255,255,255,.06);color:#fbf8f5;font:inherit;font-size:13px;outline:none;';

type Modal = {
  id: string | null;
  person: string;
  project: string;
  start: string;
  hpd: number | string;
  days: number | string;
  mask: number[];
  /** role in the project (free text, suggested from the person's skills) */
  fn: string;
};
type Pop = { pid: string; w: number; di: number | null; x: number; y: number };
type Drag = { id: string; edge: 'from' | 'to'; dw: number };

const pd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, m! - 1, d);
};

// Alocações (prototype isAlloc): timeline with draggable edges, weekly grid,
// days grid with per-cell overrides, and the allocation side panel.
export function MgAlloc({ mg }: { mg: Mg }) {
  const { D, tr, lang, wk, wi, dIso, P } = mg;
  const L = (i: number) => mgL(i, lang);
  const en = lang === 'en';
  const [q, setQ] = useState('');
  const [alTeam, setAlTeam] = useState('');
  const [alProj, setAlProj] = useState('all');
  const [mode, setMode] = usePersistentState<'timeline' | 'heat' | 'day'>('mg.alMode', 'timeline');
  const [pw, setPw] = usePersistentState('mg.alPW', 380);
  const [pwLive, setPwLive] = useState<number | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [pop, setPop] = useState<Pop | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [moved, setMoved] = useState(false);
  const want = useSearchParams().get('mode');
  useEffect(() => {
    if (want === 'heat' || want === 'day' || want === 'timeline') setMode(want);
  }, [want, setMode]);
  const qq = q.trim().toLowerCase();
  const rows = P.filter(
    (p) =>
      (!qq || `${p.name} ${p.role}`.toLowerCase().includes(qq)) &&
      (!alTeam || p.team === alTeam) &&
      (alProj === 'all' || D.allocs.some((a) => a.person === p.id && a.project === alProj)),
  );
  const loc = en ? 'en-GB' : 'pt-PT';

  const openM = (m: Partial<Alloc> & { person: string; project: string }) => {
    const st = m.start || m.from || wk(0);
    const hpd = m.hpd ?? Math.round(((+(m.hours ?? 0) || 40) / 5) * 2) / 2;
    const days = m.days ?? Math.max(1, (wi(m.to || st) - wi(m.from || st) + 1) * 5);
    setModal({
      id: m.id ?? null,
      person: m.person,
      project: m.project,
      start: st,
      hpd,
      days,
      mask: m.mask ?? [1, 1, 1, 1, 1],
      fn: m.fn ?? '',
    });
  };
  const dragEdge = (a: Alloc, edge: 'from' | 'to') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const track = (e.currentTarget as HTMLElement).closest('[data-al-track]');
    if (!track) return;
    const wpx = track.getBoundingClientRect().width / N;
    const x0 = e.clientX;
    let dw = 0;
    setMoved(false);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    const mv = (ev: PointerEvent) => {
      const n = Math.round((ev.clientX - x0) / wpx);
      if (n !== dw) {
        dw = n;
        if (n) setMoved(true);
        setDrag({ id: a.id, edge, dw: n });
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setDrag(null);
      if (dw)
        mg.upd((d) => {
          const x = d.allocs.find((y) => y.id === a.id);
          if (!x) return;
          if (edge === 'from') {
            const nf = wi(x.from) + dw;
            if (nf <= wi(x.to)) x.from = wk(nf);
          } else {
            const nt = wi(x.to) + dw;
            if (nt >= wi(x.from)) x.to = wk(nt);
          }
        });
      setTimeout(() => setMoved(false), 50);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  const isDay = mode === 'day';
  const weeks = Array.from({ length: N }, (_, i) => {
    if (isDay) {
      const w = Math.floor(i / 5);
      const di = i % 5;
      const iso = dIso(w, di);
      const td = w === 0 && di === (new Date().getDay() + 6) % 7;
      const wd = new Date(`${iso}T00:00:00`)
        .toLocaleDateString(loc, { weekday: 'short' })
        .replace('.', '')
        .slice(0, 3);
      return {
        k: iso,
        lbl: `${wd} ${iso.slice(8, 10)}`,
        mon: di === 0 ? wLbl(wk(w)) : '',
        bl: di === 0 && i ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.05)',
        on: td,
      };
    }
    const w = W0 + i;
    const iso = wk(w);
    const newM = i === 0 || +iso.slice(8, 10) <= 7;
    return {
      k: iso,
      lbl: wLbl(iso),
      mon: newM
        ? new Date(`${iso}T00:00:00`).toLocaleDateString(loc, { month: 'short' }).replace('.', '')
        : '',
      bl: newM && i ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.05)',
      on: w === 0,
    };
  });

  const pwNow = pwLive ?? pw;
  const pDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = (e.currentTarget as HTMLElement).parentElement!;
    const x0 = e.clientX;
    const w0 = el.offsetWidth;
    let w = w0;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const mv = (ev: PointerEvent) => {
      w = Math.round(Math.max(300, Math.min(760, w0 - (ev.clientX - x0))));
      setPwLive(w);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setPwLive(null);
      setPw(w);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  return (
    <div style={css('flex:1;min-height:0;min-width:0;display:flex;gap:14px;')}>
      <Glass s="min-width:0;" label={L(23)}>
        <div
          style={css(
            'flex-shrink:0;display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px;padding:22px 24px 14px;',
          )}
        >
          <div style={css('display:flex;flex-direction:column;gap:4px;margin-right:auto;')}>
            <h1 style={css('margin:0;font-size:28px;font-weight:600;letter-spacing:-.02em;')}>{L(23)}</h1>
            <span style={css('font-size:13.5px;color:rgba(255,248,240,.72);')}>{L(35)}</span>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={L(66)}
            aria-label={L(66)}
            style={css(
              'width:180px;height:36px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(18,12,9,.22);color:#fbf8f5;font:inherit;font-size:13px;outline:none;',
            )}
          />
          <Sel
            value={alProj}
            onChange={setAlProj}
            opts={[{ v: 'all', l: tr('Todos os Projetos') }, ...mg.projOpt]}
            s={SEL_PILL}
            label={tr('Projeto')}
            pos="right 11px center"
          />
          <Sel
            value={alTeam}
            onChange={setAlTeam}
            opts={mg.teamOpts.map((o) => ({ ...o, l: o.v ? o.l : tr(o.l) }))}
            s={SEL_PILL}
            label={tr('Equipa')}
            pos="right 11px center"
          />
          <div
            role="tablist"
            style={css(
              'display:flex;gap:2px;padding:3px;border-radius:999px;background:rgba(18,12,9,.22);border:1px solid rgba(255,255,255,.12);',
            )}
          >
            {(
              [
                ['timeline', 'Timeline'],
                ['heat', 'Grelha Semanal'],
                ['day', 'Dias'],
              ] as const
            ).map(([m, l]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                style={css(
                  `height:28px;padding:0 12px;border-radius:999px;border:0;font:inherit;font-size:12px;font-weight:600;cursor:pointer;background:${mode === m ? '#fbf8f5' : 'transparent'};color:${mode === m ? '#2a211c' : 'rgba(255,248,240,.8)'};`,
                )}
              >
                {tr(l)}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!P.length || !mg.PJ.length}
            onClick={() =>
              openM({
                // the first person who can be allocated (Inativo / Suspenso are not offered)
                person: (rows.find(isAvailable) ?? P.find(isAvailable) ?? rows[0] ?? P[0]!).id,
                project: alProj !== 'all' ? alProj : mg.PJ[0]!.id,
                from: wk(0),
                to: wk(8),
                hours: 16,
              })
            }
            style={css(
              'white-space:nowrap;height:36px;padding:0 16px;border-radius:999px;border:0;background:#fbf8f5;color:#2a211c;font:inherit;font-size:13px;font-weight:600;cursor:pointer;',
            )}
          >
            {L(36)}
          </button>
        </div>
        <div
          style={css(
            'flex:1;min-height:0;overflow:auto;margin:0 12px 12px;border-radius:22px;background:rgba(18,12,9,.16);border:1px solid rgba(255,255,255,.1);',
          )}
        >
          <div style={css('min-width:1400px;')}>
            <div
              style={css(
                `position:sticky;top:0;z-index:4;display:grid;grid-template-columns:${GRID};height:58px;background:linear-gradient(180deg,rgba(255,255,255,.18),rgba(255,255,255,.1));backdrop-filter:blur(30px) saturate(160%);border-bottom:1px solid rgba(255,255,255,.14);`,
              )}
            >
              <span
                style={css(
                  `position:sticky;left:0;z-index:2;display:flex;align-items:center;padding:0 20px;font-size:12.5px;font-weight:600;color:rgba(255,248,240,.85);${STICKY}`,
                )}
              >
                {L(26)}
              </span>
              {weeks.map((w) => (
                <span
                  key={w.k}
                  style={css(
                    `display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border-left:1px solid ${w.bl};`,
                  )}
                >
                  <span
                    style={css(
                      'height:13px;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,248,240,.55);',
                    )}
                  >
                    {w.mon}
                  </span>
                  <span
                    style={css(
                      `height:22px;min-width:46px;padding:0 8px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-family:'Geist Mono',monospace;font-size:11.5px;font-weight:${w.on ? 700 : 500};color:${w.on ? '#2a211c' : 'rgba(255,248,240,.78)'};background:${w.on ? '#fbf8f5' : 'transparent'};`,
                    )}
                  >
                    {w.lbl}
                  </span>
                </span>
              ))}
              <span
                style={css(
                  'display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:rgba(255,248,240,.85);border-left:1px solid rgba(255,255,255,.1);',
                )}
              >
                {L(37)}
              </span>
            </div>
            {rows.map((p, ri) => {
              const my = D.allocs
                .filter(
                  (a) =>
                    a.person === p.id &&
                    wi(a.to) >= W0 &&
                    wi(a.from) < W0 + N &&
                    (alProj === 'all' || a.project === alProj),
                )
                .sort((a, b) => a.from.localeCompare(b.from));
              const lanes: number[] = [];
              const bars = my.map((a) => {
                let f0 = wi(a.from);
                let t0 = wi(a.to);
                if (drag && drag.id === a.id) {
                  if (drag.edge === 'from') f0 = Math.min(t0, f0 + drag.dw);
                  else t0 = Math.max(f0, t0 + drag.dw);
                }
                const f = Math.max(W0, f0);
                const t = Math.min(W0 + N - 1, t0);
                let ln = lanes.findIndex((e) => e < f);
                if (ln < 0) {
                  lanes.push(t);
                  ln = lanes.length - 1;
                } else lanes[ln] = t;
                return { a, f, t, ln, pj: mg.pjById[a.project] };
              });
              let sum = 0;
              for (let w = 0; w < 8; w++) sum += mg.loadW(p.id, w);
              const avg = Math.round(sum / 8);
              const tm = mg.tOf(p);
              const h = mode === 'timeline' ? Math.max(60, 24 + Math.max(1, lanes.length) * 36 - 8) : 58;
              return (
                <div
                  key={p.id}
                  className="mg-alrow"
                  style={css(
                    `display:grid;grid-template-columns:${GRID};min-height:${h}px;border-bottom:1px solid rgba(255,255,255,.06);background:${ri % 2 ? 'rgba(255,255,255,.018)' : 'transparent'};`,
                  )}
                >
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={() => mg.nav('mg_people', { p: p.id })}
                    onKeyDown={(e) => e.key === 'Enter' && mg.nav('mg_people', { p: p.id })}
                    className="mg-alname"
                    style={css(
                      `position:sticky;left:0;z-index:3;display:flex;align-items:center;gap:12px;padding:0 20px;min-width:0;cursor:pointer;${STICKY}`,
                    )}
                  >
                    <Av p={p} size={34} fs={12} tc={tm.tc} s="box-shadow:0 0 0 2px rgba(255,255,255,.12);" />
                    <span style={css('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;')}>
                      <span
                        style={css(
                          'font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                        )}
                      >
                        {p.name}
                      </span>
                      <span
                        style={css(
                          'font-size:12px;color:rgba(255,248,240,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                        )}
                      >
                        {tr(p.role)}
                        {tm.tn && (
                          <>
                            {' · '}
                            <span style={css(`color:${tm.tc};font-weight:600;`)}>{tm.tn}</span>
                          </>
                        )}
                      </span>
                    </span>
                  </span>
                  {mode === 'timeline' ? (
                    <div
                      data-al-track="1"
                      style={css(
                        'grid-column:2 / span 20;position:relative;min-width:0;background-image:linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:5% 100%;',
                      )}
                    >
                      <div
                        style={css(
                          `position:absolute;top:0;bottom:0;left:${((0 - W0) / N) * 100}%;width:${100 / N}%;background:rgba(255,255,255,.06);box-shadow:inset 1px 0 0 rgba(255,255,255,.18),inset -1px 0 0 rgba(255,255,255,.18);`,
                        )}
                      />
                      {bars.map(({ a, f, t, ln, pj }) => (
                        <button
                          key={a.id}
                          type="button"
                          className="mg-albar"
                          title={`${pj?.code} ${pj?.name}${a.fn ? ` · ${a.fn}` : ''} · ${tr(`${a.hours}h/sem`)} · ${wLblY(a.from)} → ${wLblY(a.to)}`}
                          onClick={() => !moved && openM({ ...a })}
                          style={css(
                            `position:absolute;top:${12 + ln * 36}px;height:28px;left:calc(${((f - W0) / N) * 100}% + 4px);width:calc(${((t - f + 1) / N) * 100}% - 8px);border-radius:9px;border:0;background:${pj?.color ?? 'rgba(255,255,255,.3)'};box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 2px 8px rgba(0,0,0,.18);color:#1f1a16;font:inherit;padding:0 10px;display:flex;align-items:center;gap:8px;white-space:nowrap;overflow:hidden;cursor:pointer;box-sizing:border-box;`,
                          )}
                        >
                          <span
                            onPointerDown={dragEdge(a, 'from')}
                            title="⇠"
                            style={css(
                              'position:absolute;left:0;top:0;bottom:0;width:8px;cursor:ew-resize;border-radius:9px 0 0 9px;background:rgba(0,0,0,.12);touch-action:none;',
                            )}
                          />
                          <span
                            onPointerDown={dragEdge(a, 'to')}
                            title="⇢"
                            style={css(
                              'position:absolute;right:0;top:0;bottom:0;width:8px;cursor:ew-resize;border-radius:0 9px 9px 0;background:rgba(0,0,0,.12);touch-action:none;',
                            )}
                          />
                          <span
                            style={css(
                              "font-family:'Geist Mono',monospace;font-size:11.5px;font-weight:700;",
                            )}
                          >
                            {pj?.code}
                          </span>
                          {a.fn && (
                            <span
                              style={css(
                                'min-width:0;font-size:11px;font-weight:600;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                              )}
                            >
                              {a.fn}
                            </span>
                          )}
                          <span
                            style={css(
                              "font-family:'Geist Mono',monospace;font-size:11px;font-weight:600;opacity:.7;",
                            )}
                          >
                            {a.hours}h
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    Array.from({ length: N }, (_, i) => {
                      const w = isDay ? Math.floor(i / 5) : W0 + i;
                      const di = i % 5;
                      const hh = isDay
                        ? Math.round(
                            D.allocs.reduce((s, a) => (a.person === p.id ? s + mg.aDay(a, w, di) : s), 0) *
                              10,
                          ) / 10
                        : mg.loadW(p.id, w);
                      const capX = isDay ? (+p.cap || 40) / 5 : p.cap;
                      const V = CELL[mg.band(hh, capX)];
                      const d = isDay ? (di === 0 ? 1 : 9) : +wk(w).slice(8, 10);
                      const tip = `${p.name} · ${isDay ? dIso(w, di) : wLblY(wk(w))} · ${hh}h`;
                      return (
                        <span
                          key={i}
                          style={css(
                            `display:flex;align-items:center;justify-content:center;padding:9px 5px;border-left:1px solid ${d <= 7 && i ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.04)'};`,
                          )}
                        >
                          <button
                            type="button"
                            title={tip}
                            aria-label={tip}
                            onClick={(e) => {
                              const r = e.currentTarget.getBoundingClientRect();
                              setPop({
                                pid: p.id,
                                w,
                                di: isDay ? di : null,
                                x: r.left + r.width / 2,
                                y: r.bottom + 6,
                              });
                            }}
                            style={css(
                              `cursor:pointer;width:100%;height:38px;border:0;padding:0;border-radius:10px;display:flex;align-items:center;justify-content:center;background:${V[0]};box-shadow:${V[2]};font-family:'Geist Mono',monospace;font-size:12.5px;font-weight:600;color:${V[1]};`,
                            )}
                          >
                            {hh ? String(hh).replace('.', en ? '.' : ',') : ''}
                          </button>
                        </span>
                      );
                    })
                  )}
                  <span
                    style={css(
                      'display:flex;align-items:center;justify-content:center;border-left:1px solid rgba(255,255,255,.08);',
                    )}
                  >
                    <span
                      style={css(
                        `height:26px;min-width:56px;padding:0 10px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-family:'Geist Mono',monospace;font-size:12.5px;font-weight:700;color:${mg.lc(avg, p.cap)};background:${AVG_BG[mg.band(avg, p.cap)]};`,
                      )}
                    >
                      {avg}h
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Glass>
      {modal && (
        <AllocPanel
          mg={mg}
          m={modal}
          setM={setModal}
          width={pwNow}
          drag={pwLive !== null}
          pDown={pDown}
          pReset={() => setPw(380)}
        />
      )}
      {pop && mg.pById[pop.pid] && <CellPop mg={mg} c={pop} onClose={() => setPop(null)} />}
    </div>
  );
}

function CellPop({ mg, c, onClose }: { mg: Mg; c: Pop; onClose: () => void }) {
  const { D, lang, tr, wk, dIso } = mg;
  const en = lang === 'en';
  const p = mg.pById[c.pid]!;
  const isD = c.di != null;
  const cov = D.allocs.filter((a) => a.person === p.id && mg.inW(a, c.w));
  const key = isD ? dIso(c.w, c.di!) : wk(c.w);
  const fld = isD ? 'dov' : 'ovr';
  return createPortal(
    <>
      <div onClick={onClose} style={css('position:fixed;inset:0;z-index:56;')} />
      <div
        role="dialog"
        aria-label={p.name}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        style={css(
          `position:fixed;left:${Math.min(window.innerWidth - 300, Math.max(10, c.x - 140))}px;top:${Math.min(window.innerHeight - 280, c.y)}px;z-index:57;width:280px;display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.22),rgba(255,255,255,.12)),rgba(34,27,23,.4);backdrop-filter:blur(36px) saturate(170%);border:1px solid rgba(255,255,255,.26);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 18px 50px rgba(0,0,0,.35);color:#fbf8f5;line-height:normal;`,
        )}
      >
        <div style={css('display:flex;flex-direction:column;gap:2px;')}>
          <span style={css('font-size:14px;font-weight:600;')}>{p.name}</span>
          <span style={css('font-size:12px;color:rgba(255,248,240,.8);')}>
            {isD ? key.split('-').reverse().join('/') : `${en ? 'Week of ' : 'Semana de '}${wLblY(key)}`}
          </span>
        </div>
        {cov.map((a) => {
          const pj = mg.pjById[a.project];
          const ov = a[fld]?.[key];
          const changed = ov != null && ov !== '';
          return (
            <div key={a.id} style={css('display:flex;align-items:center;gap:8px;')}>
              <span style={css(`width:8px;height:8px;border-radius:50%;background:${pj?.color};`)} />
              <span
                style={css("flex:1;font-family:'Geist Mono',monospace;font-size:12.5px;font-weight:600;")}
              >
                {pj?.code}
              </span>
              <input
                type="number"
                min={0}
                step={0.5}
                aria-label={`${pj?.code} · ${tr(isD ? 'h/dia' : 'h/sem')}`}
                value={String(isD ? mg.aDay(a, c.w, c.di!) : mg.aWeek(a, c.w))}
                onChange={(e) => {
                  const v = e.target.value;
                  mg.upd((d) => {
                    const x = d.allocs.find((y) => y.id === a.id)!;
                    x[fld] = {
                      ...(x[fld] ?? {}),
                      [key]: v === '' ? '' : Math.min(isD ? 24 : 168, Math.max(0, +v)),
                    };
                  });
                }}
                style={css(
                  "width:70px;height:32px;padding:0 8px;border-radius:9px;border:1px solid rgba(255,255,255,.2);background:rgba(20,15,12,.3);color:#fbf8f5;font-family:'Geist Mono',monospace;font-size:13px;text-align:right;outline:none;",
                )}
              />
              <span style={css('font-size:11px;color:rgba(255,248,240,.7);width:34px;')}>
                {tr(isD ? 'h/dia' : 'h/sem')}
              </span>
              {changed && (
                <button
                  type="button"
                  title={en ? 'Reset' : 'Repor'}
                  aria-label={en ? 'Reset' : 'Repor'}
                  onClick={() =>
                    mg.upd((d) => {
                      const x = d.allocs.find((y) => y.id === a.id)!;
                      if (x[fld]) delete x[fld]![key];
                    })
                  }
                  style={css(
                    'width:24px;height:24px;border-radius:50%;border:0;background:rgba(255,255,255,.1);color:#fbf8f5;cursor:pointer;padding:0;font-size:12px;',
                  )}
                >
                  ↺
                </button>
              )}
            </div>
          );
        })}
        {!cov.length && (
          <span style={css('font-size:12.5px;color:rgba(255,248,240,.75);')}>
            {en ? 'No allocation in this period.' : 'Sem alocações neste período.'}
          </span>
        )}
      </div>
    </>,
    document.body,
  );
}

const LBL = 'font-size:12px;color:rgba(255,248,240,.78);';
const INP =
  'height:40px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(18,12,9,.22);color:#fbf8f5;font:inherit;font-size:13.5px;outline:none;color-scheme:dark;width:100%;box-sizing:border-box;';
const SEL =
  'height:40px;padding:0 34px 0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background-color:rgba(18,12,9,.22);color:#fbf8f5;font:inherit;font-size:13.5px;outline:none;width:100%;box-sizing:border-box;';
const STEP =
  'width:40px;height:40px;flex:none;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fbf8f5;cursor:pointer;font-size:16px;padding:0;';

function AllocPanel({
  mg,
  m,
  setM,
  width,
  drag,
  pDown,
  pReset,
}: {
  mg: Mg;
  m: Modal;
  setM: (m: Modal | null) => void;
  width: number;
  drag: boolean;
  pDown: (e: React.PointerEvent) => void;
  pReset: () => void;
}) {
  const { D, lang, wk, wi, dIso } = mg;
  const en = lang === 'en';
  const set = (p: Partial<Modal>) => setM({ ...m, ...p });
  const mask = m.mask;
  const hpd = Math.max(0, +m.hpd || 0);
  const nd = Math.max(1, Math.min(400, Math.round(+m.days || 1)));
  const dates: string[] = [];
  if (mask.some(Boolean) && /^\d{4}-\d{2}-\d{2}$/.test(m.start)) {
    const c = pd(m.start);
    for (let guard = 0; dates.length < nd && guard < 2000; guard++) {
      const wd = (c.getDay() + 6) % 7;
      if (wd < 5 && mask[wd]) dates.push(mgIso(c));
      c.setDate(c.getDate() + 1);
    }
  }
  const last = dates.at(-1) ?? m.start;
  const perWeek = hpd * mask.filter(Boolean).length;
  const total = hpd * dates.length;
  const pr = mg.pById[m.person];
  const cap = +(pr?.cap ?? 40) || 40;
  const okStart = /^\d{4}-\d{2}-\d{2}$/.test(m.start);
  const wFrom = okStart ? wi(mgIso(mgMonday(pd(m.start)))) : 0;
  const wTo = okStart ? wi(mgIso(mgMonday(pd(last)))) : 0;
  const tooLong = (wTo - wFrom + 1) * 5 > 800;
  let peak = 0;
  if (!tooLong)
    for (let w = wFrom; w <= wTo; w++) {
      const other = D.allocs
        .filter((a) => a.person === m.person && a.id !== m.id)
        .reduce((s, a) => s + mg.aWeek(a, w), 0);
      peak = Math.max(peak, other + perWeek);
    }
  const WD = en ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] : ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
  const fmtD = (s: string) => (s ? s.split('-').reverse().join('/') : '—');
  const hf = (n: number) => `${(Math.round(n * 10) / 10).toString().replace('.', en ? '.' : ',')}h`;
  const sum: Array<[string, string, string]> = [
    [en ? 'Ends on' : 'Termina a', fmtD(last), '#fbf8f5'],
    ['Total', `${hf(total)} · ${dates.length}${en ? ' days' : ' dias'}`, '#fbf8f5'],
    [en ? 'Per week' : 'Por semana', hf(perWeek), '#fbf8f5'],
    [
      en ? 'Peak weekly load' : 'Carga semanal máxima',
      `${hf(peak)} / ${cap}h`,
      peak > cap ? 'oklch(0.84 0.14 30)' : peak >= cap * 0.9 ? 'oklch(0.86 0.13 150)' : 'oklch(0.86 0.12 85)',
    ],
  ];
  const save = () => {
    if (!dates.length || tooLong || !m.person || !m.project) return;
    const id = m.id ?? crypto.randomUUID();
    mg.upd((d) => {
      const dov: Record<string, number> = {};
      for (let w = wFrom; w <= wTo; w++)
        for (let i = 0; i < 5; i++) dov[dIso(w, i)] = dates.includes(dIso(w, i)) ? hpd : 0;
      const a: Alloc = {
        id,
        person: m.person,
        project: m.project,
        from: wk(wFrom),
        to: wk(wTo),
        hours: perWeek,
        dov,
        start: m.start,
        hpd,
        days: nd,
        mask,
        ...(m.fn.trim() ? { fn: m.fn.trim().slice(0, 120) } : {}),
      };
      const ix = d.allocs.findIndex((x) => x.id === id);
      if (ix >= 0) d.allocs[ix] = a;
      else d.allocs.push(a);
    });
    setM(null);
  };
  const title = m.id ? (en ? 'Edit Allocation' : 'Editar Alocação') : en ? 'New Allocation' : 'Nova Alocação';
  return (
    <aside
      aria-label={title}
      style={css(
        `position:relative;isolation:isolate;flex:none;width:min(${width}px, 55%);min-height:0;display:flex;flex-direction:column;border-radius:30px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,.05));border:1px solid rgba(255,255,255,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.2);color:#fbf8f5;`,
      )}
    >
      <div
        style={css(
          'position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;backdrop-filter:blur(34px) saturate(150%);',
        )}
      />
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={pDown}
        onDoubleClick={pReset}
        style={css(
          'position:absolute;top:0;bottom:0;left:0;width:12px;z-index:5;cursor:col-resize;display:flex;align-items:center;justify-content:center;touch-action:none;',
        )}
      >
        <div
          style={css(
            `width:4px;height:44px;border-radius:4px;background:${drag ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.22)'};`,
          )}
        />
      </div>
      <div style={css('flex-shrink:0;display:flex;align-items:center;gap:10px;padding:20px 20px 12px;')}>
        <span style={css('flex:1;font-size:18px;font-weight:600;letter-spacing:-.01em;')}>{title}</span>
        <button
          type="button"
          aria-label={en ? 'Close' : 'Fechar'}
          onClick={() => setM(null)}
          style={css(
            'width:32px;height:32px;flex:none;border-radius:50%;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fbf8f5;cursor:pointer;padding:0;',
          )}
        >
          ×
        </button>
      </div>
      <div
        style={css(
          'flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:14px;padding:4px 20px 20px;',
        )}
      >
        <label style={css('display:flex;flex-direction:column;gap:6px;')}>
          <span style={css(LBL)}>{en ? 'Resource' : 'Recurso'}</span>
          <Sel
            value={m.person}
            onChange={(v) => set({ person: v, fn: '' })}
            opts={mg.personOpt.filter(
              (o) => o.v === m.person || isAvailable(mg.pById[o.v] ?? { status: 'Ativo' }),
            )}
            s={SEL}
            label={en ? 'Resource' : 'Recurso'}
            pos="right 12px center"
          />
        </label>
        <label style={css('display:flex;flex-direction:column;gap:6px;')}>
          <span style={css(LBL)}>{en ? 'Project' : 'Projeto'}</span>
          <Sel
            value={m.project}
            onChange={(v) => set({ project: v })}
            opts={mg.projOpt}
            s={SEL}
            label={en ? 'Project' : 'Projeto'}
            pos="right 12px center"
          />
        </label>
        {pr && !isAvailable(pr) && (
          <div
            role="alert"
            style={css(
              'padding:10px 14px;border-radius:14px;background:oklch(0.7 0.14 50 / .16);border:1px solid oklch(0.78 0.14 55 / .4);font-size:12.5px;line-height:1.45;',
            )}
          >
            {en
              ? `${pr.name} is ${mg.tr(pr.status).toLowerCase()}${pr.statusNote ? ` — ${pr.statusNote}` : ''}.`
              : `${pr.name} está ${pr.status.toLowerCase()}${pr.statusNote ? ` — ${pr.statusNote}` : ''}.`}
          </div>
        )}
        <div style={css('display:flex;flex-direction:column;gap:6px;')}>
          <label htmlFor="mg-al-fn" style={css(LBL)}>
            {en ? 'Role in the project' : 'Função no projeto'}
          </label>
          <input
            id="mg-al-fn"
            value={m.fn}
            maxLength={120}
            placeholder={en ? 'E.g. FI lead, ABAP developer…' : 'Ex.: Líder FI, Programador ABAP…'}
            onChange={(e) => set({ fn: e.target.value })}
            style={css(INP)}
          />
          {pr && Object.keys(pr.skills).length > 0 && (
            <div
              role="group"
              aria-label={en ? "The person's skills" : 'Competências da pessoa'}
              style={css('display:flex;flex-wrap:wrap;gap:6px;')}
            >
              {Object.entries(pr.skills)
                .sort((a, b) => b[1] - a[1])
                .map(([k, lv]) => {
                  const name = mg.tr(mg.SKN[k] ?? k);
                  const on = m.fn.trim() === name;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ fn: name })}
                      style={css(
                        `height:28px;padding:0 10px;border-radius:999px;border:1px solid ${on ? '#fbf8f5' : 'rgba(255,255,255,.16)'};background:${on ? '#fbf8f5' : 'rgba(255,255,255,.06)'};color:${on ? '#2a211c' : '#fbf8f5'};font:inherit;font-size:12px;font-weight:600;cursor:pointer;`,
                      )}
                    >
                      {name}
                      <span style={css('margin-left:6px;opacity:.7;font-weight:500;')}>
                        {mg.LV[lv] ?? lv}
                      </span>
                    </button>
                  );
                })}
            </div>
          )}
        </div>
        <div style={css('display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:10px;')}>
          <label style={css('display:flex;flex-direction:column;gap:6px;min-width:0;')}>
            <span style={css(LBL)}>{en ? 'Start date' : 'Data de início'}</span>
            <input
              type="date"
              value={m.start}
              onChange={(e) => set({ start: e.target.value })}
              style={css(INP)}
            />
          </label>
          <label style={css('display:flex;flex-direction:column;gap:6px;min-width:0;')}>
            <span style={css(LBL)}>{en ? 'Hours per day' : 'Horas por dia'}</span>
            <input
              type="number"
              min={0.5}
              max={12}
              step={0.5}
              value={m.hpd}
              onChange={(e) =>
                set({ hpd: e.target.value === '' ? '' : Math.min(24, Math.max(0, +e.target.value)) })
              }
              style={css(`${INP}font-family:'Geist Mono',monospace;`)}
            />
          </label>
        </div>
        <div style={css('display:flex;flex-direction:column;gap:6px;')}>
          <span style={css(LBL)}>{en ? 'Number of working days' : 'Número de dias úteis'}</span>
          <span style={css('display:flex;align-items:center;gap:8px;')}>
            <button
              type="button"
              aria-label="−"
              onClick={() => set({ days: Math.max(1, nd - 1) })}
              style={css(STEP)}
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={400}
              aria-label={en ? 'Number of working days' : 'Número de dias úteis'}
              value={m.days}
              onChange={(e) => set({ days: e.target.value })}
              style={css(
                `${INP}text-align:center;font-family:'Geist Mono',monospace;font-size:15px;font-weight:600;`,
              )}
            />
            <button
              type="button"
              aria-label="+"
              onClick={() => set({ days: Math.min(400, nd + 1) })}
              style={css(STEP)}
            >
              +
            </button>
          </span>
        </div>
        <div style={css('display:flex;flex-direction:column;gap:6px;')}>
          <span style={css(LBL)}>{en ? 'Working days' : 'Dias da semana'}</span>
          <div style={css('display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;')}>
            {WD.map((l, i) => {
              const on = !!mask[i];
              return (
                <button
                  key={l}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const nm = mask.slice();
                    nm[i] = nm[i] ? 0 : 1;
                    set({ mask: nm });
                  }}
                  style={css(
                    `height:36px;border-radius:10px;border:1px solid ${on ? '#fbf8f5' : 'rgba(255,255,255,.16)'};background:${on ? '#fbf8f5' : 'rgba(255,255,255,.05)'};color:${on ? '#2a211c' : 'rgba(255,248,240,.7)'};font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;`,
                  )}
                >
                  {l}
                </button>
              );
            })}
          </div>
        </div>
        <div
          style={css(
            'display:flex;flex-direction:column;gap:8px;padding:14px 16px;border-radius:18px;background:rgba(18,12,9,.22);border:1px solid rgba(255,255,255,.12);',
          )}
        >
          {sum.map(([l, v, c]) => (
            <span key={l} style={css('display:flex;align-items:baseline;gap:10px;font-size:13px;')}>
              <span style={css('flex:1;color:rgba(255,248,240,.75);')}>{l}</span>
              <span
                style={css(
                  `font-family:'Geist Mono',monospace;font-weight:600;white-space:nowrap;color:${c};`,
                )}
              >
                {v}
              </span>
            </span>
          ))}
        </div>
        {(peak > cap || tooLong) && (
          <div
            role="alert"
            style={css(
              'padding:10px 14px;border-radius:14px;background:oklch(0.7 0.14 50 / .16);border:1px solid oklch(0.78 0.14 55 / .4);font-size:12.5px;line-height:1.45;',
            )}
          >
            {tooLong
              ? en
                ? 'The period is too long (at most 160 weeks).'
                : 'O período é demasiado longo (máximo 160 semanas).'
              : `${en ? `This allocation puts ${pr?.name ?? ''} above capacity (` : `Esta alocação deixa ${pr?.name ?? ''} acima da capacidade (`}${hf(peak)} / ${cap}h).`}
          </div>
        )}
      </div>
      <div
        style={css(
          'flex-shrink:0;display:flex;align-items:center;gap:8px;padding:14px 20px 20px;border-top:1px solid rgba(255,255,255,.1);',
        )}
      >
        {m.id && (
          <button
            type="button"
            onClick={() => {
              mg.upd((d) => void (d.allocs = d.allocs.filter((a) => a.id !== m.id)));
              setM(null);
            }}
            style={css(
              'height:40px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,170,150,.4);background:transparent;color:#ffc9b8;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;',
            )}
          >
            {en ? 'Remove' : 'Remover'}
          </button>
        )}
        <span style={css('flex:1;')} />
        <button
          type="button"
          onClick={() => setM(null)}
          style={css(
            'height:40px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:transparent;color:#fbf8f5;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap;',
          )}
        >
          {en ? 'Cancel' : 'Cancelar'}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!dates.length || tooLong}
          style={css(
            'height:40px;padding:0 18px;border-radius:999px;border:0;background:#fbf8f5;color:#2a211c;font:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;',
          )}
        >
          {en ? 'Save' : 'Guardar'}
        </button>
      </div>
    </aside>
  );
}
