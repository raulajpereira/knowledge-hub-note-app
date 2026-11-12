import 'server-only';
import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped } from 'fflate';
import {
  BLOCKS,
  CELL_RE,
  colName,
  colNum,
  emptyMapping,
  placeLines,
  type Line,
  type Mapping,
} from '@/lib/budget';

// The person's Excel model (P&L) is filled by editing its own XML: only the
// mapped cells change, everything else (styles, formulas, the other sheets,
// print setup…) stays exactly as it was. When a block has more lines than
// rows, rows are inserted after its last row as copies of it (formulas and
// formatting) and every reference below moves down; the sums that end on the
// block's last row grow with it. Excel recalculates everything on opening.

export const MAX_TEMPLATE = 5 * 1024 * 1024;
const MAX_UNZIPPED = 60 * 1024 * 1024;

export class TemplateError extends Error {}

// ---------------------------------------------------------------- xml helpers

const unesc = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function attrs(raw: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of raw.matchAll(/([\w:]+)="([^"]*)"/g)) m.set(a[1]!, a[2]!);
  return m;
}
const attrStr = (m: Map<string, string>) => [...m].map(([k, v]) => ` ${k}="${v}"`).join('');

// ------------------------------------------------------------ formula refs

type Part = { colAbs: boolean; col: number; rowAbs: boolean; row: number };
type Ref = { sheet: string | null; a: Part; b: Part | null };

