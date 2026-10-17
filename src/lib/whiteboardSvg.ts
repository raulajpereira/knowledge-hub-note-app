// A whiteboard as a standalone SVG (data export): shapes, lines/arrows, pen
// strokes, text and sticky notes; images point at `image(fileId)`, app links
// are drawn as labelled boxes. A simplified rendering of the editor's drawing.
import { isLine, wbBB, wbEnds, wbMap, wbPath, wbUnion, type WbEl } from './whiteboard';

const x = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const dashOf = (d: string, sw: number) =>
  d === 'dashed'
    ? ` stroke-dasharray="${sw * 3} ${sw * 2}"`
    : d === 'dotted'
      ? ` stroke-dasharray="1 ${sw * 2}"`
      : '';

function textBlock(
  t: string,
  box: { x: number; y: number; w: number; h: number },
  fs: number,
  fill: string,
  center: boolean,
) {
  const lines = t.split('\n');
  const lh = fs * 1.25;
  const y0 = center ? box.y + box.h / 2 - ((lines.length - 1) * lh) / 2 : box.y + fs;
  const tx = center ? box.x + box.w / 2 : box.x + 4;
  return `<text x="${tx}" y="${y0}" font-size="${fs}" fill="${fill}"${center ? ' text-anchor="middle" dominant-baseline="middle"' : ''}>${lines
    .map((l, i) => `<tspan x="${tx}" dy="${i ? lh : 0}">${x(l)}</tspan>`)
    .join('')}</text>`;
}

export function whiteboardSvg(els: WbEl[], image: (file: string) => string): string {
  const M = wbMap(els);
  const u = wbUnion(els.map((e) => wbBB(e, M))) ?? { x: 0, y: 0, w: 400, h: 300 };
  const pad = 40;
  const vb = [u.x - pad, u.y - pad, u.w + 2 * pad, u.h + 2 * pad];
  const parts: string[] = [
    `<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#2b231e"/>`,
    '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs>',
  ];
  for (const el of els) {
    if (el.t === 'pen') {
      parts.push(
        `<path d="${wbPath(el.pts)}" fill="none" stroke="${el.stroke}" stroke-width="${el.sw}" stroke-opacity="${el.op}" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    } else if (isLine(el)) {
      const [p, q] = wbEnds(el, M);
      parts.push(
        `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${el.stroke}" stroke-width="${el.sw}"${dashOf(el.dash, el.sw)}${el.t === 'arrow' ? ' marker-end="url(#ah)"' : ''}/>`,
      );
    } else if (el.t === 'rect' || el.t === 'ellipse' || el.t === 'diamond') {
      const common = `fill="${el.fill === 'none' ? 'none' : el.fill}" stroke="${el.stroke}" stroke-width="${el.sw}"${dashOf(el.dash, el.sw)}`;
      if (el.t === 'rect')
        parts.push(`<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="10" ${common}/>`);
      else if (el.t === 'ellipse')
        parts.push(
          `<ellipse cx="${el.x + el.w / 2}" cy="${el.y + el.h / 2}" rx="${el.w / 2}" ry="${el.h / 2}" ${common}/>`,
        );
      else
        parts.push(
          `<path d="M${el.x + el.w / 2} ${el.y}L${el.x + el.w} ${el.y + el.h / 2}L${el.x + el.w / 2} ${el.y + el.h}L${el.x} ${el.y + el.h / 2}Z" ${common}/>`,
        );
      if (el.text) parts.push(textBlock(el.text, el, el.fs, el.stroke, true));
    } else if (el.t === 'text') {
      parts.push(textBlock(el.text, el, el.fs, el.stroke, false));
    } else if (el.t === 'sticky') {
      parts.push(`<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="6" fill="${el.fill}"/>`);
      parts.push(textBlock(el.text, { ...el, x: el.x + 8, y: el.y + 8 }, el.fs, '#2a211c', false));
    } else if (el.t === 'image') {
      parts.push(
        `<image href="${x(image(el.file))}" x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" preserveAspectRatio="xMidYMid meet"/>`,
      );
    } else if (el.t === 'link') {
      parts.push(
        `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="12" fill="rgba(255,255,255,.1)" stroke="#7fb2ff"/>`,
      );
      parts.push(textBlock(el.ref.split(':')[0]!, el, 14, '#efe7df', true));
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" width="${vb[2]}" height="${vb[3]}" font-family="system-ui, sans-serif">\n${parts.join('\n')}\n</svg>\n`;
}
