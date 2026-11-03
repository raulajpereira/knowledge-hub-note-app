import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { dnOf, weeklyOf, type Absence, type CalcEnv } from '@/lib/alloc';
import { MG_LV, mgSample } from '@/lib/mg';
import { mgTr } from '@/lib/mgText';
import { buildAllocWorkbook, exportFileName, oklchHex, XC, type XlsxInput } from '@/components/mg/alloc/xlsx';

// Alocações → Excel: the workbook built from the demo data (as "Exportar .xlsx" does)
const D = mgSample(() => crypto.randomUUID(), new Date('2026-10-30T10:00:00Z'));
const pById = Object.fromEntries(D.people.map((p) => [p.id, p]));
const absBy = new Map<string, Absence[]>();
for (const a of D.absences) absBy.set(a.person, [...(absBy.get(a.person) ?? []), a]);
const env: CalcEnv = { weekly: (p) => weeklyOf(pById[p]?.cap), absences: (p) => absBy.get(p) ?? [] };
const input = (o: Partial<XlsxInput> = {}): XlsxInput => ({
  lang: 'pt',
  tr: (s) => s,
  from: dnOf('2026-11-02'),
  to: dnOf('2027-01-31'),
  people: D.people.filter((p) => p.status === 'Ativo'),
  bookings: D.bookings,
  absences: D.absences,
  projects: D.projects,
  clients: D.clients,
  teams: D.teams,
  levels: MG_LV,
  env,
  groupBy: 'team',
  showPh: true,
  showAbs: true,
  filterText: 'Todas as equipas · Pessoas · agrupado por equipa',
  now: new Date('2026-11-02T10:00:00Z'),
  ...o,
});
/** written and read back, as a spreadsheet app would open it */
async function roundTrip(x: XlsxInput) {
  const buf = await buildAllocWorkbook(ExcelJS, x).xlsx.writeBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  return wb;
}
const texts = (ws: ExcelJS.Worksheet) => {
  const out: string[] = [];
  ws.eachRow((row) =>
    row.eachCell((c) => {
      const v = c.value as unknown;
      out.push(
        typeof v === 'object' && v && 'richText' in v
          ? (v as { richText: Array<{ text: string }> }).richText.map((t) => t.text).join('')
          : String(v ?? ''),
      );
    }),
  );
  return out;
};
/** a number, or the cached result of a formula */
const num = (v: unknown) =>
  typeof v === 'number'
    ? v
    : v && typeof v === 'object' && 'result' in v
      ? Number((v as { result: unknown }).result)
      : NaN;
const formulaOf = (v: unknown) =>
  v && typeof v === 'object' && 'formula' in v ? String((v as { formula: unknown }).formula) : '';
const fillOf = (c: ExcelJS.Cell) => (c.fill as { fgColor?: { argb?: string } } | undefined)?.fgColor?.argb;