// a cell or a range, with an optional sheet ('Folha 1'!A1, Orçamento!$C$9);
// not part of a name or a function (LOG10(…)), not a whole column / row
const REF_RE =
  /(?<![\w.$'!À-￿])((?:'(?:[^']|'')+'|[A-Za-z_À-￿][\w.À-￿]*)!)?(\$?)([A-Z]{1,3})(\$?)(\d+)(?::(\$?)([A-Z]{1,3})(\$?)(\d+))?(?![\w(À-￿])/g;

const sheetOf = (prefix: string | undefined) =>
  !prefix ? null : prefix.startsWith("'") ? prefix.slice(1, -2).replace(/''/g, "'") : prefix.slice(0, -1);

const partStr = (p: Part) => `${p.colAbs ? '$' : ''}${colName(p.col)}${p.rowAbs ? '$' : ''}${p.row}`;

/** Rewrites the cell references of a formula (string literals left alone). `fn` returns null for #REF!. */
export function mapRefs(f: string, fn: (r: Ref) => Ref | null): string {
  return f
    .split(/("(?:[^"]|"")*")/)
    .map((seg, i) =>
      i % 2
        ? seg
        : seg.replace(REF_RE, (all, prefix: string | undefined, ...m: string[]) => {
            const [ca, c, ra, r, cb2, c2, rb2, r2] = m as [
              string,
              string,
              string,
              string,
              string | undefined,
              string | undefined,
              string | undefined,
              string | undefined,
            ];
            const a: Part = { colAbs: !!ca, col: colNum(c), rowAbs: !!ra, row: Number(r) };
            const b: Part | null = c2
              ? { colAbs: !!cb2, col: colNum(c2), rowAbs: !!rb2, row: Number(r2) }
              : null;
            if (a.col > 16384 || (b && b.col > 16384)) return all;
            const out = fn({ sheet: sheetOf(prefix), a, b });
            if (!out) return `${prefix ?? ''}#REF!`;
            return `${prefix ?? ''}${partStr(out.a)}${out.b ? `:${partStr(out.b)}` : ''}`;
          }),
    )
    .join('');
}

/** A formula copied dr rows / dc columns away (relative parts move). */
export function translate(f: string, dr: number, dc: number): string {
  const mv = (p: Part): Part => ({
    ...p,
    row: p.rowAbs ? p.row : p.row + dr,
    col: p.colAbs ? p.col : p.col + dc,
  });
  return mapRefs(f, (r) => {
    const a = mv(r.a);
    const b = r.b ? mv(r.b) : null;
    if (a.row < 1 || a.col < 1 || (b && (b.row < 1 || b.col < 1))) return null;
    return { ...r, a, b };
  });
}

/**
 * `n` rows inserted at row `pos` of a sheet: references at or below move down;
 * a range that ends on the row just above (the block's last row) grows.
 */
export function insertRowsRef(r: Ref, pos: number, n: number, grow = true): Ref {
  if (!r.b) return r.a.row >= pos ? { ...r, a: { ...r.a, row: r.a.row + n } } : r;
  const [top, bot] = r.a.row <= r.b.row ? (['a', 'b'] as const) : (['b', 'a'] as const);
  const out = { ...r, a: { ...r.a }, b: { ...r.b } };
  if (out[top].row >= pos) {
    out[top].row += n;
    out[bot].row += n;
  } else if (out[bot].row >= (grow ? pos - 1 : pos)) out[bot].row += n;
  return out;
}

export function insertRowsFormula(
  f: string,
  onTarget: (sheet: string | null) => boolean,
  pos: number,
  n: number,
) {
  return mapRefs(f, (r) => (onTarget(r.sheet) ? insertRowsRef(r, pos, n) : r));
}

const shiftSqref = (sq: string, pos: number, n: number, grow: boolean) =>
  sq
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => mapRefs(x, (r) => insertRowsRef(r, pos, n, grow)))
    .join(' ');

// ------------------------------------------------------------- sheet model

type XCell = { col: number; attrs: Map<string, string>; inner: string | null };
type XRow = { r: number; attrs: Map<string, string>; cells: XCell[] };
type XSheet = { head: string; rows: XRow[]; tail: string };

function parseSheet(xml: string): XSheet {
  const a = xml.indexOf('<sheetData');
  if (a < 0) throw new TemplateError('no_sheet_data');
  const selfClosing = /^<sheetData[^>]*\/>/.exec(xml.slice(a));
  if (selfClosing) {
    return {
      head: xml.slice(0, a) + '<sheetData>',
      rows: [],
      tail: '</sheetData>' + xml.slice(a + selfClosing[0].length),
    };
  }
  const open = xml.indexOf('>', a) + 1;
  const close = xml.indexOf('</sheetData>', open);
  const body = xml.slice(open, close);
  const rows: XRow[] = [];
  for (const m of body.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const ra = attrs(m[1]!);
    const r = Number(ra.get('r'));
    ra.delete('r');
    const cells: XCell[] = [];
    for (const c of (m[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ca = attrs(c[1]!);
      const ref = CELL_RE.exec(ca.get('r') ?? '');
      ca.delete('r');
      if (!ref) continue;
      cells.push({ col: colNum(ref[1]!), attrs: ca, inner: c[2] ?? null });
    }
    rows.push({ r, attrs: ra, cells });
  }
  // rows without r (allowed, rare): number them after the previous one
  let prev = 0;
  for (const row of rows) {
    if (!Number.isFinite(row.r) || row.r <= prev) row.r = prev + 1;
    prev = row.r;
  }
  return { head: xml.slice(0, open), rows, tail: xml.slice(close) };
}

function writeSheet(s: XSheet): string {
  const rows = s.rows
    .sort((x, y) => x.r - y.r)
    .map((row) => {
      const cells = row.cells
        .sort((x, y) => x.col - y.col)
        .map((c) => {
          const at = `<c r="${colName(c.col)}${row.r}"${attrStr(c.attrs)}`;
          return c.inner === null || c.inner === '' ? `${at}/>` : `${at}>${c.inner}</c>`;
        })
        .join('');
      return `<row r="${row.r}"${attrStr(row.attrs)}>${cells}</row>`;
    })
    .join('');
  return s.head + rows + s.tail;
}

const F_RE = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/;
const formulaOf = (c: XCell) => {
  const m = c.inner ? F_RE.exec(c.inner) : null;
  return m ? { attrs: attrs(m[1]!), text: unesc(m[2] ?? '') } : null;
};
/** New text for a cell's formula; a shared one becomes its own (the other attributes stay). */
const setFormula = (c: XCell, text: string) => {
  c.inner = (c.inner ?? '').replace(F_RE, (_, raw: string) => {
    const a = attrs(raw);
    if (a.get('t') === 'shared') {
      a.delete('t');
      a.delete('si');
      a.delete('ref');
    }
    return `<f${attrStr(a)}>${esc(text)}</f>`;
  });
};

// ------------------------------------------------------------ the workbook

type Book = { files: Unzipped; sheets: Array<{ name: string; path: string }> };

function openBook(data: Uint8Array): Book {
  if (data.byteLength > MAX_TEMPLATE) throw new TemplateError('file_too_large');
  let total = 0;
  let files: Unzipped;
  try {
    files = unzipSync(data, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_UNZIPPED) throw new TemplateError('file_too_large');
        return true;
      },
    });
  } catch (e) {
    if (e instanceof TemplateError) throw e;
    throw new TemplateError('not_xlsx');
  }
  const wb = files['xl/workbook.xml'];
  const rels = files['xl/_rels/workbook.xml.rels'];
  if (!wb || !rels) throw new TemplateError('not_xlsx');
  if (Object.keys(files).some((k) => /vbaProject/i.test(k))) throw new TemplateError('macros');
  const target = new Map<string, string>();
  for (const m of strFromU8(rels).matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]!);
    const t = a.get('Target') ?? '';
    target.set(a.get('Id') ?? '', t.startsWith('/') ? t.slice(1) : `xl/${t}`);
  }
  const sheets: Book['sheets'] = [];
  for (const m of strFromU8(wb).matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]!);
    const p = target.get(a.get('r:id') ?? '');
    if (p && files[p]) sheets.push({ name: unesc(a.get('name') ?? ''), path: p });
  }
  if (!sheets.length) throw new TemplateError('not_xlsx');
  return { files, sheets };
}

