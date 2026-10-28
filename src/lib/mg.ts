// Management (Management.dc.html): constants, week helpers, the data shapes
// shared by the client and the server, their validation and the sample data
// (prototype mgSeed) used by "Repor Dados".
import { z } from 'zod';
import { parseTxMod } from './sap';
import { AL_MASK_WK, bookingSeries, dnOf, type Absence, type Booking, type CalcEnv } from './alloc';

export const MG_DAY = 86_400_000;
export const mgMonday = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
export const mgIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, m! - 1, d);
};
/** Week helpers relative to a base Monday (the current week is 0). */
export function mgWeeks(now = new Date()) {
  const base = mgMonday(now);
  const wk = (i: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + 7 * i);
    return mgIso(d);
  };
  const wi = (s: string) => Math.round((parse(s).getTime() - base.getTime()) / (7 * MG_DAY));
  const dIso = (w: number, i: number) => {
    const x = new Date(base);
    x.setDate(x.getDate() + 7 * w + i);
    return mgIso(x);
  };
  return { base, wk, wi, dIso };
}
export const wLbl = (s: string) => {
  const [, m, d] = s.split('-');
  return `${d}/${m}`;
};
export const wLblY = (s: string) => {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

export const MG_SK: Array<[string, string]> = [
  ['abap', 'ABAP'],
  ['oo', 'ABAP OO'],
  ['rap', 'RAP / CDS'],
  ['fiori', 'Fiori / UI5'],
  ['btp', 'BTP'],
  ['cpi', 'CPI / PO'],
  ['fi', 'FI'],
  ['co', 'CO'],
  ['sd', 'SD'],
  ['mm', 'MM'],
  ['pp', 'PP'],
  ['ewm', 'EWM'],
  ['hcm', 'HCM'],
  ['sf', 'SuccessFactors'],
  ['bw', 'BW / Analytics'],
  ['basis', 'Basis'],
  ['s4', 'Migração S/4'],
  ['pm', 'Gestão de projeto'],
];
export const MG_SKN: Record<string, string> = Object.fromEntries(MG_SK);
/** At most this many modules per project. */
export const MG_PJ_MOD_MAX = 30;
/** The skill (MG_SK key) a project module asks for, when there is one — for staffing. */
const MG_MOD_SK: Record<string, string> = {
  BC: 'basis',
  WM: 'ewm',
  FIORI: 'fiori',
  CPI: 'cpi',
  PO: 'cpi',
  RAP: 'rap',
  S4: 's4',
};
export const mgModSkill = (m: string, skills: Record<string, string> = MG_SKN) => {
  const k = MG_MOD_SK[m] ?? m.toLowerCase();
  return k in skills ? k : null;
};
export const MG_LV = ['', 'Júnior', 'Pleno', 'Sénior', 'Expert'];
export const MG_LVC = [
  'transparent',
  'oklch(0.72 0.08 230 / .38)',
  'oklch(0.74 0.1 185 / .5)',
  'oklch(0.76 0.12 145 / .62)',
  'oklch(0.8 0.13 85 / .72)',
];
export const MG_ROLE: Record<string, string> = {
  abap: 'Developer ABAP',
  fiori: 'Developer Fiori',
  fi: 'Consultor FI',
  co: 'Consultor CO',
  sd: 'Consultor SD',
  mm: 'Consultor MM',
  hcm: 'Consultor HCM',
  sf: 'Consultor SuccessFactors',
  basis: 'Consultor Basis',
  btp: 'Arquiteto BTP',
  pm: 'Gestor de projeto',
  ewm: 'Consultor EWM',
  bw: 'Consultor BW',
};
const MG_REL: Record<string, string[]> = {
  abap: ['oo', 'rap', 's4', 'cpi'],
  fiori: ['rap', 'btp', 'oo'],
  fi: ['co', 's4'],
  co: ['fi', 's4'],
  sd: ['mm', 'fi'],
  mm: ['sd', 'ewm', 'pp'],
  hcm: ['sf', 'abap'],
  sf: ['hcm', 'cpi'],
  basis: ['s4', 'btp'],
  btp: ['cpi', 'rap', 'fiori'],
  pm: ['s4', 'fi', 'sd'],
  ewm: ['mm', 'pp'],
  bw: ['abap', 'co'],
};
export const MG_COST = [0, 28, 38, 52, 70];
export const MG_RATE = [0, 45, 60, 80, 105];
export const MG_PST: Record<string, string> = {
  Ativo: 'oklch(0.72 0.13 150 / .45)',
  Planeado: 'oklch(0.7 0.1 240 / .45)',
  'Em risco': 'oklch(0.72 0.15 50 / .55)',
  Concluído: 'rgba(255,255,255,.14)',
};
export const MG_RST: Record<string, string> = {
  Aberto: 'oklch(0.72 0.15 60 / .55)',
  Proposto: 'oklch(0.7 0.1 240 / .5)',
  Preenchido: 'oklch(0.72 0.13 150 / .45)',
};
export const MG_TCOL = [
  'oklch(0.78 0.13 245)',
  'oklch(0.8 0.14 150)',
  'oklch(0.82 0.13 60)',
  'oklch(0.75 0.14 320)',
  'oklch(0.8 0.12 190)',
  'oklch(0.74 0.16 25)',
  'oklch(0.84 0.12 100)',
  'oklch(0.72 0.12 280)',
];
export const mgAv = (i: number) => `oklch(0.58 0.1 ${(i * 47) % 360})`;
export const mgIni = (n: string) =>
  (n || '?')
    .split(/\s+/)
    .filter((w) => /^[\p{L}\p{N}]/u.test(w))
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
export const mgEur = (n: number) =>
  `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(Math.round(n))} €`;
export const mgK = (n: number) =>
  n >= 1000 ? `${(Math.round(n / 100) / 10).toString().replace('.', ',')}k €` : `${Math.round(n)} €`;

// ── Data ──────────────────────────────────────────────────────────────────────
export type MgClient = {
  id: string;
  name: string;
  type: 'Externo' | 'Interno';
  sector: string;
  contact: string;
  email: string;
};
export type MgTeam = {
  id: string;
  name: string;
  areas: string[];
  desc: string;
  color: string;
  target: number | '';
  lead: string;
};
export type MgPerson = {
  id: string;
  team: string;
  name: string;
  area: string;
  role: string;
  level: number;
  cost: number;
  rate: number;
  cap: number;
  loc: string;
  /** Ativo / Inativo / Suspenso — Inativo and Suspenso are left out of new allocations and the finder */
  status: MgPersonStatus;
  /** free text, e.g. why the person is suspended */
  statusNote: string;
  /** hiring date, 'YYYY-MM-DD' or '' */
  hired: string;
  /** years of experience ('' = not filled in) */
  expYears: number | '';
  /** optional breakdown of those years by area, e.g. 5 in HCM, 2 in project management */
  expSplit: MgExpPart[];
  email: string;
  phone: string;
  av: string;
  /** version of the photo ('' or absent = none; changed only by /mg/people/:id/photo) */
  photo?: string;
  skills: Record<string, number>;
};
/** Time at the company from the hire date to `today` (both 'YYYY-MM-DD'); null before the hire date. */
export function mgTenure(hired: string, today: string): { y: number; m: number; d: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hired) || hired > today) return null;
  const [y0, m0, d0] = hired.split('-').map(Number) as [number, number, number];
  const [y1, m1, d1] = today.split('-').map(Number) as [number, number, number];
  let months = (y1 - y0) * 12 + (m1 - m0);
  if (d1 < d0) months--;
  // the last "monthiversary" (31 Jan + 1 month = 28/29 Feb), then the days since
  const am = m0 - 1 + months;
  const ay = y0 + Math.floor(am / 12);
  const an = ((am % 12) + 12) % 12;
  const anchor = Date.UTC(ay, an, Math.min(d0, new Date(Date.UTC(ay, an + 1, 0)).getUTCDate()));
  const d = Math.round((Date.UTC(y1, m1 - 1, d1) - anchor) / MG_DAY);
  return { y: Math.floor(months / 12), m: months % 12, d };
}
/** "3 anos, 2 meses e 5 dias" / "3 years, 2 months and 5 days" (zero parts left out). */
export function mgTenureText(t: { y: number; m: number; d: number }, lang: string) {
  const en = lang === 'en';
  const w = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    t.y ? w(t.y, en ? 'year' : 'ano', en ? 'years' : 'anos') : '',
    t.m ? w(t.m, en ? 'month' : 'mês', en ? 'months' : 'meses') : '',
    t.d || (!t.y && !t.m) ? w(t.d, en ? 'day' : 'dia', en ? 'days' : 'dias') : '',
  ].filter(Boolean);
  const and = en ? ' and ' : ' e ';
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')}${and}${parts.at(-1)}` : parts[0]!;
}
export type MgExpPart = { area: string; years: number };
export const MG_PERSON_STATUS = ['Ativo', 'Inativo', 'Suspenso'] as const;
export type MgPersonStatus = (typeof MG_PERSON_STATUS)[number];
export const isAvailable = (p: Pick<MgPerson, 'status'>) => (p.status ?? 'Ativo') === 'Ativo';
export type MgPhase = { name: string; from: string; to: string };
export type MgProject = {
  id: string;
  team: string;
  code: string;
  name: string;
  client: string;
  budget: number;
  from: string;
  to: string;
  color: string;
  status: string;
  manager: string;
  phases: MgPhase[];
  /** SAP modules the project covers (SAP_MODULES ids or the tenant's own names), in the order picked */
  modules?: string[];
};
export type MgTs = {
  id: string;
  person: string;
  week: string;
  status: 'Rascunho' | 'Submetido';
  rows: Record<string, number[]>;
};
export type MgReq = {
  id: string;
  team: string;
  project: string;
  skills: Array<{ k: string; l: number }>;
  hours: number | '';
  maxCost: number | '';
  from: string;
  to: string;
  status: string;
  assigned: string;
  note: string;
};
export type MgSettings = {
  levels?: string[];
  xsk?: Array<[string, string]>;
  xskn?: Record<string, string>;
  xrole?: Record<string, string>;
  hiddenAreas?: string[];
};
export type MgData = {
  clients: MgClient[];
  teams: MgTeam[];
  people: MgPerson[];
  projects: MgProject[];
  ts: MgTs[];
  reqs: MgReq[];
  settings: MgSettings;
};
export const MG_COLLECTIONS = ['clients', 'teams', 'people', 'projects', 'ts', 'reqs'] as const;
export type MgCollection = (typeof MG_COLLECTIONS)[number];

