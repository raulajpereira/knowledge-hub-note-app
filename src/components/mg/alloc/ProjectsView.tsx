'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  bookingSeries,
  conflictOf,
  dnOf,
  equivalents,
  fmtNum,
  holidayOf,
  isoOf,
  monthStart,
  sumDays,
  todayIso,
  wdOf,
  type Booking,
  type Dn,
} from '@/lib/alloc';
import { MG_PST, isAvailable, mgEur, mgK, mgModSkill, type MgPerson, type MgProject } from '@/lib/mg';
import { Av } from '../ui';
import type { Mg } from '../store';
import type { Filters } from './AllocPage';
import type { GUnit } from './Grid';
import { Floating } from './Popovers';
import { PPD, columns, dayMon, type TZoom } from './shared';
import type { Nav } from './Timeline';

const HEAD = 54;
const NAMEW = 250;
type PRow =
  | { k: 'pj'; key: string; pj: MgProject; y: number; h: number }
  | { k: 'r'; key: string; b: Booking; pj: MgProject; y: number; h: number };
type Cand = {
  p: MgPerson;
  score: number;
  skill: number;
  free: number[];
  cap: number[];
  freeAvg: number;
  note: string;
  lvl: string;
};
type Drop = { b: Booking; p: MgPerson; x: number; y: number };

/** Skills a role asks for: its own, else the project's modules (0049). */
export function needOf(b: Booking, pj: MgProject | undefined, skn: Record<string, string>) {
  if (b.need.length) return b.need;
  const k = (pj?.modules ?? []).map((m) => mgModSkill(m, skn)).find(Boolean);
  return k ? [{ k, l: 0 }] : [];
}