function sharedStrings(b: Book): string[] {
  const x = b.files['xl/sharedStrings.xml'];
  if (!x) return [];
  return [...strFromU8(x).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1]!.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unesc(t[1]!)).join(''),
  );
}

function cellText(c: XCell, ss: string[]): string {
  const t = c.attrs.get('t');
  const inner = c.inner ?? '';
  if (t === 'inlineStr')
    return [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unesc(m[1]!)).join('');
  const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
  if (v === undefined) return '';
  if (t === 's') return ss[Number(v)] ?? '';
  if (t === 'b') return v === '1' ? 'VERDADEIRO' : 'FALSO';
  return unesc(v);
}

// ------------------------------------------------------------- the preview

export type Preview = {
  sheets: string[];
  sheet: string;
  /** rows as shown: [row number, cells (col letter → text)] */
  rows: Array<{ r: number; cells: Record<string, { v: string; f?: true }> }>;
  maxCol: number;
};

const PREVIEW_ROWS = 150;
const PREVIEW_COLS = 30;

/** What the mapping screen shows: the sheet's first rows, values as last calculated. */
export function previewTemplate(data: Uint8Array, sheet?: string): Preview {
  const b = openBook(data);
  const sh = b.sheets.find((s) => s.name === sheet) ?? b.sheets[0]!;
  const ss = sharedStrings(b);
  const xs = parseSheet(strFromU8(b.files[sh.path]!));
  let maxCol = 1;
  const rows: Preview['rows'] = [];
  for (const row of xs.rows) {
    if (row.r > PREVIEW_ROWS) break;
    const cells: Preview['rows'][number]['cells'] = {};
    for (const c of row.cells) {
      if (c.col > PREVIEW_COLS) continue;
      const f = formulaOf(c);
      const v = cellText(c, ss).slice(0, 120);
      if (!v && !f) continue;
      cells[colName(c.col)] = f ? { v, f: true } : { v };
      maxCol = Math.max(maxCol, c.col);
    }
    rows.push({ r: row.r, cells });
  }
  return { sheets: b.sheets.map((s) => s.name), sheet: sh.name, rows, maxCol };
}

