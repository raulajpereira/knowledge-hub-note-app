// Alocações → Excel (.xlsx): always 3 sheets (Dias · Semanas · Meses) with the
// app's look — navy title bar, legends, frozen names and two-row date header,
// cells in the project colours, tentative hatched, absences, holidays and
// weekends, load colours, group subtotals, a project and a holiday legend, and
// print setup. The hours come from the shared calculation (src/lib/alloc.ts),
// so they match the screens.
//
// Built in the browser: ExportDialog loads exceljs with a dynamic import when
// "Exportar .xlsx" is clicked, so the app bundle does not grow. exceljs's
// browser build needs no eval under our CSP (its Function() calls are only
// fallbacks for very old engines, never reached) — see tests/e2e/alloc.spec.ts.
import type { Cell, Fill, Font, PaperSize, Workbook, Worksheet } from 'exceljs';
import {
  bookingSeries,
  dnOf,
  holidayName,
  holidayOf,
  isoOf,
  personLoads,
  wdOf,
  type Absence,
  type Booking,
  type CalcEnv,
  type Dn,
  type Zoom,
} from '@/lib/alloc';
import type { MgClient, MgPerson, MgProject, MgTeam } from '@/lib/mg';
import { columns, groupOfArea, loc, type Col } from './shared';

export type XlsxGroupBy = 'team' | 'project' | 'client' | 'module' | 'none' | 'byProject';
export type XlsxInput = {
  lang: string;
  tr: (s: string) => string;
  from: Dn;
  to: Dn;
  /** people of the screen (search, team, area, over / free already applied) */
  people: MgPerson[];
  /** bookings that pass the screen's filters (placeholders included) */
  bookings: Booking[];
  absences: Absence[];
  projects: MgProject[];
  clients: MgClient[];
  teams: MgTeam[];
  levels: string[];
  env: CalcEnv;
  groupBy: XlsxGroupBy;
  showPh: boolean;
  showAbs: boolean;
  /** the filter in words, for the title bar and the footer */
  filterText: string;
  now: Date;
};
type ExcelJSModule = { Workbook: new () => Workbook };

// ── colours ──────────────────────────────────────────────────────────────────
/** oklch(L C H) or #rrggbb → 'RRGGBB' (sRGB, clamped): the app's project / team colours. */
export function oklchHex(s: string): string {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(s);
  if (!m) return /^#?([0-9a-f]{6})$/i.exec(s)?.[1]?.toUpperCase() ?? '9AA0A6';
  const [L, Ch, H] = [+m[1]!, +m[2]!, (+m[3]! * Math.PI) / 180];
  const a = Ch * Math.cos(H);
  const b = Ch * Math.sin(H);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const ss = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * ss,
  ]
    .map((v) => {
      const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, c)) * 255)
        .toString(16)
        .padStart(2, '0');
    })
    .join('')
    .toUpperCase();
}
/** a hex colour mixed with white (t = share of white) */
const tint = (hex: string, t: number) =>
  [0, 2, 4]
    .map((i) =>
      Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - t) + 255 * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase();

