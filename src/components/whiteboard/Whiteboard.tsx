'use client';

import { Component, type ReactNode } from 'react';
import { api, isApiFailure } from '@/lib/client/api';
import { onActivateKey, type ConfirmOptions } from '@/components/ui';
import {
  isBox,
  isLine,
  isShape,
  wbBB,
  wbEnds,
  wbId,
  wbMap,
  wbMove,
  wbPath,
  wbRemove,
  wbScale,
  wbUnion,
  WB_ACC,
  WB_FS,
  WB_INK,
  WB_PAPER,
  WB_SW,
  type Dash,
  type ElMap,
  type LineEl,
  type LinkType,
  type Pt,
  type Rect,
  type WbEl,
} from '@/lib/whiteboard';
import './whiteboard.css';

// Whiteboard.dc.html, 1:1: an SVG canvas with select/pan, pen, highlighter,
// eraser, shapes, lines/arrows that stick to shapes, text, sticky notes, app
// items and images; several boards, undo/redo, export SVG. Boards are saved to
// the server (last write wins + conflict warning); the view and the active
// board are remembered per device.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const imgSrc = (file: string) => `${BASE}/api/v1/whiteboards/images/${file}`;

type Tool =
  | 'select'
  | 'hand'
  | 'pen'
  | 'hl'
  | 'eraser'
  | 'rect'
  | 'ellipse'
  | 'diamond'
  | 'line'
  | 'arrow'
  | 'text'
  | 'sticky'
  | 'link'
  | 'image';
type Cap = 'stroke' | 'fill' | 'paper' | 'sw' | 'dash' | 'fs';
const CAP: Record<string, Cap[]> = {
  pen: ['stroke', 'sw'],
  hl: ['stroke', 'sw'],
  rect: ['stroke', 'fill', 'sw', 'dash', 'fs'],
  ellipse: ['stroke', 'fill', 'sw', 'dash', 'fs'],
  diamond: ['stroke', 'fill', 'sw', 'dash', 'fs'],
  line: ['stroke', 'sw', 'dash'],
  arrow: ['stroke', 'sw', 'dash'],
  text: ['stroke', 'fs'],
  sticky: ['paper', 'fs'],
  link: [],
  image: [],
};
const KEYS: Record<string, Tool> = {
  v: 'select',
  h: 'hand',
  p: 'pen',
  m: 'hl',
  e: 'eraser',
  r: 'rect',
  o: 'ellipse',
  d: 'diamond',
  l: 'line',
  a: 'arrow',
  t: 'text',
  s: 'sticky',
  k: 'link',
  i: 'image',
};
const IC: Record<string, string> = {
  select: '<path d="M5 3l14 7.5-6.2 1.8L10 19z"></path>',
  hand: '<path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5"></path><path d="M11 10.5V4.5a1.5 1.5 0 0 1 3 0v6"></path><path d="M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5a6 6 0 0 1-4.9-2.6L3.3 14a1.5 1.5 0 0 1 2.4-1.8L8 15"></path>',
  pen: '<path d="M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16z"></path><path d="M14 6l3 3"></path>',
  hl: '<path d="M9 11l-5 5v3h3l5-5"></path><path d="M9 11l6-6 4 4-6 6z"></path><path d="M14 20h7"></path>',
  eraser:
    '<path d="M8 20h12"></path><path d="M4.5 15.5l9.6-9.6a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H8z"></path><path d="M9 11l5 5"></path>',
  rect: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"></rect>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"></ellipse>',
  diamond: '<path d="M12 3l9 9-9 9-9-9z"></path>',
  line: '<line x1="5" y1="19" x2="19" y2="5"></line>',
  arrow: '<path d="M5 19L19 5"></path><path d="M10 5h9v9"></path>',
  text: '<path d="M5 7V5h14v2"></path><path d="M12 5v14"></path><path d="M9 19h6"></path>',
  sticky: '<path d="M4 4h16v11l-5 5H4z"></path><path d="M15 20v-5h5"></path>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"></path><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path>',
  image:
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="M20 16l-4.5-4.5L7 19.5"></path>',
  front:
    '<rect x="8" y="8" width="12" height="12" rx="2" fill="currentColor" fill-opacity=".35"></rect><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"></path>',
  back: '<rect x="4" y="4" width="12" height="12" rx="2" fill="currentColor" fill-opacity=".35"></rect><path d="M8 16v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-3"></path>',
  dup: '<rect x="8" y="8" width="12" height="12" rx="2.5"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>',
  trash: '<path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path>',
};
const Ico = ({ k, s = 18 }: { k: string; s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    dangerouslySetInnerHTML={{ __html: IC[k]! }}
  />
);
const DASH_IC: Record<Dash, string> = {
  solid: '<line x1="3" y1="12" x2="21" y2="12"></line>',
  dashed: '<line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="4 3.5"></line>',
  dotted: '<line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="0.1 4"></line>',
};
export const LINK_DOT: Record<LinkType, string> = {
  note: 'oklch(0.86 0.1 85)',
  voice: 'oklch(0.76 0.12 300)',
  task: 'oklch(0.8 0.13 30)',
  issue: 'oklch(0.78 0.11 240)',
  artifact: 'oklch(0.8 0.1 170)',
  snippet: 'oklch(0.84 0.1 245)',
};
export const LINK_KIND: Record<LinkType, string> = {
  note: 'k_note',
  voice: 'k_voice',
  task: 'k_task',
  issue: 'k_issue',
  artifact: 'k_art',
  snippet: 'k_code',
};

export type ServerBoard = { id: string; name: string; els: WbEl[]; createdAt: string; updatedAt: string };
export type Item = { k: string; type: LinkType; title: string; sub: string };
type Board = { id: string; name: string; els: WbEl[]; created: number; updated: number; base: string };
type View = { x: number; y: number; z: number };
type Style = { stroke: string; fill: string; paper: string; sw: number; dash: Dash; fs: number };
type Data = { active: string; boards: Board[] };
type Drag =
  | { k: 'pan'; sx: number; sy: number; v0: View; click?: boolean }
  | { k: 'end'; h: 'p1' | 'p2'; id: string; before: WbEl[] }
  | { k: 'resize'; h: string; ids: string[]; box: Rect; before: WbEl[]; ratio: boolean }
  | { k: 'move'; ids: string[]; p0: { x: number; y: number }; before: WbEl[]; moved: boolean }
  | { k: 'marq'; p0: { x: number; y: number }; add: string[] }
  | { k: 'erase'; before: WbEl[]; gone: Set<string> }
  | { k: 'pen'; id: string; before: WbEl[]; last?: Pt }
  | { k: 'shape'; id: string; p0: { x: number; y: number }; before: WbEl[] }
  | { k: 'line'; id: string; before: WbEl[] };
export type Peek = {
  k: string;
  type: LinkType;
  title: string;
  meta: Array<{ k: string; v: string }>;
  subs: Array<{ t: string; done: boolean }>;
  body: string;
  code: boolean;
};

export type WhiteboardProps = {
  t: (k: string) => string;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  toast: (o: { message: ReactNode; tone?: 'info' | 'success' | 'warning' | 'error' }) => void;
  go: (type: LinkType, id: string) => void;
};
type State = {
  data: Data | null;
  items: Record<string, Item>;
  views: Record<string, View>;
  tool: Tool;
  sel: string[];
  editId: string | null;
  style: Style;
  lock: boolean;
  showBoards: boolean;
  bq: string;
  linkOpen: boolean;
  lq: string;
  lt: string;
  linkTypes: LinkType[];
  linkRes: Item[] | null;
  help: boolean;
  marq: Rect | null;
  hover: string | null;
  panning: boolean;
  space: boolean;
  conflict: string | null;
  peek: Peek | null;
  hist: number;
};

const toBoard = (b: ServerBoard): Board => ({
  id: b.id,
  name: b.name,
  els: b.els,
  created: Date.parse(b.createdAt),
  updated: Date.parse(b.updatedAt),
  base: b.updatedAt,
});
const fmt = (ts: number) => {
  const d = new Date(ts),
    p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const lsGet = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const lsSet = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // private mode / quota: the view is a convenience only
  }
};
const editable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName));

export class Whiteboard extends Component<WhiteboardProps, State> {
  state: State = {
    data: null,
    items: {},
    views: {},
    tool: 'select',
    sel: [],
    editId: null,
    style: { stroke: '#fbf8f5', fill: 'none', paper: '#f5d36b', sw: 4, dash: 'solid', fs: 22 },
    lock: false,
    showBoards: false,
    bq: '',
    linkOpen: false,
    lq: '',
    lt: 'all',
    linkTypes: [],
    linkRes: null,
    help: false,
    marq: null,
    hover: null,
    panning: false,
    space: false,
    conflict: null,
    peek: null,
    hist: 0,
  };
  private hists: Record<string, { past: WbEl[][]; future: WbEl[][] }> = {};
  private cv: HTMLDivElement | null = null;
  private root: HTMLElement | null = null;
  private svg: SVGSVGElement | null = null;
  private fileIn: HTMLInputElement | null = null;
  private d: Drag | null = null;
  private spaceDown = false;
  private clip: WbEl[] | null = null;
  private dirty = new Set<string>();
  private inflight = new Set<string>();
  private svT: ReturnType<typeof setTimeout> | undefined;
  private vT: ReturnType<typeof setTimeout> | undefined;
  private lqT: ReturnType<typeof setTimeout> | undefined;
  private alive = true;

  // ── lifecycle ────────────────────────────────────────────────────────────
  componentDidMount() {
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('paste', this.onPaste);
    window.addEventListener('beforeunload', this.flushNow);
    void this.load();
  }
  componentWillUnmount() {
    this.alive = false;
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('paste', this.onPaste);
    window.removeEventListener('beforeunload', this.flushNow);
    if (this.cv) this.cv.removeEventListener('wheel', this.onWheel);
    clearTimeout(this.svT);
    this.flushNow();
  }
  componentDidUpdate() {
    if (!this.cv || !this.state.data) return;
    // text boxes grow with their content (prototype: measured after render)
    const F: Record<string, number> = {};
    for (const el of this.board().els) {
      if (el.t !== 'text') continue;
      const n = this.cv.querySelector<HTMLElement>(`[data-mt="${el.id}"]`);
      if (!n) continue;
      const h = Math.ceil(n.offsetHeight);
      if (h && Math.abs(h - el.h) > 1) F[el.id] = h;
    }
    if (Object.keys(F).length)
      this.setBoard(
        (x) => ({ ...x, els: x.els.map((el) => (F[el.id] ? { ...el, h: F[el.id]! } : el)) }),
        true,
      );
  }