/** A first mapping from the model's own labels (Cliente, Serviços, Sub-Total, Descrição…), to confirm. */
export function guessMapping(p: Preview): Mapping {
  const map = emptyMapping(p.sheet);
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const txt = (r: Preview['rows'][number], c: string) => norm(r.cells[c]?.v ?? '');
  const next = (c: string) => colName(colNum(c) + 1);
  // header fields: a label with the value on its right
  for (const r of p.rows)
    for (const [c, cell] of Object.entries(r.cells)) {
      if (cell.f) continue;
      const v = norm(cell.v).replace(/:$/, '');
      if (v === 'cliente' && !map.fields.client) map.fields.client = `${next(c)}${r.r}`;
      if ((v === 'ref' || v === 'referencia') && !map.fields.ref) map.fields.ref = `${next(c)}${r.r}`;
    }
  // the line columns: the header row with "Descrição"
  const head = p.rows.find((r) => Object.keys(r.cells).some((c) => txt(r, c).startsWith('descri')));
  if (head) {
    for (const c of Object.keys(head.cells)) {
      const v = txt(head, c);
      if (v === '#' || v === 'dias' || v === 'qtd' || v === 'quantidade') map.cols.days ??= c;
      else if (v.startsWith('descri')) map.cols.desc ??= c;
      else if (v.startsWith('tipo')) map.cols.type ??= c;
      else if (v.startsWith('# rec') || v === 'consultores' || v === 'recursos') map.cols.count ??= c;
      else if (v.startsWith('custo unit') || v.startsWith('preco unit') || v.includes('/dia'))
        map.cols.rate ??= c;
    }
  }
  // the blocks: a title in the first column, its rows up to the next "Sub-Total"
  const first = map.cols.days ?? 'A';
  const titles: Array<[RegExp, (typeof BLOCKS)[number]]> = [
    [/^servi/, 'services'],
    [/^gest/, 'mgmt'],
    [/^garantia/, 'warranty'],
  ];
  const rows = p.rows.filter((r) => !head || r.r > head.r);
  for (const [re, block] of titles) {
    const i = rows.findIndex((r) => re.test(txt(r, first)) && !Number(r.cells[first]?.v));
    if (i < 0) continue;
    const end = rows.findIndex((r, j) => j > i && /^sub-?\s?total/.test(txt(r, first)));
    if (end < 0 || rows[end]!.r - rows[i]!.r < 2) continue;
    map.blocks[block] = { from: rows[i]!.r + 1, to: rows[end]!.r - 1 };
  }
  return map;
}

// ------------------------------------------------------------- the filling

export type FillInput = { client: string; ref: string; lines: Line[] };

function unshare(xs: XSheet) {
  const masters = new Map<string, { text: string; r: number; c: number }>();
  for (const row of xs.rows)
    for (const c of row.cells) {
      const f = formulaOf(c);
      if (f?.attrs.get('t') === 'shared' && f.attrs.has('ref'))
        masters.set(f.attrs.get('si')!, { text: f.text, r: row.r, c: c.col });
    }
  for (const row of xs.rows)
    for (const c of row.cells) {
      const f = formulaOf(c);
      if (!f) continue;
      if (f.attrs.get('t') === 'shared') {
        const m = masters.get(f.attrs.get('si') ?? '');
        setFormula(c, m ? translate(m.text, row.r - m.r, c.col - m.c) : f.text);
      } else if (f.attrs.get('t') !== 'array' && f.attrs.get('t') !== 'dataTable') setFormula(c, f.text);
    }
}

/** Formula cells lose their last value: Excel works them out again on opening. */
function dropValues(xs: XSheet) {
  for (const row of xs.rows)
    for (const c of row.cells) {
      if (!c.inner || !F_RE.test(c.inner)) continue;
      c.inner = c.inner.replace(/<v>[\s\S]*?<\/v>|<v\/>/g, '');
      c.attrs.delete('t');
    }
}

function cellAt(xs: XSheet, r: number, col: number, create: boolean): XCell | null {
  let row = xs.rows.find((x) => x.r === r);
  if (!row) {
    if (!create) return null;
    row = { r, attrs: new Map(), cells: [] };
    xs.rows.push(row);
  }
  let c = row.cells.find((x) => x.col === col);
  if (!c && create) {
    c = { col, attrs: new Map(), inner: null };
    const s = row.attrs.get('customFormat') === '1' ? row.attrs.get('s') : undefined;
    if (s) c.attrs.set('s', s);
    row.cells.push(c);
  }
  return c ?? null;
}

function put(xs: XSheet, ref: string, value: string | number | null) {
  const m = CELL_RE.exec(ref);
  if (!m) return;
  const c = cellAt(xs, Number(m[2]), colNum(m[1]!), value !== null);
  if (!c || formulaOf(c)) return; // never over a formula
  c.attrs.delete('t');
  if (value === null || value === '') c.inner = null;
  else if (typeof value === 'number') c.inner = `<v>${Number.isFinite(value) ? value : 0}</v>`;
  else {
    c.attrs.set('t', 'inlineStr');
    c.inner = `<is><t xml:space="preserve">${esc(value)}</t></is>`;
  }
}