// navy title and header, a light body that prints well
export const XC = {
  title: '13234A',
  title2: '0F1D3D',
  head: '1E3264',
  headBand: '182A55',
  ink: 'FFFFFF',
  inkSoft: 'AFC0E6',
  line: 'E4DDD6',
  lineStrong: 'C9BEB4',
  text: '2A211C',
  muted: '8A7D72',
  person: 'F7F3EF',
  weekend: 'F0ECE8',
  holiday: 'FBE6DE',
  absence: 'B8B1AA',
  absenceBg: 'EFEBE7',
  over: 'D9443F',
  ok: 'DDF3E2',
  low: 'FFF2C6',
  today: '4C9BE8',
};
const C = XC;
const solid = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${argb}` } });
const hatch = (fg: string, bg: string): Fill => ({
  type: 'pattern',
  pattern: 'lightUp',
  fgColor: { argb: `FF${fg}` },
  bgColor: { argb: `FF${bg}` },
});
const FONT = 'Arial';
const font = (o: Partial<Font> = {}): Partial<Font> => ({
  name: FONT,
  size: 9,
  color: { argb: `FF${C.text}` },
  ...o,
});
const thin = (argb: string) => ({ style: 'thin' as const, color: { argb: `FF${argb}` } });
const r2 = (v: number) => Math.round(v * 2) / 2;
const fmtH = (v: number) => (Number.isInteger(v) ? '0' : '0.0');
const num = (c: Cell, v: number) => {
  c.value = v;
  c.numFmt = fmtH(v);
};
const dmy = (n: Dn) => isoOf(n).split('-').reverse().join('/');

// ── rows ─────────────────────────────────────────────────────────────────────
type Row =
  | { k: 'g'; label: string; color: string; sub: string }
  | { k: 'p'; p: MgPerson; only?: (b: Booking) => boolean }
  | { k: 'b'; b: Booking; who?: string }
  | { k: 'a'; pid: string };

/** The rows of the export, grouped as on the screen. */
export function exportRows(x: XlsxInput): Row[] {
  const { tr } = x;
  const A = isoOf(x.from);
  const B = isoOf(x.to);
  const inWin = (b: { from: string; to: string }) => b.to >= A && b.from <= B;
  const pjById = Object.fromEntries(x.projects.map((p) => [p.id, p]));
  const pById = Object.fromEntries(x.people.map((p) => [p.id, p]));
  const bks = x.bookings.filter(inWin);
  const absent = (pid: string) => x.showAbs && x.absences.some((a) => a.person === pid && inWin(a));
  const out: Row[] = [];
  const n = (k: number) => tr(k === 1 ? '1 pessoa' : `${k} pessoas`);
  const person = (p: MgPerson, only?: (b: Booking) => boolean) => {
    out.push({ k: 'p', p, only });
    for (const b of bks) if (b.person === p.id && (!only || only(b))) out.push({ k: 'b', b });
    if (absent(p.id)) out.push({ k: 'a', pid: p.id });
  };
  if (x.groupBy === 'byProject') {
    // Projetos: one group per project, a line per role (the person or "Por atribuir")
    const ids = [...new Set(bks.filter((b) => !b.person || pById[b.person]).map((b) => b.project))];
    for (const id of ids.sort((a, b) => (pjById[a]?.code ?? '').localeCompare(pjById[b]?.code ?? ''))) {
      const pj = pjById[id];
      const list = bks.filter((b) => b.project === id && (b.person ? pById[b.person] : x.showPh));
      if (!list.length) continue;
      out.push({
        k: 'g',
        label: `${pj?.code ?? '?'} · ${pj?.name ?? ''}`,
        color: oklchHex(pj?.color ?? ''),
        sub: tr(`${list.length} funções`),
      });
      for (const b of list)
        out.push({ k: 'b', b, who: b.person ? (pById[b.person]?.name ?? '') : tr('Por atribuir') });
    }
    return out;
  }
  if (x.showPh) {
    const ph = bks.filter((b) => !b.person);
    if (ph.length) {
      out.push({
        k: 'g',
        label: tr('Por atribuir'),
        color: '9AA0A6',
        sub: tr(`${ph.length} funções por atribuir`),
      });
      for (const b of ph) out.push({ k: 'b', b });
    }
  }
  const people = x.people;
  if (x.groupBy === 'team') {
    const teams = [
      ...x.teams.map((t) => ({ id: t.id, name: tr(t.name), color: t.color })),
      { id: '', name: tr('Sem equipa'), color: '' },
    ];
    const known = new Set(x.teams.map((t) => t.id));
    for (const t of teams) {
      const ps = people.filter((p) => (t.id ? p.team === t.id : !known.has(p.team)));
      if (!ps.length) continue;
      out.push({ k: 'g', label: t.name, color: oklchHex(t.color), sub: n(ps.length) });
      for (const p of ps) person(p);
    }
  } else if (x.groupBy === 'project' || x.groupBy === 'client') {
    const keyOf = (b: Booking) => (x.groupBy === 'project' ? b.project : pjById[b.project]?.client || '_');
    const keys = new Map<string, Set<string>>();
    for (const b of bks)
      if (b.person && pById[b.person]) {
        const k = keyOf(b);
        if (!keys.has(k)) keys.set(k, new Set());
        keys.get(k)!.add(b.person);
      }
    const label = (k: string) =>
      x.groupBy === 'project'
        ? `${pjById[k]?.code ?? '?'} · ${pjById[k]?.name ?? ''}`
        : (x.clients.find((c) => c.id === k)?.name ?? tr('Sem cliente'));
    for (const [k, ids] of [...keys.entries()].sort((a, b) => label(a[0]).localeCompare(label(b[0])))) {
      const ps = people.filter((p) => ids.has(p.id));
      out.push({
        k: 'g',
        label: label(k),
        color: x.groupBy === 'project' ? oklchHex(pjById[k]?.color ?? '') : '9AA0A6',
        sub: n(ps.length),
      });
      for (const p of ps) person(p, (b) => keyOf(b) === k);
    }
    const idle = people.filter((p) => !bks.some((b) => b.person === p.id));
    if (idle.length) {
      out.push({ k: 'g', label: tr('Sem alocações'), color: 'B8B1AA', sub: n(idle.length) });
      for (const p of idle) person(p);
    }
  } else if (x.groupBy === 'module') {
    const gm = new Map<string, MgPerson[]>();
    for (const p of people) gm.set(groupOfArea(p.area), [...(gm.get(groupOfArea(p.area)) ?? []), p]);
    for (const [g, ps] of gm) {
      out.push({ k: 'g', label: g, color: '6FC3D8', sub: n(ps.length) });
      for (const p of ps) person(p);
    }
  } else for (const p of people) person(p);
  return out;
}

// ── workbook ─────────────────────────────────────────────────────────────────
/** The workbook (3 sheets). `ExcelJS` is the module, loaded by the caller. */
export function buildAllocWorkbook(ExcelJS: ExcelJSModule, x: XlsxInput): Workbook {
  const { tr, lang, env } = x;
  const F = x.from;
  const T = x.to;
  const rows = exportRows(x);
  const pjById = Object.fromEntries(x.projects.map((p) => [p.id, p]));
  const ABS: Record<string, string> = {
    ferias: tr('Férias'),
    doenca: tr('Doença'),
    formacao: tr('Formação'),
    outra: tr('Outra'),
  };
  const ABS_SHORT: Record<string, string> = {
    ferias: tr('Fér'),
    doenca: tr('Doe'),
    formacao: tr('For'),
    outra: tr('Out'),
  };
  const series = new Map<Booking, { from: Dn; h: Float64Array }>();
  const ser = (b: Booking) => {
    let s = series.get(b);
    if (!s) series.set(b, (s = bookingSeries(b, env)));
    return s;
  };
  const sumB = (b: Booking, a: Dn, z: Dn) => {
    const s = ser(b);
    let t = 0;
    for (let n = Math.max(a, s.from); n <= Math.min(z, s.from + s.h.length - 1); n++) t += s.h[n - s.from]!;
    return r2(t);
  };
  const lCache = new Map<string, ReturnType<typeof personLoads>>();
  const loads = (pid: string) => {
    let l = lCache.get(pid);
    if (!l)
      lCache.set(
        pid,
        (l = personLoads(
          pid,
          x.bookings.filter((b) => b.person === pid),
          env,
          F,
          T,
          ser,
        )),
      );
    return l;
  };
  const sumArr = (arr: Float64Array, a: Dn, z: Dn) => {
    let t = 0;
    for (let n = Math.max(a, F); n <= Math.min(z, T); n++) t += arr[n - F]!;
    return r2(t);
  };
  /** absent working days and the first type in [a, z] */
  const absIn = (pid: string, a: Dn, z: Dn) => {
    let days = 0;
    let type = '';
    for (const ab of env.absences(pid))
      for (let n = Math.max(a, dnOf(ab.from)); n <= Math.min(z, dnOf(ab.to)); n++)
        if (wdOf(n) < 5 && !holidayOf(n)) {
          days += ab.hours == null ? 1 : 0.5;
          type ||= ab.type;
        }
    return { days, type };
  };
  const now = x.now;
  const p2 = (v: number) => String(v).padStart(2, '0');
  const NOW = `${p2(now.getDate())}/${p2(now.getMonth() + 1)}/${now.getFullYear()} ${p2(now.getHours())}:${p2(now.getMinutes())}`;
  const weekday = new Intl.DateTimeFormat(loc(lang), { weekday: 'long', timeZone: 'UTC' });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'KnowledgeHub';
  wb.created = now;
  wb.title = tr('Alocações');

  const SHEETS: Array<[string, Zoom, number, string]> = [
    [tr('Dias'), 'day', 5.2, tr('horas por dia')],
    [tr('Semanas'), 'week', 12.5, tr('horas por semana')],
    [tr('Meses'), 'month', 12, tr('horas por mês')],
  ];
  for (const [name, zoom, colW, unit] of SHEETS) {
    const cols: Col[] = columns(zoom, F, T, lang, (k) => holidayName(k, lang)).map((c) => ({
      ...c,
      a: Math.max(c.a, F),
      b: Math.min(c.b, T),
    }));
    const N = cols.length;
    const H = 6; // the two header rows: 6 (band) and 7 (columns)
    const FIX = 3; // Pessoa · Função / Equipa · Carga
    const c0 = FIX + 1;
    const cT = c0 + N; // Total · Capacidade · %
    const last = cT + 2;
    const ws: Worksheet = wb.addWorksheet(name, {
      properties: {
        tabColor: { argb: `FF${zoom === 'day' ? '4C9BE8' : zoom === 'week' ? '5FBF7F' : 'E3A452'}` },
      },
      views: [{ state: 'frozen', xSplit: FIX, ySplit: H + 1, showGridLines: false, zoomScale: 100 }],
      pageSetup: {
        orientation: 'landscape',
        paperSize: 8 as PaperSize, // A3
        fitToPage: true,
        fitToWidth: zoom === 'day' ? Math.max(1, Math.ceil(N / 31)) : 1,
        fitToHeight: 0,
        horizontalCentered: true,
        margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.45, header: 0.2, footer: 0.2 },
        printTitlesRow: `${H}:${H + 1}`,
        printTitlesColumn: 'A:C',
      },
      headerFooter: {
        oddFooter: `&L&8KnowledgeHub · ${tr('Alocações')} · ${name}&C&8${x.filterText.replace(/&/g, '&&')}&R&8${tr('Página')} &P / &N`,
      },
    });
    ws.getColumn(1).width = 26;
    ws.getColumn(2).width = 24;
    ws.getColumn(3).width = 7.5;
    for (let i = 0; i < N; i++) ws.getColumn(c0 + i).width = colW;
    ws.getColumn(cT).width = 9;
    ws.getColumn(cT + 1).width = 9;
    ws.getColumn(cT + 2).width = 7;

    // title bar
    for (let r = 1; r <= 5; r++) {
      ws.getRow(r).height = r === 1 ? 30 : r >= 4 ? 19 : 17;
      for (let c = 1; c <= last; c++) ws.getCell(r, c).fill = solid(r >= 4 ? C.title2 : C.title);
    }
    const t1 = ws.getCell(1, 1);
    t1.value = {
      richText: [
        { text: tr('Alocações'), font: font({ size: 17, bold: true, color: { argb: `FF${C.ink}` } }) },
        { text: `   ·   ${name}`, font: font({ size: 13, color: { argb: `FF${C.inkSoft}` } }) },
      ],
    };
    t1.alignment = { vertical: 'middle', indent: 1 };
    const t2 = ws.getCell(2, 1);
    t2.value = x.filterText;
    t2.font = font({ size: 9.5, color: { argb: `FF${C.ink}` } });
    t2.alignment = { indent: 1, vertical: 'middle' };
    const t3 = ws.getCell(3, 1);
    t3.value = `${tr('Período')}: ${dmy(F)} – ${dmy(T)}  ·  ${unit}  ·  ${tr('gerado a')} ${NOW}`;
    t3.font = font({ size: 9, color: { argb: `FF${C.inkSoft}` } });
    t3.alignment = { indent: 1, vertical: 'middle' };

    // legend and notes strips
    const strip = (row: number, label: string, parts: Array<{ text: string; font: Partial<Font> }>) => {
      ws.mergeCells(row, 1, row, zoom === 'day' ? Math.min(last, c0 + 24) : last);
      const c = ws.getCell(row, 1);
      c.value = {
        richText: [
          { text: `${label}   `, font: font({ size: 8.5, bold: true, color: { argb: `FF${C.inkSoft}` } }) },
          ...parts,
        ],
      };
      c.alignment = { vertical: 'middle', indent: 1, wrapText: true };
    };
    const txt = (t: string, o: Partial<Font> = {}) => ({
      text: t,
      font: font({ size: 8.5, color: { argb: `FF${C.ink}` }, ...o }),
    });
    const lg: Array<[string, string]> = [
      [tr('Confirmado'), oklchHex('oklch(0.8 0.13 50)')],
      [tr('Tentativo (tracejado)'), oklchHex('oklch(0.78 0.12 300)')],
      [tr('Ausência'), C.absence],
      [tr('Feriado'), 'F2A285'],
      [tr('Fim de semana'), '8F8378'],
      [tr('Acima da capacidade'), 'F05A55'],
      [tr('Abaixo de 90 %'), 'F2D27A'],
      ['90–100 %', '7FD69A'],
    ];
    strip(
      4,
      tr('Legenda'),
      lg.flatMap(([l, col]) => [txt('■ ', { size: 11, color: { argb: `FF${col}` } }), txt(`${l}      `)]),
    );
    strip(5, tr('Notas'), [
      txt(`${tr('Carga %')} `, { bold: true }),
      txt(
        `${tr('= horas confirmadas ÷ capacidade (horas semanais da pessoa, menos feriados e ausências)')}      `,
      ),
      txt(`${tr('Ausências')} `, { bold: true }),
      txt(
        `${Object.keys(ABS)
          .map((k) => `${ABS_SHORT[k]} = ${ABS[k]}`)
          .join(' · ')}      `,
      ),
      txt(`${tr('Unidades')} `, { bold: true }),
      txt(`${unit}, ${tr('passos de 0,5 h')}`),
    ]);
    if (zoom === 'month') ws.getRow(5).height = 30;

    // header: the band row and the column labels
    ws.getRow(H).height = 18;
    ws.getRow(H + 1).height = zoom === 'day' ? 28 : 30;
    for (let c = 1; c <= last; c++) {
      ws.getCell(H, c).fill = solid(C.headBand);
      ws.getCell(H + 1, c).fill = solid(C.head);
    }
    const hd = (r: number, c: number, v: string, o: Partial<Font> = {}) => {
      const cell = ws.getCell(r, c);
      cell.value = v;
      cell.font = font({ size: 8.5, bold: true, color: { argb: `FF${C.ink}` }, ...o });
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      return cell;
    };
    const left = { vertical: 'middle' as const, horizontal: 'left' as const, indent: 1 };
    const byProject = x.groupBy === 'byProject';
    ws.mergeCells(H, 1, H + 1, 1);
    hd(H, 1, tr(byProject ? 'PROJETO · PESSOA' : 'PESSOA')).alignment = left;
    ws.mergeCells(H, 2, H + 1, 2);
    hd(H, 2, tr('FUNÇÃO · EQUIPA')).alignment = left;
    ws.mergeCells(H, 3, H + 1, 3);
    hd(H, 3, tr('CARGA'));
    ws.mergeCells(H, cT, H + 1, cT);
    hd(H, cT, tr('TOTAL (h)'));
    ws.mergeCells(H, cT + 1, H + 1, cT + 1);
    hd(H, cT + 1, tr('CAPAC. (h)'));
    ws.mergeCells(H, cT + 2, H + 1, cT + 2);
    hd(H, cT + 2, '%');
    let i0 = 0;
    for (let i = 1; i <= N; i++) {
      if (i < N && cols[i]!.band === cols[i0]!.band) continue;
      if (i - 1 > i0) ws.mergeCells(H, c0 + i0, H, c0 + i - 1);
      const c = cols[i0]!;
      const cell = hd(H, c0 + i0, c.bandSub ? `${c.band}   ${c.bandSub}` : c.band, {
        color: { argb: `FF${C.inkSoft}` },
      });
      cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, shrinkToFit: true };
      for (let k = i0; k < i; k++)
        ws.getCell(H, c0 + k).border = {
          left: k === i0 ? thin('3D5590') : undefined,
          bottom: thin('2E4478'),
        };
      i0 = i;
    }
    cols.forEach((c, i) => {
      const lab =
        zoom === 'day'
          ? `${c.lbl}\n${c.hol ? tr('fer.') : c.sub.slice(0, 3)}`
          : zoom === 'week'
            ? `${c.lbl}\n${c.sub}${c.hol ? ` · ${tr('feriado')}` : ''}`
            : c.lbl;
      const cell = hd(H + 1, c0 + i, lab, {
        size: zoom === 'day' ? 8 : 8.5,
        color: { argb: `FF${c.hol ? 'F2A285' : c.weekend ? C.inkSoft : C.ink}` },
      });
      if (c.today) {
        cell.fill = solid(C.today);
        cell.font = font({ size: zoom === 'day' ? 8 : 8.5, bold: true, color: { argb: 'FFFFFFFF' } });
      }
      cell.border = { left: c.top && i ? thin('3D5590') : thin('2A3E70') };
      if (zoom === 'day' && c.hol) cell.note = holidayName(c.hol, lang);
    });

    // body
    let r = H + 2;
    const groups: Array<{ row: number; lastRow: number; people: number[] }> = [];
    let cur: (typeof groups)[number] | null = null;
    const personRows: number[] = [];
    const bookingRows: number[] = [];
    const shade = (c: Col): Fill | null =>
      c.hol && zoom === 'day' ? solid(C.holiday) : c.weekend ? solid(C.weekend) : null;
    const baseRow = (row: number, h: number, fillAll?: string) => {
      ws.getRow(row).height = h;
      for (let c = 1; c <= last; c++) {
        const cell = ws.getCell(row, c);
        if (fillAll) cell.fill = solid(fillAll);
        cell.border = { bottom: thin(C.line) };
        cell.font = font();
        cell.alignment = {
          vertical: 'middle',
          horizontal: c >= c0 ? 'center' : 'left',
          indent: c < c0 ? 1 : 0,
        };
      }
      for (let i = 0; i < N; i++) {
        const sh = shade(cols[i]!);
        if (sh && !fillAll) ws.getCell(row, c0 + i).fill = sh;
        if (cols[i]!.top && i)
          ws.getCell(row, c0 + i).border = { bottom: thin(C.line), left: thin(C.lineStrong) };
      }
      ws.getCell(row, cT).border = { bottom: thin(C.line), left: thin(C.lineStrong) };
    };
    for (const row of rows) {
      if (row.k === 'g') {
        baseRow(r, 22, tint(row.color, 0.8));
        ws.getCell(r, 1).value = {
          richText: [
            { text: '●  ', font: font({ size: 10, color: { argb: `FF${row.color}` } }) },
            { text: row.label.toUpperCase(), font: font({ size: 9, bold: true }) },
            { text: `   ${row.sub}`, font: font({ size: 8.5, color: { argb: `FF${C.muted}` } }) },
          ],
        };
        ws.mergeCells(r, 1, r, 3);
        for (let c = 1; c <= last; c++)
          ws.getCell(r, c).border = {
            top: thin(C.lineStrong),
            bottom: thin(C.lineStrong),
            left: c === cT ? thin(C.lineStrong) : undefined,
          };
        ws.getCell(r, 1).border = {
          top: thin(C.lineStrong),
          bottom: thin(C.lineStrong),
          left: { style: 'thick', color: { argb: `FF${row.color}` } },
        };
        cur = { row: r, lastRow: r, people: [] };
        groups.push(cur);
        r++;
        continue;
      }
      if (row.k === 'p') {
        const p = row.p;
        const l = loads(p.id);
        baseRow(r, 20, C.person);
        ws.getCell(r, 1).value = p.name;
        ws.getCell(r, 1).font = font({ size: 9.5, bold: true });
        ws.getCell(r, 2).value = [tr(p.role), x.levels[p.level]].filter(Boolean).join(' · ');
        ws.getCell(r, 2).font = font({ size: 8.5, color: { argb: `FF${C.muted}` } });
        let tot = 0;
        let cap = 0;
        cols.forEach((c, i) => {
          const h = sumArr(l.conf, c.a, c.b);
          const k = sumArr(l.cap, c.a, c.b);
          tot += h;
          cap += k;
          if (!h) return;
          const cell = ws.getCell(r, c0 + i);
          num(cell, h);
          const pct = k ? h / k : 9;
          cell.fill = solid(pct > 1.001 ? C.over : pct >= 0.9 ? C.ok : C.low);
          cell.font = font({ bold: true, color: { argb: pct > 1.001 ? 'FFFFFFFF' : `FF${C.text}` } });
        });
        tot = r2(tot);
        cap = r2(cap);
        num(ws.getCell(r, cT), tot);
        ws.getCell(r, cT).font = font({ bold: true, size: 9.5 });
        num(ws.getCell(r, cT + 1), cap);
        ws.getCell(r, cT + 1).font = font({ color: { argb: `FF${C.muted}` } });
        const over = cap > 0 && tot > cap + 0.01;
        const pc = ws.getCell(r, cT + 2);
        pc.value = cap ? tot / cap : 0;
        pc.numFmt = '0%';
        pc.font = font({ bold: true, color: { argb: over ? 'FFFFFFFF' : `FF${C.text}` } });
        pc.fill = solid(over ? C.over : tot / (cap || 1) >= 0.9 ? C.ok : C.low);
        const lc = ws.getCell(r, 3);
        lc.value = { formula: pc.address, result: cap ? tot / cap : 0 };
        lc.numFmt = '0%';
        lc.font = font({ bold: true, color: { argb: over ? `FF${C.over}` : `FF${C.text}` } });
        lc.alignment = { horizontal: 'center', vertical: 'middle' };
        cur?.people.push(r);
        personRows.push(r);
        if (cur) cur.lastRow = r;
        r++;
        continue;
      }
      if (row.k === 'b') {
        const b = row.b;
        const pj = pjById[b.project];
        const col = oklchHex(pj?.color ?? '');
        const tent = b.status === 'tentative';
        baseRow(r, 17);
        const a = ws.getCell(r, 1);
        a.value = {
          richText: [
            { text: '   ', font: font() },
            row.who != null
              ? { text: row.who, font: font({ size: 9, bold: !!b.person, italic: !b.person }) }
              : { text: pj?.code ?? '?', font: font({ size: 8.5, bold: true, name: 'Courier New' }) },
            ...(tent
              ? [
                  {
                    text: `  ${tr('tentativo')}`,
                    font: font({ size: 8, italic: true, color: { argb: 'FF8A62C9' } }),
                  },
                ]
              : []),
          ],
        };
        a.border = { bottom: thin(C.line), left: { style: 'thick', color: { argb: `FF${col}` } } };
        const fn = b.role || pj?.name || '';
        ws.getCell(r, 2).value = b.person || row.who != null ? fn : `${fn} (${tr('por atribuir')})`;
        ws.getCell(r, 2).font = font({ size: 8.5, color: { argb: `FF${C.muted}` } });
        let tot = 0;
        cols.forEach((c, i) => {
          const h = sumB(b, c.a, c.b);
          tot += h;
          if (!h) return;
          const cell = ws.getCell(r, c0 + i);
          num(cell, h);
          cell.fill = tent ? hatch(col, tint(col, 0.6)) : solid(col);
          cell.font = font({ size: 8.5, bold: !tent, italic: tent, color: { argb: 'FF24180F' } });
          cell.border = { bottom: thin('FFFFFF'), left: thin('FFFFFF') };
        });
        num(ws.getCell(r, cT), r2(tot));
        ws.getCell(r, cT).font = font({ italic: tent, color: { argb: tent ? 'FF8A62C9' : `FF${C.text}` } });
        bookingRows.push(r);
        if (cur) cur.lastRow = r;
        r++;
        continue;
      }
      // the absences of the person above
      baseRow(r, 17);
      ws.getCell(r, 1).value = `   ${tr('Ausências')}`;
      ws.getCell(r, 1).font = font({ size: 8.5, italic: true, color: { argb: `FF${C.muted}` } });
      ws.getCell(r, 1).border = {
        bottom: thin(C.line),
        left: { style: 'thick', color: { argb: `FF${C.absence}` } },
      };
      ws.getCell(r, 2).value = [...new Set(env.absences(row.pid).map((a) => ABS[a.type] ?? a.type))].join(
        ', ',
      );
      ws.getCell(r, 2).font = font({ size: 8.5, color: { argb: `FF${C.muted}` } });
      let days = 0;
      cols.forEach((c, i) => {
        const ab = absIn(row.pid, c.a, c.b);
        if (!ab.days) return;
        days += ab.days;
        const cell = ws.getCell(r, c0 + i);
        cell.value = zoom === 'day' ? (ABS_SHORT[ab.type] ?? '') : `${ABS[ab.type] ?? ''} ${ab.days}d`;
        cell.fill = hatch(C.absence, C.absenceBg);
        cell.font = font({ size: zoom === 'day' ? 7 : 8, bold: true, color: { argb: 'FF5E554E' } });
        cell.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
      });
      const tc = ws.getCell(r, cT);
      tc.value = `${days} ${tr('dias')}`;
      tc.font = font({ size: 8.5, italic: true, color: { argb: `FF${C.muted}` } });
      tc.alignment = { horizontal: 'center', vertical: 'middle' };
      if (cur) cur.lastRow = r;
      r++;
    }
    if (!rows.length) {
      baseRow(r, 22);
      ws.getCell(r, 1).value = tr('Ninguém com estes filtros.');
      r++;
    }
    // group subtotals (formulas, so edits in the sheet add up)
    const sumCells = (row: number, refs: number[], ink: string) => {
      for (let i = 0; i <= N; i++) {
        const c = i < N ? c0 + i : cT;
        const L = ws.getColumn(c).letter;
        const v = r2(refs.reduce((s, rr) => s + (Number(ws.getCell(rr, c).value) || 0), 0));
        const cell = ws.getCell(row, c);
        cell.value = refs.length ? { formula: refs.map((rr) => `${L}${rr}`).join('+'), result: v } : 0;
        cell.numFmt = `${fmtH(v)};;""`;
        cell.font = font({ size: 8.5, bold: true, color: { argb: `FF${ink}` } });
      }
    };
    for (const g of groups)
      sumCells(
        g.row,
        g.people.length ? g.people : Array.from({ length: g.lastRow - g.row }, (_, k) => g.row + 1 + k),
        C.text,
      );
    // grand total (people; in Projetos the role lines)
    baseRow(r, 22, C.title2);
    ws.getCell(r, 1).value = tr('TOTAL');
    ws.getCell(r, 1).font = font({ size: 9, bold: true, color: { argb: `FF${C.ink}` } });
    sumCells(r, personRows.length ? personRows : bookingRows, C.ink);
    for (let c = 1; c <= last; c++) ws.getCell(r, c).border = {};

    // legend blocks: the projects (colour, code, name, client) and the national holidays
    const used = [...new Set(rows.flatMap((w) => (w.k === 'b' ? [w.b.project] : [])))]
      .map((id) => pjById[id])
      .filter((p): p is MgProject => !!p)
      .sort((a, b) => a.code.localeCompare(b.code));
    const hols: Array<[Dn, string]> = [];
    for (let n = F; n <= T; n++) {
      const h = holidayOf(n);
      if (h) hols.push([n, holidayName(h, lang)]);
    }
    const block = (title: string) => {
      r += 2;
      ws.getRow(r).height = 20;
      for (let c = 1; c <= 3; c++) ws.getCell(r, c).fill = solid(C.title);
      ws.mergeCells(r, 1, r, 3);
      const t = ws.getCell(r, 1);
      t.value = title;
      t.font = font({ bold: true, color: { argb: `FF${C.ink}` } });
      t.alignment = { vertical: 'middle', indent: 1 };
    };
    const line = (a: string, b: string, fill: Fill, mono = false) => {
      r++;
      ws.getRow(r).height = 17;
      const ca = ws.getCell(r, 1);
      ca.value = a;
      ca.font = font({ size: 8.5, bold: true, name: mono ? 'Courier New' : FONT });
      ca.alignment = { vertical: 'middle', indent: 1 };
      ca.fill = fill;
      ws.mergeCells(r, 2, r, 3);
      const cb = ws.getCell(r, 2);
      cb.value = b;
      cb.font = font({ size: 8.5, color: { argb: `FF${C.muted}` } });
      cb.alignment = { vertical: 'middle', indent: 1 };
      for (let c = 1; c <= 3; c++) ws.getCell(r, c).border = { bottom: thin(C.line) };
    };
    block(`${tr('PROJETOS')} (${used.length})  ·  ${tr('cor das células')}`);
    for (const pj of used)
      line(
        pj.code,
        `${pj.name} · ${x.clients.find((c) => c.id === pj.client)?.name ?? '—'}`,
        solid(oklchHex(pj.color)),
        true,
      );
    block(`${tr('FERIADOS NACIONAIS NO PERÍODO')} (${hols.length})`);
    for (const [n, h] of hols)
      line(dmy(n), `${h} · ${weekday.format(new Date(n * 86_400_000))}`, solid(C.holiday));
  }
  return wb;
}

/** "alocacoes_<filtro>_<de>_<ate>.xlsx" */
export function exportFileName(filter: string, from: Dn, to: Dn) {
  const slug =
    filter
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'todas';
  return `alocacoes_${slug}_${isoOf(from)}_${isoOf(to)}.xlsx`;
}