// ── Validation (server edge) ─────────────────────────────────────────────────
const ref = z.union([z.literal(''), z.uuid()]);
const day = z.iso.date();
const line = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[^\r\n]*$/);
const key = z.string().regex(/^[a-z][\w-]{0,39}$/i);
const color = z.string().regex(/^(oklch\([\d. /]{5,40}\)|rgba?\([\d., ]{5,40}\)|transparent)$/);
const hours = z.number().min(0).max(1000);
export const MgSchemas = {
  clients: z.strictObject({
    id: z.uuid(),
    name: line(200),
    type: z.enum(['Externo', 'Interno']),
    sector: line(120),
    contact: line(120),
    email: line(200),
  }),
  teams: z.strictObject({
    id: z.uuid(),
    name: line(120),
    areas: z.array(key).max(60),
    desc: z.string().max(2000),
    color,
    target: z.union([z.literal(''), z.number().int().min(1).max(150)]),
    lead: ref,
  }),
  people: z.strictObject({
    id: z.uuid(),
    team: ref,
    name: line(120),
    area: key,
    role: line(120),
    level: z.number().int().min(1).max(20),
    cost: z.number().min(0).max(100000),
    rate: z.number().min(0).max(100000),
    cap: z.number().min(0).max(168),
    loc: line(120),
    status: z.enum(MG_PERSON_STATUS),
    statusNote: line(500),
    hired: z.union([day, z.literal('')]),
    expYears: z.union([z.number().min(0).max(70), z.literal('')]),
    expSplit: z
      .array(
        z.strictObject({
          area: line(80).refine((s) => s.trim().length > 0),
          years: z.number().min(0).max(70),
        }),
      )
      .max(20),
    email: line(200),
    phone: line(40),
    av: color,
    // read-only here: sent back as loaded, ignored when saving
    photo: z.string().max(40).optional(),
    skills: z.record(key, z.number().int().min(1).max(20)).refine((m) => Object.keys(m).length <= 100),
  }),
  projects: z.strictObject({
    id: z.uuid(),
    team: ref,
    code: line(40),
    name: line(200),
    client: ref,
    budget: z.number().min(0).max(1e10),
    from: day,
    to: day,
    color,
    status: z.enum(['Ativo', 'Planeado', 'Em risco', 'Concluído']),
    manager: ref,
    phases: z.array(z.strictObject({ name: line(120), from: day, to: day })).max(60),
    modules: z
      // stored as typed by parseTxMod: upper case, single spaces
      .array(z.string().refine((m) => parseTxMod(m) === m))
      .max(MG_PJ_MOD_MAX)
      .refine((m) => new Set(m).size === m.length)
      .optional(),
  }),
  ts: z.strictObject({
    id: z.uuid(),
    person: z.uuid(),
    week: day,
    status: z.enum(['Rascunho', 'Submetido']),
    rows: z
      .record(z.uuid(), z.array(z.number().min(0).max(24)).length(5))
      .refine((m) => Object.keys(m).length <= 60),
  }),
  reqs: z.strictObject({
    id: z.uuid(),
    team: ref,
    project: ref,
    skills: z
      .array(z.strictObject({ k: key, l: z.number().int().min(0).max(20) }))
      .min(1)
      .max(20),
    hours: z.union([z.literal(''), hours]),
    maxCost: z.union([z.literal(''), z.number().min(0).max(100000)]),
    from: day,
    to: day,
    status: z.enum(['Aberto', 'Proposto', 'Preenchido']),
    assigned: ref,
    note: z.string().max(2000),
  }),
  settings: z.strictObject({
    levels: z.array(line(40)).min(2).max(21).optional(),
    xsk: z
      .array(z.tuple([key, line(60)]))
      .max(60)
      .optional(),
    xskn: z.record(key, line(60)).optional(),
    xrole: z.record(key, line(120)).optional(),
    hiddenAreas: z.array(key).max(60).optional(),
  }),
};
export const MgOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('put'), c: z.enum([...MG_COLLECTIONS, 'settings']), v: z.unknown() }),
  z.object({ op: z.literal('del'), c: z.enum(MG_COLLECTIONS), id: z.uuid() }),
]);
export type MgOpT = z.infer<typeof MgOp>;