/** Rows inserted in one sheet: everything in the workbook that points at or below them moves. */
function insertRows(b: Book, model: Map<string, XSheet>, target: string, last: number, n: number) {
  const pos = last + 1;
  for (const [name, xs] of model) {
    const onTarget = (s: string | null) => (s ?? name) === target;
    for (const row of xs.rows)
      for (const c of row.cells) {
        const f = formulaOf(c);
        if (f) setFormula(c, insertRowsFormula(f.text, onTarget, pos, n));
      }
    if (name !== target) continue;
    // the rows below move; the last row of the block is copied n times
    const src = xs.rows.find((r) => r.r === last);
    for (const row of xs.rows) if (row.r >= pos) row.r += n;
    for (let k = 1; k <= n; k++) {
      const cells: XCell[] = (src?.cells ?? []).map((c) => {
        const copy: XCell = { col: c.col, attrs: new Map(c.attrs), inner: c.inner };
        const f = formulaOf(copy);
        if (f) setFormula(copy, translate(f.text, k, 0));
        return copy;
      });
      xs.rows.push({ r: last + k, attrs: new Map(src?.attrs ?? []), cells });
    }
    // merged cells, conditional formats, validations, the used range
    xs.tail = xs.tail
      .replace(/<mergeCell ref="([^"]+)"\/>/g, (_, ref: string) => {
        const moved = `<mergeCell ref="${shiftSqref(ref, pos, n, false)}"/>`;
        const m = /^[A-Z]+(\d+):[A-Z]+(\d+)$/.exec(ref);
        if (!m || Number(m[1]) !== last || Number(m[2]) !== last) return moved;
        const copies = Array.from({ length: n }, (_, i) => `<mergeCell ref="${translate(ref, i + 1, 0)}"/>`);
        return moved + copies.join('');
      })
      .replace(
        /(<(?:conditionalFormatting|dataValidation|selection)\b[^>]*\bsqref=")([^"]+)"/g,
        (_, a: string, sq: string) => {
          return `${a}${shiftSqref(sq, pos, n, true)}"`;
        },
      )
      .replace(
        /(<hyperlink\b[^>]*\bref=")([^"]+)"/g,
        (_, a: string, ref: string) => `${a}${shiftSqref(ref, pos, n, false)}"`,
      )
      .replace(
        /<formula>([\s\S]*?)<\/formula>/g,
        (_, f: string) => `<formula>${esc(insertRowsFormula(unesc(f), onTarget, pos, n))}</formula>`,
      );
    const count = (xs.tail.match(/<mergeCell /g) ?? []).length;
    xs.tail = xs.tail.replace(/<mergeCells count="\d+"/, `<mergeCells count="${count}"`);
    xs.head = xs.head
      .replace(
        /(<dimension ref=")([^"]+)"/,
        (_, a: string, ref: string) => `${a}${shiftSqref(ref, pos, n, true)}"`,
      )
      .replace(
        /(<selection\b[^>]*\bsqref=")([^"]+)"/g,
        (_, a: string, sq: string) => `${a}${shiftSqref(sq, pos, n, false)}"`,
      );
    shiftDrawings(b, model, name, pos, n);
  }
  // defined names (print area, named ranges…)
  const wb = strFromU8(b.files['xl/workbook.xml']!).replace(
    /(<definedName\b[^>]*>)([\s\S]*?)(<\/definedName>)/g,
    (_, a: string, f: string, z: string) =>
      a + esc(mapRefs(unesc(f), (r) => (r.sheet === target ? insertRowsRef(r, pos, n, false) : r))) + z,
  );
  b.files['xl/workbook.xml'] = strToU8(wb);
}

/** Pictures / charts anchored at or below the inserted rows move with them. */
function shiftDrawings(b: Book, model: Map<string, XSheet>, sheet: string, pos: number, n: number) {
  const sh = b.sheets.find((s) => s.name === sheet);
  if (!sh || !model.has(sheet)) return;
  const relPath = sh.path.replace(/([^/]+)$/, '_rels/$1.rels');
  const rels = b.files[relPath];
  if (!rels) return;
  for (const m of strFromU8(rels).matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]!);
    if (!/\/drawing$/.test(a.get('Type') ?? '')) continue;
    const t = a.get('Target') ?? '';
    const p = t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\.\//, '')}`;
    const x = b.files[p];
    if (!x) continue;
    b.files[p] = strToU8(
      strFromU8(x).replace(/<xdr:row>(\d+)<\/xdr:row>/g, (s, r: string) =>
        Number(r) >= pos - 1 ? `<xdr:row>${Number(r) + n}</xdr:row>` : s,
      ),
    );
  }
}

