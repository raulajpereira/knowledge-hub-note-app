// Funcional SAP (SapFunctional.dc.html + fn-schema.js): Processos, Testes,
// Migração de Dados and Cutover. One record = title, code, status, the
// page's fields and (for all four pages) a table of rows. Shared by the
// client (form, progress) and the server (validation).
import { z } from 'zod';

type Lbl = { pt: string; en: string };
const L = (pt: string, en: string): Lbl => ({ pt, en });

export const FN_MODULES = [
  'FI',
  'CO',
  'SD',
  'MM',
  'PP',
  'QM',
  'PM',
  'EWM',
  'PS',
  'CS',
  'HCM',
  'SF',
  'BW',
  'Cross',
];
export const FN_PAGES = ['fn_proc', 'fn_test', 'fn_mig', 'fn_cut'] as const;
export type FnPage = (typeof FN_PAGES)[number];

/** [key, label, colour] */
export type FnStatus = [string, Lbl, string];
const ST: Record<'proc' | 'test' | 'mig' | 'cut', FnStatus[]> = {
  proc: [
    ['asis', L('As-Is', 'As-Is'), 'rgba(255,255,255,.16)'],
    ['tobe', L('To-Be', 'To-Be'), 'oklch(0.75 0.12 245 / .55)'],
    ['ok', L('Aprovado', 'Approved'), 'oklch(0.78 0.13 150 / .5)'],
  ],
  test: [
    ['todo', L('Por executar', 'Not run'), 'rgba(255,255,255,.16)'],
    ['run', L('Em execução', 'Running'), 'oklch(0.8 0.12 85 / .5)'],
    ['pass', L('Passou', 'Passed'), 'oklch(0.78 0.13 150 / .5)'],
    ['fail', L('Falhou', 'Failed'), 'oklch(0.7 0.16 25 / .6)'],
    ['block', L('Bloqueado', 'Blocked'), 'oklch(0.72 0.12 300 / .5)'],
  ],
  mig: [
    ['plan', L('Planeado', 'Planned'), 'rgba(255,255,255,.16)'],
    ['m1', L('Mock 1', 'Mock 1'), 'oklch(0.8 0.12 85 / .5)'],
    ['m2', L('Mock 2', 'Mock 2'), 'oklch(0.75 0.12 245 / .55)'],
    ['final', L('Carga final', 'Final load'), 'oklch(0.72 0.12 300 / .5)'],
    ['ok', L('Validado', 'Validated'), 'oklch(0.78 0.13 150 / .5)'],
  ],
  cut: [
    ['plan', L('Planeado', 'Planned'), 'rgba(255,255,255,.16)'],
    ['run', L('Em curso', 'In progress'), 'oklch(0.8 0.12 85 / .5)'],
    ['done', L('Concluído', 'Completed'), 'oklch(0.78 0.13 150 / .5)'],
  ],
};
const ROWST = {
  test: [
    ['todo', L('Por executar', 'Not run')],
    ['pass', L('OK', 'OK')],
    ['fail', L('NOK', 'NOK')],
  ] as Array<[string, Lbl]>,
  cut: [
    ['todo', L('Por fazer', 'To do')],
    ['run', L('Em curso', 'Running')],
    ['done', L('Feito', 'Done')],
    ['skip', L('N/A', 'N/A')],
  ] as Array<[string, Lbl]>,
};

export type FnFieldType = 'mod' | 'client' | 'project' | 'person' | 'text' | 'area' | 'sel' | 'num' | 'date';
export type FnField = {
  k: string;
  label: Lbl;
  type: FnFieldType;
  mono?: boolean;
  full?: boolean;
  opts?: Array<[string, Lbl]>;
};
/** Row column: [key, label, kind ('text' | 'rst' = row status), grow, mono] */
export type FnCol = [string, Lbl, 'text' | 'rst', number, boolean?];
export type FnPageDef = {
  title: Lbl;
  sub: Lbl;
  st: FnStatus[];
  codeLbl: Lbl;
  progress?: boolean;
  fields: FnField[];
  rows: { title: Lbl; cols: FnCol[]; status?: Array<[string, Lbl]> };
};
const F = (k: string, label: Lbl, type: FnFieldType, extra: Partial<FnField> = {}): FnField => ({
  k,
  label,
  type,
  ...extra,
});
const same = (...xs: string[]): Array<[string, Lbl]> => xs.map((x) => [x, L(x, x)]);

