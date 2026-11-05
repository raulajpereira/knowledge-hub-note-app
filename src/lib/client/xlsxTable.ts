'use client';

import type { Workbook } from 'exceljs';

// A list of the app → Excel (.xlsx), in the same look as the Alocações export:
// navy title bar (title, filter and when it was made), navy header, light body
// that prints well, frozen header, filters on every column, numbers as numbers
// (€, h, %, dates as real dates) and a totals row of SUBTOTAL formulas — so
// Excel's own filters keep the totals right. exceljs is loaded on click.

export type XCol<R> = {
  header: string;
  /** characters (Excel column width) */
  width?: number;
  type?: 'text' | 'int' | 'num' | 'eur' | 'hours' | 'pct' | 'date' | 'datetime';
  value: (r: R) => string | number | null | undefined;
  /** totals row: sum (SUBTOTAL 109) or average (101) of the visible rows */
  total?: 'sum' | 'avg';
  /** a fill for the cell (hex 'RRGGBB'), e.g. status colours */
  fill?: (r: R) => string | null | undefined;
};

export type XTable<R> = {
  title: string;
  /** the filter in words */
  subtitle?: string;
  sheet: string;
  columns: Array<XCol<R>>;
  rows: R[];
  fileName: string;
  lang: string;
  /** "Total" in the language of the app */
  totalLabel: string;
  generatedLabel: string;
};

// the Alocações export's colours (components/mg/alloc/xlsx.ts XC)
const XC = {
  title: '13234A',
  title2: '0F1D3D',
  head: '1E3264',
  ink: 'FFFFFF',
  inkSoft: 'AFC0E6',
  line: 'E4DDD6',
  lineStrong: 'C9BEB4',
  text: '2A211C',
  person: 'F7F3EF',
};

const FMT: Record<string, string> = {
  int: '0',
  num: '#,##0.##',
  eur: '#,##0 "€";-#,##0 "€";"–"',
  hours: '#,##0.# "h";-#,##0.# "h";"–"',
  pct: '0%',
  date: 'dd/mm/yyyy',
  datetime: 'dd/mm/yyyy hh:mm',
};
const colL = (n: number) => {
  let s = '';
  for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const solid = (hex: string) => ({
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: `FF${hex}` },
});
const thin = (hex: string) => ({ style: 'thin' as const, color: { argb: `FF${hex}` } });
const asDate = (v: unknown) => {
  if (typeof v !== 'string' || !v) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  // Excel has no time zone: keep the local wall time
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? d : new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
};

export function buildTableWorkbook<R>(
  ExcelJS: { Workbook: new () => Workbook },
  t: XTable<R>,
  now = new Date(),
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'KnowledgeHub';
  wb.created = now;
  wb.title = t.title;
  const ws = wb.addWorksheet(t.sheet.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    headerFooter: { oddFooter: `&L${t.title}&R&P / &N` },
  });
  const n = t.columns.length;
  const last = colL(n - 1);
  ws.columns = t.columns.map((c) => ({ width: c.width ?? (c.type && c.type !== 'text' ? 14 : 24) }));
  const p2 = (v: number) => String(v).padStart(2, '0');
  const stamp = `${p2(now.getDate())}/${p2(now.getMonth() + 1)}/${now.getFullYear()} ${p2(now.getHours())}:${p2(now.getMinutes())}`;

  // 1–2: title bar
  ws.mergeCells(`A1:${last}1`);
  ws.mergeCells(`A2:${last}2`);
  const t1 = ws.getCell('A1');
  t1.value = t.title;
  t1.font = { name: 'Arial', size: 15, bold: true, color: { argb: `FF${XC.ink}` } };
  t1.alignment = { vertical: 'middle', indent: 1 };
  const t2 = ws.getCell('A2');
  t2.value = [t.subtitle, `${t.generatedLabel} ${stamp}`].filter(Boolean).join('  ·  ');
  t2.font = { name: 'Arial', size: 9, color: { argb: `FF${XC.inkSoft}` } };
  t2.alignment = { vertical: 'top', indent: 1 };
  ws.getRow(1).height = 30;
  ws.getRow(2).height = 20;
  for (let i = 1; i <= n; i++) {
    ws.getRow(1).getCell(i).fill = solid(XC.title);
    ws.getRow(2).getCell(i).fill = solid(XC.title);
  }
  ws.getRow(3).height = 6;

  // 4: header
  const hr = ws.getRow(4);
  hr.height = 24;
  t.columns.forEach((c, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = c.header;
    cell.fill = solid(XC.head);
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: `FF${XC.ink}` } };
    cell.alignment = {
      vertical: 'middle',
      horizontal: c.type && c.type !== 'text' ? 'right' : 'left',
      indent: 1,
      wrapText: true,
    };
    cell.border = { bottom: thin(XC.title2) };
  });

  // body
  const first = 5;
  t.rows.forEach((r, k) => {
    const row = ws.getRow(first + k);
    row.height = 18;
    t.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const raw = c.value(r);
      let v: string | number | Date | null = raw ?? null;
      if (c.type === 'date' || c.type === 'datetime') v = asDate(raw);
      else if (c.type && c.type !== 'text' && typeof raw === 'string') v = raw === '' ? null : +raw;
      cell.value = v as never;
      if (c.type && FMT[c.type]) cell.numFmt = FMT[c.type]!;
      cell.font = { name: 'Arial', size: 9, color: { argb: `FF${XC.text}` } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: c.type && c.type !== 'text' ? 'right' : 'left',
        indent: 1,
      };
      const f = c.fill?.(r);
      cell.fill = solid(f ?? (k % 2 ? 'FBF9F7' : 'FFFFFF'));
      cell.border = { bottom: thin(XC.line) };
    });
  });

  // totals: SUBTOTAL keeps them right with Excel's filters
  const lastRow = first + t.rows.length - 1;
  if (t.columns.some((c) => c.total) && t.rows.length) {
    const tr = ws.getRow(lastRow + 1);
    tr.height = 20;
    t.columns.forEach((c, i) => {
      const cell = tr.getCell(i + 1);
      cell.fill = solid(XC.person);
      cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: `FF${XC.text}` } };
      cell.border = { top: thin(XC.lineStrong) };
      cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right', indent: 1 };
      if (i === 0 && !c.total) cell.value = t.totalLabel;
      if (!c.total) return;
      const L = colL(i);
      const vals = t.rows.map((r) => +(c.value(r) ?? 0) || 0);
      const result =
        c.total === 'sum' ? vals.reduce((a, b) => a + b, 0) : vals.reduce((a, b) => a + b, 0) / vals.length;
      cell.value = {
        formula: `SUBTOTAL(${c.total === 'sum' ? 109 : 101},${L}${first}:${L}${lastRow})`,
        result: Math.round(result * 100) / 100,
      };
      if (c.type && FMT[c.type]) cell.numFmt = FMT[c.type]!;
    });
  }
  if (t.rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: lastRow, column: n } };
  wb.calcProperties = { fullCalcOnLoad: true };
  return wb;
}

/** Builds the workbook and downloads it. */
export async function downloadTableXlsx<R>(t: XTable<R>) {
  const mod = await import('exceljs');
  const ExcelJS = ((mod as { default?: unknown }).default ?? mod) as { Workbook: new () => Workbook };
  const wb = buildTableWorkbook(ExcelJS, t);
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = t.fileName.endsWith('.xlsx') ? t.fileName : `${t.fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "Tickets 2026-11-04.xlsx" */
export const xlsxName = (base: string, now = new Date()) =>
  `${base.replace(/[\\/:*?"<>|]+/g, '-')} ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.xlsx`;
