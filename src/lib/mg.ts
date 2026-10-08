// Management (Management.dc.html): constants, week helpers, the data shapes
// shared by the client and the server, their validation and the sample data
// (prototype mgSeed) used by "Repor Dados".
import { z } from 'zod';

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
  skills: Record<string, number>;
};
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
};
export type MgAlloc = {
  id: string;
  person: string;
  project: string;
  from: string;
  to: string;
  hours: number;
  /** hours per week overriding `hours` ({ 'YYYY-MM-DD' (Monday): h | '' }) */
  ovr?: Record<string, number | ''>;
  /** hours per day ({ 'YYYY-MM-DD': h | '' }) */
  dov?: Record<string, number | ''>;
  start?: string;
  hpd?: number;
  days?: number;
  mask?: number[];
  /** role in the project (free text, suggested from the person's skills) */
  fn?: string;
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
  allocs: MgAlloc[];
  ts: MgTs[];
  reqs: MgReq[];
  settings: MgSettings;
};
export const MG_COLLECTIONS = ['clients', 'teams', 'people', 'projects', 'allocs', 'ts', 'reqs'] as const;
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
const hmap = z.record(day, z.union([z.literal(''), hours])).refine((m) => Object.keys(m).length <= 800);
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
  }),
  allocs: z.strictObject({
    id: z.uuid(),
    person: z.uuid(),
    project: z.uuid(),
    from: day,
    to: day,
    hours,
    ovr: hmap.optional(),
    dov: hmap.optional(),
    start: day.optional(),
    hpd: z.number().min(0).max(24).optional(),
    days: z.number().int().min(1).max(2000).optional(),
    mask: z.array(z.number().int().min(0).max(1)).length(5).optional(),
    /** role in the project (free text, suggested from the person's skills) */
    fn: line(120).optional(),
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
export function mgSample(uuid: () => string, now = new Date()): Omit<MgData, 'settings'> {
  const { wk, wi } = mgWeeks(now);
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
  ];
  const allocs: MgAlloc[] = [];
  const load: Record<string, number> = {};
  const addA = (pid: string, proj: string, from: number, to: number, hours: number) => {
    allocs.push({ id: uuid(), person: pid, project: proj, from: wk(from), to: wk(to), hours });
    for (let w = from; w <= to; w++) load[pid + w] = (load[pid + w] ?? 0) + hours;
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
      cands.slice(0, n).forEach((p) => {
        const hrs = [24, 32, 40, 40][Math.floor(R() * 4)]!;
        const f = Math.max(s, -8);
        const t = Math.min(e, 4 + Math.floor(R() * 16));
        if (f <= t) addA(p.id, id(k), f, t, hrs);
      });
    }
    return {
      id: id(k),
      team: '',
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
      ['abap', 0, 'p9', 0, 6, 16],
      ['fi', 0, 'p3', -1, 4, 16],
      ['sd', 0, 'p8', 3, 10, 24],
      ['pm', 0, 'p6', -2, 8, 16],
    ] as const
  ).forEach(([a, i, pr, f, t, hh]) => {
    const p = byArea(a)[i];
    if (p) addA(p.id, id(pr), f, t, hh);
  });
  for (const pr of projects) {
    const pm =
      people.find((p) => p.area === 'pm' && allocs.some((a) => a.person === p.id && a.project === pr.id)) ??
      people.find((p) => p.area === 'pm');
    pr.manager = pm?.id ?? '';
  }
  const ts: MgTs[] = [];
  for (let w = -6; w <= -1; w++)
    people.forEach((p, pi) => {
      const rows: Record<string, number[]> = {};
      allocs
        .filter((a) => a.person === p.id && wi(a.from) <= w && wi(a.to) >= w)
        .forEach((a) => {
          rows[a.project] = [0, 1, 2, 3, 4].map(() =>
            Math.max(0, Math.round((a.hours / 5 + (R() - 0.5) * 2) * 2) / 2),
          );
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
  return { clients, teams, people, projects, allocs, ts, reqs };
}