describe('alocações → xlsx', () => {
  it('has exactly 3 sheets: Dias, Semanas, Meses (translated)', async () => {
    const wb = await roundTrip(input());
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Dias', 'Semanas', 'Meses']);
    const en = await roundTrip(input({ lang: 'en', tr: (s) => mgTr(s, 'en') }));
    expect(en.worksheets.map((w) => w.name)).toEqual(['Days', 'Weeks', 'Months']);
  });

  it('navy title bar, frozen panes, print setup', async () => {
    const ws = (await roundTrip(input())).getWorksheet('Semanas')!;
    expect(fillOf(ws.getCell(1, 1))).toBe(`FF${XC.title}`);
    expect(fillOf(ws.getCell(6, 1))).toBe(`FF${XC.headBand}`);
    expect(texts(ws).some((t) => t.startsWith('Alocações'))).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', xSplit: 3, ySplit: 7 });
    expect(ws.pageSetup).toMatchObject({ orientation: 'landscape', fitToWidth: 1 });
  });

  it('week columns and week bands show the date range', async () => {
    const wb = await roundTrip(input());
    expect(texts(wb.getWorksheet('Semanas')!)).toContain('09/11 – 15/11\nS46');
    expect(texts(wb.getWorksheet('Dias')!)).toContain('09/11 – 15/11   S46');
    expect(texts(wb.getWorksheet('Meses')!)).toEqual(expect.arrayContaining(['nov', 'dez', 'jan']));
  });

  it('booking cells hold the hours in the project colour; tentative is hatched', async () => {
    const ws = (await roundTrip(input())).getWorksheet('Semanas')!;
    let solidSeen = false;
    let hatchSeen = false;
    ws.eachRow((row) => {
      const a = row.getCell(1).value as { richText?: Array<{ text: string }> } | null;
      const code = a?.richText
        ?.map((t) => t.text)
        .join('')
        .trim()
        .split(/\s+/)[0];
      const pj = D.projects.find((p) => p.code === code);
      if (!pj) return;
      row.eachCell((c, col) => {
        if (col < 4 || num(c.value) <= 0) return;
        const f = c.fill as { pattern?: string; fgColor?: { argb?: string } };
        if (f.fgColor?.argb !== `FF${oklchHex(pj.color)}`) return;
        if (f.pattern === 'solid') solidSeen = true;
        if (f.pattern === 'lightUp') hatchSeen = true;
      });
    });
    expect(solidSeen).toBe(true);
    expect(hatchSeen).toBe(true);
  });

  it('person rows: totals are formulas (SUM of the confirmed project rows), with cached results', async () => {
    expect(buildAllocWorkbook(ExcelJS, input()).calcProperties.fullCalcOnLoad).toBe(true);
    const wb = await roundTrip(input());
    const ws = wb.getWorksheet('Semanas')!;
    const joao = D.people.find((p) => p.name === 'João Carvalho')!;
    let found = false;
    ws.eachRow((row, rn) => {
      if (row.getCell(1).value !== joao.name) return;
      found = true;
      // 40 h in the first full week (Monday 2/11 – 6/11) = SUM of his project row(s)
      const wk = row.getCell(4);
      expect(formulaOf(wk.value)).toMatch(/^SUM\(D\d+/);
      expect(num(wk.value)).toBe(40);
      const last = row.cellCount;
      // Total (h) = SUM across the periods, Capacidade = SUM of the hidden capacity row, % = Total / Capacidade
      expect(formulaOf(row.getCell(last - 2).value)).toMatch(new RegExp(`^SUM\\(D${rn}:`));
      expect(formulaOf(row.getCell(last - 1).value)).toMatch(new RegExp(`^SUM\\(D${rn + 1}:`));
      expect(ws.getRow(rn + 1).hidden).toBe(true);
      expect(formulaOf(row.getCell(last).value)).toMatch(/^IFERROR\(/);
      expect(num(row.getCell(last).value)).toBeGreaterThan(0.95);
      expect(formulaOf(row.getCell(3).value)).toBe(row.getCell(last).address);
    });
    expect(found).toBe(true);
  });

  it('Semanas / Meses periods are sums of the Dias sheet; groups and TOTAL are formulas', async () => {
    const wb = await roundTrip(input());
    const sem = wb.getWorksheet('Semanas')!;
    const dias = wb.getWorksheet('Dias')!;
    let checked = 0;
    sem.eachRow((row, rn) => {
      const a = row.getCell(1).value as { richText?: Array<{ text: string }> } | null;
      if (!a?.richText?.some((t) => t.text === 'LUS-S4')) return;
      const f = formulaOf(row.getCell(5).value);
      if (!f) return;
      // 09/11 – 15/11 = Dias columns of those days, same row
      expect(f).toMatch(new RegExp(`^SUM\\('Dias'!\\w+${rn}:\\w+${rn}\\)$`));
      let days = 0;
      // November only (the first weeks of the sheet)
      for (let c = 4; c <= 4 + 20; c++) {
        const lbl = String(dias.getCell(7, c).value ?? '');
        if (/^(9|1[0-5])\n/.test(lbl)) days += num(dias.getCell(rn, c).value) || 0;
      }
      expect(num(row.getCell(5).value)).toBe(days);
      checked++;
    });
    expect(checked).toBeGreaterThan(0);
    const total = sem.getColumn(1).values.findIndex((v) => v === 'TOTAL');
    expect(formulaOf(sem.getCell(total, 4).value)).toMatch(/^SUM\(/);
    const cf = (sem as unknown as { conditionalFormattings: unknown[] }).conditionalFormattings;
    expect(cf.length).toBeGreaterThan(10);
  });

  it('legends: strips, the projects block and the holidays block', async () => {
    const t = texts((await roundTrip(input())).getWorksheet('Meses')!);
    expect(t.some((x) => x.startsWith('Legenda') && x.includes('Tentativo'))).toBe(true);
    expect(t.some((x) => x.includes('Fér = Férias'))).toBe(true);
    expect(t.some((x) => x.startsWith('PROJETOS ('))).toBe(true);
    expect(t).toContain('LUS-S4');
    expect(t.some((x) => x.startsWith('FERIADOS NACIONAIS NO PERÍODO (4)'))).toBe(true);
    expect(t).toContain('25/12/2026');
  });

  it('Projetos: grouped by project, a line per role', async () => {
    const t = texts((await roundTrip(input({ groupBy: 'byProject' }))).getWorksheet('Semanas')!);
    expect(t.some((x) => x.includes('LUS-S4 · ') && x.includes('funções'))).toBe(true);
  });

  it('file name', () => {
    expect(exportFileName('Finanças & Logística', dnOf('2026-11-02'), dnOf('2027-01-31'))).toBe(
      'alocacoes_financas-logistica_2026-11-02_2027-01-31.xlsx',
    );
  });
});
