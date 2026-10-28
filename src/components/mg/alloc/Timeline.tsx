'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  dnOf,
  effortLabel,
  equivalents,
  fmtNum,
  holidayName,
  holidayOf,
  isoOf,
  loadBand,
  monthStart,
  sumDays,
  todayIso,
  wdOf,
  type Absence,
  type Booking,
  type Dn,
} from '@/lib/alloc';
import type { MgPerson } from '@/lib/mg';
import { Av } from '../ui';
import type { Mg } from '../store';
import {
  ABS_LABEL,
  BAND_BG,
  BAND_FG,
  PPD,
  columns,
  groupOfArea,
  lanes,
  rangeBooking,
  shiftBooking,
  splitBooking,
  type TZoom,
} from './shared';

export type Unit = 'hpd' | 'pct' | 'total';
export type GroupBy = 'team' | 'project' | 'client' | 'module' | 'none';
export type Item = { kind: 'bk'; b: Booking } | { kind: 'ab'; a: Absence };
type Lane = { from: string; to: string; it: Item; lane: number };
type RowP = {
  k: 'p';
  key: string;
  p: MgPerson;
  /** only these bookings in this group (grouped by project / client) */
  only?: (b: Booking) => boolean;
  items: Lane[];
  y: number;
  h: number;
  /** project of the group, for new bookings */
  gp?: string;
};
type RowPh = { k: 'ph'; key: string; b: Booking; y: number; h: number };
type RowG = { k: 'g'; key: string; label: string; dot: string; count: string; y: number; h: number };
type Row = RowP | RowPh | RowG;

const HEAD = 54;
const LANE = 26;

export type Nav = { kind: 'today' | 'prev' | 'next'; n: number };
type Ghost =
  | { m: 'create'; row: string; person: string; a: Dn; b: Dn; abs: boolean }
  | { m: 'move' | 'resize'; it: Item; from: Dn; to: Dn; row: string; person: string; copy: boolean };
type Menu = { x: number; y: number; items: Array<[string, () => void, string?] | null> };

