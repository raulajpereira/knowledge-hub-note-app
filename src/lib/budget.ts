// "Orçamentos" (Management): SuccessFactors estimates from the person's matrix.
// The matrix has the SF modules and, for each module, the days (Greenfield /
// Brownfield) and the number of consultants of each profile. A budget picks
// some modules and a scenario; its lines are made from the matrix and go to
// the person's Excel model (the P&L), in the mapped blocks.

export const SCENARIOS = ['gf', 'bf'] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const BLOCKS = ['services', 'mgmt', 'warranty'] as const;
export type Block = (typeof BLOCKS)[number];

/**
 * How a profile becomes lines:
 * - module: one line per module ("Consultor SAP SF <módulo>", the module's €/dia)
 * - sum: one line, the days of every module added (Técnico ABAP, Gestor…)
 * - perModule: one line per module, with the profile's label ("Consultor SF ECP")
 */
export type ProfileMode = 'module' | 'sum' | 'perModule';

export type Profile = {
  key: string;
  /** the Excel description; for perModule, {code} / {name} are the module's */
  label: string;
  /** "Tipo de Recurso" in the Excel (Consultor, Gestor, Diretor) */
  type: string;
  block: Block;
  /** €/dia (the "module" profile uses each module's own) */
  rate: number;
  mode: ProfileMode;
};

export type Cell = { gf: number | null; bf: number | null; n: number };

export type BudgetModule = {
  code: string;
  name: string;
  group: string;
  /** the Excel description of its consultant line */
  label: string;
  rate: number;
  active: boolean;
  days: Record<string, Cell>;
};

export type Matrix = { profiles: Profile[]; modules: BudgetModule[] };

export type Line = {
  block: Block;
  desc: string;
  type: string;
  days: number;
  count: number;
  rate: number;
  /** the module codes it came from (empty: added by hand) */
  origin: string[];
};

export const PROFILE_KEYS = ['CONS', 'FI', 'INT', 'ABAP', 'BASIS', 'LOC', 'GP', 'DIR', 'GAR'] as const;

export const DEFAULT_PROFILES: Profile[] = [
  {
    key: 'CONS',
    label: 'Consultor SAP SF {name}',
    type: 'Consultor',
    block: 'services',
    rate: 375,
    mode: 'module',
  },
  { key: 'FI', label: 'Consultor de SAP FI', type: 'Consultor', block: 'services', rate: 375, mode: 'sum' },
  {
    key: 'INT',
    label: 'Técnico de Integração',
    type: 'Consultor',
    block: 'services',
    rate: 375,
    mode: 'sum',
  },
  { key: 'ABAP', label: 'Técnico ABAP', type: 'Consultor', block: 'services', rate: 375, mode: 'sum' },
  { key: 'BASIS', label: 'Técnico Basis', type: 'Consultor', block: 'services', rate: 375, mode: 'sum' },
  { key: 'LOC', label: 'Consultor Local', type: 'Consultor', block: 'services', rate: 10000, mode: 'sum' },
  { key: 'GP', label: 'Gestor de Projectos', type: 'Gestor', block: 'mgmt', rate: 375, mode: 'sum' },
  { key: 'DIR', label: 'Diretor de Projetos', type: 'Diretor', block: 'mgmt', rate: 375, mode: 'sum' },
  {
    key: 'GAR',
    label: 'Consultor SF {code}',
    type: 'Consultor',
    block: 'warranty',
    rate: 375,
    mode: 'perModule',
  },
];

/** The SuccessFactors modules the matrix starts with (days empty: the person fills them). */
export const DEFAULT_MODULES: Array<[code: string, name: string, group: string]> = [
  ['EC', 'Employee Central', 'Core HR & Payroll'],
  ['ECP', 'Employee Central Payroll', 'Core HR & Payroll'],
  ['TT', 'Time Tracking / Time Off', 'Core HR & Payroll'],
  ['BEN', 'Global Benefits', 'Core HR & Payroll'],
  ['RCM', 'Recruiting', 'Talent'],
  ['ONB', 'Onboarding', 'Talent'],
  ['PMGM', 'Performance & Goals', 'Talent'],
  ['CMP', 'Compensation / Variable Pay', 'Talent'],
  ['SCDP', 'Succession & Development', 'Talent'],
  ['LMS', 'Learning', 'Talent'],
  ['OM', 'Opportunity Marketplace', 'Talent'],
  ['PA', 'People Analytics', 'Analytics & Planeamento'],
  ['WFP', 'Workforce Planning', 'Analytics & Planeamento'],
  ['INT', 'Integrações (Integration Suite)', 'Técnico'],
  ['WZ', 'SAP Work Zone for HR', 'Técnico'],
];

