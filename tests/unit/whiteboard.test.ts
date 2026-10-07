import { describe, expect, it } from 'vitest';
import {
  wbBB,
  wbEdge,
  wbEnds,
  wbMap,
  wbMove,
  wbPath,
  wbRemove,
  wbScale,
  wbUnion,
  WbDocSchema,
  type LineEl,
  type ShapeEl,
  type WbEl,
} from '@/lib/whiteboard';

// Whiteboard geometry (ported from Whiteboard.dc.html) and the document schema
// the API enforces.
const rect = (id: string, x: number, y: number, w = 100, h = 50): ShapeEl => ({
  id,
  t: 'rect',
  x,
  y,
  w,
  h,
  stroke: '#fbf8f5',
  fill: 'none',
  sw: 4,
  dash: 'solid',
  fs: 18,
  text: '',
});
const arrow = (a: string | null, b: string | null): LineEl => ({
  id: 'l',
  t: 'arrow',
  x1: 0,
  y1: 0,
  x2: 10,
  y2: 0,
  a,
  b,
  stroke: '#fbf8f5',
  sw: 4,
  dash: 'solid',
});

describe('geometry', () => {
  it('arrows attach to the outline of the boxes they connect, 8 units out', () => {
    const A = rect('a', 0, 0),
      B = rect('b', 300, 0);
    const [p, q] = wbEnds(arrow('a', 'b'), wbMap([A, B]));
    expect(p).toEqual([108, 25]);
    expect(q).toEqual([292, 25]);
    const E: ShapeEl = { ...A, t: 'ellipse', w: 100, h: 100 };
    expect(wbEdge(E, 200, 50)).toEqual([108, 50]);
    const D: ShapeEl = { ...A, t: 'diamond', w: 100, h: 100 };
    expect(wbEdge(D, 50, 300)).toEqual([50, 108]);
  });

  it('bounding boxes, union, move and scale', () => {
    const pen: WbEl = {
      id: 'p',
      t: 'pen',
      pts: [
        [0, 0],
        [10, 20],
      ],
      stroke: '#ffffff',
      sw: 4,
      op: 1,
    };
    expect(wbBB(pen, {})).toEqual({ x: -2, y: -2, w: 14, h: 24 });
    expect(
      wbUnion([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 20, y: -5, w: 5, h: 5 },
      ]),
    ).toEqual({ x: 0, y: -5, w: 25, h: 15 });
    expect(wbUnion([])).toBeNull();
    expect(wbMove(rect('a', 1, 2), 10, 10)).toMatchObject({ x: 11, y: 12 });
    const s = wbScale(rect('a', 0, 0, 100, 50), { x: 0, y: 0, w: 100, h: 50 }, { x: 0, y: 0, w: 200, h: 25 });
    expect(s).toMatchObject({ w: 200, h: 25 });
    expect(
      wbScale(rect('a', 0, 0, 10, 10), { x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 1, h: 1 }),
    ).toMatchObject({ w: 8, h: 8 });
  });

  it('removing a box keeps the arrows where they were, detached', () => {
    const out = wbRemove([rect('a', 0, 0), rect('b', 300, 0), arrow('a', 'b')], new Set(['a']));
    expect(out.map((e) => e.id)).toEqual(['b', 'l']);
    expect(out[1]).toMatchObject({ a: null, b: 'b', x1: 108, y1: 25 });
  });

  it('freehand path is smoothed', () => {
    expect(wbPath([[0, 0]])).toBe('M0 0l0.01 0');
    expect(
      wbPath([
        [0, 0],
        [10, 10],
        [20, 0],
      ]),
    ).toBe('M0 0Q10 10 15 5L20 0');
  });
});

describe('document schema', () => {
  const ok = (els: unknown[]) => WbDocSchema.safeParse({ els }).success;
  it('accepts every element type of the prototype', () => {
    expect(
      ok([
        rect('a', 0, 0),
        { ...rect('d', 0, 0), t: 'diamond', fill: '#6aa8f5', dash: 'dashed', text: 'Go / No-go' },
        arrow('a', null),
        { id: 'p', t: 'pen', pts: [[1, 2]], stroke: '#f5d36b', sw: 16, op: 0.35 },
        { id: 't', t: 'text', x: 0, y: 0, w: 320, h: 30, stroke: '#fbf8f5', fs: 22, text: 'Olá' },
        { id: 's', t: 'sticky', x: 0, y: 0, w: 200, h: 200, fill: '#f5d36b', fs: 18, text: '' },
        {
          id: 'k',
          t: 'link',
          x: 0,
          y: 0,
          w: 270,
          h: 78,
          ref: 'snippet:0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
        },
        { id: 'i', t: 'image', x: 0, y: 0, w: 100, h: 80, file: '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' },
      ]),
    ).toBe(true);
  });
  it.each([
    ['unknown type', { id: 'x', t: 'iframe', x: 0, y: 0, w: 1, h: 1 }],
    ['image by URL', { id: 'i', t: 'image', x: 0, y: 0, w: 1, h: 1, src: 'https://evil.example/x.png' }],
    ['extra field', { ...rect('a', 0, 0), onclick: 'alert(1)' }],
    ['bad colour', { ...rect('a', 0, 0), stroke: 'url(javascript:alert(1))' }],
    [
      'link to unknown type',
      { id: 'k', t: 'link', x: 0, y: 0, w: 1, h: 1, ref: 'user:0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' },
    ],
    ['huge coordinate', { ...rect('a', 0, 0), x: 1e12 }],
    ['NaN', { ...rect('a', 0, 0), w: Number.NaN }],
  ])('rejects %s', (_n, el) => expect(ok([el])).toBe(false));
  it('rejects duplicate ids', () => expect(ok([rect('a', 0, 0), rect('a', 1, 1)])).toBe(false));
});