  private T = (k: string) => this.props.t(k);

  async load() {
    try {
      const r = await api<{ boards: ServerBoard[]; items: Record<string, Item> }>('/whiteboards');
      let boards = r.boards.map(toBoard);
      if (!boards.length) {
        const { board } = await api<{ board: ServerBoard }>('/whiteboards', {
          name: `${this.T('wb_untitled')} 1`,
        });
        boards = [toBoard(board)];
      }
      const want = lsGet<string>('kh.wb.active', '');
      const active = boards.some((b) => b.id === want) ? want : boards[0]!.id;
      if (!this.alive) return;
      this.setState({ data: { active, boards }, items: r.items, views: lsGet('kh.wb.views', {}) }, () =>
        this.ensureView(),
      );
    } catch {
      this.props.toast({ message: this.T('wb_saveFail'), tone: 'error' });
    }
  }

  // ── data helpers ─────────────────────────────────────────────────────────
  board(): Board {
    const d = this.state.data!;
    return d.boards.find((b) => b.id === d.active) ?? d.boards[0]!;
  }
  view(): View {
    return this.state.views[this.board().id] ?? { x: 0, y: 0, z: 1 };
  }
  /** A board opened for the first time on this device is fitted to its content. */
  ensureView() {
    if (!this.state.data || this.state.views[this.board().id]) return;
    requestAnimationFrame(() => this.fit());
  }
  setView(v: View) {
    const id = this.board().id;
    this.setState(
      (s) => ({ views: { ...s.views, [id]: v } }),
      () => {
        clearTimeout(this.vT);
        this.vT = setTimeout(() => lsSet('kh.wb.views', this.state.views), 400);
      },
    );
  }
  setActive(id: string) {
    lsSet('kh.wb.active', id);
    this.setState(
      (s) => ({ data: s.data && { ...s.data, active: id }, sel: [], editId: null, showBoards: false }),
      () => this.ensureView(),
    );
  }
  setBoard(fn: (b: Board) => Board, quiet?: boolean) {
    const cur = this.board().id;
    this.setState(
      (s) => {
        const d = s.data!;
        return {
          data: {
            ...d,
            boards: d.boards.map((b) =>
              b.id === cur ? { ...fn(b), updated: quiet ? b.updated : Date.now() } : b,
            ),
          },
        };
      },
      () => {
        if (!quiet) {
          this.dirty.add(cur);
          this.save();
        }
      },
    );
  }
  H() {
    const id = this.board().id;
    return (this.hists[id] ??= { past: [], future: [] });
  }
  pushHist(before: WbEl[]) {
    const H = this.H();
    H.past.push(before);
    if (H.past.length > 120) H.past.shift();
    H.future = [];
    this.setState((s) => ({ hist: s.hist + 1 }));
  }
  rawEls(els: WbEl[]) {
    this.setBoard((b) => ({ ...b, els }));
  }
  setEls(els: WbEl[]) {
    this.pushHist(this.board().els);
    this.rawEls(els);
  }
  updEl(id: string, fn: (e: WbEl) => WbEl) {
    this.setBoard((b) => ({ ...b, els: b.els.map((e) => (e.id === id ? fn(e) : e)) }));
  }
  undo() {
    const H = this.H();
    if (!H.past.length) return;
    H.future.push(this.board().els);
    this.rawEls(H.past.pop()!);
    this.setState((s) => ({ sel: [], editId: null, hist: s.hist + 1 }));
  }
  redo() {
    const H = this.H();
    if (!H.future.length) return;
    H.past.push(this.board().els);
    this.rawEls(H.future.pop()!);
    this.setState((s) => ({ sel: [], editId: null, hist: s.hist + 1 }));
  }