export function defaultMatrix(): Matrix {
  return {
    profiles: DEFAULT_PROFILES.map((p) => ({ ...p })),
    modules: DEFAULT_MODULES.map(([code, name, group]) => ({
      code,
      name,
      group,
      label: `Consultor SAP SF ${name}`,
      rate: 375,
      active: true,
      days: {},
    })),
  };
}

const fill = (label: string, m: Pick<BudgetModule, 'code' | 'name'>) =>
  label.replace(/\{code\}/g, m.code).replace(/\{name\}/g, m.name);

const daysOf = (c: Cell | undefined, s: Scenario) => (c ? (s === 'gf' ? c.gf : c.bf) : null) ?? 0;

/** The lines of a budget: per block, consultant lines first, then the profiles in their order. */
export function buildLines(matrix: Matrix, codes: readonly string[], scenario: Scenario): Line[] {
  const mods = matrix.modules.filter((m) => codes.includes(m.code));
  const out: Line[] = [];
  for (const block of BLOCKS)
    for (const p of matrix.profiles) {
      if (p.block !== block) continue;
      if (p.mode === 'sum') {
        let days = 0;
        let count = 0;
        const origin: string[] = [];
        for (const m of mods) {
          const c = m.days[p.key];
          const d = daysOf(c, scenario);
          if (d > 0) {
            days += d;
            count = Math.max(count, c?.n || 1);
            origin.push(m.code);
          }
        }
        if (days > 0) out.push({ block, desc: p.label, type: p.type, days, count, rate: p.rate, origin });
        continue;
      }
      for (const m of mods) {
        const c = m.days[p.key];
        const d = daysOf(c, scenario);
        if (d <= 0) continue;
        out.push({
          block,
          desc: p.mode === 'module' ? m.label || fill(p.label, m) : fill(p.label, m),
          type: p.type,
          days: d,
          count: c?.n || 1,
          rate: p.mode === 'module' ? m.rate : p.rate,
          origin: [m.code],
        });
      }
    }
  return out;
}

/** What a line costs (the model's own formula: days × consultants × €/dia). */
export const lineCost = (l: Pick<Line, 'days' | 'count' | 'rate'>) => l.days * (l.count || 1) * l.rate;
export const totalCost = (ls: readonly Line[]) => ls.reduce((s, l) => s + lineCost(l), 0);
export const totalDays = (ls: readonly Line[]) => ls.reduce((s, l) => s + l.days, 0);

// ---- the Excel model's mapping

export const MAP_COLS = ['days', 'desc', 'type', 'count', 'rate'] as const;
export type MapCol = (typeof MAP_COLS)[number];
export const MAP_FIELDS = ['client', 'ref'] as const;
export type MapField = (typeof MAP_FIELDS)[number];

export type Mapping = {
  sheet: string;
  /** cell of each header field ("B1") */
  fields: Partial<Record<MapField, string>>;
  /** column letter of each line value ("A") */
  cols: Partial<Record<MapCol, string>>;
  /** first and last row of each block */
  blocks: Partial<Record<Block, { from: number; to: number }>>;
};

export const emptyMapping = (sheet = ''): Mapping => ({ sheet, fields: {}, cols: {}, blocks: {} });

/** Where each line goes: per block, its rows and how many must be inserted. */
export function placeLines(map: Mapping, lines: readonly Line[]) {
  const out: Array<{ block: Block; from: number; to: number; lines: Line[]; extra: number }> = [];
  for (const block of BLOCKS) {
    const b = map.blocks[block];
    const ls = lines.filter((l) => l.block === block);
    if (!b) continue;
    const cap = b.to - b.from + 1;
    out.push({ block, from: b.from, to: b.to, lines: ls, extra: Math.max(0, ls.length - cap) });
  }
  return out;
}

/** Blocks with lines but no rows in the model. */
export const unmappedBlocks = (map: Mapping | null, lines: readonly Line[]) =>
  BLOCKS.filter((b) => lines.some((l) => l.block === b) && !map?.blocks[b]);

export const COL_RE = /^[A-Z]{1,3}$/;
export const CELL_RE = /^([A-Z]{1,3})([1-9]\d{0,6})$/;

export function colNum(c: string) {
  let n = 0;
  for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
export function colName(n: number) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