/** The calculation chain is rebuilt by Excel; the workbook recalculates on opening. */
function recalcOnOpen(b: Book) {
  delete b.files['xl/calcChain.xml'];
  const rels = 'xl/_rels/workbook.xml.rels';
  b.files[rels] = strToU8(strFromU8(b.files[rels]!).replace(/<Relationship\b[^>]*\/calcChain"[^>]*\/>/g, ''));
  const ct = '[Content_Types].xml';
  if (b.files[ct])
    b.files[ct] = strToU8(strFromU8(b.files[ct]).replace(/<Override\b[^>]*calcChain[^>]*\/>/g, ''));
  let wb = strFromU8(b.files['xl/workbook.xml']!);
  if (/<calcPr\b/.test(wb)) {
    wb = wb.replace(/<calcPr\b([^>]*?)(\/?)>/, (_, a: string, sl: string) => {
      const m = attrs(a);
      m.set('fullCalcOnLoad', '1');
      return `<calcPr${attrStr(m)}${sl}>`;
    });
  } else {
    const at = wb.search(
      /<(?:oleSize|customWorkbookViews|pivotCaches|smartTagPr|smartTagTypes|webPublishing|fileRecoveryPr|webPublishObjects|extLst)\b|<\/workbook>/,
    );
    wb = wb.slice(0, at) + '<calcPr fullCalcOnLoad="1"/>' + wb.slice(at);
  }
  b.files['xl/workbook.xml'] = strToU8(wb);
}

export type FillReport = { inserted: Array<{ block: string; rows: number }> };

/** The model with the budget written in its mapped cells. */
export function fillTemplate(
  data: Uint8Array,
  map: Mapping,
  input: FillInput,
): { file: Uint8Array; report: FillReport } {
  const b = openBook(data);
  const sh = b.sheets.find((s) => s.name === map.sheet);
  if (!sh) throw new TemplateError('sheet_missing');
  const model = new Map<string, XSheet>();
  for (const s of b.sheets) {
    const xs = parseSheet(strFromU8(b.files[s.path]!));
    unshare(xs);
    model.set(s.name, xs);
  }
  const xs = model.get(sh.name)!;
  if (map.fields.client) put(xs, map.fields.client, input.client);
  if (map.fields.ref) put(xs, map.fields.ref, input.ref);

  const report: FillReport = { inserted: [] };
  const places = placeLines(map, input.lines).sort((a, z) => z.from - a.from); // bottom first
  for (const p of places) {
    if (p.extra > 0) {
      insertRows(b, model, sh.name, p.to, p.extra);
      report.inserted.push({ block: p.block, rows: p.extra });
    }
    const rows = p.to - p.from + 1 + p.extra;
    for (let i = 0; i < rows; i++) {
      const r = p.from + i;
      const l = p.lines[i];
      const cols = map.cols;
      if (cols.days) put(xs, `${cols.days}${r}`, l ? l.days : null);
      if (cols.desc) put(xs, `${cols.desc}${r}`, l ? l.desc : null);
      if (cols.type) put(xs, `${cols.type}${r}`, l ? l.type : null);
      if (cols.count) put(xs, `${cols.count}${r}`, l ? l.count : null);
      if (cols.rate) put(xs, `${cols.rate}${r}`, l ? l.rate : null);
    }
  }
  for (const [name, s] of model) {
    dropValues(s);
    b.files[b.sheets.find((x) => x.name === name)!.path] = strToU8(writeSheet(s));
  }
  recalcOnOpen(b);
  report.inserted.reverse();
  return { file: zipSync(b.files, { level: 6 }), report };
}

/** Checks a model can be read (on upload). */
export function checkTemplate(data: Uint8Array) {
  const p = previewTemplate(data);
  return { sheets: p.sheets };
}