export const FN: Record<FnPage, FnPageDef> = {
  fn_proc: {
    title: L('Processos', 'Processes'),
    sub: L('Blueprint e fluxos de negócio por módulo', 'Blueprint and business flows per module'),
    st: ST.proc,
    codeLbl: L('Código do processo', 'Process code'),
    fields: [
      F('module', L('Módulo', 'Module'), 'mod'),
      F('area', L('Cenário', 'Scenario'), 'text'),
      F('client', L('Cliente', 'Client'), 'client'),
      F('project', L('Projeto', 'Project'), 'project'),
      F('owner', L('Responsável', 'Owner'), 'person'),
      F('desc', L('Descrição', 'Description'), 'area', { full: true }),
    ],
    rows: {
      title: L('Passos do processo', 'Process steps'),
      cols: [
        ['step', L('Passo', 'Step'), 'text', 2],
        ['tcode', L('TCode / App Fiori', 'TCode / Fiori app'), 'text', 1, true],
        ['role', L('Função', 'Role'), 'text', 1],
        ['note', L('Notas', 'Notes'), 'text', 2],
      ],
    },
  },
  fn_test: {
    title: L('Testes', 'Tests'),
    sub: L(
      'Cenários e casos de teste: unitários, integração e UAT',
      'Test scenarios and cases: unit, integration and UAT',
    ),
    st: ST.test,
    codeLbl: L('ID do teste', 'Test ID'),
    progress: true,
    fields: [
      F('module', L('Módulo', 'Module'), 'mod'),
      F('kind', L('Tipo de teste', 'Test type'), 'sel', {
        opts: [
          ['Unitário', L('Unitário', 'Unit')],
          ['Integração', L('Integração', 'Integration')],
          ['UAT', L('UAT', 'UAT')],
          ['Regressão', L('Regressão', 'Regression')],
          ['Performance', L('Performance', 'Performance')],
        ],
      }),
      F('cycle', L('Ciclo', 'Cycle'), 'sel', {
        opts: [...same('SIT 1', 'SIT 2', 'UAT 1', 'UAT 2'), ['Regressão', L('Regressão', 'Regression')]],
      }),
      F('client', L('Cliente', 'Client'), 'client'),
      F('project', L('Projeto', 'Project'), 'project'),
      F('owner', L('Testador', 'Tester'), 'person'),
      F('date', L('Data de execução', 'Run date'), 'date'),
      F('pre', L('Pré-condições / dados', 'Preconditions / data'), 'area', { full: true }),
      F('evidence', L('Evidências / observações', 'Evidence / notes'), 'area', { full: true }),
    ],
    rows: {
      title: L('Passos de teste', 'Test steps'),
      status: ROWST.test,
      cols: [
        ['step', L('Passo', 'Step'), 'text', 2],
        ['expected', L('Resultado esperado', 'Expected result'), 'text', 2],
        ['st', L('Resultado', 'Result'), 'rst', 1],
      ],
    },
  },
  fn_mig: {
    title: L('Migração de Dados', 'Data Migration'),
    sub: L(
      'Objetos de migração, mapeamentos e ciclos de carga',
      'Migration objects, mappings and load cycles',
    ),
    st: ST.mig,
    codeLbl: L('Objeto', 'Object'),
    fields: [
      F('module', L('Módulo', 'Module'), 'mod'),
      F('tool', L('Ferramenta', 'Tool'), 'sel', {
        opts: [
          ...same('Migration Cockpit', 'LSMW'),
          ['BAPI / Programa', L('BAPI / Programa', 'BAPI / Program')],
          ...same('SAP Data Services', 'Manual'),
        ],
      }),
      F('records', L('Nº de registos', 'Record count'), 'num'),
      F('errors', L('Erros na última carga', 'Errors in last load'), 'num'),
      F('client', L('Cliente', 'Client'), 'client'),
      F('project', L('Projeto', 'Project'), 'project'),
      F('owner', L('Responsável', 'Owner'), 'person'),
      F('rules', L('Regras de validação / limpeza', 'Validation / cleansing rules'), 'area', { full: true }),
    ],
    rows: {
      title: L('Mapeamento de campos', 'Field mapping'),
      cols: [
        ['src', L('Campo legado', 'Legacy field'), 'text', 1, true],
        ['dst', L('Campo SAP', 'SAP field'), 'text', 1, true],
        ['rule', L('Regra de conversão', 'Conversion rule'), 'text', 2],
      ],
    },
  },
  fn_cut: {
    title: L('Cutover', 'Cutover'),
    sub: L('Plano de cutover e checklist de go-live', 'Cutover plan and go-live checklist'),
    st: ST.cut,
    codeLbl: L('Fase', 'Phase'),
    progress: true,
    fields: [
      F('client', L('Cliente', 'Client'), 'client'),
      F('project', L('Projeto', 'Project'), 'project'),
      F('golive', L('Data de go-live', 'Go-live date'), 'date'),
      F('owner', L('Coordenador', 'Coordinator'), 'person'),
      F('desc', L('Notas', 'Notes'), 'area', { full: true }),
    ],
    rows: {
      title: L('Atividades', 'Activities'),
      status: ROWST.cut,
      cols: [
        ['act', L('Atividade', 'Activity'), 'text', 3],
        ['when', L('Quando', 'When'), 'text', 1, true],
        ['who', L('Responsável', 'Owner'), 'text', 1],
        ['st', L('Estado', 'Status'), 'rst', 1],
      ],
    },
  },
};

