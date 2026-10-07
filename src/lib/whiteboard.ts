import { z } from 'zod';

// Whiteboard (Whiteboard.dc.html): element model, geometry helpers and the
// document schema the server validates. Shared by the client and the API.

export const WB_INK = [
  '#fbf8f5',
  '#2a211c',
  '#f5d36b',
  '#f5a25c',
  '#ef6a5a',
  '#e889b5',
  '#a98bf0',
  '#6aa8f5',
  '#5cc8c0',
  '#7ccf7c',
];
export const WB_PAPER = [
  '#f5d36b',
  '#f7b37a',
  '#f49a9a',
  '#f2a7cf',
  '#c7b4f5',
  '#9cc7f7',
  '#8fdad2',
  '#a8e0a0',
  '#fbf8f5',
];
export const WB_SW = [2, 4, 7, 12];
export const WB_FS = [16, 22, 32, 48];
export const WB_ACC = '#7fb2ff';
export const WB_MAX_ELS = 5000;
export const LINK_TYPES = ['note', 'task', 'voice', 'issue', 'artifact', 'snippet'] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export type Dash = 'solid' | 'dashed' | 'dotted';
type Base = { id: string };
type Box = { x: number; y: number; w: number; h: number };
export type ShapeEl = Base &
  Box & {
    t: 'rect' | 'ellipse' | 'diamond';
    stroke: string;
    fill: string;
    sw: number;
    dash: Dash;
    fs: number;
    text: string;
  };
export type LineEl = Base & {
  t: 'line' | 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  a: string | null;
  b: string | null;
  stroke: string;
  sw: number;
  dash: Dash;
};
export type PenEl = Base & { t: 'pen'; pts: Array<[number, number]>; stroke: string; sw: number; op: number };
export type TextEl = Base & Box & { t: 'text'; stroke: string; fs: number; text: string };
export type StickyEl = Base & Box & { t: 'sticky'; fill: string; fs: number; text: string };
export type LinkEl = Base & Box & { t: 'link'; ref: string };
export type ImageEl = Base & Box & { t: 'image'; file: string };
export type WbEl = ShapeEl | LineEl | PenEl | TextEl | StickyEl | LinkEl | ImageEl;
export type BoxEl = ShapeEl | TextEl | StickyEl | LinkEl | ImageEl;
export type ElMap = Record<string, WbEl>;
export type Rect = Box;
export type Pt = [number, number];

export const isShape = (t: string): t is ShapeEl['t'] => t === 'rect' || t === 'ellipse' || t === 'diamond';
export const isLine = (el: WbEl | undefined): el is LineEl => !!el && (el.t === 'line' || el.t === 'arrow');
export const isBox = (el: WbEl | undefined): el is BoxEl => !!el && !isLine(el) && el.t !== 'pen';

/** Point on the outline of a box element towards (tx, ty), 8 units outside (arrow gap). */
export function wbEdge(el: BoxEl, tx: number, ty: number): Pt {
  const cx = el.x + el.w / 2,
    cy = el.y + el.h / 2,
    dx = tx - cx,
    dy = ty - cy,
    len = Math.hypot(dx, dy) || 1;
  let t: number;
  if (el.t === 'ellipse') t = 1 / (Math.sqrt((dx / (el.w / 2)) ** 2 + (dy / (el.h / 2)) ** 2) || 1);
  else if (el.t === 'diamond') t = 1 / (Math.abs(dx) / (el.w / 2) + Math.abs(dy) / (el.h / 2) || 1);
  else t = Math.min(el.w / 2 / (Math.abs(dx) || 1e-9), el.h / 2 / (Math.abs(dy) || 1e-9));
  return [cx + dx * t + (dx / len) * 8, cy + dy * t + (dy / len) * 8];
}

/** End points of a line, following the boxes it is attached to. */
export function wbEnds(el: LineEl, M: ElMap): [Pt, Pt] {
  const A = el.a && isBox(M[el.a]) ? (M[el.a] as BoxEl) : null;
  const B = el.b && isBox(M[el.b]) ? (M[el.b] as BoxEl) : null;
  let p1: Pt = [el.x1, el.y1],
    p2: Pt = [el.x2, el.y2];
  const cA: Pt = A ? [A.x + A.w / 2, A.y + A.h / 2] : p1,
    cB: Pt = B ? [B.x + B.w / 2, B.y + B.h / 2] : p2;
  if (A) p1 = wbEdge(A, cB[0], cB[1]);
  if (B) p2 = wbEdge(B, cA[0], cA[1]);
  return [p1, p2];
}

export function wbBB(el: WbEl, M: ElMap): Rect {
  if (el.t === 'pen') {
    let a = 1e9,
      b = 1e9,
      c = -1e9,
      d = -1e9;
    for (const [x, y] of el.pts) {
      a = Math.min(a, x);
      b = Math.min(b, y);
      c = Math.max(c, x);
      d = Math.max(d, y);
    }
    const p = el.sw / 2;
    return { x: a - p, y: b - p, w: c - a + 2 * p, h: d - b + 2 * p };
  }
  if (isLine(el)) {
    const [p, q] = wbEnds(el, M);
    return {
      x: Math.min(p[0], q[0]),
      y: Math.min(p[1], q[1]),
      w: Math.abs(p[0] - q[0]),
      h: Math.abs(p[1] - q[1]),
    };
  }
  return { x: el.x, y: el.y, w: el.w, h: el.h };
}