export function Timeline({
  mg,
  zoom,
  win,
  setWin,
  people,
  groupBy,
  unit,
  showPh,
  showAbs,
  bkFilter,
  nav,
  onView,
  openBk,
  openAb,
}: {
  mg: Mg;
  zoom: TZoom;
  win: [Dn, Dn];
  setWin: (w: [Dn, Dn]) => void;
  people: MgPerson[];
  groupBy: GroupBy;
  unit: Unit;
  showPh: boolean;
  showAbs: boolean;
  bkFilter: (b: Booking) => boolean;
  nav: Nav;
  onView: (a: Dn, b: Dn) => void;
  openBk: (b: Booking, isNew: boolean, x: number, y: number) => void;
  openAb: (a: Absence, isNew: boolean, x: number, y: number) => void;
}) {
  const { tr, lang } = mg;
  const [F, T] = win;
  const ppd = PPD[zoom];
  const scRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ l: 0, t: 0, w: 1200, h: 700 });
  const [nameW, setNameW] = useState(236);
  const [sel, setSel] = useState<{ kind: 'bk' | 'ab'; id: string } | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const hoverDn = useRef<Dn>(dnOf(todayIso()));
  const lastProject = useRef<string>('');
  const today = dnOf(todayIso());
  const width = (T - F + 1) * ppd;

  // ── rows ──
  const rows = useMemo(() => {
    const out: Row[] = [];
    let y = 0;
    const inWin = (x: { from: string; to: string }) => x.to >= isoOf(F) && x.from <= isoOf(T);
    const bkOf = new Map<string, Booking[]>();
    for (const b of mg.BK)
      if (b.person && inWin(b) && bkFilter(b)) bkOf.set(b.person, [...(bkOf.get(b.person) ?? []), b]);
    const abOf = new Map<string, Absence[]>();
    if (showAbs) for (const a of mg.AB) if (inWin(a)) abOf.set(a.person, [...(abOf.get(a.person) ?? []), a]);
    const group = (key: string, label: string, dot: string, count: string) => {
      out.push({ k: 'g', key, label, dot, count, y, h: 30 });
      y += 30;
      return !collapsed[key];
    };
    const person = (p: MgPerson, gkey: string, only?: (b: Booking) => boolean, gp?: string) => {
      const its: Array<{ from: string; to: string; it: Item }> = [
        ...(bkOf.get(p.id) ?? [])
          .filter((b) => !only || only(b))
          .map((b) => ({ from: b.from, to: b.to, it: { kind: 'bk' as const, b } })),
        ...(abOf.get(p.id) ?? []).map((a) => ({ from: a.from, to: a.to, it: { kind: 'ab' as const, a } })),
      ];
      const ln = lanes(its);
      const nl = Math.max(1, ...ln.map((x) => x.lane + 1));
      const h = Math.max(54, 14 + nl * LANE + 10);
      out.push({ k: 'p', key: `${gkey}|${p.id}`, p, only, items: ln, y, h, gp });
      y += h;
    };
    if (showPh) {
      const ph = mg.BK.filter((b) => !b.person && inWin(b) && bkFilter(b));
      if (ph.length) {
        if (group('ph', tr('Por atribuir'), 'rgb(var(--w) / .6)', tr(`${ph.length} perfis`)))
          for (const b of ph) {
            out.push({ k: 'ph', key: `ph|${b.id}`, b, y, h: 54 });
            y += 54;
          }
      }
    }
    const n = (k: number) => tr(k === 1 ? '1 pessoa' : `${k} pessoas`);
    if (groupBy === 'team') {
      const teams = [
        ...mg.TEAMS.map((t) => ({ id: t.id, name: tr(t.name), color: t.color })),
        { id: '', name: tr('Sem equipa'), color: 'rgb(var(--w) / .4)' },
      ];
      for (const t of teams) {
        const ps = people.filter((p) => (t.id ? p.team === t.id : !mg.tById[p.team]));
        if (!ps.length) continue;
        if (group(`t|${t.id}`, t.name, t.color, n(ps.length))) for (const p of ps) person(p, `t|${t.id}`);
      }
    } else if (groupBy === 'project' || groupBy === 'client') {
      const keyOf = (b: Booking) => (groupBy === 'project' ? b.project : mg.pjById[b.project]?.client || '_');
      const keys = new Map<string, Set<string>>();
      for (const p of people)
        for (const b of bkOf.get(p.id) ?? []) {
          const k = keyOf(b);
          if (!keys.has(k)) keys.set(k, new Set());
          keys.get(k)!.add(p.id);
        }
      const list = [...keys.entries()].sort((a, b) => {
        const la = groupBy === 'project' ? (mg.pjById[a[0]]?.code ?? '') : (mg.cById[a[0]]?.name ?? '~');
        const lb = groupBy === 'project' ? (mg.pjById[b[0]]?.code ?? '') : (mg.cById[b[0]]?.name ?? '~');
        return la.localeCompare(lb);
      });
      for (const [k, ids] of list) {
        const pj = mg.pjById[k];
        const label =
          groupBy === 'project'
            ? `${pj?.code ?? '?'} · ${pj?.name ?? ''}`
            : (mg.cById[k]?.name ?? tr('Sem cliente'));
        const dot = groupBy === 'project' ? (pj?.color ?? 'transparent') : 'rgb(var(--w) / .5)';
        const ps = people.filter((p) => ids.has(p.id));
        if (group(`g|${k}`, label, dot, n(ps.length)))
          for (const p of ps)
            person(p, `g|${k}`, (b) => keyOf(b) === k, groupBy === 'project' ? k : undefined);
      }
      const idle = people.filter((p) => !(bkOf.get(p.id) ?? []).length);
      if (idle.length && group('g|idle', tr('Sem alocações'), 'rgb(var(--w) / .3)', n(idle.length)))
        for (const p of idle) person(p, 'g|idle');
    } else if (groupBy === 'module') {
      const gm = new Map<string, MgPerson[]>();
      for (const p of people) {
        const g = groupOfArea(p.area);
        gm.set(g, [...(gm.get(g) ?? []), p]);
      }
      for (const [g, ps] of gm)
        if (group(`m|${g}`, g, 'oklch(0.8 0.1 200)', n(ps.length))) for (const p of ps) person(p, `m|${g}`);
    } else for (const p of people) person(p, 'all');
    return { list: out, height: y };
  }, [
    mg.BK,
    mg.AB,
    mg.TEAMS,
    mg.tById,
    mg.pjById,
    mg.cById,
    F,
    T,
    people,
    groupBy,
    showPh,
    showAbs,
    bkFilter,
    collapsed,
    tr,
  ]);

  // ── scroll / view ──
  const onScroll = useCallback(() => {
    const el = scRef.current;
    if (!el) return;
    setView({ l: el.scrollLeft, t: el.scrollTop, w: el.clientWidth, h: el.clientHeight });
  }, []);
  useLayoutEffect(() => {
    const el = scRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      onScroll();
      setNameW(parseFloat(getComputedStyle(el).getPropertyValue('--al-name')) || 236);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onScroll]);
  // the day at the centre of the view: kept when the zoom or the window changes
  const center = useRef<number | null>(null);
  // when we scrolled ourselves (those scroll events move nothing else)
  const prog = useRef(0);
  const lastPpd = useRef(ppd);
  useLayoutEffect(() => {
    const el = scRef.current;
    if (!el) return;
    const span = (el.clientWidth - nameW) / ppd;
    // a new zoom with today in view keeps today a fifth from the left (else the day in the centre stays)
    if (center.current != null && lastPpd.current !== ppd) {
      const half = (el.clientWidth - nameW) / lastPpd.current / 2;
      if (Math.abs(today - center.current) < half) center.current = null;
    }
    lastPpd.current = ppd;
    // first show: today a fifth from the left
    if (center.current == null) center.current = today + span * 0.3;
    prog.current = performance.now();
    el.scrollLeft = Math.max(0, (center.current - F) * ppd - (el.clientWidth - nameW) / 2);
    onScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [F, ppd]);
  // free scrolling past the edges widens the window by 3 months
  const onUserScroll = () => {
    onScroll();
    const el = scRef.current;
    if (!el || performance.now() - prog.current < 150) return;
    center.current = F + (el.scrollLeft + (el.clientWidth - nameW) / 2) / ppd;
    if (el.scrollLeft < 40 && F > dnOf(todayIso()) - 365 * 3) setWin([monthStart(F, -3), T]);
    else if (el.scrollLeft + el.clientWidth > nameW + width - 40) setWin([F, monthStart(T + 1, 3) - 1]);
  };
  // ‹ Hoje ›
  useEffect(() => {
    const el = scRef.current;
    if (!el || !nav.n) return;
    const span = el.clientWidth - nameW;
    if (nav.kind === 'today') {
      center.current = today + (span / ppd) * 0.3;
      const want = (today - F) * ppd - span / 5;
      el.scrollTo({ left: Math.max(0, want), behavior: 'smooth' });
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
  const visB = Math.min(T, F + Math.ceil((view.l + view.w - nameW) / ppd));
  useEffect(() => {
    onView(visA, visB);
  }, [visA, visB, onView]);
  useEffect(() => {
    mg.AL.ensure(F, T);
  }, [F, T, mg.AL]);

  const cols = useMemo(
    () => columns(zoom, F, T, lang, (k) => (zoom === 'day' ? tr('feriado') : holidayName(k, lang))),
    [zoom, F, T, lang, tr],
  );
  const x = (n: Dn) => nameW + (n - F) * ppd;
  const xa = view.l - 200;
  const xb = view.l + view.w + 200;
  const ya = view.t - 300;
  const yb = view.t + view.h + 300;

  // ── geometry from the pointer ──
  const dnAt = (cx: number) => {
    const el = scRef.current!;
    const r = el.getBoundingClientRect();
    return F + Math.floor((cx - r.left + el.scrollLeft - nameW) / ppd);
  };
  const rowAt = (cy: number): Row | null => {
    const el = scRef.current!;
    const r = el.getBoundingClientRect();
    const yy = cy - r.top + el.scrollTop - HEAD;
    for (const row of rows.list) if (yy >= row.y && yy < row.y + row.h) return row;
    return null;
  };
  const personOfRow = (row: Row | null) => (row?.k === 'p' ? row.p.id : row?.k === 'ph' ? '' : null);

  // ── equivalents for the bar labels (cached per booking) ──
  // equivalents depend on the capacities: a new cache with each new environment
  const env = mg.env;
  const eqCache = useMemo(() => (void env, new WeakMap<Booking, ReturnType<typeof equivalents>>()), [env]);
  const eqOf = (b: Booking) => {
    let e = eqCache.get(b);
    if (!e) eqCache.set(b, (e = equivalents(b, mg.env)));
    return e;
  };
  const effort = (b: Booking) => {
    if (unit === 'pct') return `${Math.round(eqOf(b).pct)}%`;
    if (unit === 'total') return `${fmtNum(eqOf(b).total, lang)}h`;
    return b.mode === 'hpd' || b.mode === 'hpw' || b.mode === 'fte' || b.mode === 'pct'
      ? `${fmtNum(eqOf(b).hpd, lang)}h/${lang === 'en' ? 'd' : 'd'}`
      : effortLabel(b, lang);
  };

  // ── drag & drop ──
  const autoScroll = (cx: number, cy: number) => {
    const el = scRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (cx < r.left + nameW + 30) el.scrollLeft -= 18;
    else if (cx > r.right - 30) el.scrollLeft += 18;
    if (cy < r.top + HEAD + 20) el.scrollTop -= 14;
    else if (cy > r.bottom - 20) el.scrollTop += 14;
  };
  const startItem = (e: React.PointerEvent, it: Item, mode: 'move' | 'l' | 'r', row: Row) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const d0 = dnAt(x0);
    const f0 = dnOf(it.kind === 'bk' ? it.b.from : it.a.from);
    const t0 = dnOf(it.kind === 'bk' ? it.b.to : it.a.to);
    const p0 = it.kind === 'bk' ? it.b.person : it.a.person;
    let moved = false;
    let g: Ghost | null = null;
    const mv = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moved = true;
      autoScroll(ev.clientX, ev.clientY);
      const dd = dnAt(ev.clientX) - d0;
      let from = f0;
      let to = t0;
      let person = p0;
      let rkey = row.key;
      if (mode === 'move') {
        from = f0 + dd;
        to = t0 + dd;
        const tr0 = rowAt(ev.clientY);
        const tp = personOfRow(tr0);
        // bookings go to any person (or back to "Por atribuir"); absences only between people
        if (tr0 && tp !== null && (it.kind === 'bk' || tp)) {
          person = tp;
          rkey = tr0.key;
        }
      } else if (mode === 'l') from = Math.min(t0, f0 + dd);
      else to = Math.max(f0, t0 + dd);
      g = { m: mode === 'move' ? 'move' : 'resize', it, from, to, row: rkey, person, copy: ev.altKey };
      setGhost(g);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      setGhost(null);
      const id = it.kind === 'bk' ? it.b.id : it.a.id;
      if (!moved || !g || g.m === 'create') {
        setSel({ kind: it.kind, id });
        if (it.kind === 'bk') openBk(it.b, false, ev.clientX + 12, ev.clientY - 40);
        else openAb(it.a, false, ev.clientX + 12, ev.clientY - 40);
        return;
      }
      const copy = g.copy || ev.altKey;
      if (it.kind === 'bk') {
        let nb: Booking =
          g.m === 'move' ? shiftBooking(it.b, g.from - f0) : rangeBooking(it.b, isoOf(g.from), isoOf(g.to));
        nb = { ...nb, person: g.person };
        if (copy) nb = { ...nb, id: crypto.randomUUID(), ver: '' };
        if (nb.from === it.b.from && nb.to === it.b.to && nb.person === it.b.person && !copy) return;
        mg.AL.change({ bk: [nb] });
        setSel({ kind: 'bk', id: nb.id });
      } else {
        let na: Absence = { ...it.a, from: isoOf(g.from), to: isoOf(g.to), person: g.person || it.a.person };
        if (copy) na = { ...na, id: crypto.randomUUID(), ver: '' };
        mg.AL.change({ ab: [na] });
        setSel({ kind: 'ab', id: na.id });
      }
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const startCreate = (e: React.PointerEvent, row: RowP | RowPh) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const a = dnAt(x0);
    const abs = e.shiftKey && row.k === 'p';
    const person = row.k === 'p' ? row.p.id : '';
    let g: Ghost | null = null;
    let moved = false;
    setSel(null);
    const mv = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - x0) < 4) return;
      moved = true;
      autoScroll(ev.clientX, ev.clientY);
      const b = dnAt(ev.clientX);
      g = { m: 'create', row: row.key, person, a: Math.min(a, b), b: Math.max(a, b), abs };
      setGhost(g);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      setGhost(null);
      if (!moved || !g || g.m !== 'create') return;
      create(g.person, g.a, g.b, g.abs, row, ev.clientX + 14, ev.clientY - 60);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const create = (person: string, a: Dn, b: Dn, abs: boolean, row: Row | null, cx: number, cy: number) => {
    if (abs && person) {
      openAb(
        {
          id: crypto.randomUUID(),
          person,
          type: 'ferias',
          from: isoOf(a),
          to: isoOf(b),
          hours: null,
          note: '',
          ver: '',
        },
        true,
        cx,
        cy,
      );
      return;
    }
    // the group's project, else the person's latest project, else the last one used
    const mine = mg.BK.filter((x) => x.person === person && x.status === 'confirmed');
    const proj =
      (row?.k === 'p' && row.gp) ||
      (row?.k === 'ph' && row.b.project) ||
      mine.sort((x, y) => y.to.localeCompare(x.to))[0]?.project ||
      lastProject.current ||
      mg.PJ.find((p) => p.status !== 'Concluído')?.id ||
      '';
    const weekend = wdOf(a) >= 5 && a === b;
    openBk(
      {
        id: crypto.randomUUID(),
        person,
        project: proj,
        role: row?.k === 'ph' ? row.b.role : '',
        status: 'confirmed',
        from: isoOf(a),
        to: isoOf(b),
        mode: 'hpd',
        value: 8,
        // a single weekend day (cutover) gets that day in the mask; a holiday too
        mask: weekend ? 1 << wdOf(a) : 0b0011111,
        hol: a === b && !!holidayOf(a),
        note: '',
        need: row?.k === 'ph' ? row.b.need : [],
        days: {},
        ver: '',
      },
      true,
      cx,
      cy,
    );
  };
  useEffect(() => {
    lastProject.current = lastProject.current || (mg.BK.at(-1)?.project ?? '');
  }, [mg.BK]);

  // ── keyboard ──
  const selItem = (): Item | null => {
    if (!sel) return null;
    if (sel.kind === 'bk') {
      const b = mg.BK.find((x) => x.id === sel.id);
      return b ? { kind: 'bk', b } : null;
    }
    const a = mg.AB.find((x) => x.id === sel.id);
    return a ? { kind: 'ab', a } : null;
  };
  const del = (it: Item) =>
    it.kind === 'bk' ? mg.AL.change({ delBk: [it.b.id] }) : mg.AL.change({ delAb: [it.a.id] });
  const split = (b: Booking, n: Dn) => {
    const s = splitBooking(b, n);
    if (s) mg.AL.change({ bk: s });
  };
  const onKey = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) mg.AL.redo();
      else mg.AL.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      mg.AL.redo();
      return;
    }
    const it = selItem();
    if (!it) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      del(it);
      setSel(null);
    } else if (e.key === 'Escape') setSel(null);
    else if (e.key === 'Enter') {
      const el = document.querySelector(`[data-item="${it.kind === 'bk' ? it.b.id : it.a.id}"]`);
      const r = el?.getBoundingClientRect();
      if (it.kind === 'bk') openBk(it.b, false, (r?.left ?? 300) + 20, (r?.bottom ?? 200) + 8);
      else openAb(it.a, false, (r?.left ?? 300) + 20, (r?.bottom ?? 200) + 8);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const k = e.key === 'ArrowLeft' ? -1 : 1;
      if (it.kind === 'bk') {
        const b = it.b;
        const nb = e.shiftKey
          ? rangeBooking(b, b.from, isoOf(Math.max(dnOf(b.from), dnOf(b.to) + k)))
          : shiftBooking(b, k);
        mg.AL.change({ bk: [nb] });
      } else {
        const a = it.a;
        mg.AL.change({
          ab: [
            e.shiftKey
              ? { ...a, to: isoOf(Math.max(dnOf(a.from), dnOf(a.to) + k)) }
              : { ...a, from: isoOf(dnOf(a.from) + k), to: isoOf(dnOf(a.to) + k) },
          ],
        });
      }
    } else if (it.kind === 'bk' && e.key.toLowerCase() === 't' && !mod) {
      mg.AL.change({ bk: [{ ...it.b, status: it.b.status === 'tentative' ? 'confirmed' : 'tentative' }] });
    } else if (it.kind === 'bk' && e.key.toLowerCase() === 's' && !mod) {
      split(it.b, hoverDn.current);
    } else if (it.kind === 'bk' && mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      const len = dnOf(it.b.to) - dnOf(it.b.from) + 1;
      const nb = { ...shiftBooking(it.b, len), id: crypto.randomUUID(), ver: '' };
      mg.AL.change({ bk: [nb] });
      setSel({ kind: 'bk', id: nb.id });
    }
  };

  const ctxItem = (e: React.MouseEvent, it: Item) => {
    e.preventDefault();
    e.stopPropagation();
    const n = dnAt(e.clientX);
    setSel({ kind: it.kind, id: it.kind === 'bk' ? it.b.id : it.a.id });
    const items: Menu['items'] =
      it.kind === 'bk'
        ? [
            [tr('Editar…'), () => openBk(it.b, false, e.clientX + 10, e.clientY - 30), '↵'],
            [tr('Dividir aqui'), () => split(it.b, n), 'S'],
            [
              tr('Duplicar a seguir'),
              () => {
                const len = dnOf(it.b.to) - dnOf(it.b.from) + 1;
                mg.AL.change({ bk: [{ ...shiftBooking(it.b, len), id: crypto.randomUUID(), ver: '' }] });
              },
              'Ctrl D',
            ],
            [
              it.b.status === 'tentative' ? tr('Confirmar') : tr('Marcar como tentativo'),
              () =>
                mg.AL.change({
                  bk: [{ ...it.b, status: it.b.status === 'tentative' ? 'confirmed' : 'tentative' }],
                }),
              'T',
            ],
            [
              tr('Pôr por atribuir'),
              () => mg.AL.change({ bk: [{ ...it.b, person: '', role: it.b.role || tr('Por atribuir') }] }),
            ],
            null,
            [tr('Eliminar'), () => del(it), 'Del'],
          ]
        : [
            [tr('Editar…'), () => openAb(it.a, false, e.clientX + 10, e.clientY - 30), '↵'],
            [tr('Eliminar'), () => del(it), 'Del'],
          ];
    setMenu({ x: e.clientX, y: e.clientY, items });
  };
  const ctxEmpty = (e: React.MouseEvent, row: RowP | RowPh) => {
    e.preventDefault();
    const n = dnAt(e.clientX);
    const person = row.k === 'p' ? row.p.id : '';
    const mon = n - wdOf(n);
    const items: Menu['items'] = [
      [tr('Nova alocação neste dia'), () => create(person, n, n, false, row, e.clientX + 10, e.clientY - 40)],
      [
        tr('Nova alocação nesta semana'),
        () => create(person, mon, mon + 4, false, row, e.clientX + 10, e.clientY - 40),
      ],
    ];
    if (row.k === 'p') {
      items.push(null);
      items.push([
        tr('Marcar ausência neste dia'),
        () => create(person, n, n, true, row, e.clientX + 10, e.clientY - 40),
        'Shift+arrastar',
      ]);
      items.push([
        tr('Marcar férias nesta semana'),
        () => create(person, mon, mon + 4, true, row, e.clientX + 10, e.clientY - 40),
      ]);
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  // ── render ──
  // the columns in view (and a little around)
  const vcols = cols.filter((c) => x(c.b) + ppd >= xa && x(c.a) <= xb);
  const holidays = useMemo(() => {
    const out: Dn[] = [];
    if (zoom === 'month') return out;
    for (let n = F; n <= T; n++) if (holidayOf(n) && wdOf(n) < 5) out.push(n);
    return out;
  }, [F, T, zoom]);
  const bgStyle: React.CSSProperties = (() => {
    const off = -wdOf(F) * ppd;
    const layers: string[] = [];
    const pos: string[] = [];
    if (zoom !== 'month') {
      layers.push(
        `repeating-linear-gradient(90deg, transparent 0 ${5 * ppd}px, rgb(var(--d) / calc(.18 * var(--d-k))) ${5 * ppd}px ${7 * ppd}px)`,
      );
      pos.push(`${off}px 0`);
    }
    if (zoom === 'day') {
      layers.push(`repeating-linear-gradient(90deg, rgb(var(--w) / .045) 0 1px, transparent 1px ${ppd}px)`);
      pos.push('0 0');
    }
    if (zoom === 'week') {
      layers.push(
        `repeating-linear-gradient(90deg, rgb(var(--w) / .07) 0 1px, transparent 1px ${7 * ppd}px)`,
      );
      pos.push(`${off}px 0`);
    }
    return {
      left: nameW,
      top: HEAD,
      width,
      height: rows.height,
      backgroundImage: layers.join(','),
      backgroundPosition: pos.join(','),
    };
  })();
  const monthLines = useMemo(() => {
    const out: Dn[] = [];
    for (let m = monthStart(F, 1); m <= T; m = monthStart(m, 1)) out.push(m);
    return out;
  }, [F, T]);

  const barStyle = (b: Booking): React.CSSProperties => {
    const c = mg.pjById[b.project]?.color ?? 'oklch(0.75 0.05 60)';
    return b.status === 'tentative'
      ? { background: `color-mix(in oklch, ${c} 38%, transparent)`, border: `1.5px dashed ${c}` }
      : { background: c };
  };
  const renderBar = (it: Item, lane: number, row: Row, fromS: string, toS: string, ghostly = false) => {
    const f = Math.max(F, dnOf(fromS));
    const t = Math.min(T, dnOf(toS));
    if (t < f) return null;
    const left = x(f) + 2;
    const w = Math.max(8, (t - f + 1) * ppd - 4);
    if (!ghostly && (left + w < xa || left > xb)) return null;
    const top = 8 + lane * LANE;
    const id = it.kind === 'bk' ? it.b.id : it.a.id;
    const isSel = !ghostly && sel?.id === id;
    if (it.kind === 'ab') {
      const a = it.a;
      return (
        <div
          key={`${id}${ghostly ? 'g' : ''}`}
          data-item={id}
          className={`al-bar abs${isSel ? ' sel' : ''}${ghostly ? ' ghost' : ''}`}
          style={{
            left,
            top,
            width: w,
            paddingLeft: 8 + Math.max(0, Math.min(view.l + nameW - left, w - 90)),
          }}
          title={`${tr(ABS_LABEL[a.type]!)} · ${a.from} → ${a.to}${a.hours != null ? ` · ${fmtNum(a.hours, lang)}h` : ''}${a.note ? ` · ${a.note}` : ''}`}
          onPointerDown={(e) => startItem(e, it, 'move', row)}
          onContextMenu={(e) => ctxItem(e, it)}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
          {w > 50 && tr(ABS_LABEL[a.type]!)}
          {w > 120 && (
            <span
              style={{ fontWeight: 500, opacity: 0.75 }}
            >{`${dnOf(a.from) === dnOf(a.to) ? isoOf(dnOf(a.from)).slice(8) : `${+a.from.slice(8)}–${+a.to.slice(8)}`}`}</span>
          )}
          {!ghostly && <span className="h l" onPointerDown={(e) => startItem(e, it, 'l', row)} />}
          {!ghostly && <span className="h r" onPointerDown={(e) => startItem(e, it, 'r', row)} />}
        </div>
      );
    }
    const b = it.b;
    const pj = mg.pjById[b.project];
    const code = pj?.code ?? '?';
    // the label stays in view when the bar starts left of it
    const pad = Math.max(0, Math.min(view.l + nameW - left, w - 120));
    return (
      <div
        key={`${id}${ghostly ? 'g' : ''}`}
        data-item={id}
        className={`al-bar${b.status === 'tentative' ? ' tent' : ''}${isSel ? ' sel' : ''}${ghostly ? ' ghost' : ''}`}
        style={{ left, top, width: w, paddingLeft: 8 + pad, ...barStyle(b) }}
        title={`${code} · ${pj?.name ?? ''}\n${effortLabel(b, lang)} · ${b.from} → ${b.to}${b.role ? `\n${b.role}` : ''}${b.status === 'tentative' ? `\n${tr('tentativo')}` : ''}`}
        onPointerDown={(e) => startItem(e, it, 'move', row)}
        onContextMenu={(e) => ctxItem(e, it)}
        onPointerMove={(e) => (hoverDn.current = dnAt(e.clientX))}
      >
        {w > 44 ? code : code.split('-')[0]}
        {w > 90 && <span className="ef">{effort(b)}</span>}
        {w > 170 && b.role && row.k !== 'ph' && <span className="fn">· {b.role}</span>}
        {w > 170 && row.k === 'ph' && <span className="fn">· {fmtNum(eqOf(b).total, lang)}h</span>}
        {b.status === 'tentative' && w > 240 && <span className="tag">{tr('tentativo')}</span>}
        {!ghostly && <span className="h l" onPointerDown={(e) => startItem(e, it, 'l', row)} />}
        {!ghostly && <span className="h r" onPointerDown={(e) => startItem(e, it, 'r', row)} />}
      </div>
    );
  };

  const nameCell = (row: RowP | RowPh) => {
    if (row.k === 'ph') {
      const pj = mg.pjById[row.b.project];
      return (
        <div className="al-name" onClick={(e) => openBk(row.b, false, e.clientX + 20, e.clientY - 30)}>
          <span className="al-ph-av">?</span>
          <span className="txt">
            <span className="nm">{row.b.role || tr('Por atribuir')}</span>
            <span className="rl">
              {pj?.code} · {+row.b.from.slice(8)} {mgMon(row.b.from)} → {+row.b.to.slice(8)} {mgMon(row.b.to)}
            </span>
          </span>
        </div>
      );
    }
    const p = row.p;
    const l = mg.loads(p.id);
    const conf = sumDays(l.conf, l, visA, visB);
    const cap = sumDays(l.cap, l, visA, visB);
    const bd = loadBand(conf, cap);
    let overDays = 0;
    for (let n = Math.max(visA, l.from); n <= Math.min(visB, l.to); n++) {
      const i = n - l.from;
      if (l.cap[i]! > 0 && l.conf[i]! > l.cap[i]! + 0.001) overDays++;
    }
    const pct = cap ? Math.round((conf / cap) * 100) : 0;
    const sub = (() => {
      // "Livre a partir de 19 nov" when the person has nothing confirmed after a day in view
      return `${tr(p.role)} · ${mg.LV[p.level]}${+p.cap !== 40 ? ` · ${fmtNum(+p.cap, lang)}h/${lang === 'en' ? 'wk' : 'sem'}` : ''}`;
    })();
    return (
      <div className="al-name" onClick={() => mg.nav('mg_people', { p: p.id })} title={tr('Abrir ficha')}>
        <Av p={p} size={32} fs={11.5} tc={mg.tOf(p).tc} />
        <span className="txt">
          <span className="nm">{p.name}</span>
          <span className="rl">{sub}</span>
        </span>
        <span className="badge">
          <span
            className="al-pct"
            style={{ background: BAND_BG[bd], color: bd ? BAND_FG[bd] : 'var(--ink)' }}
          >
            {pct}%
          </span>
          {overDays > 0 && (
            <span className="al-over">+{tr(overDays === 1 ? '1 dia' : `${overDays} dias`)}</span>
          )}
        </span>
      </div>
    );
  };
  const mgMon = (s: string) =>
    new Date(`${s}T00:00:00Z`)
      .toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT', { month: 'short', timeZone: 'UTC' })
      .replace('.', '');

  const strip = (row: RowP) => {
    const l = mg.loads(row.p.id);
    return vcols.map((c) => {
      const conf = sumDays(l.conf, l, c.a, c.b);
      const cap = sumDays(l.cap, l, c.a, c.b);
      if (!conf && !cap) return null;
      const bd = cap ? loadBand(conf, cap) : conf ? -1 : 0;
      const over = cap > 0 && conf > cap + 0.001;
      const left = x(c.a) + 1;
      const w = (c.b - c.a + 1) * ppd - 2;
      return (
        <span
          key={c.a}
          className={`al-strip${over ? ' over' : ''}`}
          title={`${fmtNum(conf, lang)}h / ${fmtNum(cap, lang)}h`}
          style={{
            left,
            width: w,
            background: bd < 0 ? 'var(--accent)' : bd ? BAND_BG[bd] : 'rgb(var(--w) / .08)',
          }}
        />
      );
    });
  };

  const totalH = HEAD + rows.height;
  const todayX =
    x(today) +
    (zoom === 'day' ? ppd * ((new Date().getHours() + new Date().getMinutes() / 60) / 24) : ppd / 2);
  return (
    <div className="al-well" tabIndex={0} onKeyDown={onKey} aria-label={tr('Timeline de alocações')}>
      <div className="al-scroll" ref={scRef} onScroll={onUserScroll} data-al-scroll>
        <div className="al-canvas" style={{ width: nameW + width, height: totalH }}>
          {/* header */}
          <div className="al-hdr" style={{ height: HEAD, width: nameW + width }}>
            <div className="al-corner">{groupBy === 'none' ? tr('Pessoa') : tr('Pessoa')}</div>
            {vcols.map((c, i) => {
              const w = (c.b - c.a + 1) * ppd;
              return (
                <div
                  key={c.a}
                  className={`al-hcol${c.top && i ? ' newgrp' : ''}${c.today ? ' today' : ''}${c.hol && zoom === 'day' ? ' hol' : ''}${c.weekend ? ' we' : ''}${w < 34 ? ' narrow' : ''}`}
                  style={{ left: x(c.a), width: w }}
                  data-day={isoOf(c.a)}
                  title={c.hol ? holidayName(c.hol, lang) : undefined}
                >
                  {c.top && <span className="top">{c.top}</span>}
                  <span className="lbl">{c.lbl}</span>
                  {c.sub && (zoom === 'day' || zoom === 'week') && (
                    <span
                      className="sub"
                      style={c.hol && zoom === 'week' ? { color: 'var(--al-hol)' } : undefined}
                    >
                      {zoom === 'week' && c.hol ? tr('feriado') : c.sub}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="al-bg" style={bgStyle} />
          {zoom !== 'day' &&
            monthLines.map((m) => (
              <span
                key={m}
                className="al-vline"
                style={{ left: x(m), top: HEAD, height: rows.height, background: 'rgb(var(--w) / .12)' }}
              />
            ))}
          {holidays.map((n) => (
            <span
              key={n}
              className="al-holcol"
              title={holidayName(holidayOf(n)!, lang)}
              style={{ left: x(n), top: HEAD, width: ppd, height: rows.height }}
            />
          ))}
          {today >= F && today <= T && (
            <span className="al-todayline" style={{ left: todayX, top: HEAD, height: rows.height }} />
          )}
          {/* rows */}
          {rows.list.map((row) => {
            if (row.y + row.h < ya || row.y > yb) return null;
            if (row.k === 'g')
              return (
                <div key={row.key} className="al-group" style={{ top: HEAD + row.y, width: nameW + width }}>
                  <button
                    type="button"
                    className="g"
                    aria-expanded={!collapsed[row.key]}
                    onClick={() => setCollapsed({ ...collapsed, [row.key]: !collapsed[row.key] })}
                  >
                    <span style={{ fontSize: 9 }}>{collapsed[row.key] ? '▸' : '▾'}</span>
                    <i style={{ background: row.dot }} />
                    {row.label}
                    <span className="c">{row.count}</span>
                  </button>
                </div>
              );
            const isDrop = ghost && ghost.m !== 'create' && ghost.row === row.key && ghost.m === 'move';
            return (
              <div
                key={row.key}
                className={`al-row${isDrop ? ' drop' : ''}`}
                style={{ top: HEAD + row.y, height: row.h, width: nameW + width }}
                data-row={row.k === 'p' ? row.p.id : 'ph'}
              >
                <div
                  className="al-track"
                  style={{ left: nameW, width }}
                  onPointerDown={(e) => startCreate(e, row)}
                  onPointerMove={(e) => (hoverDn.current = dnAt(e.clientX))}
                  onDoubleClick={(e) => {
                    const n = dnAt(e.clientX);
                    create(row.k === 'p' ? row.p.id : '', n, n, false, row, e.clientX + 12, e.clientY - 40);
                  }}
                  onContextMenu={(e) => ctxEmpty(e, row)}
                />
                {row.k === 'p' && strip(row)}
                {row.k === 'p'
                  ? row.items.map((l) => renderBar(l.it, l.lane, row, l.from, l.to))
                  : renderBar({ kind: 'bk', b: row.b }, 0, row, row.b.from, row.b.to)}
                {ghost && ghost.row === row.key && ghost.m === 'create' && (
                  <>
                    <span
                      className={`al-sweep${ghost.abs ? ' abs' : ''}`}
                      style={{ left: x(ghost.a) + 2, top: 8, width: (ghost.b - ghost.a + 1) * ppd - 4 }}
                    />
                    <span className="al-tip" style={{ left: x(ghost.a), top: -14 }}>
                      {isoOf(ghost.a).slice(8)}/{isoOf(ghost.a).slice(5, 7)} → {isoOf(ghost.b).slice(8)}/
                      {isoOf(ghost.b).slice(5, 7)} · {ghost.b - ghost.a + 1} {tr('dias')}
                      {ghost.abs ? ` · ${tr('ausência')}` : ''}
                    </span>
                  </>
                )}
                {ghost && ghost.m !== 'create' && ghost.row === row.key && (
                  <>
                    {renderBar(ghost.it, 0, row, isoOf(ghost.from), isoOf(ghost.to), true)}
                    <span className="al-tip" style={{ left: x(ghost.from), top: -14 }}>
                      {isoOf(ghost.from).slice(8)}/{isoOf(ghost.from).slice(5, 7)} →{' '}
                      {isoOf(ghost.to).slice(8)}/{isoOf(ghost.to).slice(5, 7)}
                      {ghost.copy ? ` · ${tr('copiar')}` : ''}
                    </span>
                  </>
                )}
                {nameCell(row)}
              </div>
            );
          })}
          {!rows.list.length && (
            <div className="al-empty" style={{ position: 'absolute', top: HEAD + 20, left: 0, right: 0 }}>
              {tr('Ninguém com estes filtros.')}
            </div>
          )}
        </div>
      </div>
      {menu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 305 }}
            onPointerDown={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <div
            className="al-menu"
            role="menu"
            style={{
              left: Math.min(menu.x, window.innerWidth - 240),
              top: Math.min(menu.y, window.innerHeight - 280),
            }}
          >
            {menu.items.map((m, i) =>
              m ? (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  autoFocus={i === 0}
                  onClick={() => {
                    setMenu(null);
                    m[1]();
                  }}
                >
                  {m[0]}
                  {m[2] && <span className="k al-kbd">{m[2]}</span>}
                </button>
              ) : (
                <hr key={i} />
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
}