/** Changes between two snapshots as ops: puts in dependency order, then deletes in reverse (client `upd`). */
export function mgDiff(a: MgData, b: MgData): MgOpT[] {
  const puts: MgOpT[] = [];
  const dels: MgOpT[] = [];
  for (const c of MG_COLLECTIONS) {
    const before = new Map((a[c] as Array<{ id: string }>).map((x) => [x.id, JSON.stringify(x)]));
    const after = new Set<string>();
    for (const x of b[c] as Array<{ id: string }>) {
      after.add(x.id);
      if (before.get(x.id) !== JSON.stringify(x)) puts.push({ op: 'put', c, v: x });
    }
    for (const id of before.keys()) if (!after.has(id)) dels.unshift({ op: 'del', c, id });
  }
  if (JSON.stringify(a.settings) !== JSON.stringify(b.settings))
    puts.push({ op: 'put', c: 'settings', v: b.settings });
  return [...puts, ...dels];
}

// ── Sample data (prototype mgSeed), with uuids ──────────────────────────────
const MG_NAMES = [
  'Rui Martins',
  'Inês Mendes',
  'João Carvalho',
  'Ana Ferreira',
  'Pedro Almeida',
  'Sofia Ribeiro',
  'Tiago Costa',
  'Marta Sousa',
  'Miguel Pereira',
  'Catarina Lopes',
  'André Gomes',
  'Beatriz Santos',
  'Hugo Rodrigues',
  'Rita Oliveira',
  'Nuno Fernandes',
  'Joana Marques',
  'Diogo Pinto',
  'Carla Teixeira',
  'Bruno Correia',
  'Filipa Moreira',
  'Ricardo Nunes',
  'Mariana Vieira',
  'Luís Rocha',
  'Patrícia Cardoso',
  'Gonçalo Barbosa',
  'Helena Machado',
  'Vasco Monteiro',
  'Daniela Freitas',
  'Paulo Antunes',
  'Cláudia Matos',
  'Sérgio Tavares',
  'Lara Coelho',
  'Fábio Mendes',
  'Teresa Fonseca',
  'Rafael Cunha',
  'Vera Batista',
  'Eduardo Lima',
  'Sara Pires',
];
const MG_AREAS = [
  'abap',
  'fi',
  'abap',
  'sd',
  'fiori',
  'mm',
  'abap',
  'hcm',
  'co',
  'sf',
  'basis',
  'abap',
  'btp',
  'pm',
  'ewm',
  'abap',
  'fi',
  'bw',
  'sd',
  'fiori',
  'abap',
  'mm',
  'pm',
  'hcm',
  'abap',
  'co',
  'sf',
  'basis',
  'abap',
  'btp',
  'ewm',
  'fi',
  'abap',
  'sd',
  'fiori',
  'pm',
  'abap',
  'mm',
];
const mgRnd = (seed: number) => {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
};

