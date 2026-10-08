// Module & plan catalogue seeded into the database (Admin Console prototype:
// AGRP, AP and the FREE limits). Admins edit prices/modules later in the
// console; the seed only inserts what is missing and never overwrites edits.
export type ModuleDef = { id: string; grp: string; pt: string; en: string };

export const MODULE_GROUPS: ReadonlyArray<{
  grp: string;
  pt: string;
  en: string;
  modules: ReadonlyArray<[string, string, string]>;
}> = [
  {
    grp: 'base',
    pt: 'Base',
    en: 'Base',
    modules: [
      ['calendar', 'Calendário', 'Calendar'],
      ['notes', 'Notas', 'Notes'],
      ['voice', 'Notas de Voz', 'Voice Notes'],
      ['tasks', 'Tarefas', 'Tasks'],
      ['meetings', 'Atas de Reunião', 'Meeting Minutes'],
      ['files', 'Ficheiros', 'Files'],
    ],
  },
  {
    grp: 'pro',
    pt: 'Pro',
    en: 'Pro',
    modules: [
      ['passwords', 'Passwords', 'Passwords'],
      ['issues', 'Tarefas de Projeto', 'Project Issues'],
      ['emails', 'Emails', 'Emails'],
    ],
  },
  {
    grp: 'mgmt',
    pt: 'Management',
    en: 'Management',
    modules: [
      ['mg_overview', 'Visão Geral', 'Overview'],
      ['mg_teams', 'Equipas', 'Teams'],
      ['mg_people', 'Recursos', 'Resources'],
      ['mg_skills', 'Competências', 'Skills'],
      ['mg_projects', 'Projetos', 'Projects'],
      ['mg_dash', 'Painel de Alocação', 'Allocation Dashboard'],
      ['mg_alloc', 'Alocações', 'Allocations'],
      ['mg_staff', 'Pesquisar Recursos', 'Resource Finder'],
      ['mg_time', 'Folhas de Tempos', 'Timesheets'],
      ['mg_clients', 'Clientes', 'Clients'],
    ],
  },
  {
    grp: 'dev',
    pt: 'Developer',
    en: 'Developer',
    modules: [
      ['artifacts', 'Artefactos', 'Artifacts'],
      ['devlib', 'Biblioteca de Código', 'Code Library'],
      ['api', 'API Playground', 'API Playground'],
    ],
  },
  {
    grp: 'sap',
    pt: 'SAP',
    en: 'SAP',
    modules: [
      ['codelib', 'Biblioteca de Código SAP', 'SAP Code Library'],
      ['systems', 'Sistemas SAP', 'SAP Systems'],
      ['tcodes', 'SAP TCodes', 'SAP TCodes'],
      ['transports', 'Ordens de Transporte', 'Transport Requests'],
      ['fn_proc', 'Processos', 'Processes'],
      ['fn_test', 'Testes', 'Tests'],
      ['fn_mig', 'Migração de Dados', 'Data Migration'],
      ['fn_cut', 'Cutover', 'Cutover'],
    ],
  },
  {
    grp: 'feat',
    pt: 'Funcionalidades',
    en: 'Features',
    modules: [
      ['whiteboard', 'Whiteboard', 'Whiteboard'],
      ['share', 'Partilha', 'Sharing'],
      ['news', 'SAP News', 'SAP News'],
    ],
  },
  {
    grp: 'custom',
    pt: 'Personalização',
    en: 'Customization',
    modules: [
      ['brand', 'Marca', 'Brand'],
      ['bgphoto', 'Foto de fundo própria', 'Custom background photo'],
      ['typeface', 'Tipo de letra', 'Typeface'],
      ['glass', 'Liquid Glass', 'Liquid Glass'],
      ['accent', 'Cor de destaque', 'Accent color'],
      ['sidebar', 'Barra lateral', 'Sidebar'],
    ],
  },
];

export const MODULES: ModuleDef[] = MODULE_GROUPS.flatMap((g) =>
  g.modules.map(([id, pt, en]) => ({ id, grp: g.grp, pt, en })),
);

// The prototype's plan lists use two umbrella ids; expand them.
const EXPAND: Record<string, string[]> = {
  functional: ['fn_proc', 'fn_test', 'fn_mig', 'fn_cut'],
  management: MODULE_GROUPS.find((g) => g.grp === 'mgmt')!.modules.map(([id]) => id),
};
const expand = (ids: string[]) => ids.flatMap((id) => EXPAND[id] ?? [id]);

export type PlanDef = {
  code: string;
  color: string;
  price: number;
  annualDiscountPct: number;
  modules: string[];
  isPopular?: boolean;
};

// [name, colour, €/user/month, annual discount %, modules] — prototype `AP`.
export const PLANS: PlanDef[] = (
  [
    ['FREE', 'oklch(0.85 0.02 250)', 0, 0, ['notes', 'tasks']],
    [
      'PRO',
      'oklch(0.8 0.13 150)',
      6,
      20,
      ['notes', 'tasks', 'calendar', 'meetings', 'files', 'voice', 'artifacts', 'whiteboard', 'share'],
    ],
    [
      'DEVELOPER',
      'oklch(0.8 0.13 305)',
      9,
      20,
      [
        'notes',
        'tasks',
        'calendar',
        'meetings',
        'files',
        'artifacts',
        'devlib',
        'api',
        'whiteboard',
        'share',
      ],
    ],
    [
      'SAP',
      'oklch(0.78 0.14 245)',
      14,
      20,
      [
        'notes',
        'tasks',
        'calendar',
        'meetings',
        'files',
        'codelib',
        'systems',
        'transports',
        'tcodes',
        'functional',
        'share',
      ],
    ],
    [
      'MANAGEMENT',
      'oklch(0.82 0.13 70)',
      12,
      20,
      ['notes', 'tasks', 'calendar', 'meetings', 'files', 'management', 'share'],
    ],
    [
      'ULTRA',
      'oklch(0.8 0.14 25)',
      24,
      25,
      [
        'notes',
        'tasks',
        'calendar',
        'meetings',
        'files',
        'voice',
        'artifacts',
        'whiteboard',
        'devlib',
        'api',
        'codelib',
        'systems',
        'transports',
        'tcodes',
        'functional',
        'management',
        'news',
        'share',
      ],
    ],
  ] as const
).map(([code, color, price, disc, mods]) => ({
  code,
  color,
  price,
  annualDiscountPct: disc,
  modules: expand([...mods]),
}));

// FREE creation limits (DATA_MODEL.md §3; prototype defaults).
export const FREE_LIMITS: Record<string, number> = {
  notes: 30,
  tasks: 20,
  artifacts: 5,
  whiteboards: 2,
  snippets: 10,
  voice: 5,
};

/**
 * "Pacote individual" (prototype CUSTOM): no modules of its own — the tenant's
 * chosen module groups (tenants.addon_groups) are copied into tenant_modules.
 */
export const CUSTOM_PLAN = 'CUSTOM';
export const groupModules = (grp: string) =>
  MODULE_GROUPS.find((g) => g.grp === grp)?.modules.map(([id]) => id) ?? [];

/** Plan given to the operator's own tenant (all modules). */
export const OWNER_PLAN = 'ULTRA';