  // ── saving (debounced PUT per board, conflict by updated_at) ─────────────
  save() {
    clearTimeout(this.svT);
    this.svT = setTimeout(() => this.flush(), 600);
  }
  flush() {
    for (const id of [...this.dirty]) if (!this.inflight.has(id)) void this.send(id);
  }
  async send(id: string, force = false) {
    const b = this.state.data?.boards.find((x) => x.id === id);
    if (!b) return;
    this.dirty.delete(id);
    this.inflight.add(id);
    try {
      const r = await api<{ updatedAt: string }>(
        `/whiteboards/${id}`,
        { name: b.name, els: b.els, base: b.base, force },
        'PUT',
      );
      if (!this.alive) return;
      this.setState((s) => ({
        data: s.data && {
          ...s.data,
          boards: s.data.boards.map((x) => (x.id === id ? { ...x, base: r.updatedAt } : x)),
        },
        conflict: s.conflict === id ? null : s.conflict,
      }));
    } catch (e) {
      if (isApiFailure(e) && e.code === 'conflict') this.setState({ conflict: id });
      else {
        this.dirty.add(id);
        this.props.toast({ message: this.T('wb_saveFail'), tone: 'error' });
      }
    } finally {
      this.inflight.delete(id);
      if (this.dirty.has(id) && this.state.conflict !== id) this.save();
    }
  }
  /** Leaving the page: send what is pending right away (keepalive when small). */
  flushNow = () => {
    clearTimeout(this.svT);
    lsSet('kh.wb.views', this.state.views);
    for (const id of this.dirty) {
      const b = this.state.data?.boards.find((x) => x.id === id);
      if (!b || this.state.conflict === id) continue;
      const body = JSON.stringify({ name: b.name, els: b.els, base: b.base });
      void fetch(`${BASE}/api/v1/whiteboards/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
        credentials: 'same-origin',
        keepalive: body.length < 60_000,
      }).catch(() => {});
    }
    this.dirty.clear();
  };
  async resolveConflict(keep: boolean) {
    const id = this.state.conflict;
    if (!id) return;
    if (keep) return void this.send(id, true);
    const r = await api<{ boards: ServerBoard[]; items: Record<string, Item> }>('/whiteboards').catch(
      () => null,
    );
    const sb = r?.boards.find((x) => x.id === id);
    this.dirty.delete(id);
    delete this.hists[id];
    this.setState((s) => ({
      conflict: null,
      sel: [],
      editId: null,
      items: { ...s.items, ...(r?.items ?? {}) },
      data: s.data && {
        ...s.data,
        boards: sb
          ? s.data.boards.map((x) => (x.id === id ? toBoard(sb) : x))
          : s.data.boards.filter((x) => x.id !== id),
      },
    }));
  }

  // ── boards ───────────────────────────────────────────────────────────────
  async newBoard() {
    try {
      const n = this.state.data?.boards.length ?? 0;
      const { board } = await api<{ board: ServerBoard }>('/whiteboards', {
        name: `${this.T('wb_untitled')} ${n + 1}`,
      });
      const b = toBoard(board);
      this.setState((s) => ({
        data: s.data && { ...s.data, boards: [...s.data.boards, b] },
        tool: 'select',
      }));
      this.setActive(b.id);
    } catch (e) {
      const limit = isApiFailure(e) && e.code === 'limit_reached';
      this.props.toast({ message: this.T(limit ? 'wb_limit' : 'wb_saveFail'), tone: 'error' });
    }
  }
  async dupBoard(x: Board) {
    try {
      if (this.dirty.has(x.id)) await this.send(x.id);
      const { board } = await api<{ board: ServerBoard }>(`/whiteboards/${x.id}/duplicate`, {
        suffix: this.T('wb_copy'),
      });
      const b = toBoard(board);
      if (x.id in this.state.views) this.setState((s) => ({ views: { ...s.views, [b.id]: s.views[x.id]! } }));
      this.setState((s) => ({ data: s.data && { ...s.data, boards: [...s.data.boards, b] } }));
      this.setActive(b.id);
    } catch (e) {
      const limit = isApiFailure(e) && e.code === 'limit_reached';
      this.props.toast({ message: this.T(limit ? 'wb_limit' : 'wb_saveFail'), tone: 'error' });
    }
  }
  async delBoard(x: Board) {
    const ok = await this.props.confirm({
      title: this.T('tr_askTitle'),
      body: this.T('tr_askBody').replace('{x}', x.name || this.T('wb_untitled')),
      confirmLabel: this.T('tr_move'),
      cancelLabel: this.T('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    this.dirty.delete(x.id);
    try {
      await api(`/whiteboards/${x.id}`, undefined, 'DELETE');
    } catch {
      return this.props.toast({ message: this.T('wb_saveFail'), tone: 'error' });
    }
    const rest = this.state.data!.boards.filter((b) => b.id !== x.id);
    this.setState((s) => ({ data: s.data && { ...s.data, boards: rest }, sel: [] }));
    if (!rest.length) {
      this.setState((s) => ({ data: s.data && { ...s.data, boards: [] } }));
      return void this.newBoard();
    }
    if (this.state.data!.active === x.id) this.setActive(rest.sort((a, c) => c.updated - a.updated)[0]!.id);
  }

  // ── geometry ─────────────────────────────────────────────────────────────
  kz() {
    const r = this.cv!.getBoundingClientRect();
    return r.width / (this.cv!.offsetWidth || 1) || 1;
  }
  local(e: { clientX: number; clientY: number }) {
    const r = this.cv!.getBoundingClientRect(),
      k = this.kz();
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  }
  toW(e: { clientX: number; clientY: number }) {
    const l = this.local(e),
      v = this.view();
    return { x: (l.x - v.x) / v.z, y: (l.y - v.y) / v.z };
  }
  center() {
    const v = this.view(),
      w = this.cv?.offsetWidth ?? 1000,
      h = this.cv?.offsetHeight ?? 700;
    return { x: (w / 2 - v.x) / v.z, y: (h / 2 - v.y) / v.z };
  }
  zoomAt(f: number, sx?: number, sy?: number) {
    if (!this.cv) return;
    const v = this.view(),
      z = Math.min(4, Math.max(0.1, v.z * f));
    const x = sx ?? this.cv.offsetWidth / 2,
      y = sy ?? this.cv.offsetHeight / 2;
    this.setView({ x: x - (x - v.x) * (z / v.z), y: y - (y - v.y) * (z / v.z), z });
  }
  fit() {
    if (!this.cv || !this.state.data) return;
    const b = this.board(),
      M = wbMap(b.els),
      u = wbUnion(b.els.map((e) => wbBB(e, M)));
    const W = this.cv.offsetWidth,
      Hh = this.cv.offsetHeight;
    if (!u) return this.setView({ x: W / 2, y: Hh / 2, z: 1 });
    const z = Math.min(2, Math.max(0.1, Math.min((W - 200) / (u.w || 1), (Hh - 180) / (u.h || 1))));
    this.setView({ z, x: W / 2 - (u.x + u.w / 2) * z, y: Hh / 2 - (u.y + u.h / 2) * z });
  }
  boxAt(e: { clientX: number; clientY: number }, ex: string | null, M: ElMap) {
    for (const n of document.elementsFromPoint(e.clientX, e.clientY)) {
      const g = n.closest('[data-id]');
      if (!g || !this.cv!.contains(g)) continue;
      const id = g.getAttribute('data-id')!;
      if (id === ex) continue;
      if (isBox(M[id])) return id;
    }
    return null;
  }
  eraseAt(e: { clientX: number; clientY: number }) {
    const d = this.d;
    if (d?.k !== 'erase') return;
    for (const n of document.elementsFromPoint(e.clientX, e.clientY)) {
      const g = n.closest('[data-id]');
      if (!g || !this.cv!.contains(g)) continue;
      const id = g.getAttribute('data-id')!;
      if (d.gone.has(id)) continue;
      d.gone.add(id);
      this.setBoard((b) => ({ ...b, els: wbRemove(b.els, new Set([id])) }));
      break;
    }
  }
  canvasRef = (n: HTMLDivElement | null) => {
    if (n === this.cv) return;
    if (this.cv) this.cv.removeEventListener('wheel', this.onWheel);
    this.cv = n;
    if (n) n.addEventListener('wheel', this.onWheel, { passive: false });
  };
  onWheel = (e: WheelEvent) => {
    if (!this.state.data) return;
    e.preventDefault();
    const l = this.local(e);
    if (e.ctrlKey || e.metaKey) this.zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025)), l.x, l.y);
    else {
      const v = this.view(),
        k = this.kz();
      this.setView({ ...v, x: v.x - e.deltaX / k, y: v.y - e.deltaY / k });
    }
  };

  // ── tools & editing ──────────────────────────────────────────────────────
  pick(tool: Tool) {
    if (tool === 'link') return this.openLink();
    if (tool === 'image') return this.fileIn?.click();
    this.setState((s) => ({ tool, sel: tool === 'select' ? s.sel : [], editId: null }));
  }
  commitText(id: string, txt: string) {
    const b = this.board(),
      el = b.els.find((x) => x.id === id);
    this.setState({ editId: null });
    if (!el || !('text' in el)) return;
    if ((el.text || '') === txt) {
      if (el.t === 'text' && !txt.trim()) this.rawEls(b.els.filter((x) => x.id !== id));
      return;
    }
    if (el.t === 'text' && !txt.trim()) {
      this.setEls(wbRemove(b.els, new Set([id])));
      this.setState({ sel: [] });
      return;
    }
    this.setEls(b.els.map((x) => (x.id === id ? ({ ...x, text: txt.slice(0, 10000) } as WbEl) : x)));
  }
  applyStyle<K extends keyof Style>(k: K, v: Style[K]) {
    this.setState((s) => ({ style: { ...s.style, [k]: v } }));
    const sel = new Set(this.state.sel);
    if (!sel.size) return;
    this.setEls(
      this.board().els.map((el) => {
        if (!sel.has(el.id)) return el;
        const cap = CAP[el.t === 'pen' ? (el.op < 1 ? 'hl' : 'pen') : el.t] ?? [];
        if (k === 'paper') return el.t === 'sticky' ? { ...el, fill: v as string } : el;
        if (!cap.includes(k)) return el;
        if (k === 'sw' && el.t === 'pen' && el.op < 1) return { ...el, sw: (v as number) * 4 };
        return { ...el, [k]: v } as WbEl;
      }),
    );
  }
  order(front: boolean) {
    const sel = new Set(this.state.sel);
    if (!sel.size) return;
    const b = this.board(),
      a = b.els.filter((e) => sel.has(e.id)),
      r = b.els.filter((e) => !sel.has(e.id));
    this.setEls(front ? [...r, ...a] : [...a, ...r]);
  }
  delSel() {
    const sel = new Set(this.state.sel);
    if (!sel.size) return;
    this.setEls(wbRemove(this.board().els, sel));
    this.setState({ sel: [] });
  }
  pasteEls(list: WbEl[], off = 24) {
    if (!list.length) return;
    const idm: Record<string, string> = {};
    for (const e of list) idm[e.id] = wbId();
    const M = { ...wbMap(this.board().els), ...wbMap(list) };
    const nu = list.map((e) => {
      let n: WbEl = { ...e, id: idm[e.id]! };
      if (isLine(e)) {
        const [p, q] = wbEnds(e, M);
        n = {
          ...(n as LineEl),
          x1: p[0],
          y1: p[1],
          x2: q[0],
          y2: q[1],
          a: e.a && idm[e.a] ? idm[e.a]! : null,
          b: e.b && idm[e.b] ? idm[e.b]! : null,
        };
      }
      return wbMove(n, off, off);
    });
    this.setEls([...this.board().els, ...nu]);
    this.setState({ sel: nu.map((e) => e.id), tool: 'select' });
  }
  duplicate() {
    const sel = new Set(this.state.sel);
    this.pasteEls(this.board().els.filter((e) => sel.has(e.id)));
  }
  copy() {
    const sel = new Set(this.state.sel);
    const L = this.board().els.filter((e) => sel.has(e.id));
    if (!L.length) return;
    this.clip = L;
    void navigator.clipboard?.writeText('kvwb:' + JSON.stringify(L)).catch(() => {});
  }
  /** Scaled down in the browser (max 1400 px, as the prototype) and stored with the board. */
  addImage(file: File, at: { x: number; y: number } | null, i = 0) {
    const boardId = this.board().id;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => URL.revokeObjectURL(url);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const s = Math.min(1, 1400 / Math.max(img.width, img.height)),
        c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const png = file.type === 'image/png';
      c.toBlob(
        async (blob) => {
          if (!blob) return;
          try {
            const res = await fetch(`${BASE}/api/v1/whiteboards/${boardId}/images`, {
              method: 'POST',
              headers: { 'Content-Type': blob.type },
              body: blob,
              credentials: 'same-origin',
            });
            if (!res.ok) throw new Error(String(res.status));
            const { id: file } = (await res.json()) as { id: string };
            if (!this.alive || this.board().id !== boardId) return;
            const k = Math.min(1, 520 / Math.max(c.width, c.height)),
              w = c.width * k,
              h = c.height * k,
              p = at ?? this.center(),
              id = wbId();
            this.setEls([
              ...this.board().els,
              { id, t: 'image', x: p.x - w / 2 + i * 30, y: p.y - h / 2 + i * 30, w, h, file },
            ]);
            this.setState({ sel: [id], tool: 'select' });
          } catch {
            this.props.toast({ message: this.T('wb_imgFail'), tone: 'error' });
          }
        },
        png ? 'image/png' : 'image/jpeg',
        0.86,
      );
    };
    img.src = url;
  }
  openLink() {
    this.setState({ linkOpen: true, lq: '', lt: 'all', help: false });
    this.searchItems('', 'all');
  }
  searchItems(q: string, lt: string) {
    clearTimeout(this.lqT);
    this.lqT = setTimeout(async () => {
      const r = await api<{ types: LinkType[]; items: Item[] }>(
        `/whiteboards/items?${new URLSearchParams({ q, type: lt })}`,
      ).catch(() => null);
      if (r && this.alive) this.setState({ linkRes: r.items, linkTypes: r.types });
    }, 160);
  }
  addLink(it: Item) {
    const p = this.center(),
      id = wbId();
    this.setEls([
      ...this.board().els,
      { id, t: 'link', x: p.x - 135, y: p.y - 39, w: 270, h: 78, ref: it.k },
    ]);
    this.setState((s) => ({ items: { ...s.items, [it.k]: it }, sel: [id], linkOpen: false, tool: 'select' }));
  }
  async openItem(k: string) {
    const [type, id] = k.split(':') as [LinkType, string];
    try {
      const r = await api<{ item: Omit<Peek, 'k'> }>(
        `/whiteboards/peek?${new URLSearchParams({ type, id })}`,
      );
      this.setState({ peek: { ...r.item, k } });
    } catch {
      this.props.toast({ message: this.T('wb_missing'), tone: 'warning' });
    }
  }

  // ── input ────────────────────────────────────────────────────────────────
  onPaste = (e: ClipboardEvent) => {
    if (editable(e.target) || !this.cv || !this.state.data || this.state.linkOpen || this.state.peek) return;
    const dt = e.clipboardData;
    if (!dt) return;
    const files = [...dt.files].filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      files.forEach((f, i) => this.addImage(f, null, i));
      return;
    }
    const txt = (dt.getData('text/plain') || '').trim();
    if (txt.startsWith('kvwb:')) {
      e.preventDefault();
      try {
        this.pasteEls(JSON.parse(txt.slice(5)) as WbEl[]);
      } catch {
        // not a board selection
      }
      return;
    }
    if (!txt && this.clip) {
      e.preventDefault();
      this.pasteEls(this.clip);
      return;
    }
    if (txt) {
      e.preventDefault();
      const p = this.center(),
        id = wbId(),
        s = this.state.style;
      this.setEls([
        ...this.board().els,
        {
          id,
          t: 'text',
          x: p.x - 160,
          y: p.y - 20,
          w: 320,
          h: 30,
          stroke: s.stroke,
          fs: s.fs,
          text: txt.slice(0, 10000),
        },
      ]);
      this.setState({ sel: [id], tool: 'select' });
    }
  };
  onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space' && this.spaceDown) {
      this.spaceDown = false;
      this.setState({ space: false });
    }
  };
  onKey = (e: KeyboardEvent) => {
    if (editable(e.target) || !this.cv || !this.state.data) return;
    // an app dialog (confirm, account…) above the board owns the keyboard
    if ([...document.querySelectorAll('[role="dialog"]')].some((d) => !this.root?.contains(d))) return;
    const mod = e.metaKey || e.ctrlKey,
      k = (e.key || '').toLowerCase(),
      S = this.state;
    if (k === 'escape') {
      this.setState({ sel: [], tool: 'select', linkOpen: false, help: false, showBoards: false, peek: null });
      return;
    }
    if (S.linkOpen || S.peek) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!this.spaceDown) {
        this.spaceDown = true;
        this.setState({ space: true });
      }
      return;
    }
    if (mod && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && k === 'y') return void (e.preventDefault(), this.redo());
    if (mod && k === 'd') return void (e.preventDefault(), this.duplicate());
    if (mod && k === 'a') {
      e.preventDefault();
      this.setState({ sel: this.board().els.map((x) => x.id), tool: 'select' });
      return;
    }
    if (mod && k === 'c') return this.copy();
    if (mod && (k === '=' || k === '+')) return void (e.preventDefault(), this.zoomAt(1.2));
    if (mod && k === '-') return void (e.preventDefault(), this.zoomAt(1 / 1.2));
    if (mod && k === '0') return void (e.preventDefault(), this.fit());
    if (k === 'delete' || k === 'backspace') {
      if (S.sel.length) {
        e.preventDefault();
        this.delSel();
      }
      return;
    }
    if (k.startsWith('arrow') && S.sel.length) {
      e.preventDefault();
      const s = e.shiftKey ? 10 : 1,
        dx = k === 'arrowleft' ? -s : k === 'arrowright' ? s : 0,
        dy = k === 'arrowup' ? -s : k === 'arrowdown' ? s : 0,
        sel = new Set(S.sel);
      this.setEls(this.board().els.map((el) => (sel.has(el.id) ? wbMove(el, dx, dy) : el)));
      return;
    }
    if (k === ']') return this.order(true);
    if (k === '[') return this.order(false);
    if (mod || e.altKey) return;
    const T = KEYS[k];
    if (T) {
      e.preventDefault();
      this.pick(T);
    }
  };
  onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!this.state.data || !this.cv) return;
    const S = this.state,
      b = this.board(),
      v = this.view(),
      p = this.toW(e),
      M = wbMap(b.els);
    const tgt = e.target as Element;
    const hEl = tgt.closest('[data-h]'),
      idEl = tgt.closest('[data-id]'),
      id = idEl ? idEl.getAttribute('data-id') : null;
    const cap = () => {
      try {
        this.cv!.setPointerCapture(e.pointerId);
      } catch {
        // pointer already gone
      }
    };
    if (S.showBoards || S.help) this.setState({ showBoards: false, help: false });
    if (e.button === 1 || S.tool === 'hand' || this.spaceDown) {
      e.preventDefault();
      this.d = { k: 'pan', sx: e.clientX, sy: e.clientY, v0: { ...v } };
      this.setState({ panning: true });
      cap();
      return;
    }
    if (e.button !== 0) return;
    if (S.editId && id === S.editId) return;
    const T = S.tool,
      st = S.style,
      nid = wbId();
    if (hEl && T === 'select') {
      const h = hEl.getAttribute('data-h')!;
      if (h === 'p1' || h === 'p2') this.d = { k: 'end', h, id: S.sel[0]!, before: b.els };
      else {
        const els = S.sel.map((i) => M[i]).filter((x): x is WbEl => !!x);
        this.d = {
          k: 'resize',
          h,
          ids: S.sel,
          box: wbUnion(els.map((x) => wbBB(x, M)))!,
          before: b.els,
          ratio: els.length === 1 && els[0]!.t === 'image',
        };
      }
      cap();
      return;
    }
    if (T === 'select') {
      if (id && M[id]) {
        let sel = S.sel;
        if (e.shiftKey) sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
        else if (!sel.includes(id)) sel = [id];
        this.d = { k: 'move', ids: sel, p0: p, before: b.els, moved: false };
        this.setState({ sel });
        cap();
        return;
      }
      if (!e.shiftKey) {
        this.d = { k: 'pan', sx: e.clientX, sy: e.clientY, v0: { ...v }, click: true };
        this.setState({ sel: [], panning: true });
        cap();
        return;
      }
      this.d = { k: 'marq', p0: p, add: S.sel };
      this.setState({ marq: { x: p.x, y: p.y, w: 0, h: 0 } });
      cap();
      return;
    }
    if (T === 'eraser') {
      this.d = { k: 'erase', before: b.els, gone: new Set() };
      this.eraseAt(e);
      cap();
      return;
    }
    if (T === 'pen' || T === 'hl') {
      this.d = { k: 'pen', id: nid, before: b.els };
      this.rawEls([
        ...b.els,
        {
          id: nid,
          t: 'pen',
          pts: [[p.x, p.y]],
          stroke: st.stroke,
          sw: T === 'hl' ? st.sw * 4 : st.sw,
          op: T === 'hl' ? 0.35 : 1,
        },
      ]);
      cap();
      return;
    }
    if (isShape(T)) {
      this.d = { k: 'shape', id: nid, p0: p, before: b.els };
      this.rawEls([
        ...b.els,
        {
          id: nid,
          t: T,
          x: p.x,
          y: p.y,
          w: 0,
          h: 0,
          stroke: st.stroke,
          fill: st.fill,
          sw: st.sw,
          dash: st.dash,
          fs: 18,
          text: '',
        },
      ]);
      cap();
      return;
    }
    if (T === 'line' || T === 'arrow') {
      this.d = { k: 'line', id: nid, before: b.els };
      this.rawEls([
        ...b.els,
        {
          id: nid,
          t: T,
          x1: p.x,
          y1: p.y,
          x2: p.x,
          y2: p.y,
          a: this.boxAt(e, null, M),
          b: null,
          stroke: st.stroke,
          sw: st.sw,
          dash: st.dash,
        },
      ]);
      cap();
      return;
    }
    if (T === 'text') {
      e.preventDefault();
      this.setEls([
        ...b.els,
        {
          id: nid,
          t: 'text',
          x: p.x,
          y: p.y - st.fs * 0.65,
          w: 320,
          h: Math.round(st.fs * 1.3),
          stroke: st.stroke,
          fs: st.fs,
          text: '',
        },
      ]);
      this.setState({ sel: [nid], editId: nid, tool: S.lock ? T : 'select' });
      return;
    }
    if (T === 'sticky') {
      e.preventDefault();
      this.setEls([
        ...b.els,
        {
          id: nid,
          t: 'sticky',
          x: p.x - 100,
          y: p.y - 100,
          w: 200,
          h: 200,
          fill: st.paper,
          fs: st.fs > 22 ? 22 : Math.max(16, st.fs),
          text: '',
        },
      ]);
      this.setState({ sel: [nid], editId: nid, tool: S.lock ? T : 'select' });
    }
  };
  onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = this.d;
    if (!d) return;
    const p = this.toW(e),
      z = this.view().z;
    if (d.k === 'pan') {
      const k = this.kz();
      this.setView({ ...d.v0, x: d.v0.x + (e.clientX - d.sx) / k, y: d.v0.y + (e.clientY - d.sy) / k });
      return;
    }
    if (d.k === 'move') {
      const dx = p.x - d.p0.x,
        dy = p.y - d.p0.y;
      if (!d.moved && Math.hypot(dx, dy) * z < 3) return;
      d.moved = true;
      const ids = new Set(d.ids),
        M0 = wbMap(d.before);
      this.rawEls(
        d.before.map((el) => {
          if (!ids.has(el.id)) return el;
          let n = el;
          if (isLine(el)) {
            const [a, c] = wbEnds(el, M0);
            n = {
              ...el,
              x1: a[0],
              y1: a[1],
              x2: c[0],
              y2: c[1],
              a: el.a && ids.has(el.a) ? el.a : null,
              b: el.b && ids.has(el.b) ? el.b : null,
            };
          }
          return wbMove(n, dx, dy);
        }),
      );
      return;
    }
    if (d.k === 'resize') {
      const o = d.box,
        h = d.h,
        ax = h.includes('w') ? o.x + o.w : o.x,
        ay = h.includes('n') ? o.y + o.h : o.y;
      let w = o.w,
        hh = o.h;
      if (h.includes('e') || h.includes('w')) w = Math.max(8, h.includes('w') ? ax - p.x : p.x - ax);
      if (h.includes('n') || h.includes('s')) hh = Math.max(8, h.includes('n') ? ay - p.y : p.y - ay);
      if (h.length === 2 && (e.shiftKey || d.ratio)) {
        const s = Math.max(w / o.w, hh / o.h);
        w = o.w * s;
        hh = o.h * s;
      }
      const nb = { x: h.includes('w') ? ax - w : o.x, y: h.includes('n') ? ay - hh : o.y, w, h: hh },
        ids = new Set(d.ids);
      this.rawEls(d.before.map((el) => (ids.has(el.id) ? wbScale(el, o, nb) : el)));
      return;
    }
    if (d.k === 'end') {
      const M = wbMap(this.board().els),
        t = this.boxAt(e, d.id, M);
      this.setState({ hover: t });
      this.rawEls(
        d.before.map((el) =>
          el.id !== d.id || !isLine(el)
            ? el
            : d.h === 'p1'
              ? { ...el, x1: p.x, y1: p.y, a: t }
              : { ...el, x2: p.x, y2: p.y, b: t },
        ),
      );
      return;
    }
    if (d.k === 'shape') {
      let w = p.x - d.p0.x,
        h = p.y - d.p0.y;
      if (e.shiftKey) {
        const s = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * s;
        h = Math.sign(h || 1) * s;
      }
      const x = Math.min(d.p0.x, d.p0.x + w),
        y = Math.min(d.p0.y, d.p0.y + h);
      this.updEl(d.id, (el) => ({ ...el, x, y, w: Math.abs(w), h: Math.abs(h) }) as WbEl);
      return;
    }
    if (d.k === 'line') {
      const M = wbMap(this.board().els);
      let t = this.boxAt(e, d.id, M);
      const el = M[d.id];
      if (!isLine(el)) return;
      if (t === el.a) t = null;
      let x2 = p.x,
        y2 = p.y;
      if (e.shiftKey) {
        const ang = Math.round(Math.atan2(p.y - el.y1, p.x - el.x1) / (Math.PI / 4)) * (Math.PI / 4),
          L = Math.hypot(p.x - el.x1, p.y - el.y1);
        x2 = el.x1 + Math.cos(ang) * L;
        y2 = el.y1 + Math.sin(ang) * L;
      }
      this.setState({ hover: t });
      this.updEl(d.id, (x) => ({ ...x, x2, y2, b: t }) as WbEl);
      return;
    }
    if (d.k === 'pen') {
      if (d.last && Math.hypot(p.x - d.last[0], p.y - d.last[1]) * z < 1.5) return;
      d.last = [p.x, p.y];
      this.updEl(d.id, (el) =>
        el.t === 'pen' && el.pts.length < 5000 ? { ...el, pts: [...el.pts, [p.x, p.y]] } : el,
      );
      return;
    }
    if (d.k === 'marq') {
      this.setState({
        marq: {
          x: Math.min(p.x, d.p0.x),
          y: Math.min(p.y, d.p0.y),
          w: Math.abs(p.x - d.p0.x),
          h: Math.abs(p.y - d.p0.y),
        },
      });
      return;
    }
    if (d.k === 'erase') this.eraseAt(e);
  };
  onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = this.d;
    this.d = null;
    if (!d) return;
    try {
      this.cv?.releasePointerCapture(e.pointerId);
    } catch {
      // released already
    }
    const S = this.state,
      keep = S.lock;
    if (d.k === 'pan') return this.setState({ panning: false });
    if (d.k === 'marq') {
      const r = S.marq,
        b = this.board(),
        M = wbMap(b.els);
      const ids =
        r && (r.w > 2 || r.h > 2)
          ? b.els
              .filter((el) => {
                const q = wbBB(el, M);
                return q.x < r.x + r.w && q.x + q.w > r.x && q.y < r.y + r.h && q.y + q.h > r.y;
              })
              .map((el) => el.id)
          : [];
      return this.setState({ marq: null, sel: [...new Set([...d.add, ...ids])] });
    }
    if (d.k === 'move') {
      if (d.moved) this.pushHist(d.before);
      return;
    }
    if (d.k === 'resize' || d.k === 'end' || d.k === 'pen') {
      this.pushHist(d.before);
      return this.setState({ hover: null });
    }
    if (d.k === 'erase') {
      if (d.gone.size) this.pushHist(d.before);
      return;
    }
    if (d.k === 'shape') {
      this.updEl(d.id, (el) => {
        if (!isBox(el) || el.w >= 6 || el.h >= 6) return el;
        const W = 180,
          Hh = el.t === 'diamond' ? 130 : 110;
        return { ...el, x: d.p0.x - W / 2, y: d.p0.y - Hh / 2, w: W, h: Hh };
      });
      this.pushHist(d.before);
      return this.setState({ sel: [d.id], tool: keep ? S.tool : 'select' });
    }
    if (d.k === 'line') {
      this.updEl(d.id, (el) =>
        isLine(el) && Math.hypot(el.x2 - el.x1, el.y2 - el.y1) < 6 && !el.b ? { ...el, x2: el.x1 + 180 } : el,
      );
      this.pushHist(d.before);
      this.setState({ sel: [d.id], tool: keep ? S.tool : 'select', hover: null });
    }
  };
  onDbl = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!this.state.data) return;
    const g = (e.target as Element).closest('[data-id]'),
      b = this.board();
    if (g) {
      const el = b.els.find((x) => x.id === g.getAttribute('data-id'));
      if (!el) return;
      if (el.t === 'link') return void this.openItem(el.ref);
      if (el.t === 'text' || el.t === 'sticky' || isShape(el.t))
        this.setState({ editId: el.id, sel: [el.id] });
      return;
    }
    if (this.state.tool !== 'select') return;
    const p = this.toW(e),
      st = this.state.style,
      id = wbId();
    this.setEls([
      ...b.els,
      {
        id,
        t: 'text',
        x: p.x,
        y: p.y - st.fs * 0.65,
        w: 320,
        h: Math.round(st.fs * 1.3),
        stroke: st.stroke,
        fs: st.fs,
        text: '',
      },
    ]);
    this.setState({ sel: [id], editId: id });
  };

  // ── rendering ────────────────────────────────────────────────────────────
  fo(
    el: WbEl & { x: number; y: number; w: number; h: number; text: string },
    ed: boolean,
    st: React.CSSProperties,
    pass: boolean,
  ) {
    const mt = el.t === 'text' ? el.id : undefined;
    const inner = ed ? (
      <div
        key="ed"
        contentEditable
        suppressContentEditableWarning
        data-mt={mt}
        aria-label={this.T('wb_text')}
        ref={(n) => {
          if (n && !n.dataset.init) {
            n.dataset.init = '1';
            n.innerText = el.text || '';
            n.focus();
            setTimeout(() => {
              try {
                const r = document.createRange();
                r.selectNodeContents(n);
                r.collapse(false);
                const s = window.getSelection();
                s?.removeAllRanges();
                s?.addRange(r);
              } catch {
                // selection not available
              }
            }, 0);
          }
        }}
        onPointerDown={(x) => x.stopPropagation()}
        onDoubleClick={(x) => x.stopPropagation()}
        onBlur={(x) => this.commitText(el.id, x.currentTarget.innerText.replace(/\n$/, ''))}
        onKeyDown={(x) => {
          if (x.key === 'Escape' || (x.key === 'Enter' && (x.metaKey || x.ctrlKey))) {
            x.preventDefault();
            x.currentTarget.blur();
          }
        }}
        style={{
          ...st,
          outline: 'none',
          cursor: 'text',
          pointerEvents: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
      />
    ) : (
      <div
        key="v"
        data-mt={mt}
        style={{
          ...st,
          pointerEvents: pass ? 'none' : 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {el.text || ''}
      </div>
    );
    return (
      <foreignObject
        x={el.x}
        y={el.y}
        width={Math.max(1, el.w)}
        height={Math.max(1, el.h)}
        style={{ overflow: 'visible', pointerEvents: pass && !ed ? 'none' : 'auto' }}
      >
        {inner}
      </foreignObject>
    );
  }
  rEl(el: WbEl, M: ElMap, z: number, preview = false): ReactNode {
    const S = this.state,
      ed = !preview && S.editId === el.id;
    const k = {
      key: el.id,
      'data-id': preview ? undefined : el.id,
      style: S.tool === 'select' && !S.space && !S.panning ? { cursor: 'default' } : undefined,
    };
    if (el.t === 'pen') {
      const d = wbPath(el.pts);
      return (
        <g {...k}>
          <path
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={el.sw + 14 / z}
            strokeLinecap="round"
            style={{ pointerEvents: 'stroke' }}
          />
          <path
            d={d}
            fill="none"
            stroke={el.stroke}
            strokeWidth={el.sw}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={el.op || 1}
            style={{ pointerEvents: 'none', mixBlendMode: el.op < 1 ? 'screen' : 'normal' }}
          />
        </g>
      );
    }
    if (el.t === 'image')
      return (
        <g {...k}>
          <image
            href={imgSrc(el.file)}
            x={el.x}
            y={el.y}
            width={el.w}
            height={el.h}
            preserveAspectRatio="none"
            style={{ pointerEvents: 'all' }}
          />
        </g>
      );
    if (el.t === 'link') {
      const it = this.state.items[el.ref];
      const type = el.ref.split(':')[0] as LinkType;
      return (
        <g {...k}>
          <foreignObject x={el.x} y={el.y} width={el.w} height={el.h} style={{ overflow: 'visible' }}>
            <div className="kh-wb-card">
              <span style={{ background: it ? LINK_DOT[type] : 'rgba(255,255,255,.3)' }} />
              <div>
                <span>{it ? this.T(LINK_KIND[type]) : this.T('wb_missing')}</span>
                <span>{it ? it.title : '—'}</span>
              </div>
              {it && !preview ? (
                <button
                  type="button"
                  title={this.T('wb_open')}
                  aria-label={`${this.T('wb_open')} ${it.title}`}
                  onPointerDown={(x) => x.stopPropagation()}
                  onDoubleClick={(x) => x.stopPropagation()}
                  onClick={(x) => {
                    x.stopPropagation();
                    void this.openItem(el.ref);
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 17L17 7" />
                    <path d="M8 7h9v9" />
                  </svg>
                </button>
              ) : null}
            </div>
          </foreignObject>
        </g>
      );
    }
    if (el.t === 'text')
      return (
        <g {...k}>
          {this.fo(
            el,
            ed,
            {
              color: el.stroke,
              fontSize: el.fs,
              fontWeight: 500,
              lineHeight: 1.3,
              minHeight: Math.round(el.fs * 1.3) + 'px',
              letterSpacing: el.fs >= 30 ? '-.02em' : 'normal',
            },
            false,
          )}
        </g>
      );
    if (el.t === 'sticky')
      return (
        <g {...k}>
          {this.fo(
            el,
            ed,
            {
              width: '100%',
              height: '100%',
              boxSizing: 'border-box',
              padding: '18px 18px',
              background: el.fill,
              color: '#2a211c',
              fontSize: el.fs || 18,
              lineHeight: 1.32,
              fontWeight: 500,
              borderRadius: '6px',
              boxShadow: '0 12px 26px rgba(0,0,0,.24), inset 0 -2px 0 rgba(0,0,0,.06)',
              overflow: 'hidden',
            },
            false,
          )}
        </g>
      );
    const dash =
      el.dash === 'dashed'
        ? `${el.sw * 2.6} ${el.sw * 2.2}`
        : el.dash === 'dotted'
          ? `0.01 ${el.sw * 2.2}`
          : undefined;
    const sp = {
      stroke: el.stroke,
      strokeWidth: el.sw,
      strokeDasharray: dash,
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
    };
    if (isLine(el)) {
      const [p, q] = wbEnds(el, M),
        ang = Math.atan2(q[1] - p[1], q[0] - p[0]),
        hs = 9 + el.sw * 2.2,
        arrow = el.t === 'arrow';
      const qe = arrow ? [q[0] - Math.cos(ang) * hs * 0.55, q[1] - Math.sin(ang) * hs * 0.55] : q;
      const d = `M${p[0]} ${p[1]}L${qe[0]} ${qe[1]}`;
      return (
        <g {...k}>
          <path
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={el.sw + 16 / z}
            style={{ pointerEvents: 'stroke' }}
          />
          <path d={d} fill="none" {...sp} style={{ pointerEvents: 'none' }} />
          {arrow ? (
            <polygon
              points={`${q[0]},${q[1]} ${q[0] - Math.cos(ang - 0.42) * hs},${q[1] - Math.sin(ang - 0.42) * hs} ${q[0] - Math.cos(ang + 0.42) * hs},${q[1] - Math.sin(ang + 0.42) * hs}`}
              fill={el.stroke}
              stroke={el.stroke}
              strokeWidth={Math.max(1, el.sw * 0.5)}
              strokeLinejoin="round"
              style={{ pointerEvents: 'none' }}
            />
          ) : null}
        </g>
      );
    }
    const fp = el.fill && el.fill !== 'none' ? { fill: el.fill, fillOpacity: 0.26 } : { fill: 'transparent' };
    const lab =
      el.text || ed
        ? this.fo(
            el,
            ed,
            {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              width: '100%',
              height: '100%',
              boxSizing: 'border-box',
              padding: '10px 16px',
              color: el.stroke,
              fontSize: el.fs || 18,
              fontWeight: 500,
              lineHeight: 1.25,
            },
            true,
          )
        : null;
    const all = { pointerEvents: 'all' as const };
    if (el.t === 'rect')
      return (
        <g {...k}>
          <rect
            x={el.x}
            y={el.y}
            width={el.w}
            height={el.h}
            rx={Math.min(14, el.w / 5, el.h / 5)}
            {...fp}
            {...sp}
            style={all}
          />
          {lab}
        </g>
      );
    if (el.t === 'ellipse')
      return (
        <g {...k}>
          <ellipse
            cx={el.x + el.w / 2}
            cy={el.y + el.h / 2}
            rx={el.w / 2}
            ry={el.h / 2}
            {...fp}
            {...sp}
            style={all}
          />
          {lab}
        </g>
      );
    const cx = el.x + el.w / 2,
      cy = el.y + el.h / 2;
    return (
      <g {...k}>
        <polygon
          points={`${cx},${el.y} ${el.x + el.w},${cy} ${cx},${el.y + el.h} ${el.x},${cy}`}
          {...fp}
          {...sp}
          style={all}
        />
        {lab}
      </g>
    );
  }
  overlay(M: ElMap, z: number) {
    const S = this.state,
      out: ReactNode[] = [],
      sw = 1.5 / z,
      hs = 10 / z;
    if (S.hover && M[S.hover]) {
      const q = wbBB(M[S.hover]!, M);
      out.push(
        <rect
          key="hv"
          data-ui="1"
          x={q.x - 6 / z}
          y={q.y - 6 / z}
          width={q.w + 12 / z}
          height={q.h + 12 / z}
          rx={10 / z}
          fill="rgba(127,178,255,.08)"
          stroke={WB_ACC}
          strokeWidth={2 / z}
          style={{ pointerEvents: 'none' }}
        />,
      );
    }
    const sel = S.sel.map((i) => M[i]).filter((x): x is WbEl => !!x);
    if (sel.length && !S.editId && S.tool === 'select') {
      const one = sel[0]!;
      if (sel.length === 1 && isLine(one)) {
        const [p, q] = wbEnds(one, M);
        for (const [h, c] of [
          ['p1', p],
          ['p2', q],
        ] as const)
          out.push(
            <circle
              key={h}
              data-ui="1"
              data-h={h}
              cx={c[0]}
              cy={c[1]}
              r={6.5 / z}
              fill="#fbf8f5"
              stroke={WB_ACC}
              strokeWidth={2 / z}
              style={{ cursor: 'move' }}
            />,
          );
      } else {
        if (sel.length > 1)
          for (const el of sel) {
            const q = wbBB(el, M);
            out.push(
              <rect
                key={'o' + el.id}
                data-ui="1"
                x={q.x}
                y={q.y}
                width={q.w}
                height={q.h}
                fill="none"
                stroke={WB_ACC}
                strokeWidth={1 / z}
                strokeDasharray={`${4 / z} ${3 / z}`}
                style={{ pointerEvents: 'none' }}
              />,
            );
          }
        const u = wbUnion(sel.map((el) => wbBB(el, M)))!,
          pad = 4 / z,
          g = { x: u.x - pad, y: u.y - pad, w: u.w + 2 * pad, h: u.h + 2 * pad };
        out.push(
          <rect
            key="gb"
            data-ui="1"
            x={g.x}
            y={g.y}
            width={g.w}
            height={g.h}
            fill="none"
            stroke={WB_ACC}
            strokeWidth={sw}
            style={{ pointerEvents: 'none' }}
          />,
        );
        const only = sel.length === 1 ? one.t : null,
          H =
            only === 'text'
              ? ['e', 'w']
              : only === 'link'
                ? []
                : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
        const pos: Record<string, Pt> = {
          nw: [g.x, g.y],
          n: [g.x + g.w / 2, g.y],
          ne: [g.x + g.w, g.y],
          e: [g.x + g.w, g.y + g.h / 2],
          se: [g.x + g.w, g.y + g.h],
          s: [g.x + g.w / 2, g.y + g.h],
          sw: [g.x, g.y + g.h],
          w: [g.x, g.y + g.h / 2],
        };
        const cur: Record<string, string> = {
          nw: 'nwse-resize',
          se: 'nwse-resize',
          ne: 'nesw-resize',
          sw: 'nesw-resize',
          n: 'ns-resize',
          s: 'ns-resize',
          e: 'ew-resize',
          w: 'ew-resize',
        };
        for (const h of H)
          out.push(
            <rect
              key={'h' + h}
              data-ui="1"
              data-h={h}
              x={pos[h]![0] - hs / 2}
              y={pos[h]![1] - hs / 2}
              width={hs}
              height={hs}
              rx={3 / z}
              fill="#fbf8f5"
              stroke={WB_ACC}
              strokeWidth={sw}
              style={{ cursor: cur[h] }}
            />,
          );
      }
    }
    if (S.marq)
      out.push(
        <rect
          key="mq"
          data-ui="1"
          x={S.marq.x}
          y={S.marq.y}
          width={S.marq.w}
          height={S.marq.h}
          fill="rgba(127,178,255,.12)"
          stroke={WB_ACC}
          strokeWidth={1 / z}
          style={{ pointerEvents: 'none' }}
        />,
      );
    return out;
  }
  preview(bd: Board) {
    const M = wbMap(bd.els),
      u = wbUnion(bd.els.map((e) => wbBB(e, M)));
    if (!u) return null;
    const pad = Math.max(u.w, u.h) * 0.08 + 10;
    return (
      <svg
        width="100%"
        height="100%"
        viewBox={`${u.x - pad} ${u.y - pad} ${u.w + 2 * pad} ${u.h + 2 * pad}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block' }}
      >
        {bd.els.map((el) => this.rEl(el, M, 1, true))}
      </svg>
    );
  }
  /** Export SVG (prototype): the drawing without the selection UI; images are embedded. */
  async exportSvg() {
    if (!this.svg || !this.cv) return;
    const b = this.board(),
      M = wbMap(b.els),
      u = wbUnion(b.els.map((e) => wbBB(e, M)));
    if (!u) return;
    const c = this.svg.cloneNode(true) as SVGSVGElement;
    c.querySelectorAll('[data-ui]').forEach((n) => n.remove());
    c.querySelector('g')?.removeAttribute('transform');
    c.querySelectorAll('button').forEach((n) => n.remove());
    await Promise.all(
      [...c.querySelectorAll('image')].map(async (im) => {
        try {
          const blob = await (await fetch(im.getAttribute('href')!, { credentials: 'same-origin' })).blob();
          const url = await new Promise<string>((ok) => {
            const fr = new FileReader();
            fr.onload = () => ok(String(fr.result));
            fr.readAsDataURL(blob);
          });
          im.setAttribute('href', url);
        } catch {
          // keep the link
        }
      }),
    );
    const pad = 40,
      ns = 'http://www.w3.org/2000/svg';
    c.setAttribute('xmlns', ns);
    c.setAttribute('viewBox', `${u.x - pad} ${u.y - pad} ${u.w + 2 * pad} ${u.h + 2 * pad}`);
    c.setAttribute('width', String(u.w + 2 * pad));
    c.setAttribute('height', String(u.h + 2 * pad));
    c.removeAttribute('style');
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('x', String(u.x - pad));
    bg.setAttribute('y', String(u.y - pad));
    bg.setAttribute('width', String(u.w + 2 * pad));
    bg.setAttribute('height', String(u.h + 2 * pad));
    bg.setAttribute('fill', '#2b231e');
    c.insertBefore(bg, c.firstChild);
    c.setAttribute('font-family', getComputedStyle(this.cv).fontFamily);
    const blob = new Blob([new XMLSerializer().serializeToString(c)], { type: 'image/svg+xml' }),
      a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ((b.name || 'whiteboard').replace(/[^\w\- ]+/g, '').trim() || 'whiteboard') + '.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  render() {
    const S = this.state,
      T = this.T;
    if (!S.data) return <section className="kh-wb" aria-busy="true" />;
    const b = this.board(),
      v = this.view(),
      M = wbMap(b.els);
    let gs = 24 * v.z;
    while (gs < 12) gs *= 4;
    const tool = S.tool;
    const cursor = S.panning
      ? 'grabbing'
      : S.space || tool === 'hand' || tool === 'select'
        ? 'grab'
        : tool === 'text'
          ? 'text'
          : tool === 'eraser'
            ? 'cell'
            : 'crosshair';
    const tb = (ids: Array<[Tool, string]>) =>
      ids.map(([id, sc]) => {
        const on = tool === id && id !== 'link' && id !== 'image';
        return (
          <button
            key={id}
            type="button"
            className="kh-wb-tool"
            data-on={on || undefined}
            title={`${T('wb_' + id)} (${sc})`}
            aria-label={T('wb_' + id)}
            aria-pressed={on}
            onClick={() => this.pick(id)}
          >
            <Ico k={id} />
          </button>
        );
      });
    const types = S.sel.length
      ? [
          ...new Set(
            S.sel
              .map((i) => M[i])
              .filter((x): x is WbEl => !!x)
              .map((e) => (e.t === 'pen' ? (e.op < 1 ? 'hl' : 'pen') : e.t)),
          ),
        ]
      : [tool];
    const has = (c: Cap) => types.some((t) => (CAP[t] ?? []).includes(c));
    const one = S.sel.length === 1 ? M[S.sel[0]!] : undefined;
    const cur: Style = { ...S.style };
    if (one && one.t !== 'link' && one.t !== 'image') {
      if ('stroke' in one) cur.stroke = one.stroke;
      if (one.t === 'sticky') cur.paper = one.fill;
      else if ('fill' in one) cur.fill = one.fill;
      if ('sw' in one) cur.sw = one.t === 'pen' && one.op < 1 ? one.sw / 4 : one.sw;
      if ('dash' in one) cur.dash = one.dash;
      if ('fs' in one) cur.fs = one.fs;
    }
    const st = {
      hasStroke: has('stroke'),
      hasFill: has('fill'),
      hasPaper: has('paper'),
      hasSw: has('sw'),
      hasDash: has('dash'),
      hasFs: has('fs'),
      hasSel: S.sel.length > 0,
    };
    const hasStyle =
      !S.panning &&
      !S.showBoards &&
      (st.hasStroke || st.hasFill || st.hasPaper || st.hasSel) &&
      !(S.sel.length === 0 && ['select', 'hand', 'eraser'].includes(tool));
    const H = this.H();
    const q = S.bq.trim().toLowerCase();
    const rows = S.showBoards
      ? S.data.boards
          .filter((x) => !q || (x.name || '').toLowerCase().includes(q))
          .sort((a, c) => c.updated - a.updated)
      : [];
    const sep = <span className="kh-wb-sep" />;

    return (
      <section className="kh-wb" ref={(n) => void (this.root = n)}>
        <div
          ref={this.canvasRef}
          className="kh-wb-canvas"
          data-testid="wb-canvas"
          onPointerDown={this.onDown}
          onPointerMove={this.onMove}
          onPointerUp={this.onUp}
          onPointerCancel={this.onUp}
          onDoubleClick={this.onDbl}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const p = this.toW(e);
            [...e.dataTransfer.files]
              .filter((f) => f.type.startsWith('image/'))
              .forEach((f, i) => this.addImage(f, p, i));
          }}
          onContextMenu={(e) => e.preventDefault()}
          style={{ cursor, backgroundSize: `${gs}px ${gs}px`, backgroundPosition: `${v.x}px ${v.y}px` }}
        >
          <svg ref={(n) => void (this.svg = n)} width="100%" height="100%" className="kh-wb-svg">
            <g transform={`translate(${v.x} ${v.y}) scale(${v.z})`}>
              {b.els.map((el) => this.rEl(el, M, v.z))}
              {this.overlay(M, v.z)}
            </g>
          </svg>
        </div>

        {!b.els.length && (
          <div className="kh-wb-empty">
            <div>
              <svg
                width="34"
                height="34"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(255,248,240,.55)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16z" />
                <path d="M14 6l3 3" />
              </svg>
              <span>{T('wb_empty')}</span>
            </div>
          </div>
        )}

        <div className="kh-wb-top">
          <div className="kh-wb-bar">
            <button
              type="button"
              className="kh-wb-round"
              data-on={S.showBoards || undefined}
              title={T('wb_boards')}
              aria-label={T('wb_boards')}
              aria-expanded={S.showBoards}
              onClick={() => this.setState((s) => ({ showBoards: !s.showBoards, help: false, bq: '' }))}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="7" rx="2" />
                <rect x="14" y="3" width="7" height="7" rx="2" />
                <rect x="3" y="14" width="7" height="7" rx="2" />
                <rect x="14" y="14" width="7" height="7" rx="2" />
              </svg>
            </button>
            <input
              className="kh-wb-name"
              value={b.name}
              aria-label={T('wb_name')}
              placeholder={T('wb_untitled')}
              maxLength={200}
              onChange={(e) => {
                const n = e.target.value;
                this.setBoard((x) => ({ ...x, name: n }));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              style={{ width: Math.min(560, Math.max(160, (b.name.length * 8.4 + 24) * 2)) }}
            />
            <span className="kh-wb-vsep" />
            <button
              type="button"
              className="kh-wb-round"
              title={T('wb_newBoard')}
              aria-label={T('wb_newBoard')}
              onClick={() => void this.newBoard()}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              type="button"
              className="kh-wb-round"
              title={T('wb_exportSvg')}
              aria-label={T('wb_exportSvg')}
              onClick={() => void this.exportSvg()}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 4v11" />
                <path d="M7 10l5 5 5-5" />
                <path d="M5 20h14" />
              </svg>
            </button>
          </div>
          {S.conflict === b.id && (
            <div className="kh-wb-conflict" role="alert">
              <span>{T('wb_conflict')}</span>
              <button type="button" onClick={() => void this.resolveConflict(false)}>
                {T('wb_reload')}
              </button>
              <button type="button" onClick={() => void this.resolveConflict(true)}>
                {T('wb_keep')}
              </button>
            </div>
          )}
          {hasStyle && (
            <div className="kh-wb-style" onPointerDown={(e) => e.stopPropagation()}>
              {st.hasStroke && (
                <div title={T('wb_color')} role="group" aria-label={T('wb_color')}>
                  {WB_INK.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="kh-wb-sw"
                      aria-label={c}
                      aria-pressed={cur.stroke === c}
                      style={{ background: c, borderColor: cur.stroke === c ? '#fbf8f5' : 'transparent' }}
                      onClick={() => this.applyStyle('stroke', c)}
                    />
                  ))}
                </div>
              )}
              {st.hasFill && (
                <>
                  {sep}
                  <div title={T('wb_fill')} role="group" aria-label={T('wb_fill')}>
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="rgba(255,248,240,.7)"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ flex: 'none', marginRight: 2 }}
                    >
                      <path d="M5 11l7-7 7 7-7 7z" />
                      <path d="M19 16s2 2.4 2 3.5a2 2 0 0 1-4 0c0-1.1 2-3.5 2-3.5z" />
                    </svg>
                    {['none', ...WB_INK].map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="kh-wb-sw kh-wb-sw--sq"
                        title={c === 'none' ? T('wb_none') : undefined}
                        aria-label={c === 'none' ? T('wb_none') : c}
                        aria-pressed={cur.fill === c}
                        style={{
                          background:
                            c === 'none'
                              ? 'linear-gradient(135deg,transparent 45%,#ef6a5a 45%,#ef6a5a 55%,transparent 55%),rgba(255,255,255,.08)'
                              : c,
                          borderColor: cur.fill === c ? '#fbf8f5' : 'transparent',
                        }}
                        onClick={() => this.applyStyle('fill', c)}
                      />
                    ))}
                  </div>
                </>
              )}
              {st.hasPaper && (
                <div title={T('wb_fill')} role="group" aria-label={T('wb_fill')}>
                  {WB_PAPER.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="kh-wb-sw kh-wb-sw--paper"
                      aria-label={c}
                      aria-pressed={cur.paper === c}
                      style={{ background: c, borderColor: cur.paper === c ? '#fbf8f5' : 'transparent' }}
                      onClick={() => this.applyStyle('paper', c)}
                    />
                  ))}
                </div>
              )}
              {st.hasSw && (
                <>
                  {sep}
                  <div title={T('wb_width')} role="group" aria-label={T('wb_width')} className="kh-wb-tight">
                    {WB_SW.map((w) => (
                      <button
                        key={w}
                        type="button"
                        className="kh-wb-pick"
                        data-on={cur.sw === w || undefined}
                        aria-label={`${T('wb_width')} ${w}`}
                        onClick={() => this.applyStyle('sw', w)}
                      >
                        <span
                          style={{
                            width: 16,
                            height: Math.max(2, Math.round(w * 0.8)),
                            borderRadius: 999,
                            background: 'currentColor',
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </>
              )}
              {st.hasDash && (
                <>
                  {sep}
                  <div title={T('wb_dash')} role="group" aria-label={T('wb_dash')} className="kh-wb-tight">
                    {(['solid', 'dashed', 'dotted'] as Dash[]).map((dsh) => (
                      <button
                        key={dsh}
                        type="button"
                        className="kh-wb-pick kh-wb-pick--dash"
                        data-on={(cur.dash || 'solid') === dsh || undefined}
                        title={T('wb_' + dsh)}
                        aria-label={T('wb_' + dsh)}
                        onClick={() => this.applyStyle('dash', dsh)}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          dangerouslySetInnerHTML={{ __html: DASH_IC[dsh] }}
                        />
                      </button>
                    ))}
                  </div>
                </>
              )}
              {st.hasFs && (
                <>
                  {sep}
                  <div title={T('wb_size')} role="group" aria-label={T('wb_size')} className="kh-wb-tight">
                    {WB_FS.map((f, i) => (
                      <button
                        key={f}
                        type="button"
                        className="kh-wb-pick kh-wb-pick--fs"
                        data-on={cur.fs === f || undefined}
                        onClick={() => this.applyStyle('fs', f)}
                      >
                        {['S', 'M', 'L', 'XL'][i]}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {st.hasSel && (
                <>
                  {sep}
                  <div className="kh-wb-tight">
                    {(
                      [
                        ['front', `${T('wb_front')} ( ] )`, () => this.order(true)],
                        ['back', `${T('wb_back')} ( [ )`, () => this.order(false)],
                        ['dup', `${T('wb_dup')} (Ctrl D)`, () => this.duplicate()],
                        ['trash', `${T('wb_del')} (Del)`, () => this.delSel()],
                      ] as const
                    ).map(([ic, tip, fn]) => (
                      <button
                        key={ic}
                        type="button"
                        className="kh-wb-act"
                        data-del={ic === 'trash' || undefined}
                        title={tip}
                        aria-label={tip}
                        onClick={fn}
                      >
                        <Ico k={ic} s={16} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {S.showBoards && (
          <div
            className="kh-wb-boards"
            onPointerDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={T('wb_boards')}
          >
            <div className="kh-wb-boards__head">
              <div>
                <span>{T('wb_boards')}</span>
                <span>{S.data.boards.length}</span>
              </div>
              <input
                value={S.bq}
                onChange={(e) => this.setState({ bq: e.target.value })}
                placeholder={T('wb_search')}
                aria-label={T('wb_search')}
              />
            </div>
            <div className="kh-wb-boards__list">
              {rows.map((x) => {
                const n = x.els.length;
                return (
                  <div
                    key={x.id}
                    className="kh-wb-brow"
                    data-on={x.id === b.id || undefined}
                    role="button"
                    tabIndex={0}
                    onClick={() => this.setActive(x.id)}
                    onKeyDown={onActivateKey(() => this.setActive(x.id))}
                  >
                    <div className="kh-wb-brow__pv">{this.preview(x)}</div>
                    <div className="kh-wb-brow__txt">
                      <span>{x.name || T('wb_untitled')}</span>
                      <span>
                        {n} {n === 1 ? T('wb_el1') : T('wb_els')} · {fmt(x.updated)}
                      </span>
                    </div>
                    <button
                      type="button"
                      title={T('wb_dup')}
                      aria-label={`${T('wb_dup')} ${x.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void this.dupBoard(x);
                      }}
                    >
                      <Ico k="dup" s={14} />
                    </button>
                    <button
                      type="button"
                      data-del="1"
                      title={T('wb_del')}
                      aria-label={`${T('wb_del')} ${x.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void this.delBoard(x);
                      }}
                    >
                      <Ico k="trash" s={14} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="kh-wb-boards__foot">
              <button type="button" onClick={() => void this.newBoard()}>
                + {T('wb_newBoard')}
              </button>
            </div>
          </div>
        )}

        <div className="kh-wb-tools" role="toolbar" aria-label={T('wb_help')}>
          {tb([
            ['select', 'V'],
            ['hand', 'H'],
          ])}
          <span className="kh-wb-hsep" />
          {tb([
            ['pen', 'P'],
            ['hl', 'M'],
            ['eraser', 'E'],
          ])}
          <span className="kh-wb-hsep" />
          {tb([
            ['rect', 'R'],
            ['ellipse', 'O'],
            ['diamond', 'D'],
            ['line', 'L'],
            ['arrow', 'A'],
          ])}
          <span className="kh-wb-hsep" />
          {tb([
            ['text', 'T'],
            ['sticky', 'S'],
            ['link', 'K'],
            ['image', 'I'],
          ])}
          <span className="kh-wb-hsep" />
          <button
            type="button"
            className="kh-wb-lock"
            data-on={S.lock || undefined}
            title={T('wb_lock')}
            aria-label={T('wb_lock')}
            aria-pressed={S.lock}
            onClick={() => this.setState((s) => ({ lock: !s.lock }))}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="5" y="11" width="14" height="10" rx="2.5" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </button>
        </div>

        <div className="kh-wb-zoom">
          <button
            type="button"
            title={T('wb_undo')}
            aria-label={T('wb_undo')}
            disabled={!H.past.length}
            onClick={() => this.undo()}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
          </button>
          <button
            type="button"
            title={T('wb_redo')}
            aria-label={T('wb_redo')}
            disabled={!H.future.length}
            onClick={() => this.redo()}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 14l5-5-5-5" />
              <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
            </svg>
          </button>
          <span className="kh-wb-vsep" />
          <button
            type="button"
            title={T('wb_zoomOut')}
            aria-label={T('wb_zoomOut')}
            onClick={() => this.zoomAt(1 / 1.2)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button type="button" className="kh-wb-zlbl" title="100%" onClick={() => this.zoomAt(1 / v.z)}>
            {Math.round(v.z * 100)}%
          </button>
          <button
            type="button"
            title={T('wb_zoomIn')}
            aria-label={T('wb_zoomIn')}
            onClick={() => this.zoomAt(1.2)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button type="button" title={T('wb_fit')} aria-label={T('wb_fit')} onClick={() => this.fit()}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 9V5h4" />
              <path d="M20 9V5h-4" />
              <path d="M4 15v4h4" />
              <path d="M20 15v4h-4" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          className="kh-wb-help"
          title={T('wb_help')}
          aria-label={T('wb_help')}
          aria-expanded={S.help}
          onClick={() => this.setState((s) => ({ help: !s.help, showBoards: false }))}
        >
          ?
        </button>
        {S.help && (
          <div className="kh-wb-keys">
            <span>{T('wb_help')}</span>
            <div>
              {Array.from({ length: 15 }, (_, i) => {
                const [l, kk] = T(`wb_k${i + 1}`).split('|');
                return [<span key={'l' + i}>{l}</span>, <span key={'k' + i}>{kk}</span>];
              })}
            </div>
          </div>
        )}

        {S.linkOpen && (
          <div
            className="kh-wb-dim"
            onClick={() => this.setState({ linkOpen: false })}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
              className="kh-wb-link"
              role="dialog"
              aria-modal="true"
              aria-label={T('wb_linkTitle')}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="kh-wb-link__head">
                <span>{T('wb_linkTitle')}</span>
                <button
                  type="button"
                  aria-label={T('wb_close')}
                  onClick={() => this.setState({ linkOpen: false })}
                >
                  ×
                </button>
              </div>
              <input
                autoFocus
                value={S.lq}
                placeholder={T('wb_linkPh')}
                aria-label={T('wb_linkPh')}
                onChange={(e) => {
                  this.setState({ lq: e.target.value });
                  this.searchItems(e.target.value.trim(), S.lt);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && S.linkRes?.[0]) this.addLink(S.linkRes[0]);
                  if (e.key === 'Escape') this.setState({ linkOpen: false });
                }}
              />
              <div className="kh-wb-chips">
                {[
                  ['all', T('wb_all'), 'rgba(255,255,255,.5)'] as const,
                  ...S.linkTypes.map((ty) => [ty, T(LINK_KIND[ty]), LINK_DOT[ty]] as const),
                ].map(([id, label, dot]) => (
                  <button
                    key={id}
                    type="button"
                    data-on={S.lt === id || undefined}
                    aria-pressed={S.lt === id}
                    onClick={() => {
                      this.setState({ lt: id });
                      this.searchItems(S.lq.trim(), id);
                    }}
                  >
                    <span style={{ background: dot }} />
                    {label}
                  </button>
                ))}
              </div>
              <div className="kh-wb-link__res">
                {(S.linkRes ?? []).map((x) => (
                  <button key={x.k} type="button" onClick={() => this.addLink(x)}>
                    <span style={{ background: LINK_DOT[x.type] }} />
                    <span>
                      <span>{x.title || '—'}</span>
                      <span>
                        {T(LINK_KIND[x.type])} · {fmt(Date.parse(x.sub))}
                      </span>
                    </span>
                  </button>
                ))}
                {S.linkRes && !S.linkRes.length && <div className="kh-wb-none">{T('wb_noRes')}</div>}
              </div>
            </div>
          </div>
        )}

        {S.peek && this.renderPeek(S.peek)}

        <input
          type="file"
          accept="image/*"
          multiple
          ref={(n) => void (this.fileIn = n)}
          aria-label={T('wb_image')}
          onChange={(e) => {
            [...(e.target.files ?? [])]
              .filter((f) => f.type.startsWith('image/'))
              .forEach((f, i) => this.addImage(f, null, i));
            e.target.value = '';
          }}
          hidden
        />
      </section>
    );
  }

  renderPeek(p: Peek) {
    const T = this.T;
    const val = (k: string, v: string) => {
      if (!v) return '';
      if (k === 'prio')
        return T(v === 'high' ? 't_high' : v === 'medium' ? 't_med' : v === 'low' ? 't_low' : 'p_critical');
      if (k === 'ttype') return T(v === 'mgmt' ? 'tk_mgmt' : 'tk_tech');
      if (k === 'status') return T(`s_${v}`);
      if (k === 'type' && p.type === 'snippet') return T(`dl_t_${v}`);
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
        const [y, m, d] = v.slice(0, 10).split('-');
        return `${d}/${m}/${y}`;
      }
      return v;
    };
    const meta = p.meta
      .map((m) => ({ k: T(`wb_m_${m.k}`), v: val(m.k, m.v) }))
      .filter((m) => m.v && m.v.length <= 120);
    const [type, id] = p.k.split(':') as [LinkType, string];
    const close = () => this.setState({ peek: null });
    return (
      <div className="kh-wb-dim kh-wb-dim--peek" onClick={close} onPointerDown={(e) => e.stopPropagation()}>
        <div
          className="kh-wb-peek"
          role="dialog"
          aria-modal="true"
          aria-label={p.title}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="kh-wb-peek__head">
            <div>
              <span className="kh-wb-peek__kind">
                <span style={{ background: LINK_DOT[type] }} />
                {T(LINK_KIND[type])}
              </span>
              <span className="kh-wb-peek__title">{p.title}</span>
            </div>
            <button
              type="button"
              className="kh-wb-peek__go"
              onClick={() => {
                close();
                this.props.go(type, id);
              }}
            >
              {T('wb_openPage')} ↗
            </button>
            <button
              type="button"
              className="kh-wb-peek__x"
              title={T('wb_close')}
              aria-label={T('wb_close')}
              onClick={close}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="kh-wb-peek__body">
            {meta.length > 0 && (
              <div className="kh-wb-peek__meta">
                {meta.map((m) => (
                  <div key={m.k}>
                    <span>{m.k}</span>
                    <span>{m.v}</span>
                  </div>
                ))}
              </div>
            )}
            {p.subs.length > 0 && (
              <div className="kh-wb-peek__subs">
                <span>{T('wb_subs')}</span>
                {p.subs.map((s, i) => (
                  <span key={i}>
                    {s.done ? '✓' : '○'} {s.t}
                  </span>
                ))}
              </div>
            )}
            {p.body ? (
              <pre className="kh-wb-peek__text" data-code={p.code || undefined}>
                {p.body}
              </pre>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
}