/** Prototype mgSeed + mgEnsureTeams; `uuid` makes the ids, `now` fixes the current week. */
export type MgSampleData = Omit<MgData, 'settings'> & { bookings: Booking[]; absences: Absence[] };
export function mgSample(uuid: () => string, now = new Date()): MgSampleData {
  const { wk, wi, dIso } = mgWeeks(now);
  const R = mgRnd(17);
  const C: Record<string, string> = {};
  const id = (k: string) => (C[k] ??= uuid());
  const clients: MgClient[] = (
    [
      ['c1', 'Lusitânia Energia', 'Externo', 'Energia', 'Marta Faria', 'marta.faria@lusitania-energia.pt'],
      ['c2', 'Atlântico Retail', 'Externo', 'Retalho', 'Jorge Simões', 'jsimoes@atlantico-retail.pt'],
      ['c3', 'Douro Vinhos', 'Externo', 'Agroalimentar', 'Isabel Queirós', 'iqueiros@dourovinhos.pt'],
      ['c4', 'Porto Logística', 'Externo', 'Logística', 'Carlos Brandão', 'c.brandao@portologistica.pt'],
      ['c5', 'Beira Saúde', 'Externo', 'Saúde', 'Ana Paiva', 'ana.paiva@beirasaude.pt'],
      ['c6', 'Sistemas de Informação', 'Interno', 'Equipa interna', 'Direção de SI', 'si@empresa.pt'],
    ] as const
  ).map(([k, name, type, sector, contact, email]) => ({ id: id(k), name, type, sector, contact, email }));
  const people: MgPerson[] = MG_NAMES.map((name, i) => {
    const area = MG_AREAS[i]!;
    const r = R();
    const level = r < 0.22 ? 1 : r < 0.55 ? 2 : r < 0.85 ? 3 : 4;
    const skills: Record<string, number> = { [area]: level };
    (MG_REL[area] ?? []).forEach((s, j) => {
      if (R() < 0.75 - j * 0.15)
        skills[s] = Math.max(1, level - (R() < 0.5 ? 1 : 0) - j * (R() < 0.4 ? 1 : 0));
    });
    if (area === 'pm') skills.pm = Math.max(level, 3);
    return {
      id: id(`u${i + 1}`),
      team: '',
      name,
      area,
      role: MG_ROLE[area]!,
      level,
      cost: MG_COST[level]! + Math.round(R() * 6),
      rate: MG_RATE[level]! + Math.round(R() * 10),
      cap: 40,
      loc: ['Lisboa', 'Porto', 'Remoto', 'Lisboa', 'Coimbra'][Math.floor(R() * 5)]!,
      status: 'Ativo' as const,
      statusNote: '',
      // one draw, as the old "since" year (the seeded sequence must not shift)
      hired: `${2012 + Math.floor(R() * 13)}-${String((i % 12) + 1).padStart(2, '0')}-01`,
      expYears: level + 1 + (i % 4),
      expSplit: [],
      phone: '',
      skills,
      email: `${name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.')}@empresa.pt`,
      av: mgAv(i),
    };
  });
  const PH = ['Preparação', 'Desenho', 'Construção', 'Testes', 'Go-live', 'Suporte'];
  const PF = [0.1, 0.2, 0.35, 0.2, 0.05, 0.1];
  const P: Array<
    [string, string, string, string, number, number, number, string, string, Array<[string, number]>]
  > = [
    [
      'p1',
      'LUS-S4',
      'Migração S/4HANA',
      'c1',
      480000,
      -20,
      34,
      'oklch(0.8 0.13 50)',
      'Ativo',
      [
        ['abap', 3],
        ['fi', 2],
        ['co', 1],
        ['sd', 1],
        ['mm', 1],
        ['basis', 1],
        ['pm', 1],
      ],
    ],
    [
      'p2',
      'ATL-FIORI',
      'Apps Fiori para lojas',
      'c2',
      120000,
      -8,
      10,
      'oklch(0.8 0.12 200)',
      'Ativo',
      [
        ['fiori', 2],
        ['abap', 1],
      ],
    ],
    [
      'p3',
      'DOU-AMS',
      'Suporte aplicacional (AMS)',
      'c3',
      90000,
      -40,
      60,
      'oklch(0.82 0.1 140)',
      'Ativo',
      [
        ['abap', 1],
        ['fi', 1],
        ['sd', 1],
      ],
    ],
    [
      'p4',
      'POR-EWM',
      'Implementação EWM',
      'c4',
      260000,
      -14,
      18,
      'oklch(0.78 0.14 25)',
      'Em risco',
      [
        ['ewm', 2],
        ['mm', 1],
        ['abap', 1],
        ['pm', 1],
      ],
    ],
    [
      'p5',
      'BEI-SF',
      'SuccessFactors EC + integração HCM',
      'c5',
      180000,
      -10,
      16,
      'oklch(0.78 0.12 300)',
      'Ativo',
      [
        ['sf', 2],
        ['hcm', 2],
        ['abap', 1],
      ],
    ],
    [
      'p6',
      'LUS-BTP',
      'Extensões em BTP',
      'c1',
      75000,
      -4,
      12,
      'oklch(0.8 0.11 240)',
      'Ativo',
      [
        ['btp', 1],
        ['fiori', 1],
      ],
    ],
    [
      'p7',
      'INT-UPG',
      'Upgrade NetWeaver 7.58',
      'c6',
      40000,
      -2,
      6,
      'oklch(0.82 0.08 90)',
      'Ativo',
      [
        ['basis', 1],
        ['abap', 1],
      ],
    ],
    [
      'p8',
      'ATL-SD',
      'Rollout SD Espanha',
      'c2',
      150000,
      3,
      26,
      'oklch(0.8 0.12 170)',
      'Planeado',
      [['sd', 1]],
    ],
    [
      'p9',
      'INT-ACAD',
      'Academia ABAP interna',
      'c6',
      15000,
      -6,
      20,
      'oklch(0.84 0.09 330)',
      'Ativo',
      [['abap', 1]],
    ],
    // a proposal: tentative bookings and roles still without a person
    [
      'p10',
      'CRT-RISE',
      'RISE with SAP (proposta)',
      'c4',
      240000,
      3,
      40,
      'oklch(0.78 0.12 300)',
      'Planeado',
      [],
    ],
  ];
  // FIORI is not in SAP_MODULES: a module of the tenant's own
  const MODS: Record<string, string[]> = {
    p1: ['FI', 'CO', 'SD', 'MM', 'ABAP', 'BC'],
    p2: ['SD', 'FIORI', 'BTP'],
    p3: ['FI', 'CO', 'SD', 'MM'],
    p4: ['EWM', 'MM'],
    p5: ['SF', 'HCM'],
    p6: ['BTP', 'ABAP', 'FIORI'],
    p7: ['BC'],
    p8: ['SD', 'FI'],
    p9: ['ABAP'],
    p10: ['FI', 'CO', 'PP', 'QM', 'BC', 'BTP'],
  };
  // Alocações v2: h/dia (some h/semana) from a Monday to a Friday, a role on each booking
  const bookings: Booking[] = [];
  const load: Record<string, number> = {};
  const bk = (o: Partial<Booking> & Pick<Booking, 'person' | 'project' | 'from' | 'to' | 'value'>) => {
    const b: Booking = {
      id: uuid(),
      role: '',
      status: 'confirmed',
      mode: 'hpd',
      mask: AL_MASK_WK,
      hol: false,
      note: '',
      need: [],
      days: {},
      ver: '',
      ...o,
    };
    bookings.push(b);
    return b;
  };
  const addA = (pid: string, proj: string, from: number, to: number, want: number, role: string, over = false) => {
    // what still fits in the person's week over the range (a few are left over capacity on purpose)
    let peak = 0;
    for (let w = from; w <= to; w++) peak = Math.max(peak, load[pid + w] ?? 0);
    const room = Math.max(0, 40 - peak) / 5;
    const hpd = over ? want : Math.min(want, Math.floor(room * 2) / 2);
    if (hpd < 1) return;
    const asWeek = bookings.length % 4 === 3;
    bk({
      person: pid,
      project: proj,
      from: dIso(from, 0),
      to: dIso(to, 4),
      mode: asWeek ? 'hpw' : 'hpd',
      value: asWeek ? hpd * 5 : hpd,
      role,
    });
    for (let w = from; w <= to; w++) load[pid + w] = (load[pid + w] ?? 0) + hpd * 5;
  };
  const FN: Record<string, string[]> = {
    abap: ['ABAP · interfaces', 'ABAP · RICEFW', 'ABAP · conversões'],
    fi: ['Líder FI-GL / AA', 'FI · contas a pagar', 'FI · fecho'],
    co: ['CO-PA', 'CO · centros de custo'],
    sd: ['SD pricing / output', 'SD · encomendas'],
    mm: ['MM · migração de dados', 'MM · compras'],
    fiori: ['Fiori · apps de loja', 'Fiori · Launchpad'],
    basis: ['Basis · landscape', 'Basis · cutover'],
    pm: ['Gestão de projeto'],
    ewm: ['EWM · armazém'],
    sf: ['SuccessFactors EC'],
    hcm: ['HCM · integração'],
    btp: ['BTP · extensões'],
  };
  const projects: MgProject[] = P.map(([k, code, name, client, budget, s, e, color, status, needs]) => {
    const dur = e - s + 1;
    let cur = s;
    const phases =
      k === 'p3'
        ? [{ name: 'Suporte contínuo', from: wk(s), to: wk(e) }]
        : PH.map((n, i) => {
            const len = Math.max(1, Math.round(dur * PF[i]!));
            const f = cur;
            const t = i === PH.length - 1 ? e : Math.min(e, cur + len - 1);
            cur = t + 1;
            return { name: n, from: wk(f), to: wk(t) };
          }).filter((ph) => wi(ph.from) <= wi(ph.to));
    for (const [area, n] of needs) {
      const cands = people
        .filter((p) => p.area === area)
        .sort((a, b) => (load[`${a.id}0`] ?? 0) - (load[`${b.id}0`] ?? 0));
      cands.slice(0, n).forEach((p, j) => {
        const hpd = [4, 6, 6, 8][Math.floor(R() * 4)]!;
        const f = Math.max(s, -8);
        const t = Math.min(e, 4 + Math.floor(R() * 16));
        const fns = FN[area] ?? [MG_ROLE[area] ?? area];
        if (f <= t) addA(p.id, id(k), f, t, hpd, fns[j % fns.length]!);
      });
    }
    return {
      id: id(k),
      team: '',
      modules: MODS[k] ?? [],
      code,
      name,
      client: id(client),
      budget,
      from: wk(s),
      to: wk(e),
      color,
      status,
      manager: '',
      phases,
    };
  });
  const byArea = (a: string) => people.filter((p) => p.area === a);
  (
    [
      ['abap', 0, 'p9', 0, 6, 2],
      ['fi', 0, 'p3', -1, 4, 2],
      ['sd', 0, 'p8', 3, 10, 4],
      ['pm', 0, 'p6', -2, 8, 2],
    ] as const
  ).forEach(([a, i, pr, f, t, hpd]) => {
    const p = byArea(a)[i];
    // these overlap on purpose: over capacity for a few weeks
    if (p) addA(p.id, id(pr), f, t, hpd, FN[a]?.[0] ?? '', true);
  });
  // the proposal (CRT-RISE): tentative bookings of real people, and roles "Por atribuir"
  const rise = id('p10');
  const tent = (a: string, i: number, f: number, t: number, hpd: number, role: string) => {
    const p = byArea(a)[i];
    if (p)
      bk({
        person: p.id,
        project: rise,
        from: dIso(f, 0),
        to: dIso(t, 4),
        value: hpd,
        role,
        status: 'tentative',
      });
  };
  tent('fi', 1, 3, 12, 2, 'Fit-to-standard FI');
  tent('co', 0, 4, 16, 4, 'Arquitetura Finance');
  tent('basis', 1, 3, 20, 4, 'Basis / BTP');
  tent('fiori', 1, 6, 18, 8, 'Fiori / BTP');
  const ph = (
    f: number,
    t: number,
    hpd: number,
    role: string,
    need: Booking['need'],
    pr = rise,
    status: Booking['status'] = 'tentative',
  ) => bk({ person: '', project: pr, from: dIso(f, 0), to: dIso(t, 4), value: hpd, role, need, status });
  ph(3, 12, 8, 'Consultor FI · Sénior', [{ k: 'fi', l: 3 }]);
  ph(14, 30, 6, 'Consultor PP/QM', [{ k: 'pp', l: 2 }]);
  ph(4, 9, 8, 'Developer ABAP · RICEFW', [{ k: 'abap', l: 2 }], id('p1'), 'confirmed');
  ph(5, 14, 6, 'Consultor SD · Pleno', [{ k: 'sd', l: 2 }], id('p8'), 'confirmed');
  // a Saturday cutover (weekends are allowed) and a part-time person (4 days a week, 32 h)
  const bas = byArea('basis')[0];
  if (bas) {
    const sat = dIso(3, 5);
    bk({
      person: bas.id,
      project: id('p1'),
      from: sat,
      to: sat,
      value: 8,
      mask: 0b0100000,
      role: 'Cutover go-live',
    });
    bas.cap = 32;
  }
  for (const pr of projects) {
    const pm =
      people.find((p) => p.area === 'pm' && bookings.some((a) => a.person === p.id && a.project === pr.id)) ??
      people.find((p) => p.area === 'pm');
    pr.manager = pm?.id ?? '';
  }
  // absences: vacation (soon, Christmas, summer), training, a sick leave
  const absences: Absence[] = [];
  const ab = (pi: number, type: Absence['type'], from: string, to: string, hours: number | null = null) => {
    const p = people[pi];
    if (p) absences.push({ id: uuid(), person: p.id, type, from, to, hours, note: '', ver: '' });
  };
  const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  ab(6, 'ferias', dIso(1, 0), dIso(1, 4));
  ab(1, 'ferias', `${y}-12-21`, `${y}-12-31`);
  ab(3, 'ferias', `${y}-12-28`, `${y + 1}-01-08`);
  ab(9, 'ferias', dIso(5, 0), dIso(6, 4));
  ab(16, 'ferias', `${y + 1}-08-02`, `${y + 1}-08-20`);
  ab(21, 'ferias', `${y + 1}-07-12`, `${y + 1}-07-23`);
  ab(5, 'formacao', dIso(2, 2), dIso(2, 3));
  ab(11, 'formacao', dIso(0, 4), dIso(0, 4), 4);
  ab(13, 'doenca', dIso(-1, 2), dIso(-1, 3));
  ab(25, 'outra', dIso(3, 1), dIso(3, 1));
  const weekly = Object.fromEntries(people.map((p) => [p.id, p.cap]));
  const env: CalcEnv = {
    weekly: (p) => weekly[p] ?? 40,
    absences: (p) => absences.filter((a) => a.person === p),
  };
  const ts: MgTs[] = [];
  for (let w = -6; w <= -1; w++)
    people.forEach((p, pi) => {
      const rows: Record<string, number[]> = {};
      bookings
        .filter(
          (a) => a.person === p.id && a.status === 'confirmed' && a.from <= dIso(w, 4) && a.to >= dIso(w, 0),
        )
        .forEach((a) => {
          const s = bookingSeries(a, env);
          rows[a.project] = [0, 1, 2, 3, 4].map((i) => {
            const h = s.h[dnOf(dIso(w, i)) - s.from] ?? 0;
            return h ? Math.max(0, Math.round((h + (R() - 0.5) * 2) * 2) / 2) : 0;
          });
        });
      if (!Object.keys(rows).length) return;
      ts.push({
        id: uuid(),
        person: p.id,
        week: wk(w),
        status: w === -1 && pi % 5 === 0 ? 'Rascunho' : 'Submetido',
        rows,
      });
    });
  const reqs: MgReq[] = (
    [
      ['p8', 'sd', 3, 40, 3, 16, 'Aberto'],
      ['p4', 'ewm', 2, 32, 1, 12, 'Aberto'],
      ['p1', 'abap', 3, 24, 0, 10, 'Proposto'],
      ['p5', 'sf', 4, 16, 2, 8, 'Aberto'],
      ['p2', 'fiori', 2, 40, 1, 6, 'Aberto'],
      ['p6', 'btp', 3, 20, -2, 8, 'Preenchido'],
    ] as const
  ).map(([project, skill, level, h, f, t, status]) => ({
    id: uuid(),
    team: '',
    project: id(project),
    skills: [{ k: skill, l: level }],
    hours: h,
    maxCost: '',
    from: wk(f),
    to: wk(t),
    status,
    assigned: status === 'Preenchido' ? (people.find((p) => p.area === 'btp')?.id ?? '') : '',
    note: '',
  }));
  // mgEnsureTeams
  const G: Array<[string, string, string[], string]> = [
    [
      't1',
      'Desenvolvimento & Tecnologia',
      ['abap', 'oo', 'rap', 'fiori', 'btp', 'cpi', 'basis'],
      'Desenvolvimento ABAP, Fiori, integração e Basis.',
    ],
    [
      't2',
      'Finanças & Logística',
      ['fi', 'co', 'sd', 'mm', 'pp', 'ewm', 'bw', 's4'],
      'Consultoria funcional FI/CO e Logística.',
    ],
    ['t3', 'Pessoas & PMO', ['hcm', 'sf', 'pm'], 'HCM, SuccessFactors e gestão de projeto.'],
  ];
  const teams: MgTeam[] = G.map(([k, name, areas, desc], i) => ({
    id: id(k),
    name,
    areas,
    desc,
    color: MG_TCOL[i]!,
    target: 90,
    lead: '',
  }));
  for (const p of people) p.team = (teams.find((t) => t.areas.includes(p.area)) ?? teams[0]!).id;
  for (const t of teams)
    t.lead = people.filter((p) => p.team === t.id).sort((a, b) => b.level - a.level)[0]?.id ?? '';
  return { clients, teams, people, projects, ts, reqs, bookings, absences };
}