// Projetos (concept C1/C3): a project per block, a row per role (with or
// without a person), budget / real / planned; "Quem pode ir?" ranks people by
// skill and availability for the role picked; drag one onto a role.
export function ProjectsView({
  mg,
  zoom: z0,
  unit,
  win,
  setWin,
  q,
  fl,
  nav,
  onView,
  openBk,
}: {
  mg: Mg;
  zoom: TZoom;
  unit: GUnit;
  win: [Dn, Dn];
  setWin: (w: [Dn, Dn]) => void;
  q: string;
  fl: Filters;
  nav: Nav;
  onView: (a: Dn, b: Dn) => void;
  openBk: (b: Booking, isNew: boolean, x: number, y: number) => void;
}) {
  const { tr, lang } = mg;
  const zoom: TZoom = z0 === 'day' ? 'week' : z0;
  const ppd = PPD[zoom];
  const [F, T] = win;
  const scRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ l: 0, w: 900, t: 0, h: 600 });
  const [pick, setPick] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ p: MgPerson; x: number; y: number; over: string | null } | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const today = dnOf(todayIso());
  const width = (T - F + 1) * ppd;
  const A = isoOf(F);
  const B = isoOf(T);

  const projects = useMemo(
    () =>
      mg.PJ.filter(
        (p) =>
          p.status !== 'Concluído' &&
          (!fl.proj || p.id === fl.proj) &&
          (!fl.client || p.client === fl.client) &&
          (!q || `${p.code} ${p.name} ${mg.cById[p.client]?.name ?? ''}`.toLowerCase().includes(q)) &&
          mg.inTeamProj(p.id),
      ).sort((a, b) => a.code.localeCompare(b.code)),
    [mg, fl.proj, fl.client, q],
  );
  const rows = useMemo(() => {
    const out: PRow[] = [];
    let y = 0;
    for (const pj of projects) {
      const bks = mg.BK.filter(
        (b) => b.project === pj.id && b.to >= A && b.from <= B && (!fl.hideTent || b.status !== 'tentative'),
      );
      out.push({ k: 'pj', key: pj.id, pj, y, h: 52 });
      y += 52;
      if (closed[pj.id]) continue;
      const list = [...bks].sort((a, b) => +!a.person - +!b.person || a.from.localeCompare(b.from));
      for (const b of list) {
        out.push({ k: 'r', key: b.id, b, pj, y, h: 40 });
        y += 40;
      }
    }
    return { list: out, height: y };
  }, [projects, mg.BK, A, B, closed, fl.hideTent]);

  // ── the role picked for "Quem pode ir?" (a placeholder) ──
  const placeholders = rows.list.filter((r): r is Extract<PRow, { k: 'r' }> => r.k === 'r' && !r.b.person);
  const picked = mg.BK.find((b) => b.id === pick && !b.person) ?? placeholders[0]?.b ?? null;
  const pickedPj = picked ? mg.pjById[picked.project] : undefined;
  const cands = useMemo<Cand[]>(() => {
    if (!picked) return [];
    const need = needOf(picked, pickedPj, mg.SKN);
    const f = dnOf(picked.from);
    const t = dnOf(picked.to);
    const eq = equivalents(picked, mg.env);
    const weeks: Array<[Dn, Dn]> = [];
    for (let w = f - wdOf(f); w <= t && weeks.length < 16; w += 7) weeks.push([w, w + 6]);
    return mg.ALLP.filter(isAvailable)
      .map((p) => {
        const sk = need.length
          ? need.reduce((s, n) => {
              const lv = p.skills[n.k] ?? 0;
              return s + (!lv ? 0 : !n.l || lv >= n.l ? 1 : 0.4 + (0.4 * lv) / n.l);
            }, 0) / need.length
          : 0.5;
        const l = mg.loads(p.id);
        const free = weeks.map(([a, b]) => Math.max(0, sumDays(l.cap, l, a, b) - sumDays(l.conf, l, a, b)));
        const cap = weeks.map(([a, b]) => sumDays(l.cap, l, a, b));
        const need5 = eq.hpd * 5 || 1;
        const freeAvg = free.reduce((s, x) => s + x, 0) / (free.length || 1);
        const av = Math.min(1, freeAvg / need5);
        const lvK = need[0]?.k;
        const lvl =
          lvK && p.skills[lvK]
            ? `${mg.SKN[lvK] ?? lvK} ${mg.LV[p.skills[lvK]!] ?? ''}`
            : `${mg.SKN[p.area] ?? p.area} ${mg.LV[p.level] ?? ''}`;
        // where the person is now
        const now = mg.BK.filter(
          (b) => b.person === p.id && b.status === 'confirmed' && b.from <= picked.to && b.to >= picked.from,
        );
        const note = !now.length
          ? tr('Livre no período')
          : now.length === 1
            ? tr(`Em ${mg.pjById[now[0]!.project]?.code ?? '?'} até ${dayMon(dnOf(now[0]!.to), lang)}`)
            : tr(`Em ${now.length} projetos`);
        return { p, score: Math.round(sk * 60 + av * 40), skill: sk, free, cap, freeAvg, note, lvl };
      })
      .filter((c) => c.skill > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 14);
  }, [picked, pickedPj, mg, tr, lang]);

  // ── scroll ──
  const onScroll = useCallback(() => {
    const el = scRef.current;
    if (el) setView({ l: el.scrollLeft, w: el.clientWidth, t: el.scrollTop, h: el.clientHeight });
  }, []);
  useLayoutEffect(() => {
    const el = scRef.current;
    if (!el) return;
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    el.scrollLeft = Math.max(0, (today - F) * ppd - 40);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const prev = useRef({ F, ppd });
  useLayoutEffect(() => {
    const el = scRef.current;
    if (!el) return;
    const p = prev.current;
    if (p.F !== F || p.ppd !== ppd) {
      el.scrollLeft = (p.F + el.scrollLeft / p.ppd - F) * ppd;
      prev.current = { F, ppd };
      onScroll();
    }
  }, [F, ppd, onScroll]);
  useEffect(() => {
    const el = scRef.current;
    if (!el || !nav.n) return;
    const span = el.clientWidth - NAMEW;
    if (nav.kind === 'today') {
      el.scrollTo({ left: Math.max(0, (today - F) * ppd - 40), behavior: 'smooth' });
      return;
    }
    const dir = nav.kind === 'next' ? 1 : -1;
    const target = el.scrollLeft + dir * span * 0.8;
    if (target < 0) setWin([monthStart(F, -3), T]);
    else if (target + el.clientWidth > width) setWin([F, monthStart(T + 1, 3) - 1]);
    requestAnimationFrame(() => el.scrollBy({ left: dir * span * 0.8, behavior: 'smooth' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav]);
  const visA = F + Math.max(0, Math.floor(view.l / ppd));
  const visB = Math.min(T, F + Math.ceil((view.l + view.w - NAMEW) / ppd));
  useEffect(() => onView(visA, visB), [visA, visB, onView]);
  const cols = useMemo(() => columns(zoom, F, T, lang, () => tr('feriado')), [zoom, F, T, lang, tr]);
  const x = (n: Dn) => NAMEW + (n - F) * ppd;
  const xa = view.l - 200;
  const xb = view.l + view.w + 200;

  // ── drag a candidate onto a role ──
  const startDrag = (e: React.PointerEvent, p: MgPerson) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    let over: string | null = null;
    const target = (cx: number, cy: number) => {
      const el = document.elementFromPoint(cx, cy) as HTMLElement | null;
      return el?.closest('[data-role-row]')?.getAttribute('data-role-row') ?? null;
    };
    const mv = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      moved = true;
      over = target(ev.clientX, ev.clientY);
      setDrag({ p, x: ev.clientX, y: ev.clientY, over });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (!moved || !over) return;
      const b = mg.BK.find((k) => k.id === over);
      if (b && !b.person) setDrop({ b, p, x: ev.clientX - 180, y: ev.clientY - 220 });
      else if (b) {
        // onto a role with a person: a new booking of the same role and period
        openBk(
          { ...b, id: crypto.randomUUID(), person: p.id, days: {}, ver: '' },
          true,
          ev.clientX,
          ev.clientY - 100,
        );
      } else {
        const pj = mg.pjById[over];
        if (pj) {
          const t0 = Math.max(today, dnOf(pj.from));
          const mon = t0 - wdOf(t0);
          openBk(
            {
              id: crypto.randomUUID(),
              person: p.id,
              project: pj.id,
              role: '',
              status: pj.status === 'Planeado' ? 'tentative' : 'confirmed',
              from: isoOf(mon),
              to: isoOf(Math.min(dnOf(pj.to) + 4, mon + 25)),
              mode: 'hpd',
              value: 8,
              mask: 31,
              hol: false,
              note: '',
              need: [],
              days: {},
              ver: '',
            },
            true,
            ev.clientX,
            ev.clientY - 100,
          );
        }
      }
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  const effort = (b: Booking, p?: MgPerson) => {
    const e = equivalents(b, mg.env);
    if (unit === 'pct') return `${Math.round(e.pct)}%`;
    if (unit === 'fte') return `${fmtNum(e.fte, lang, 2)} FTE`;
    void p;
    return `${fmtNum(e.hpw, lang)}h/${lang === 'en' ? 'wk' : 'sem'}`;
  };
  const projHead = (r: Extract<PRow, { k: 'pj' }>) => {
    const pj = r.pj;
    const used = mg.tsHours(pj.id).v;
    const plan = mg.forecast(pj.id);
    const bud = pj.budget || 1;
    const live = pj.phases.find((p) => /go-live/i.test(p.name));
    const st = `${tr(pj.status)}${live ? ` · go-live ${dayMon(dnOf(live.from), lang)}` : ''}`;
    const over = used + plan > pj.budget;
    return (
      <div
        key={r.key}
        className="al-row al-pjhead"
        data-role-row={pj.id}
        style={{ top: HEAD + r.y, height: r.h, width: NAMEW + width, background: 'rgb(var(--w) / .035)' }}
      >
        <div
          className="al-name"
          style={{ width: NAMEW, cursor: 'pointer' }}
          onClick={() => setClosed({ ...closed, [pj.id]: !closed[pj.id] })}
        >
          <span style={{ fontSize: 9, width: 8 }}>{closed[pj.id] ? '▸' : '▾'}</span>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: pj.color, flex: 'none' }} />
          <span className="txt">
            <span className="nm">
              <span className="al-mono">{pj.code}</span> · {mg.cById[pj.client]?.name ?? tr('Sem cliente')}
            </span>
            <span className="rl">{pj.name}</span>
          </span>
        </div>
        <div
          className="al-budget"
          style={{
            left: Math.max(NAMEW + 12, view.l + NAMEW + 12),
            width: Math.min(560, view.w - NAMEW - 40),
          }}
        >
          <span
            className="al-status"
            style={{ background: MG_PST[pj.status] ?? 'rgb(var(--w) / .12)', color: 'var(--ink)' }}
          >
            {st}
          </span>
          <span
            className="bar"
            title={`${tr('real')} ${mgEur(used)} · ${tr('previsto')} ${mgEur(plan)} · ${tr('orçamento')} ${mgEur(pj.budget)}`}
          >
            <i
              style={{ width: `${Math.min(100, (used / bud) * 100)}%`, background: 'rgb(var(--w) / .75)' }}
            />
            <i
              style={{
                left: `${Math.min(100, (used / bud) * 100)}%`,
                width: `${Math.max(0, Math.min(100 - (used / bud) * 100, (plan / bud) * 100))}%`,
                background: pj.color,
              }}
            />
          </span>
          <span style={{ color: over ? 'oklch(calc(.84 * var(--lk)) .13 30)' : undefined }}>
            {mgK(used)} {tr('real')} · {mgK(used + plan)} / {mgK(pj.budget)}
          </span>
        </div>
      </div>
    );
  };
  const roleRow = (r: Extract<PRow, { k: 'r' }>) => {
    const b = r.b;
    const p = b.person ? mg.pById[b.person] : undefined;
    const isPick = picked?.id === b.id;
    const isOver = drag?.over === b.id;
    const f = Math.max(F, dnOf(b.from));
    const t = Math.min(T, dnOf(b.to));
    const left = x(f) + 2;
    const w = Math.max(8, (t - f + 1) * ppd - 4);
    const c = r.pj.color;
    const tent = b.status === 'tentative';
    const need = needOf(b, r.pj, mg.SKN)[0];
    return (
      <div
        key={r.key}
        className={`al-row${isOver ? ' drop' : ''}${isPick ? ' hl' : ''}`}
        data-role-row={b.id}
        style={{ top: HEAD + r.y, height: r.h, width: NAMEW + width }}
      >
        <div
          className="al-name"
          style={{ width: NAMEW, paddingLeft: 26 }}
          onClick={() => (b.person ? mg.nav('mg_people', { p: b.person }) : setPick(b.id))}
        >
          {p ? <Av p={p} size={28} fs={10} tc={mg.tOf(p).tc} /> : <span className="al-ph-av sm">?</span>}
          <span className="txt">
            <span className="nm" style={{ fontSize: 13 }}>
              {b.role || (p ? mg.tr(p.role) : tr('Por atribuir'))}
            </span>
            <span className="rl" style={!p ? { color: 'oklch(calc(.86 * var(--lk)) .13 85)' } : undefined}>
              {p ? p.name : tr('Por atribuir')}
            </span>
          </span>
        </div>
        {left + w >= xa && left <= xb && (
          <div
            className={`al-bar${tent ? ' tent' : ''}${isPick ? ' sel' : ''}`}
            style={{
              left,
              top: 9,
              width: w,
              paddingLeft: 8 + Math.max(0, Math.min(view.l + NAMEW - left, w - 120)),
              cursor: 'pointer',
              ...(p
                ? tent
                  ? { background: `color-mix(in oklch, ${c} 38%, transparent)`, border: `1.5px dashed ${c}` }
                  : { background: c }
                : {
                    background: 'transparent',
                    border: '1.5px dashed rgb(var(--w) / .55)',
                    color: 'var(--ink)',
                    boxShadow: 'none',
                  }),
            }}
            onClick={(e) => (b.person ? openBk(b, false, e.clientX + 10, e.clientY - 40) : setPick(b.id))}
            onDoubleClick={(e) => openBk(b, false, e.clientX + 10, e.clientY - 40)}
            title={`${b.role} · ${b.from} → ${b.to}`}
          >
            {p ? p.name.split(' ')[0] : null}
            <span className="ef" style={!p ? { opacity: 1 } : undefined}>
              {effort(b)}
            </span>
            {!p && w > 200 && (
              <span className="fn">
                · {b.role}
                {need ? ` · ≥ ${mg.LV[need.l] ?? ''}` : ''}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };
  const holidays = useMemo(() => {
    const out: Dn[] = [];
    for (let n = F; n <= T; n++) if (holidayOf(n) && wdOf(n) < 5) out.push(n);
    return out;
  }, [F, T]);
  const off = -wdOf(F) * ppd;
  return (
    <div className="al-body">
      <div className="al-well">
        <div className="al-scroll" ref={scRef} onScroll={onScroll}>
          <div
            className="al-canvas"
            style={{
              width: NAMEW + width,
              height: HEAD + rows.height,
              ['--al-name' as string]: `${NAMEW}px`,
            }}
          >
            <div className="al-hdr" style={{ height: HEAD, width: NAMEW + width }}>
              <div className="al-corner">{tr('Projeto · função')}</div>
              {cols
                .filter((c) => x(c.b) + ppd >= xa && x(c.a) <= xb)
                .map((c, i) => (
                  <div
                    key={c.a}
                    className={`al-hcol${c.today ? ' today' : ''}${c.top && i ? ' newgrp' : ''}`}
                    style={{ left: x(c.a), width: (c.b - c.a + 1) * ppd }}
                  >
                    {c.hol && zoom === 'week' ? (
                      <span
                        className="top"
                        style={{ color: 'var(--al-hol)', textTransform: 'none', letterSpacing: 0 }}
                      >
                        {tr('feriado')}
                      </span>
                    ) : (
                      c.top && <span className="top">{c.top}</span>
                    )}
                    <span className="lbl">{c.lbl}</span>
                  </div>
                ))}
            </div>
            <div
              className="al-bg"
              style={{
                left: NAMEW,
                top: HEAD,
                width,
                height: rows.height,
                backgroundImage: `repeating-linear-gradient(90deg, rgb(var(--w) / .06) 0 1px, transparent 1px ${7 * ppd}px)`,
                backgroundPosition: `${off}px 0`,
              }}
            />
            {zoom === 'week' &&
              holidays.map((n) => (
                <span
                  key={n}
                  className="al-holcol"
                  style={{
                    left: x(n - wdOf(n)),
                    width: 7 * ppd,
                    top: HEAD,
                    height: rows.height,
                    opacity: 0.55,
                  }}
                />
              ))}
            {today >= F && today <= T && (
              <span className="al-todayline" style={{ left: x(today), top: HEAD, height: rows.height }} />
            )}
            {rows.list.map((r) =>
              r.y + r.h < view.t - 300 || r.y > view.t + view.h + 300
                ? null
                : r.k === 'pj'
                  ? projHead(r)
                  : roleRow(r),
            )}
            {!rows.list.length && <div className="al-empty">{tr('Sem projetos com estes filtros.')}</div>}
          </div>
        </div>
      </div>
      <aside className="al-side" aria-label={tr('Quem pode ir?')}>
        <div className="al-side-hd">
          <div className="t">
            <b>{tr('Quem pode ir?')}</b>
            <small>{tr('arraste para uma função')}</small>
          </div>
          {picked ? (
            <div className="al-chips">
              <span className="al-chip" aria-pressed>
                {pickedPj?.code} · {picked.role || tr('Por atribuir')}
              </span>
              {needOf(picked, pickedPj, mg.SKN).map((n) => (
                <span key={n.k} className="al-chip">
                  {mg.SKN[n.k] ?? n.k}
                  {n.l ? ` ≥ ${mg.LV[n.l] ?? n.l}` : ''}
                </span>
              ))}
              <span className="al-chip">
                {dayMon(dnOf(picked.from), lang)} → {dayMon(dnOf(picked.to), lang)}
              </span>
            </div>
          ) : (
            <small>{tr('Escolha uma função por atribuir (linha com “?”).')}</small>
          )}
          <div className="t" style={{ fontSize: 11 }}>
            <small style={{ marginRight: 'auto' }}>
              {tr('Correspondência · competência + disponibilidade')}
            </small>
            <small>{tr('horas livres / sem')}</small>
          </div>
        </div>
        <div className="al-side-bd">
          {cands.map((c) => {
            const bd =
              c.score >= 85 ? 'var(--al-u2)' : c.score >= 60 ? 'var(--al-u1)' : 'rgb(var(--w) / .16)';
            const mx = Math.max(1, ...c.cap);
            return (
              <div
                key={c.p.id}
                className={`al-cand${drag?.p.id === c.p.id ? ' dragging' : ''}`}
                onPointerDown={(e) => startDrag(e, c.p)}
                data-cand={c.p.id}
                title={tr('Arraste para uma função por atribuir')}
              >
                <div className="r1">
                  <Av p={c.p} size={34} fs={12} tc={mg.tOf(c.p).tc} />
                  <span className="tx">
                    <b>{c.p.name}</b>
                    <span>{c.note}</span>
                  </span>
                  <span
                    className="al-pct"
                    style={{ background: bd, color: c.score >= 60 ? '#1d2a12' : 'var(--ink)' }}
                  >
                    {c.score}%
                  </span>
                </div>
                <div className="r2">
                  <span className="al-tagk">{c.lvl}</span>
                  <span className="al-spark" aria-label={tr('horas livres por semana')}>
                    {c.free.map((f, i) => (
                      <i
                        key={i}
                        title={`${fmtNum(f, lang)}h`}
                        style={{
                          height: `${Math.max(2, (f / mx) * 18)}px`,
                          background:
                            f >= (c.cap[i] ?? 0) * 0.6
                              ? 'var(--al-u2)'
                              : f > 0
                                ? 'var(--al-u1)'
                                : 'var(--al-u3)',
                        }}
                      />
                    ))}
                  </span>
                </div>
              </div>
            );
          })}
          {picked && !cands.length && <div className="al-empty">{tr('Ninguém com esta competência.')}</div>}
        </div>
      </aside>
      {drag && (
        <div className="al-dragghost" style={{ left: drag.x + 10, top: drag.y - 18 }}>
          <Av p={drag.p} size={28} fs={10} tc={mg.tOf(drag.p).tc} />
          {drag.p.name}
          <span className="al-mono" style={{ fontSize: 11, opacity: 0.7 }}>
            {mg.SKN[drag.p.area] ?? drag.p.area}
          </span>
        </div>
      )}
      {drop && (
        <DropPop
          mg={mg}
          d={drop}
          onClose={() => setDrop(null)}
          onDrop={(b) => {
            mg.AL.change({ bk: [b] });
            setDrop(null);
            setPick(null);
          }}
          onEdit={(b) => {
            setDrop(null);
            openBk(b, false, drop.x, drop.y);
          }}
        />
      )}
    </div>
  );
}

/** C3: what dropping a person on a role means — period, effort, status, conflicts, cost. */
function DropPop({
  mg,
  d,
  onClose,
  onDrop,
  onEdit,
}: {
  mg: Mg;
  d: Drop;
  onClose: () => void;
  onDrop: (b: Booking) => void;
  onEdit: (b: Booking) => void;
}) {
  const { tr, lang } = mg;
  const [half, setHalf] = useState(false);
  const base: Booking = { ...d.b, person: d.p.id };
  const b: Booking = half
    ? { ...base, value: base.mode === 'fte' ? base.value / 2 : Math.round(base.value) / 2 }
    : base;
  const eq = equivalents(b, mg.env);
  const pj = mg.pjById[b.project];
  const c = conflictOf(b, mg.BK, mg.env);
  const total = (() => {
    const s = bookingSeries(b, mg.env);
    let t = 0;
    for (const h of s.h) t += h;
    return t;
  })();
  const l = mg.loads(d.p.id);
  const f = dnOf(b.from);
  const t = dnOf(b.to);
  const cap = sumDays(l.cap, l, f, t);
  const conf = sumDays(l.conf, l, f, t);
  const pct = cap ? Math.round(((conf + (b.status === 'confirmed' ? total : 0)) / cap) * 100) : 0;
  const first = d.p.name.split(' ')[0];
  const row = (k: string, v: React.ReactNode) => (
    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 10, fontSize: 13 }}>
      <span style={{ color: 'rgb(var(--t) / calc(.65 * var(--t-k)))' }}>{k}</span>
      <span className="al-mono">{v}</span>
    </div>
  );
  return (
    <Floating x={d.x} y={d.y} w={370} label={tr('Largar na função')} onClose={onClose}>
      <form
        className="al-pop-bd"
        style={{ paddingTop: 16, gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          onDrop(b);
        }}
      >
        <b style={{ fontSize: 14 }}>
          {tr('Largar em')} {pj?.code} · {b.role || tr('Por atribuir')}
        </b>
        {row(tr('Período'), `${dayMon(f, lang)} → ${dayMon(t, lang)} · ${tr(`${eq.days} dias úteis`)}`)}
        {row(
          tr('Esforço'),
          `${fmtNum(eq.hpw, lang)}h/${lang === 'en' ? 'wk' : 'sem'} = ${fmtNum(eq.hpd, lang)}h/${lang === 'en' ? 'day' : 'dia'} · ${fmtNum(total, lang)}h`,
        )}
        {row(
          tr('Estado'),
          <span style={{ fontFamily: 'inherit' }}>
            {tr(b.status === 'tentative' ? 'Tentativo' : 'Confirmado')}
            {pj?.status === 'Planeado' && (
              <span style={{ opacity: 0.7 }}> ({tr('o projeto é proposta')})</span>
            )}
          </span>,
        )}
        {row(
          first ?? '',
          c ? (
            <span style={{ color: 'oklch(calc(.84 * var(--lk)) .14 30)' }}>
              {tr(`fica a ${pct}% · ${c.days.length} dias acima da capacidade`)}
            </span>
          ) : (
            <span style={{ color: 'oklch(calc(.86 * var(--lk)) .13 150)' }}>
              {tr(`fica a ${pct}% · sem conflitos`)}
            </span>
          ),
        )}
        {row(
          tr('Custo'),
          `${fmtNum(total, lang, 0)}h × ${fmtNum(d.p.rate, lang, 0)} €/h = ${mgEur(total * d.p.rate)}`,
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            type="button"
            className="al-btn ghost sm"
            aria-pressed={half}
            onClick={() => setHalf(!half)}
          >
            {half ? tr('100%') : tr('Só 50%')}
          </button>
          <button type="button" className="al-btn ghost sm" onClick={() => onEdit(b)}>
            {tr('Mudar período')}
          </button>
          <button type="submit" className="al-btn sm" autoFocus>
            {tr('Largar')} ↵
          </button>
        </div>
      </form>
    </Floating>
  );
}