export function wbUnion(bs: Rect[]): Rect | null {
  if (!bs.length) return null;
  let a = 1e9,
    b = 1e9,
    c = -1e9,
    d = -1e9;
  for (const r of bs) {
    a = Math.min(a, r.x);
    b = Math.min(b, r.y);
    c = Math.max(c, r.x + r.w);
    d = Math.max(d, r.y + r.h);
  }
  return { x: a, y: b, w: c - a, h: d - b };
}

/** Smoothed freehand path (quadratic curves through the midpoints). */
export function wbPath(pts: Pt[]): string {
  const f = pts[0]!;
  if (pts.length < 2) return `M${f[0]} ${f[1]}l0.01 0`;
  let d = `M${f[0]} ${f[1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!,
      n = pts[i + 1]!;
    d += `Q${p[0]} ${p[1]} ${(p[0] + n[0]) / 2} ${(p[1] + n[1]) / 2}`;
  }
  const l = pts[pts.length - 1]!;
  return `${d}L${l[0]} ${l[1]}`;
}

export function wbMove<T extends WbEl>(el: T, dx: number, dy: number): T {
  if (el.t === 'pen') return { ...el, pts: el.pts.map(([x, y]) => [x + dx, y + dy] as Pt) };
  if (isLine(el)) return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
  const b = el as BoxEl;
  return { ...b, x: b.x + dx, y: b.y + dy } as T;
}

export function wbScale<T extends WbEl>(el: T, o: Rect, nb: Rect): T {
  const sx = nb.w / (o.w || 1),
    sy = nb.h / (o.h || 1),
    X = (x: number) => nb.x + (x - o.x) * sx,
    Y = (y: number) => nb.y + (y - o.y) * sy;
  if (el.t === 'pen') return { ...el, pts: el.pts.map(([x, y]) => [X(x), Y(y)] as Pt) };
  if (isLine(el)) return { ...el, x1: X(el.x1), y1: Y(el.y1), x2: X(el.x2), y2: Y(el.y2) };
  const b = el as BoxEl;
  return { ...b, x: X(b.x), y: Y(b.y), w: Math.max(8, b.w * sx), h: Math.max(8, b.h * sy) } as T;
}

/** Removes elements; lines attached to a removed box keep their last position. */
export function wbRemove(els: WbEl[], ids: Set<string>): WbEl[] {
  const M = wbMap(els);
  return els
    .filter((e) => !ids.has(e.id))
    .map((e) => {
      if (isLine(e) && ((e.a && ids.has(e.a)) || (e.b && ids.has(e.b)))) {
        const [p, q] = wbEnds(e, M);
        return {
          ...e,
          x1: p[0],
          y1: p[1],
          x2: q[0],
          y2: q[1],
          a: e.a && ids.has(e.a) ? null : e.a,
          b: e.b && ids.has(e.b) ? null : e.b,
        };
      }
      return e;
    });
}

export const wbMap = (els: WbEl[]): ElMap => Object.fromEntries(els.map((e) => [e.id, e]));
export const wbId = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Image element ids referenced by a document (kept on the board's storage). */
export const wbFiles = (els: WbEl[]) => els.flatMap((e) => (e.t === 'image' ? [e.file] : []));

// ── Document schema (server-side validation) ───────────────────────────────
const num = z.number().finite().min(-1e6).max(1e6);
const size = z.number().finite().min(0).max(1e6);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const fill = z.union([z.literal('none'), color]);
const elId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
const sw = z.number().finite().min(0.5).max(80);
const fs = z.number().finite().min(8).max(120);
const dash = z.enum(['solid', 'dashed', 'dotted']);
const text = z.string().max(10000);
const box = { id: elId, x: num, y: num, w: size, h: size };
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const WbElSchema = z.discriminatedUnion('t', [
  z
    .object({ ...box, t: z.enum(['rect', 'ellipse', 'diamond']), stroke: color, fill, sw, dash, fs, text })
    .strict(),
  z
    .object({
      id: elId,
      t: z.enum(['line', 'arrow']),
      x1: num,
      y1: num,
      x2: num,
      y2: num,
      a: elId.nullable(),
      b: elId.nullable(),
      stroke: color,
      sw,
      dash,
    })
    .strict(),
  z
    .object({
      id: elId,
      t: z.literal('pen'),
      pts: z
        .array(z.tuple([num, num]))
        .min(1)
        .max(5000),
      stroke: color,
      sw,
      op: z.number().min(0.05).max(1),
    })
    .strict(),
  z.object({ ...box, t: z.literal('text'), stroke: color, fs, text }).strict(),
  z.object({ ...box, t: z.literal('sticky'), fill: color, fs, text }).strict(),
  z
    .object({
      ...box,
      t: z.literal('link'),
      ref: z.string().regex(new RegExp(`^(${LINK_TYPES.join('|')}):[0-9a-f-]{36}$`)),
    })
    .strict(),
  z.object({ ...box, t: z.literal('image'), file: uuid }).strict(),
]);

export const WbDocSchema = z
  .object({ els: z.array(WbElSchema).max(WB_MAX_ELS) })
  .strict()
  .refine((d) => new Set(d.els.map((e) => e.id)).size === d.els.length, { message: 'duplicate_id' });
