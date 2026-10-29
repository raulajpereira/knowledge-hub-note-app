'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AL_MASK_ALL,
  bookingSeries,
  dayCap,
  dnOf,
  eligible,
  fmtNum,
  holidayName,
  holidayOf,
  isoOf,
  loadBand,
  monthStart,
  roundStep,
  spread,
  sumDays,
  todayIso,
  wdOf,
  weeklyOf,
  type Booking,
  type Dn,
  type Zoom,
} from '@/lib/alloc';
import type { MgPerson } from '@/lib/mg';
import { Av } from '../ui';
import type { Mg } from '../store';
import { Floating } from './Popovers';
import {
  ABS_LABEL,
  BAND_BG,
  BAND_FG,
  bands,
  columns,
  groupOfArea,
  newBooking,
  stdHours,
  stdWorkDays,
  wdShort,
  type Col,
} from './shared';
import type { GroupBy, Nav } from './Timeline';

export type GUnit = 'h' | 'pct' | 'fte';
const COLW: Record<Zoom, number> = { day: 52, week: 66, month: 74, quarter: 96 };
const HEAD = 78;
const NAMEW = 262;

type GRow =
  | { k: 'g'; key: string; label: string; dot: string; sub: string; people: string[] }
  | { k: 'p'; key: string; p: MgPerson; open: boolean }
  | {
      k: 's';
      key: string;
      person: string;
      project: string;
      status: Booking['status'];
      bks: Booking[];
      role: string;
    }
  | { k: 'ph'; key: string; b: Booking }
  | { k: 'add'; key: string; person: string };
type Sel = { r0: number; c0: number; r1: number; c1: number };
type Apply = { v: number; x: number; y: number };
type Target = { person: string; project: string; status: Booking['status']; bks: Booking[] };

const r1 = (x: number) => Math.round(x * 10) / 10;
/** The first weekday holiday of a column. */
const holDay = (c: Col): Dn => {
  for (let n = c.a; n <= c.b; n++) if (wdOf(n) < 5 && holidayOf(n)) return n;
  return c.a;
};