/** Colours of the row results in the progress bar (prototype FN_RC). */
export const FN_RC: Record<string, string> = {
  pass: 'oklch(0.78 0.14 150)',
  done: 'oklch(0.78 0.14 150)',
  fail: 'oklch(0.7 0.17 25)',
  run: 'oklch(0.82 0.13 85)',
  todo: 'rgba(255,255,255,.22)',
  skip: 'rgba(255,255,255,.4)',
};
/** Background of the row result select. */
export const FN_RBG: Record<string, string> = {
  pass: 'oklch(0.72 0.14 150 / .5)',
  done: 'oklch(0.72 0.14 150 / .5)',
  fail: 'oklch(0.66 0.17 25 / .6)',
  run: 'oklch(0.78 0.13 85 / .5)',
  skip: 'rgba(255,255,255,.18)',
};

export type FnVal = string | number;
export type FnRow = Record<string, string>;
export type FnRecordData = {
  title: string;
  code: string;
  st: string;
  f: Record<string, FnVal>;
  rows: FnRow[];
};

/** Prototype prog(): % of rows passed/done/not applicable, and the count per result. */
export function fnProgress(page: FnPage, rows: FnRow[]) {
  const P = FN[page];
  if (!P.progress || !P.rows.status) return null;
  const n = rows.length;
  if (!n) return { pct: 0, parts: [] as Array<{ k: string; label: Lbl; n: number; w: number }> };
  const cnt: Record<string, number> = {};
  for (const r of rows) cnt[r.st || 'todo'] = (cnt[r.st || 'todo'] ?? 0) + 1;
  const ok = (cnt.pass ?? 0) + (cnt.done ?? 0) + (cnt.skip ?? 0);
  return {
    pct: Math.round((ok / n) * 100),
    parts: P.rows.status
      .map(([k, label]) => ({ k, label, n: cnt[k] ?? 0, w: ((cnt[k] ?? 0) / n) * 100 }))
      .filter((p) => p.n > 0),
  };
}

/** A blank row of the page (result columns start "todo"). */
export const fnBlankRow = (page: FnPage): FnRow =>
  Object.fromEntries(FN[page].rows.cols.map((c) => [c[0], c[2] === 'rst' ? 'todo' : '']));

// ── Validation (server edge) ─────────────────────────────────────────────────
const line = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[^\r\n]*$/);
const opt = (vals: string[]) => z.union([z.literal(''), z.enum(vals as [string, ...string[]])]);
function fieldSchema(fd: FnField): z.ZodType {
  switch (fd.type) {
    case 'mod':
      return opt(FN_MODULES);
    case 'client':
    case 'project':
    case 'person':
      return z.union([z.literal(''), z.uuid()]);
    case 'sel':
      return opt(fd.opts!.map((o) => o[0]));
    case 'num':
      return z.union([z.literal(''), z.number().int().min(0).max(1e12)]);
    case 'date':
      return z.union([z.literal(''), z.iso.date()]);
    case 'area':
      return z.string().max(20000);
    default:
      return line(500);
  }
}
const schemas = new Map<FnPage, { f: z.ZodType; rows: z.ZodType; st: z.ZodType }>();
export function fnSchemas(page: FnPage) {
  let s = schemas.get(page);
  if (!s) {
    const P = FN[page];
    s = {
      f: z.strictObject(Object.fromEntries(P.fields.map((fd) => [fd.k, fieldSchema(fd).optional()]))),
      rows: z
        .array(
          z.strictObject(
            Object.fromEntries(
              P.rows.cols.map((c) => [
                c[0],
                (c[2] === 'rst'
                  ? z.enum(P.rows.status!.map((x) => x[0]) as [string, ...string[]])
                  : line(2000)
                ).optional(),
              ]),
            ),
          ),
        )
        .max(500),
      st: z.enum(P.st.map((x) => x[0]) as [string, ...string[]]),
    };
    schemas.set(page, s);
  }
  return s;
}
