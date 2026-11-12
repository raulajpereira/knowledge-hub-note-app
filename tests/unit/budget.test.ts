import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildLines, defaultMatrix, placeLines, totalCost, type Matrix } from '@/lib/budget';
import {
  fillTemplate,
  guessMapping,
  insertRowsFormula,
  previewTemplate,
  translate,
} from '@/server/budget/xlsx';

function matrix(): Matrix {
  const m = defaultMatrix();
  const set = (code: string, k: string, gf: number, bf: number, n = 1) => {
    m.modules.find((x) => x.code === code)!.days[k] = { gf, bf, n };
  };
  set('EC', 'CONS', 90, 60);
  set('ECP', 'CONS', 170, 120, 2);
  set('EC', 'INT', 15, 10);
  set('ECP', 'INT', 25, 20);
  set('EC', 'GP', 8, 5);
  set('ECP', 'GP', 7, 5);
  set('EC', 'GAR', 20, 15);
  set('ECP', 'GAR', 20, 15);
  return m;
}

describe('budget lines', () => {
  it('one consultant line per module, shared profiles added up, warranty per module', () => {
    const ls = buildLines(matrix(), ['EC', 'ECP'], 'gf');
    expect(ls.map((l) => [l.block, l.desc, l.days, l.count])).toEqual([
      ['services', 'Consultor SAP SF Employee Central', 90, 1],
      ['services', 'Consultor SAP SF Employee Central Payroll', 170, 2],
      ['services', 'Técnico de Integração', 40, 1],
      ['mgmt', 'Gestor de Projectos', 15, 1],
      ['warranty', 'Consultor SF EC', 20, 1],
      ['warranty', 'Consultor SF ECP', 20, 1],
    ]);
    expect(buildLines(matrix(), ['EC'], 'bf').map((l) => l.days)).toEqual([60, 10, 5, 15]);
    expect(totalCost(ls)).toBe(375 * (90 + 170 * 2 + 40 + 15 + 40));
  });
  it('places the lines in the mapped rows and counts the rows to insert', () => {
    const ls = buildLines(matrix(), ['EC', 'ECP'], 'gf');
    const p = placeLines(
      {
        sheet: 'S',
        fields: {},
        cols: {},
        blocks: { services: { from: 18, to: 19 }, mgmt: { from: 25, to: 26 } },
      },
      ls,
    );
    expect(p.map((x) => [x.block, x.lines.length, x.extra])).toEqual([
      ['services', 3, 1],
      ['mgmt', 1, 0],
    ]);
  });
});

describe('formula references', () => {
  it('moves relative parts only, leaves strings and functions alone', () => {
    expect(translate('IF(D18="",A18*E18,A18*D18*E18)', 3, 0)).toBe('IF(D21="",A21*E21,A21*D21*E21)');
    expect(translate('F24*$G$4+LOG10(A1)&"A1"', 1, 0)).toBe('F25*$G$4+LOG10(A2)&"A1"');
  });
  it('inserted rows: references below move, a range ending on the last row grows, other sheets follow', () => {
    const own = (s: string | null) => s === null || s === 'Orçamento';
    expect(insertRowsFormula('SUM(F18:F25)+N26+$U$38', own, 26, 2)).toBe('SUM(F18:F27)+N28+$U$40');
    expect(insertRowsFormula('Orçamento!C9+Orçamento!U38', (s) => s === 'Orçamento', 26, 2)).toBe(
      'Orçamento!C9+Orçamento!U40',
    );
    expect(insertRowsFormula("'Outra folha'!A30", own, 26, 2)).toBe("'Outra folha'!A30");
  });
});

async function model() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Orçamento');
  ws.getCell('A1').value = 'Cliente';
  ws.getCell('A13').value = '#';
  ws.getCell('B13').value = 'Descrição';
  ws.getCell('C13').value = 'Tipo de Recurso';
  ws.getCell('D13').value = '# Recurso';
  ws.getCell('E13').value = 'Custo Unit.';
  ws.getCell('A17').value = 'Serviços';
  for (const r of [18, 19]) {
    ws.getCell(`A${r}`).value = 10;
    ws.getCell(`B${r}`).value = 'exemplo';
    ws.getCell(`E${r}`).value = 100;
    ws.getCell(`E${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
  }
  ws.getCell('F18').value = { formula: 'IF(D18="",A18*E18,A18*D18*E18)', result: 1000 };
  ws.getCell('F19').value = { sharedFormula: 'F18', result: 1000 } as ExcelJS.CellValue;
  ws.getCell('A20').value = 'Sub-Total';
  ws.mergeCells('A20:D20');
  ws.getCell('F20').value = { formula: 'SUM(F18:F19)', result: 2000 };
  ws.getCell('F22').value = { formula: 'F20', result: 2000 };
  const s2 = wb.addWorksheet('Folha1');
  s2.getCell('A1').value = { formula: 'Orçamento!F22', result: 2000 };
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe('the Excel model', () => {
  it('guesses the mapping from the labels', async () => {
    const map = guessMapping(previewTemplate(await model()));
    expect(map).toMatchObject({
      sheet: 'Orçamento',
      fields: { client: 'B1' },
      cols: { days: 'A', desc: 'B', type: 'C', count: 'D', rate: 'E' },
      blocks: { services: { from: 18, to: 19 } },
    });
  });
  it('fills it, inserting a copy of the last row when a block is short, and keeps the rest', async () => {
    const data = await model();
    const map = guessMapping(previewTemplate(data));
    const lines = buildLines(matrix(), ['EC', 'ECP'], 'gf').filter((l) => l.block === 'services');
    const { file, report } = fillTemplate(data, map, { client: 'Banco Atlântico', ref: 'ORC-1', lines });
    expect(report.inserted).toEqual([{ block: 'services', rows: 1 }]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(file) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Orçamento')!;
    expect(ws.getCell('B1').value).toBe('Banco Atlântico');
    expect([18, 19, 20].map((r) => ws.getCell(`B${r}`).value)).toEqual([
      'Consultor SAP SF Employee Central',
      'Consultor SAP SF Employee Central Payroll',
      'Técnico de Integração',
    ]);
    expect(ws.getCell('D19').value).toBe(2);
    const f = (a: string) => (ws.getCell(a).value as { formula?: string } | null)?.formula;
    expect(f('F19')).toBe('IF(D19="",A19*E19,A19*D19*E19)');
    expect(f('F20')).toBe('IF(D20="",A20*E20,A20*D20*E20)');
    expect(ws.getCell('E20').fill).toMatchObject({ fgColor: { argb: 'FFDBEAFE' } });
    expect(ws.getCell('A21').value).toBe('Sub-Total');
    expect(f('F21')).toBe('SUM(F18:F20)');
    expect(f('F23')).toBe('F21');
    expect(ws.model.merges).toContain('A21:D21');
    expect((wb.getWorksheet('Folha1')!.getCell('A1').value as { formula: string }).formula).toBe(
      'Orçamento!F23',
    );
  });
  it('refuses what is not a workbook', () => {
    expect(() => previewTemplate(new Uint8Array([1, 2, 3]))).toThrow();
  });
});