// Grelha (concept B): people × periods, open into person × project; type in
// a cell to set the hours of that period (spread over its working days and
// kept as typed days), select several to fill or distribute.
export function Grid({
  mg,
  zoom,
  unit,
  win,
  setWin,
  people,
  groupBy,
  bkFilter,
  showPh,
  nav,
  onView,
  openBk,
}: {
  mg: Mg;
  zoom: Zoom;
  unit: GUnit;
  win: [Dn, Dn];
  setWin: (w: [Dn, Dn]) => void;
  people: MgPerson[];
  groupBy: GroupBy;
  bkFilter: (b: Booking) => boolean;
  showPh: boolean;
  nav: Nav;
  onView: (a: Dn, b: Dn) => void;
  openBk: (b: Booking, isNew: boolean, x: number, y: number) => void;
}) {
  const { tr, lang } = mg;
  const [F, T] = win;
  const colW = COLW[zoom];
  const scRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ l: 0, w: 1100, t: 0, h: 600 });
  const [openP, setOpenP] = useState<Record<string, boolean>>({});
  const [cur, setCur] = useState<{ r: number; c: number } | null>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const [edit, setEdit0] = useState<{ r: number; c: number; v: string } | null>(null);
  // the cell being typed, also for keys that arrive before its input has focus
  const editRef = useRef<{ r: number; c: number; v: string } | null>(null);
  const setEdit = (e: { r: number; c: number; v: string } | null) => {
    editRef.current = e;
    setEdit0(e);
  };
  const [apply, setApply] = useState<Apply | null>(null);
  const [dayEd, setDayEd] = useState<{ r: number; c: number; x: number; y: number } | null>(null);
  const [fill, setFill] = useState<number | null>(null);
  const today = dnOf(todayIso());
  const cols = useMemo(() => columns(zoom, F, T, lang, (k) => holidayName(k, lang)), [zoom, F, T, lang]);
  useEffect(() => {
    mg.AL.ensure(cols[0]?.a ?? F, cols.at(-1)?.b ?? T);
  }, [cols, F, T, mg.AL]);

  // ── rows ──
  const rows = useMemo(() => {
    const out: GRow[] = [];
    const A = isoOf(cols[0]?.a ?? F);
    const B = isoOf(cols.at(-1)?.b ?? T);
    const inWin = (b: Booking) => b.to >= A && b.from <= B && bkFilter(b);
    if (showPh) {
      const ph = mg.BK.filter((b) => !b.person && inWin(b));
      if (ph.length) {
        out.push({
          k: 'g',
          key: 'g|ph',
          label: tr('Por atribuir'),
          dot: 'rgb(var(--w) / .6)',
          sub: tr(`${ph.length} perfis`),
          people: [],
        });
        for (const b of ph) out.push({ k: 'ph', key: `ph|${b.id}`, b });
      }
    }
    const person = (p: MgPerson) => {
      const open = !!openP[p.id];
      out.push({ k: 'p', key: `p|${p.id}`, p, open });
      if (!open) return;
      const m = new Map<string, Booking[]>();
      for (const b of mg.BK)
        if (b.person === p.id && inWin(b))
          m.set(`${b.project}|${b.status}`, [...(m.get(`${b.project}|${b.status}`) ?? []), b]);
      for (const [k, bks] of [...m].sort((a, b) => a[0].localeCompare(b[0]))) {
        const [project, status] = k.split('|') as [string, Booking['status']];
        out.push({
          k: 's',
          key: `s|${p.id}|${k}`,
          person: p.id,
          project,
          status,
          bks,
          role: bks.map((b) => b.role).filter(Boolean)[0] ?? '',
        });
      }
      out.push({ k: 'add', key: `add|${p.id}`, person: p.id });
    };
    const grp = (key: string, label: string, dot: string, ps: MgPerson[]) => {
      if (!ps.length) return;
      out.push({ k: 'g', key, label, dot, sub: '', people: ps.map((p) => p.id) });
      ps.forEach(person);
    };
    if (groupBy === 'module') {
      const gm = new Map<string, MgPerson[]>();
      for (const p of people) gm.set(groupOfArea(p.area), [...(gm.get(groupOfArea(p.area)) ?? []), p]);
      for (const [g, ps] of gm) grp(`g|${g}`, g, 'oklch(0.8 0.1 200)', ps);
    } else if (groupBy === 'none') people.forEach(person);
    else {
      // by team (also when the timeline groups by project / client)
      for (const t of mg.TEAMS)
        grp(
          `g|${t.id}`,
          tr(t.name),
          t.color,
          people.filter((p) => p.team === t.id),
        );
      grp(
        'g|',
        tr('Sem equipa'),
        'rgb(var(--w) / .4)',
        people.filter((p) => !mg.tById[p.team]),
      );
    }
    return out;
  }, [mg.BK, mg.TEAMS, mg.tById, people, groupBy, showPh, openP, bkFilter, cols, F, T, tr]);
  const rowH = (r: GRow) => (r.k === 'p' ? 50 : r.k === 'g' ? 44 : r.k === 'add' ? 30 : 34);
  const layout = useMemo(() => {
    let y = 0;
    return rows.map((r) => {
      const o = { y, h: rowH(r) };
      y += o.h;
      return o;
    });
  }, [rows]);
  const totalH = layout.length ? layout.at(-1)!.y + layout.at(-1)!.h : 0;
  const editable = (r: GRow | undefined) => r?.k === 's' || r?.k === 'ph';

  // ── values ──
  const capOf = useCallback(
    (pid: string, c: { a: Dn; b: Dn }) => {
      if (!pid) return stdHours(c.a, c.b);
      const l = mg.loads(pid);
      return sumDays(l.cap, l, c.a, c.b);
    },
    [mg],
  );
  const bkSum = (bks: Booking[], c: { a: Dn; b: Dn }) => {
    let t = 0;
    for (const b of bks) {
      const s = mg.series(b);
      for (let n = Math.max(c.a, s.from); n <= Math.min(c.b, s.from + s.h.length - 1); n++)
        t += s.h[n - s.from]!;
    }
    return r1(t);
  };
  const typedIn = (bks: Booking[], c: Col) =>
    bks.some((b) => Object.keys(b.days).some((d) => d >= isoOf(c.a) && d <= isoOf(c.b)));
  /** hours → the unit shown */
  const toUnit = (h: number, pid: string, c: Col) => {
    if (unit === 'h') return h;
    if (unit === 'fte') {
      const s = stdHours(c.a, c.b);
      return s ? h / s : 0;
    }
    const cap = capOf(pid, c);
    return cap ? (h / cap) * 100 : 0;
  };
  const fmtU = (h: number, pid: string, c: Col) => {
    const v = toUnit(h, pid, c);
    if (unit === 'pct') return `${Math.round(v)}%`;
    // a little that rounds to 0 still shows it is there
    if (v > 0 && v < 0.05) return lang === 'en' ? '<0.1' : '<0,1';
    return fmtNum(v, lang, 1);
  };
  const fromUnit = (v: number, pid: string, c: Col) =>
    unit === 'h' ? v : unit === 'fte' ? v * stdHours(c.a, c.b) : (v / 100) * capOf(pid, c);

  // ── writing a cell: the hours of a row in a column, spread over its working days ──
  const rowTarget = (r: GRow | undefined): Target | null =>
    r?.k === 's'
      ? { person: r.person, project: r.project, status: r.status, bks: r.bks }
      : r?.k === 'ph'
        ? { person: '', project: r.b.project, status: r.b.status, bks: [r.b] }
        : null;
  const planCell = (r: GRow, c: Col, hours0: number, acc: Map<string, Booking>) => {
    const t = rowTarget(r);
    if (!t) return;
    const hours = roundStep(hours0);
    const curB = t.bks.map((b) => acc.get(b.id) ?? b);
    let over = curB.filter((b) => dnOf(b.to) >= c.a && dnOf(b.from) <= c.b);
    if (!over.length && r.k === 'ph' && hours) {
      // a role "Por atribuir" is one booking: it grows to the column (the days in between give 0)
      const b = curB[0]!;
      const days = { ...b.days };
      const from = Math.min(dnOf(b.from), c.a);
      const to = Math.max(dnOf(b.to), c.b);
      for (let n = from; n <= to; n++)
        if ((n < dnOf(b.from) || n > dnOf(b.to)) && (n < c.a || n > c.b)) days[isoOf(n)] = 0;
      const grown = { ...b, from: isoOf(from), to: isoOf(to), days };
      acc.set(b.id, grown);
      over = [grown];
    }
    if (!over.length) {
      if (!hours) return;
      // nothing there yet: a new booking with this total over the column
      let mask = 0b0011111;
      let hol = false;
      let any = false;
      for (let n = c.a; n <= c.b; n++) any ||= eligible({ mask, hol, person: t.person }, n, mg.env);
      if (!any) {
        mask = AL_MASK_ALL;
        hol = true;
      }
      const nb = newBooking({
        person: t.person,
        project: t.project,
        status: t.status,
        from: isoOf(c.a),
        to: isoOf(c.b),
        mode: 'total',
        value: hours,
        mask,
        hol,
        role: r.k === 's' ? r.role : '',
      });
      acc.set(nb.id, nb);
      return;
    }
    const [first, ...rest] = over;
    const s0 = bookingSeries(first!, mg.env);
    const lo = Math.max(c.a, dnOf(first!.from));
    const hi = Math.min(c.b, dnOf(first!.to));
    const weekly = t.person ? weeklyOf(mg.env.weekly(t.person)) : 40;
    const abs = t.person ? mg.env.absences(t.person) : [];
    const days: Dn[] = [];
    for (let n = lo; n <= hi; n++) if (dayCap(weekly, n, abs) > 0) days.push(n);
    if (!days.length) for (let n = lo; n <= hi; n++) days.push(n);
    const share = spread(days.map(() => hours / days.length));
    const nd = { ...first!.days };
    for (let n = lo; n <= hi; n++) {
      const i = days.indexOf(n);
      const want = i >= 0 ? share[i]! : 0;
      const rule = s0.h[n - s0.from] ?? 0;
      if (want === rule && nd[isoOf(n)] === undefined) continue;
      nd[isoOf(n)] = Math.min(24, want);
    }
    acc.set(first!.id, { ...first!, days: nd });
    // the row's other bookings give nothing in this column
    for (const b of rest) {
      const s = bookingSeries(b, mg.env);
      const d2 = { ...b.days };
      for (let n = Math.max(c.a, dnOf(b.from)); n <= Math.min(c.b, dnOf(b.to)); n++)
        if ((s.h[n - s.from] ?? 0) > 0) d2[isoOf(n)] = 0;
      acc.set(b.id, { ...b, days: d2 });
    }
  };
  const writeCells = (cells: Array<{ r: number; c: number; hours: number }>) => {
    const acc = new Map<string, Booking>();
    for (const x of cells) {
      const row = rows[x.r];
      const col = cols[x.c];
      if (row && col && editable(row)) planCell(row, col, x.hours, acc);
    }
    if (acc.size) mg.AL.change({ bk: [...acc.values()] });
  };
  const cellHours = (r: GRow, c: Col) => {
    const t = rowTarget(r);
    return t ? bkSum(t.bks, c) : 0;
  };

  // ── scroll / view ──
  const onScroll = useCallback(() => {
    const el = scRef.current;
    if (!el) return;
    // the cells are cut at the name and Total columns (see .al-lane--g)
    el.style.setProperty('--al-sl', `${el.scrollLeft}px`);
    el.style.setProperty('--al-vw', `${el.clientWidth}px`);
    setView({ l: el.scrollLeft, w: el.clientWidth, t: el.scrollTop, h: el.clientHeight });
  }, []);
  useLayoutEffect(() => {
    const el = scRef.current;
    if (!el) return;
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onScroll]);
  const prevZ = useRef({ zoom, F });
  const first = useRef(true);
  useLayoutEffect(() => {
    const el = scRef.current;
    if (!el) return;
    if (first.current || prevZ.current.zoom !== zoom) {
      first.current = false;
      const i = cols.findIndex((c) => c.b >= today);
      el.scrollLeft = Math.max(0, i * colW);
    } else if (prevZ.current.F !== F) {
      const old = columns(prevZ.current.zoom, prevZ.current.F, T, lang, () => '');
      const leftDn = old[Math.floor(el.scrollLeft / colW)]?.a ?? F;
      el.scrollLeft = Math.max(0, cols.findIndex((c) => c.b >= leftDn) * colW);
    }
    prevZ.current = { zoom, F };
    onScroll();
  }, [zoom, F, cols, colW, today, T, lang, onScroll]);
  useEffect(() => {
    const el = scRef.current;
    if (!el || !nav.n) return;
    const span = el.clientWidth - NAMEW - 84;
    if (nav.kind === 'today') {
      const i = cols.findIndex((c) => c.b >= today);
      el.scrollTo({ left: Math.max(0, i * colW), behavior: 'smooth' });
      return;
    }
    const dir = nav.kind === 'next' ? 1 : -1;
    const target = el.scrollLeft + dir * span * 0.8;
    if (target < 0) setWin([monthStart(F, zoom === 'quarter' ? -6 : -3), T]);
    else if (target + el.clientWidth > cols.length * colW + NAMEW)
      setWin([F, monthStart(T + 1, zoom === 'quarter' ? 6 : 3) - 1]);
    requestAnimationFrame(() => el.scrollBy({ left: dir * span * 0.8, behavior: 'smooth' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav]);
  const c0 = Math.max(0, Math.floor(view.l / colW) - 2);
  const c1 = Math.min(cols.length - 1, Math.ceil((view.l + view.w - NAMEW) / colW) + 2);
  const visCols = cols.slice(c0, c1 + 1);
  const va = cols[Math.max(0, Math.floor(view.l / colW))]?.a ?? F;
  const vb =
    cols[Math.max(0, Math.min(cols.length - 1, Math.floor((view.l + view.w - NAMEW - 84) / colW)))]?.b ?? T;
  useEffect(() => onView(va, vb), [va, vb, onView]);

  // ── selection & keyboard ──
  const inSel = (r: number, c: number) =>
    !!sel &&
    r >= Math.min(sel.r0, sel.r1) &&
    r <= Math.max(sel.r0, sel.r1) &&
    c >= Math.min(sel.c0, sel.c1) &&
    c <= Math.max(sel.c0, sel.c1);
  const selCells = () => {
    if (!sel) return [] as Array<{ r: number; c: number }>;
    const out: Array<{ r: number; c: number }> = [];
    for (let r = Math.min(sel.r0, sel.r1); r <= Math.max(sel.r0, sel.r1); r++)
      if (editable(rows[r]))
        for (let c = Math.min(sel.c0, sel.c1); c <= Math.max(sel.c0, sel.c1); c++) out.push({ r, c });
    return out;
  };
  const move = (dr: number, dc: number, extend: boolean) => {
    const p = cur ?? {
      r: rows.findIndex(editable),
      c: Math.max(
        0,
        cols.findIndex((c) => c.b >= today),
      ),
    };
    if (p.r < 0) return;
    let r = p.r + dr;
    while (r >= 0 && r < rows.length && !editable(rows[r])) r += dr || 1;
    if (r < 0 || r >= rows.length) r = p.r;
    const c = Math.max(0, Math.min(cols.length - 1, p.c + dc));
    setCur({ r, c });
    setSel(extend && sel ? { ...sel, r1: r, c1: c } : { r0: r, c0: c, r1: r, c1: c });
    const el = scRef.current;
    if (el) {
      const xx = c * colW;
      const span = el.clientWidth - NAMEW - 84;
      if (xx < el.scrollLeft) el.scrollLeft = xx;
      else if (xx + colW > el.scrollLeft + span) el.scrollLeft = xx + colW - span;
      const L = layout[r];
      if (L) {
        if (L.y < el.scrollTop) el.scrollTop = L.y;
        else if (L.y + L.h + HEAD > el.scrollTop + el.clientHeight)
          el.scrollTop = L.y + L.h + HEAD - el.clientHeight;
      }
    }
  };
  const commit = (v: string, r: number, c: number, x: number, y: number) => {
    const n = Number(v.replace(',', '.'));
    setEdit(null);
    gridRef.current?.focus();
    if (!v.trim() || !Number.isFinite(n) || n < 0) return false;
    if (selCells().length > 1) {
      setApply({ v: n, x, y });
      return true;
    }
    const row = rows[r];
    const col = cols[c];
    if (!row || !col) return false;
    writeCells([{ r, c, hours: fromUnit(n, rowTarget(row)?.person ?? '', col) }]);
    return false;
  };
  const fillRight = () => {
    if (!sel) return;
    const ca = Math.min(sel.c0, sel.c1);
    const out: Array<{ r: number; c: number; hours: number }> = [];
    for (const { r, c } of selCells()) {
      if (c === ca) continue;
      const row = rows[r]!;
      const pid = rowTarget(row)?.person ?? '';
      const h = cellHours(row, cols[ca]!);
      out.push({ r, c, hours: unit === 'h' ? h : fromUnit(toUnit(h, pid, cols[ca]!), pid, cols[c]!) });
    }
    writeCells(out);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.target !== gridRef.current) return;
    const ed = editRef.current;
    if (ed && e.target === gridRef.current) {
      // typed before the cell's input took the focus
      if (/^[0-9.,]$/.test(e.key)) {
        e.preventDefault();
        setEdit({ ...ed, v: ed.v + e.key });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const el = document.querySelector(`[data-cell="${ed.r}:${ed.c}"]`)?.getBoundingClientRect();
        if (!commit(ed.v, ed.r, ed.c, el?.left ?? 400, (el?.bottom ?? 300) + 6)) move(1, 0, false);
      } else if (e.key === 'Escape') setEdit(null);
      return;
    }
    if (ed || apply || dayEd) return;
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
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      fillRight();
      return;
    }
    const k: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      Tab: [0, 1],
    };
    if (k[e.key]) {
      e.preventDefault();
      const [dr, dc] = k[e.key]!;
      move(dr, e.key === 'Tab' && e.shiftKey ? -dc : dc, e.shiftKey && e.key !== 'Tab');
      return;
    }
    if (!cur) return;
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      const el = document.querySelector(`[data-cell="${cur.r}:${cur.c}"]`)?.getBoundingClientRect();
      setDayEd({ ...cur, x: el?.left ?? 400, y: (el?.bottom ?? 300) + 6 });
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      writeCells(selCells().map((x) => ({ ...x, hours: 0 })));
      return;
    }
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      if (editable(rows[cur.r])) setEdit({ ...cur, v: '' });
      return;
    }
    if (/^[0-9.,]$/.test(e.key) && editable(rows[cur.r])) {
      e.preventDefault();
      setEdit({ ...cur, v: e.key });
    }
  };
  const down = (e: React.PointerEvent, r: number, c: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    gridRef.current?.focus();
    if (e.shiftKey && cur) {
      setSel({ r0: cur.r, c0: cur.c, r1: r, c1: c });
      return;
    }
    setCur({ r, c });
    setSel({ r0: r, c0: c, r1: r, c1: c });
    const mv = (ev: PointerEvent) => {
      const t = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest(
        '[data-cell]',
      );
      const m = t?.getAttribute('data-cell')?.split(':').map(Number);
      if (m) setSel({ r0: r, c0: c, r1: m[0]!, c1: m[1]! });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  // drag the fill handle to copy the selection's last column to the right
  const fillDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!sel) return;
    const s = sel;
    const last = Math.max(s.c0, s.c1);
    let to: number | null = null;
    const mv = (ev: PointerEvent) => {
      const t = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest(
        '[data-cell]',
      );
      const m = t?.getAttribute('data-cell')?.split(':').map(Number);
      if (m && m[1]! > last) {
        to = m[1]!;
        setFill(to);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      setFill(null);
      if (to == null) return;
      const out: Array<{ r: number; c: number; hours: number }> = [];
      for (let r = Math.min(s.r0, s.r1); r <= Math.max(s.r0, s.r1); r++) {
        const row = rows[r];
        if (!editable(row)) continue;
        const h = cellHours(row!, cols[last]!);
        for (let c = last + 1; c <= to; c++) out.push({ r, c, hours: h });
      }
      writeCells(out);
      setSel({ ...s, c0: Math.min(s.c0, s.c1), c1: to });
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  /** Applies a value typed over several cells: in each one, spread over the period, or per working day. */
  const applyMode = (m: 'each' | 'dist' | 'day', v: number) => {
    const cells = selCells();
    if (!cells.length) return;
    const byRow = new Map<number, number[]>();
    for (const { r, c } of cells) byRow.set(r, [...(byRow.get(r) ?? []), c]);
    const out: Array<{ r: number; c: number; hours: number }> = [];
    for (const [r, cs] of byRow) {
      const t = rowTarget(rows[r])!;
      if (m === 'each') for (const c of cs) out.push({ r, c, hours: fromUnit(v, t.person, cols[c]!) });
      else if (m === 'dist') {
        const total = fromUnit(v, t.person, cols[cs[0]!]!);
        const w = cs.map((c) => capOf(t.person, cols[c]!));
        const sw = w.reduce((a, b) => a + b, 0);
        const sh = spread(cs.map((_, i) => (sw ? (total * w[i]!) / sw : total / cs.length)));
        cs.forEach((c, i) => out.push({ r, c, hours: sh[i]! }));
      } else {
        const cf = cols[cs[0]!]!;
        const per = fromUnit(v, t.person, cf) / (stdWorkDays(cf.a, cf.b) || 1);
        for (const c of cs) out.push({ r, c, hours: per * stdWorkDays(cols[c]!.a, cols[c]!.b) });
      }
    }
    writeCells(out);
  };

  // ── render ──
  const x = (c: number) => NAMEW + c * colW;
  const ya = view.t - 200;
  const yb = view.t + view.h + 200;
  const W = NAMEW + cols.length * colW + 84;
  const tsum = (pid: string, a: Dn, b: Dn) => {
    const l = mg.loads(pid);
    return { conf: sumDays(l.conf, l, a, b), tent: sumDays(l.tent, l, a, b), cap: sumDays(l.cap, l, a, b) };
  };
  const cellBox = (ci: number): React.CSSProperties => ({
    left: x(ci),
    width: colW,
    top: 0,
    bottom: 0,
    position: 'absolute',
  });
  const personCell = (p: MgPerson, c: Col, ci: number, ri: number) => {
    const s = tsum(p.id, c.a, c.b);
    const bd = s.cap ? loadBand(s.conf, s.cap) : s.conf ? 3 : 0;
    const absent =
      !s.conf &&
      !s.cap &&
      mg.env.absences(p.id).some((a) => dnOf(a.from) <= c.b && dnOf(a.to) >= c.a) &&
      !(zoom === 'day' && c.weekend);
    const holOnly = !s.conf && !s.cap && !!c.hol && zoom === 'day';
    return (
      <div
        key={ci}
        data-cell={`${ri}:${ci}`}
        className={`al-gcell${c.weekend ? ' we' : ''}`}
        style={cellBox(ci)}
      >
        {absent ? (
          <span className="v absent">
            {tr(
              ABS_LABEL[
                mg.env.absences(p.id).find((a) => dnOf(a.from) <= c.b && dnOf(a.to) >= c.a)?.type ?? 'outra'
              ]!,
            )}
          </span>
        ) : holOnly ? (
          <span className="v none" style={{ fontSize: 10, color: 'var(--al-hol)' }}>
            {tr('feriado')}
          </span>
        ) : s.conf || s.tent ? (
          <span
            className="v"
            style={{
              background: s.conf ? BAND_BG[bd] : 'transparent',
              color: s.conf ? BAND_FG[bd] : 'var(--ink)',
              boxShadow: s.conf ? undefined : 'none',
            }}
          >
            {s.conf ? fmtU(s.conf, p.id, c) : '·'}
            {s.tent > 0 && <span className="plus">+{fmtU(s.tent, p.id, c)}</span>}
          </span>
        ) : (
          <span className="v none">{s.cap ? '·' : ''}</span>
        )}
      </div>
    );
  };
  const editCell = (row: GRow, c: Col, ci: number, ri: number) => {
    const t = rowTarget(row)!;
    const h = cellHours(row, c);
    const isCur = cur?.r === ri && cur?.c === ci;
    const isSel = inSel(ri, ci);
    const isLastSel = !!sel && ri === Math.max(sel.r0, sel.r1) && ci === Math.max(sel.c0, sel.c1) && !edit;
    const filling =
      fill != null &&
      !!sel &&
      ri >= Math.min(sel.r0, sel.r1) &&
      ri <= Math.max(sel.r0, sel.r1) &&
      ci > Math.max(sel.c0, sel.c1) &&
      ci <= fill;
    const ph = row.k === 'ph';
    return (
      <div
        key={ci}
        data-cell={`${ri}:${ci}`}
        role="gridcell"
        className={`al-gcell sub${t.status === 'tentative' ? ' tent' : ''}${c.weekend ? ' we' : ''}${isSel || filling ? ' sel' : ''}${isCur ? ' cur' : ''}`}
        style={{
          ...cellBox(ci),
          cursor: 'cell',
          outline: filling ? '1px dashed rgb(var(--w) / .5)' : undefined,
        }}
        onPointerDown={(e) => down(e, ri, ci)}
        onDoubleClick={() => setEdit({ r: ri, c: ci, v: h ? String(r1(toUnit(h, t.person, c))) : '' })}
      >
        {ph && h ? (
          <span className="v tentv" style={{ minWidth: 40, height: 24, fontSize: 12 }}>
            {fmtU(h, t.person, c)}
          </span>
        ) : h ? (
          fmtU(h, t.person, c)
        ) : (
          <span style={{ color: 'rgb(var(--t) / calc(.3 * var(--t-k)))' }}>·</span>
        )}
        {typedIn(t.bks, c) && <span className="man" title={tr('ajustado à mão')} />}
        {isLastSel && (
          <span className="fill" onPointerDown={fillDown} title={tr('Arraste para copiar para a direita')} />
        )}
      </div>
    );
  };
  const groupCells = (g: Extract<GRow, { k: 'g' }>) =>
    g.people.length
      ? visCols.map((c, k) => {
          const ci = c0 + k;
          let conf = 0;
          let cap = 0;
          for (const pid of g.people) {
            const s = tsum(pid, c.a, c.b);
            conf += s.conf;
            cap += s.cap;
          }
          if (unit === 'fte') {
            const sh = stdHours(c.a, c.b) || 1;
            const d = (cap - conf) / sh;
            return (
              <div
                key={ci}
                className="al-gcell"
                style={{ ...cellBox(ci), flexDirection: 'column', fontSize: 11.5 }}
              >
                <span>
                  {fmtNum(conf / sh, lang, 1)}/{fmtNum(cap / sh, lang, 0)}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    color:
                      d < 0 ? 'oklch(calc(.84 * var(--lk)) .13 30)' : 'oklch(calc(.86 * var(--lk)) .12 150)',
                  }}
                >
                  {d < 0 ? tr('falta') : tr('livre')} {fmtNum(Math.abs(d), lang, 1)}
                </span>
              </div>
            );
          }
          const pct = cap ? Math.round((conf / cap) * 100) : 0;
          const bd = cap ? loadBand(conf, cap) : 0;
          return (
            <div key={ci} className="al-gcell" style={cellBox(ci)}>
              {cap > 0 && (
                <span
                  className="al-pct"
                  style={{ background: BAND_BG[bd], color: bd ? BAND_FG[bd] : 'var(--ink)', fontSize: 10.5 }}
                >
                  {pct}%
                </span>
              )}
            </div>
          );
        })
      : null;
  const totals = (pid: string, bks?: Booking[]) => {
    if (bks) return <span>{fmtNum(bkSum(bks, { a: va, b: vb }), lang, 0)}h</span>;
    const s = tsum(pid, va, vb);
    return (
      <>
        <span>{fmtNum(s.conf, lang, 0)}h</span>
        <small>{s.cap ? Math.round((s.conf / s.cap) * 100) : 0}%</small>
      </>
    );
  };
  const curRow = cur ? rows[cur.r] : undefined;
  const selInfo = (() => {
    const cells = selCells();
    if (cells.length < 2) return null;
    const t = rowTarget(rows[cells[0]!.r]);
    const pj = t ? mg.pjById[t.project] : undefined;
    const p = t?.person ? mg.pById[t.person] : undefined;
    const sum = cells.reduce((s, c) => s + cellHours(rows[c.r]!, cols[c.c]!), 0);
    return { n: cells.length, label: `${pj?.code ?? ''}${p ? ` · ${p.name.split(' ')[0]}` : ''}`, sum };
  })();
  const muted = 'rgb(var(--t) / calc(.6 * var(--t-k)))';

  return (
    <>
      <div className="al-body" style={{ position: 'relative' }}>
        <div className="al-well">
          <div className="al-scroll" ref={scRef} onScroll={onScroll}>
            <div
              ref={gridRef}
              className="al-grid"
              tabIndex={0}
              role="grid"
              aria-label={tr('Grelha de alocações')}
              onKeyDown={onKey}
              style={{
                width: W,
                height: HEAD + totalH,
                ['--al-name' as string]: `${NAMEW}px`,
                ['--al-tot' as string]: '84px',
              }}
            >
              <div className="al-hdr" style={{ height: HEAD, width: W, display: 'flex' }}>
                <div
                  className="al-corner"
                  style={{
                    width: NAMEW,
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-end',
                    gap: 4,
                  }}
                >
                  <span>{tr('Pessoa / projeto')}</span>
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 500,
                      letterSpacing: 0,
                      textTransform: 'none',
                      color: muted,
                    }}
                  >
                    {tr(unit === 'fte' ? 'Área · FTE por período' : 'Equipa · ocupação confirmada')}
                  </span>
                </div>
                <div className="al-lane al-lane--g">
                  {bands(visCols).map((g) => {
                    // cut to what is between the name and Total columns
                    const l = Math.max(x(c0 + g.i), view.l + NAMEW);
                    const r = Math.min(x(c0 + g.i) + g.n * colW, view.l + view.w - 84);
                    return r - l < 24 ? null : (
                      <div key={g.a} className="al-band" style={{ left: l, width: r - l }}>
                        <span>{g.label}</span>
                      </div>
                    );
                  })}
                  {visCols.map((c, k) => {
                    const ci = c0 + k;
                    const wd = stdWorkDays(c.a, c.b);
                    return (
                      <div
                        key={ci}
                        className={`al-hcol${c.today ? ' today' : ''}${c.top && ci ? ' newgrp' : ''}${c.weekend ? ' we' : ''}${c.hol && zoom === 'day' ? ' hol' : ''}`}
                        style={{ left: x(ci), width: colW }}
                      >
                        <span className="lbl">{c.lbl}</span>
                        {(zoom === 'day' || zoom === 'week') && <span className="sub">{c.sub}</span>}
                        {zoom !== 'day' && (
                          <span
                            className="sub"
                            style={c.hol && zoom === 'week' ? { color: 'var(--al-hol)' } : undefined}
                          >
                            {c.hol && zoom === 'week'
                              ? `${tr('feriado')} ${+isoOf(holDay(c)).slice(8)}`
                              : tr(`${wd} dias`)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="al-gtot" style={{ marginLeft: 'auto', height: HEAD }}>
                  {tr('Total')}
                </div>
              </div>
              {rows.map((row, ri) => {
                const L = layout[ri]!;
                if (L.y + L.h < ya || L.y > yb) return null;
                const style: React.CSSProperties = {
                  position: 'absolute',
                  top: HEAD + L.y,
                  height: L.h,
                  width: W,
                  left: 0,
                };
                if (row.k === 'g')
                  return (
                    <div
                      key={row.key}
                      className="al-grow"
                      style={{ ...style, background: 'rgb(var(--w) / .035)' }}
                    >
                      <div className="al-gname" style={{ height: '100%' }}>
                        <i
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: row.dot,
                            flex: 'none',
                          }}
                        />
                        <span
                          style={{
                            fontSize: 13.5,
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {row.label}
                        </span>
                        <span style={{ fontSize: 11, color: muted, whiteSpace: 'nowrap' }}>
                          {row.sub || tr(`${row.people.length} pessoas`)}
                        </span>
                      </div>
                      <div className="al-lane al-lane--g">{groupCells(row)}</div>
                      <div className="al-gtot" style={{ marginLeft: 'auto', height: '100%' }} />
                    </div>
                  );
                if (row.k === 'add')
                  return (
                    <div key={row.key} className="al-grow sub" style={style}>
                      <div className="al-gname" style={{ height: '100%', paddingLeft: 50 }}>
                        <button
                          type="button"
                          className="al-hint"
                          style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
                          onClick={(e) => {
                            const mon = dnOf(mg.wk(0));
                            openBk(
                              newBooking({
                                person: row.person,
                                project: mg.PJ.find((p) => p.status !== 'Concluído')?.id ?? '',
                                from: isoOf(mon),
                                to: isoOf(mon + 4),
                              }),
                              true,
                              e.clientX + 20,
                              e.clientY - 60,
                            );
                          }}
                        >
                          + {tr(`projeto para ${mg.pById[row.person]?.name.split(' ')[0] ?? ''}…`)}
                        </button>
                      </div>
                    </div>
                  );
                if (row.k === 'p') {
                  const p = row.p;
                  return (
                    <div key={row.key} className="al-grow" style={style} data-person={p.id}>
                      <div className="al-gname" style={{ height: '100%' }}>
                        <button
                          type="button"
                          className="tw"
                          aria-expanded={row.open}
                          aria-label={`${tr(row.open ? 'Fechar' : 'Abrir')} ${p.name}`}
                          onClick={() => setOpenP({ ...openP, [p.id]: !row.open })}
                        >
                          {row.open ? '▾' : '▸'}
                        </button>
                        <Av p={p} size={32} fs={11} tc={mg.tOf(p).tc} />
                        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <span
                            style={{
                              fontSize: 13.5,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {p.name}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: muted,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {tr(p.role)} · {mg.LV[p.level]} · {fmtNum(+p.cap, lang)}h
                          </span>
                        </span>
                      </div>
                      <div className="al-lane al-lane--g">
                        {visCols.map((c, k) => personCell(p, c, c0 + k, ri))}
                      </div>
                      <div className="al-gtot" style={{ marginLeft: 'auto', height: '100%' }}>
                        {totals(p.id)}
                      </div>
                    </div>
                  );
                }
                const t = rowTarget(row)!;
                const pj = mg.pjById[t.project];
                return (
                  <div
                    key={row.key}
                    className="al-grow sub"
                    style={style}
                    data-sub={`${t.person}|${pj?.code ?? ''}`}
                  >
                    <div
                      className="al-gname"
                      style={{ height: '100%', paddingLeft: row.k === 'ph' ? 12 : 50 }}
                    >
                      {row.k === 'ph' && <span className="al-ph-av sm">?</span>}
                      <i
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: pj?.color,
                          flex: 'none',
                        }}
                      />
                      <span
                        className="al-mono"
                        style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flex: 'none' }}
                      >
                        {pj?.code}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: muted,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {row.k === 'ph'
                          ? row.b.role
                          : t.status === 'tentative'
                            ? tr('tentativo')
                            : row.role || pj?.name}
                      </span>
                    </div>
                    <div className="al-lane al-lane--g">
                      {visCols.map((c, k) => editCell(row, c, c0 + k, ri))}
                    </div>
                    <div className="al-gtot" style={{ marginLeft: 'auto', height: '100%', fontWeight: 500 }}>
                      {totals(t.person, t.bks)}
                    </div>
                  </div>
                );
              })}
              {edit &&
                (() => {
                  const L = layout[edit.r];
                  if (!L) return null;
                  return (
                    <input
                      className="al-gedit"
                      autoFocus
                      aria-label={tr('Valor')}
                      value={edit.v}
                      inputMode="decimal"
                      style={{ left: x(edit.c) + 3, top: HEAD + L.y + (L.h - 34) / 2, width: colW - 6 }}
                      onChange={(e) => setEdit({ ...edit, v: e.target.value })}
                      onBlur={() => setEdit(null)}
                      onKeyDown={(e) => {
                        // the grid's own keys are not for this input
                        e.stopPropagation();
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEdit(null);
                          gridRef.current?.focus();
                        } else if (e.key === 'Enter' || e.key === 'Tab') {
                          e.preventDefault();
                          const r = (e.target as HTMLElement).getBoundingClientRect();
                          const many = commit(edit.v, edit.r, edit.c, r.left, r.bottom + 6);
                          if (!many) move(e.key === 'Tab' ? 0 : 1, e.key === 'Tab' ? 1 : 0, false);
                        }
                      }}
                      placeholder={unit === 'h' ? 'h' : unit === 'pct' ? '%' : 'FTE'}
                    />
                  );
                })()}
            </div>
          </div>
        </div>
        {selInfo && !apply && (
          <div className="al-selbar" role="toolbar" aria-label={tr('Seleção')}>
            <b>{tr(`${selInfo.n} células`)}</b>
            <span>{selInfo.label}</span>
            <span className="al-mono">Σ {fmtNum(selInfo.sum, lang)}h</span>
            <button type="button" className="al-btn ghost sm" onClick={fillRight}>
              {tr('Preencher')}
            </button>
            <button
              type="button"
              className="al-btn ghost sm"
              onClick={(e) => {
                const r = (e.target as HTMLElement).getBoundingClientRect();
                setApply({ v: r1(toUnit(selInfo.sum, '', cols[0]!)) || 8, x: r.left - 100, y: r.top - 230 });
              }}
            >
              {tr('Distribuir')}
            </button>
            <button
              type="button"
              className="al-btn ghost sm"
              onClick={() => {
                const ids = new Map<string, Booking>();
                for (const { r, c } of selCells())
                  for (const b of rowTarget(rows[r])?.bks ?? [])
                    if (dnOf(b.to) >= cols[c]!.a && dnOf(b.from) <= cols[c]!.b) ids.set(b.id, b);
                mg.AL.change({
                  bk: [...ids.values()].map((b) => ({
                    ...b,
                    status: b.status === 'tentative' ? 'confirmed' : 'tentative',
                  })),
                });
              }}
            >
              {tr('Tentativo')}
            </button>
            <button
              type="button"
              className="al-btn ghost sm"
              onClick={() => writeCells(selCells().map((c) => ({ ...c, hours: 0 })))}
            >
              {tr('Limpar')}
            </button>
          </div>
        )}
      </div>
      <div className="al-foot">
        <span className="al-lg">
          <i style={{ background: 'var(--al-u1)' }} />
          {'< 90%'}
        </span>
        <span className="al-lg">
          <i style={{ background: 'var(--al-u2)' }} />
          90–100%
        </span>
        <span className="al-lg">
          <i style={{ background: 'var(--al-u3)' }} />
          {'> 100%'}
        </span>
        <span className="al-lg">
          <i style={{ background: 'rgb(var(--d) / calc(.35 * var(--d-k)))' }} />
          {tr('+8 tentativo')}
        </span>
        <span className="al-lg">
          <i
            style={{
              width: 0,
              height: 0,
              borderLeft: '8px solid transparent',
              borderTop: '8px solid oklch(0.72 0.17 245)',
              borderRadius: 0,
            }}
          />
          {tr('ajustado à mão')}
        </span>
        <span style={{ flex: 1 }} />
        <span className="al-hint">
          <span className="al-kbd">↑↓←→</span>
          {tr('mover')}
        </span>
        <span className="al-hint">
          <span className="al-kbd">0-9</span>
          {tr('escrever')}
        </span>
        <span className="al-hint">
          <span className="al-kbd">⇧</span>
          {tr('+setas selecionar')}
        </span>
        <span className="al-hint">
          <span className="al-kbd">Ctrl D</span>
          {tr('preencher')}
        </span>
        <span className="al-hint">
          <span className="al-kbd">Alt ↵</span>
          {tr('por dias')}
        </span>
      </div>
      {apply && sel && (
        <ApplyPop
          mg={mg}
          v={apply.v}
          x={apply.x}
          y={apply.y}
          unit={unit}
          ncols={Math.abs(sel.c1 - sel.c0) + 1}
          zoom={zoom}
          perDay={(() => {
            const c = cols[Math.min(sel.c0, sel.c1)]!;
            return stdWorkDays(c.a, c.b);
          })()}
          onClose={() => setApply(null)}
          onApply={(m, v) => {
            applyMode(m, v);
            setApply(null);
          }}
        />
      )}
      {dayEd && curRow && editable(curRow) && (
        <DayEditor
          mg={mg}
          row={rowTarget(curRow)!}
          col={cols[dayEd.c]!}
          x={dayEd.x}
          y={dayEd.y}
          onClose={() => {
            setDayEd(null);
            gridRef.current?.focus();
          }}
          openBk={openBk}
        />
      )}
    </>
  );
}

function ApplyPop({
  mg,
  v: v0,
  x,
  y,
  unit,
  ncols,
  zoom,
  perDay,
  onClose,
  onApply,
}: {
  mg: Mg;
  v: number;
  x: number;
  y: number;
  unit: GUnit;
  ncols: number;
  zoom: Zoom;
  perDay: number;
  onClose: () => void;
  onApply: (m: 'each' | 'dist' | 'day', v: number) => void;
}) {
  const { tr, lang } = mg;
  const [m, setM] = useState<'each' | 'dist' | 'day'>('each');
  const [raw, setRaw] = useState(fmtNum(v0, lang));
  const v = Number(raw.replace(',', '.')) || 0;
  const u = unit === 'h' ? 'h' : unit === 'pct' ? '%' : ' FTE';
  const per = { day: 'dia', week: 'semana', month: 'mês', quarter: 'trimestre' }[zoom];
  const opts: Array<['each' | 'dist' | 'day', string, string]> = [
    ['each', tr(`${fmtNum(v, lang)}${u} em cada ${per}`), `${fmtNum(v * ncols, lang)}${u} ${tr('no total')}`],
    [
      'dist',
      tr(`Distribuir ${fmtNum(v, lang)}${u} no período`),
      `${fmtNum(v / ncols, lang)}${u} ${tr(`por ${per}`)}`,
    ],
    ['day', tr(`Manter horas/dia (${fmtNum(v / (perDay || 1), lang)}h)`), tr('ajusta-se a feriados')],
  ];
  return (
    <Floating x={x} y={y} w={420} label={tr('Como aplicar')} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onApply(m, v);
        }}
      >
        <div className="al-pop-hd">
          <b>{tr(`Como aplicar ${fmtNum(v, lang)}${u} em ${ncols} colunas?`)}</b>
        </div>
        <div className="al-pop-bd">
          <label className="al-f">
            <span className="al-f-l">{tr('Valor')}</span>
            <input
              className="al-in mono"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              aria-label={tr('Valor')}
              inputMode="decimal"
            />
          </label>
          <div className="al-opts" role="radiogroup" aria-label={tr('Como aplicar')}>
            {opts.map(([k, l, s]) => (
              <label key={k} className={`al-opt${m === k ? ' on' : ''}`}>
                <input type="radio" name="al-apply" checked={m === k} onChange={() => setM(k)} />
                <span className="t">
                  <b>{l}</b>
                  <span>{s}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="al-pop-ft">
          <button type="button" className="al-btn ghost" onClick={onClose}>
            {tr('Cancelar')}
          </button>
          <button type="submit" className="al-btn" autoFocus>
            {tr('Aplicar')}
          </button>
        </div>
      </form>
    </Floating>
  );
}

/** Alt+Enter: the hours of each day of the cell, typed one by one. */
function DayEditor({
  mg,
  row,
  col,
  x,
  y,
  onClose,
  openBk,
}: {
  mg: Mg;
  row: Target;
  col: Col;
  x: number;
  y: number;
  onClose: () => void;
  openBk: (b: Booking, isNew: boolean, x: number, y: number) => void;
}) {
  const { tr, lang } = mg;
  const b = row.bks.find((k) => dnOf(k.to) >= col.a && dnOf(k.from) <= col.b);
  const s = b ? bookingSeries(b, mg.env) : null;
  const days: Dn[] = [];
  if (b)
    for (let n = Math.max(col.a, dnOf(b.from)); n <= Math.min(col.b, dnOf(b.to)) && days.length < 31; n++)
      days.push(n);
  const [vals, setVals] = useState<Record<number, string>>(() =>
    Object.fromEntries(days.map((n) => [n, fmtNum(s?.h[n - s.from] ?? 0, lang)])),
  );
  if (!b || !s)
    return (
      <Floating x={x} y={y} w={320} label={tr('Por dias')} onClose={onClose}>
        <div className="al-pop-hd">
          <b>{tr('Por dias')}</b>
        </div>
        <div className="al-pop-bd">
          <span className="al-note">{tr('Sem alocação neste período.')}</span>
        </div>
      </Floating>
    );
  return (
    <Floating
      x={x}
      y={y}
      w={Math.min(600, 64 + Math.min(days.length, 7) * 72)}
      label={tr('Por dias')}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const nd = { ...b.days };
          for (const n of days) {
            const v = roundStep(Number((vals[n] ?? '').replace(',', '.')));
            if (!Number.isFinite(v)) continue;
            const rule = s.h[n - s.from] ?? 0;
            if (v !== rule || nd[isoOf(n)] !== undefined) nd[isoOf(n)] = Math.min(24, v);
          }
          mg.AL.change({ bk: [{ ...b, days: nd }] });
          onClose();
        }}
      >
        <div className="al-pop-hd">
          <b>
            {mg.pjById[b.project]?.code} · {tr('horas por dia')}
          </b>
        </div>
        <div className="al-pop-bd">
          <div className="al-daygrid">
            {days.map((n, i) => (
              <label key={n} className="al-f">
                <span className="al-f-l">
                  {wdShort(n, lang)} {isoOf(n).slice(8)}
                </span>
                <input
                  className="al-in mono"
                  style={{ textAlign: 'center', padding: '0 6px' }}
                  inputMode="decimal"
                  value={vals[n] ?? ''}
                  autoFocus={i === 0}
                  onChange={(e) => setVals({ ...vals, [n]: e.target.value })}
                />
              </label>
            ))}
          </div>
        </div>
        <div className="al-pop-ft">
          <button
            type="button"
            className="al-btn ghost"
            style={{ marginRight: 'auto' }}
            onClick={(e) => {
              onClose();
              openBk(b, false, e.clientX, e.clientY);
            }}
          >
            {tr('Abrir alocação…')}
          </button>
          <button type="submit" className="al-btn">
            {tr('Guardar')}
          </button>
        </div>
      </form>
    </Floating>
  );
}
