// Code Library SAP (ZNotes.dc.html isCodelib): ABAP objects as a tree of
// nodes (code, configuration forms, grids, generated code). Shared by the
// client (editor, generators) and the server (validation, trash, search).
import { z } from 'zod';

export const CL_TYPES = {
  PROG: ['SE38', 'oklch(0.8 0.13 50)', 'cl_t_prog'],
  FUGR: ['SE37', 'oklch(0.76 0.12 300)', 'cl_t_fugr'],
  CLAS: ['SE24', 'oklch(0.8 0.11 175)', 'cl_t_clas'],
  INTF: ['SE24', 'oklch(0.82 0.1 210)', 'cl_t_intf'],
  TABL: ['SE11', 'oklch(0.78 0.11 245)', 'cl_t_tabl'],
  STRU: ['SE11', 'oklch(0.8 0.09 270)', 'cl_t_stru'],
  DTEL: ['SE11', 'oklch(0.82 0.12 145)', 'cl_t_dtel'],
  DOMA: ['SE11', 'oklch(0.85 0.12 100)', 'cl_t_doma'],
  SNIP: ['—', 'oklch(0.85 0.03 60)', 'cl_t_snip'],
} as const;
export type ClType = keyof typeof CL_TYPES;
export const CL_TYPE_IDS = Object.keys(CL_TYPES) as ClType[];

export const CL_GROUP_IDS = ['code', 'cfg', 'fm', 'inc', 'meth', 'gen'] as const;
export type ClGroup = (typeof CL_GROUP_IDS)[number];
export const CL_GROUPS: Record<ClType, ClGroup[]> = {
  PROG: ['code', 'cfg'],
  FUGR: ['fm', 'inc', 'cfg'],
  CLAS: ['cfg', 'meth', 'code', 'gen'],
  INTF: ['cfg', 'meth', 'gen'],
  TABL: ['cfg', 'gen'],
  STRU: ['cfg', 'gen'],
  DTEL: ['cfg'],
  DOMA: ['cfg'],
  SNIP: ['code'],
};

const ENH = [
  'Can Be Enhanced (Deep)',
  'Can be enhanced (character-type or numeric)',
  'Can be enhanced (character-type)',
  'Cannot Be Enhanced',
  'Not classified',
];
const VIS = ['Public', 'Protected', 'Private'];
const TYP3 = ['Type', 'Like', 'Type Ref To'];
const TYP_FM = ['TYPE', 'LIKE', 'TYPE REF TO'];

export type FieldKind = 'text' | 'mono' | 'sel' | 'check';
/** Form field: [key, label, kind, options]. */
export type FormField = [string, string, FieldKind, string[]?];
/** Grid column: [key, label, width (0 = grow), kind, options]. */
export type GridCol = [string, string, number, FieldKind, string[]?];

export const CL_FORMS = {
  prog_attr: [
    ['title', 'Title', 'text'],
    [
      'type',
      'Type',
      'sel',
      [
        '1 Executable program',
        'I INCLUDE program',
        'M Module pool',
        'F Function group',
        'S Subroutine pool',
        'K Class pool',
        'J Interface pool',
        'T Type pool',
      ],
    ],
    [
      'status',
      'Status',
      'sel',
      [
        'K Customer Production Program',
        'T Test Program',
        'S System Program',
        'P SAP Standard Production Program',
      ],
    ],
    ['app', 'Application', 'text'],
    ['authGroup', 'Authorization Group', 'mono'],
    ['pkg', 'Package', 'mono'],
    ['ldb', 'Logical database', 'mono'],
    ['editLock', 'Editor Lock', 'check'],
    ['fixedPt', 'Fixed point arithmetic', 'check'],
    ['unicode', 'Unicode Checks Active', 'check'],
    ['startVar', 'Start Using Variant', 'check'],
  ],
  fugr_attr: [
    ['text', 'Short text', 'text'],
    ['pkg', 'Package', 'mono'],
    ['resp', 'Person Responsible', 'mono'],
    ['main', 'Main program', 'mono'],
  ],
  fm_attr: [
    ['text', 'Short text', 'text'],
    ['proc', 'Processing Type', 'sel', ['Normal Function Module', 'Remote-Enabled Module', 'Update Module']],
    [
      'upd',
      'Update type',
      'sel',
      ['—', 'Start immed.', 'Immediate Start, No Restart', 'Start Delayed', 'Coll.run'],
    ],
    ['pkg', 'Package', 'mono'],
    ['released', 'Released', 'check'],
    ['excCls', 'Exception Classes', 'check'],
  ],
  cl_props: [
    ['text', 'Description', 'text'],
    ['inst', 'Instantiation', 'sel', ['Public', 'Protected', 'Private', 'Abstract']],
    ['super', 'Superclass', 'mono'],
    ['pkg', 'Package', 'mono'],
    ['msgCls', 'Message class', 'mono'],
    ['final', 'Final', 'check'],
    ['shared', 'Shared Memory-Enabled', 'check'],
    ['fixedPt', 'Fixed point arithmetic', 'check'],
  ],
  in_props: [
    ['text', 'Description', 'text'],
    ['pkg', 'Package', 'mono'],
  ],
  cl_meth: [
    ['text', 'Description', 'text'],
    ['level', 'Level', 'sel', ['Instance', 'Static']],
    ['vis', 'Visibility', 'sel', VIS],
    ['abs', 'Abstract', 'check'],
    ['fin', 'Final', 'check'],
    ['redef', 'Redefinition', 'check'],
  ],
  tb_attr: [
    ['text', 'Short Description', 'text'],
    [
      'deliv',
      'Delivery Class',
      'sel',
      [
        'A Application table (master and transaction data)',
        'C Customizing table, maintenance only by cust.',
        'L Table for storing temporary data',
        'G Customizing table, protected against SAP Upd.',
        'E Control table, SAP and customer have separate key areas',
        'S System table, maint. only by SAP',
        'W System table, contents transportable via separate TR objects',
      ],
    ],
    [
      'browse',
      'Data Browser/Table View Editing',
      'sel',
      [
        'Display/Maintenance Allowed with Restrictions',
        'Display/Maintenance Allowed',
        'Display/Maintenance Not Allowed',
      ],
    ],
    ['enh', 'Enhancement Category', 'sel', ENH],
    ['pkg', 'Package', 'mono'],
  ],
  tb_tech: [
    [
      'dclass',
      'Data Class',
      'sel',
      [
        'APPL0 Master data, transparent tables',
        'APPL1 Transaction data, transparent tables',
        'APPL2 Organization and customizing',
        'USER Customer data class',
      ],
    ],
    ['size', 'Size category', 'sel', ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']],
    [
      'buff',
      'Buffering',
      'sel',
      ['Buffering not allowed', 'Buffering allowed but switched off', 'Buffering switched on'],
    ],
    [
      'btype',
      'Buffering Type',
      'sel',
      ['—', 'Single records buff.', 'Generic Area Buffered', 'Fully buffered'],
    ],
    ['log', 'Log data changes', 'check'],
  ],
  tb_tmg: [
    ['auth', 'Authorization Group', 'mono'],
    ['fugr', 'Function group', 'mono'],
    ['pkg', 'Package', 'mono'],
    ['mtype', 'Maintenance type', 'sel', ['One step', 'Two step']],
    ['scr1', 'Overview screen', 'mono'],
    ['scr2', 'Single screen', 'mono'],
    ['rec', 'Recording routine', 'sel', ['Standard recording routine', 'No, or user, recording routine']],
  ],
  st_attr: [
    ['text', 'Short Description', 'text'],
    ['enh', 'Enhancement Category', 'sel', ENH],
    ['pkg', 'Package', 'mono'],
  ],
  de_attr: [
    ['text', 'Short Description', 'text'],
    [
      'kind',
      'Data Type',
      'sel',
      ['Elementary Type · Domain', 'Elementary Type · Predefined Type', 'Reference Type'],
    ],
    ['domain', 'Domain', 'mono'],
    ['dtype', 'Data Type', 'mono'],
    ['len', 'Length', 'mono'],
    ['dec', 'Decimal Places', 'mono'],
    ['pkg', 'Package', 'mono'],
  ],
  de_more: [
    ['shlp', 'Search Help', 'mono'],
    ['param', 'Parameter ID', 'mono'],
    ['chdoc', 'Change document', 'check'],
    ['nohist', 'No Input History', 'check'],
  ],
  do_def: [
    ['text', 'Short Description', 'text'],
    ['dtype', 'Data Type', 'mono'],
    ['nchar', 'No. Characters', 'mono'],
    ['dec', 'Decimal Places', 'mono'],
    ['olen', 'Output Length', 'mono'],
    ['conv', 'Convers. Routine', 'mono'],
    ['valtab', 'Value Table', 'mono'],
    ['pkg', 'Package', 'mono'],
    ['lower', 'Lowercase', 'check'],
    ['sign', 'Sign', 'check'],
  ],
} satisfies Record<string, FormField[]>;

export const CL_GRIDS = {
  prog_sym: [
    ['sym', 'Sym', 70, 'mono'],
    ['text', 'Text', 0, 'text'],
    ['dlen', 'dLen', 70, 'mono'],
    ['mlen', 'mLen', 70, 'mono'],
  ],
  prog_sel: [
    ['name', 'Name', 160, 'mono'],
    ['text', 'Text', 0, 'text'],
    ['dict', 'Dictionary Ref.', 120, 'check'],
  ],
  prog_var: [
    ['name', 'Variant', 170, 'mono'],
    ['desc', 'Description', 0, 'text'],
    ['prot', 'Protected', 100, 'check'],
    ['sys', 'System variant', 120, 'check'],
  ],
  fm_imp: [
    ['param', 'Parameter Name', 170, 'mono'],
    ['typing', 'Typing', 120, 'sel', TYP_FM],
    ['atype', 'Associated Type', 170, 'mono'],
    ['def', 'Default value', 120, 'mono'],
    ['opt', 'Optional', 80, 'check'],
    ['byval', 'Pass Value', 90, 'check'],
    ['text', 'Short text', 0, 'text'],
  ],
  fm_exp: [
    ['param', 'Parameter Name', 170, 'mono'],
    ['typing', 'Typing', 120, 'sel', TYP_FM],
    ['atype', 'Associated Type', 170, 'mono'],
    ['byval', 'Pass Value', 90, 'check'],
    ['text', 'Short text', 0, 'text'],
  ],
  fm_tab: [
    ['param', 'Parameter Name', 170, 'mono'],
    ['typing', 'Typing', 120, 'sel', ['LIKE', 'TYPE', 'STRUCTURE']],
    ['atype', 'Associated Type', 170, 'mono'],
    ['opt', 'Optional', 80, 'check'],
    ['text', 'Short text', 0, 'text'],
  ],
  fm_exc: [
    ['exc', 'Exception', 230, 'mono'],
    ['text', 'Short text', 0, 'text'],
  ],
  cl_intf: [
    ['intf', 'Interface', 230, 'mono'],
    ['abs', 'Abstract', 90, 'check'],
    ['fin', 'Final', 80, 'check'],
    ['text', 'Description', 0, 'text'],
  ],
  cl_attr: [
    ['name', 'Attribute', 170, 'mono'],
    ['level', 'Level', 120, 'sel', ['Instance', 'Static', 'Constant']],
    ['vis', 'Visibility', 120, 'sel', VIS],
    ['ro', 'Read-Only', 90, 'check'],
    ['typing', 'Typing', 130, 'sel', TYP3],
    ['atype', 'Associated Type', 170, 'mono'],
    ['init', 'Initial value', 120, 'mono'],
    ['text', 'Description', 0, 'text'],
  ],
  cl_par: [
    ['name', 'Parameter', 160, 'mono'],
    ['kind', 'Type', 120, 'sel', ['Importing', 'Exporting', 'Changing', 'Returning']],
    ['byval', 'Pass Value', 90, 'check'],
    ['opt', 'Optional', 80, 'check'],
    ['typing', 'Typing', 130, 'sel', TYP3],
    ['atype', 'Associated Type', 170, 'mono'],
    ['def', 'Default value', 110, 'mono'],
    ['text', 'Description', 0, 'text'],
  ],
  cl_exc: [
    ['exc', 'Exception', 230, 'mono'],
    ['resum', 'Resumable', 100, 'check'],
    ['text', 'Description', 0, 'text'],
  ],
  tb_fields: [
    ['field', 'Field', 160, 'mono'],
    ['key', 'Key', 56, 'check'],
    ['ini', 'Initial Values', 96, 'check'],
    ['dtel', 'Data element', 170, 'mono'],
    ['dtype', 'Data Type', 96, 'mono'],
    ['len', 'Length', 72, 'mono'],
    ['dec', 'Decimals', 80, 'mono'],
    ['text', 'Short Description', 0, 'text'],
  ],
  tb_idx: [
    ['id', 'Index', 80, 'mono'],
    ['text', 'Short Description', 0, 'text'],
    ['uniq', 'Unique', 80, 'check'],
    ['fields', 'Fields', 240, 'mono'],
  ],
  tb_fk: [
    ['field', 'Field', 160, 'mono'],
    ['chk', 'Check table', 170, 'mono'],
    ['chkf', 'Check field', 160, 'mono'],
    ['card', 'Cardinality', 120, 'sel', ['1:N', '1:CN', '1:1', '1:C', 'C:N', 'C:C']],
  ],
  st_comp: [
    ['comp', 'Component', 170, 'mono'],
    ['typing', 'Typing Method', 130, 'sel', ['Types', 'Type Ref To']],
    ['ctype', 'Component Type', 170, 'mono'],
    ['dtype', 'Data Type', 96, 'mono'],
    ['len', 'Length', 72, 'mono'],
    ['dec', 'Decimals', 80, 'mono'],
    ['text', 'Short Description', 0, 'text'],
  ],
  de_lbl: [
    ['kind', 'Label', 130, 'text'],
    ['len', 'Length', 80, 'mono'],
    ['text', 'Field Label', 0, 'text'],
  ],
  do_val: [
    ['low', 'Fix. Val.', 130, 'mono'],
    ['high', 'Upper Limit', 130, 'mono'],
    ['text', 'Short Description', 0, 'text'],
  ],
} satisfies Record<string, GridCol[]>;
export type FormId = keyof typeof CL_FORMS;
export type GridId = keyof typeof CL_GRIDS;

// ── Document model ──────────────────────────────────────────────────────────
export const CL_TAB_KEYS = [
  'attr',
  'imp',
  'exp',
  'chg',
  'tab',
  'exc',
  'src',
  'par',
  'code',
  'grid',
  'gen',
] as const;
export type Val = string | boolean;
export type Row = Record<string, Val>;
export type ClTab =
  | { k: (typeof CL_TAB_KEYS)[number]; view: 'code'; code: string; hdr?: 'fm' }
  | { k: (typeof CL_TAB_KEYS)[number]; view: 'form'; s: FormId; vals: Row }
  | { k: (typeof CL_TAB_KEYS)[number]; view: 'grid'; s: GridId; rows: Row[] }
  | { k: (typeof CL_TAB_KEYS)[number]; view: 'gen'; gen: 'class' | 'intf' | 'table' | 'stru' };
export type ClNode = {
  id: string;
  g: ClGroup;
  /** `cl_n_*` labels are translated; anything else is an ABAP name. */
  label: string;
  sub?: string;
  /** Added by the user (include, FM, method): can be renamed and deleted. */
  user?: boolean;
  tabs: ClTab[];
};
export type ClObject = { type: ClType; name: string; description: string; nodes: ClNode[] };

const MAX_CODE = 200_000;
const key = z.string().regex(/^[A-Za-z]\w{0,19}$/);
const val = z.union([z.string().max(2000), z.boolean()]);
const row = z.record(key, val).refine((r) => Object.keys(r).length <= 20);
const tabKey = z.enum(CL_TAB_KEYS);
export const ClTabSchema = z.discriminatedUnion('view', [
  z.strictObject({
    k: tabKey,
    view: z.literal('code'),
    code: z.string().max(MAX_CODE),
    hdr: z.literal('fm').optional(),
  }),
  z.strictObject({
    k: tabKey,
    view: z.literal('form'),
    s: z.enum(Object.keys(CL_FORMS) as [FormId, ...FormId[]]),
    vals: row,
  }),
  z.strictObject({
    k: tabKey,
    view: z.literal('grid'),
    s: z.enum(Object.keys(CL_GRIDS) as [GridId, ...GridId[]]),
    rows: z.array(row).max(1000),
  }),
  z.strictObject({ k: tabKey, view: z.literal('gen'), gen: z.enum(['class', 'intf', 'table', 'stru']) }),
]);
export const ClNodeSchema = z.strictObject({
  id: z.string().regex(/^[\w-]{1,40}$/),
  g: z.enum(CL_GROUP_IDS),
  label: z.string().max(80),
  sub: z.string().max(60).optional(),
  user: z.boolean().optional(),
  tabs: z.array(ClTabSchema).min(1).max(10),
});
export const ClNodesSchema = z
  .array(ClNodeSchema)
  .max(400)
  .refine((ns) => new Set(ns.map((n) => n.id)).size === ns.length, { message: 'duplicate node id' })
  .refine((ns) => ns.reduce((a, n) => a + n.tabs.length, 0) <= 1500, { message: 'too many tabs' });

// ── Templates (prototype TB / CN / CL_TPL / CL_NEW) ───────────────────────────
let seq = 0;
/** Node id for user-added nodes (unique within the object). */
export const clNodeId = () => `n${Date.now().toString(36)}${(seq++ % 1296).toString(36)}`;
const code = (k: ClTab['k'], c: string, hdr?: 'fm'): ClTab =>
  hdr ? { k, view: 'code', code: c, hdr } : { k, view: 'code', code: c };
const form = (k: ClTab['k'], s: FormId, vals: Row = {}): ClTab => ({ k, view: 'form', s, vals });
const grid = (k: ClTab['k'], s: GridId, rows: Row[] = []): ClTab => ({ k, view: 'grid', s, rows });
const gen = (g: 'class' | 'intf' | 'table' | 'stru'): ClTab => ({ k: 'gen', view: 'gen', gen: g });
const CN = (id: string, g: ClGroup, label: string, tabs: ClTab[], o: Partial<ClNode> = {}): ClNode => ({
  id,
  g,
  label,
  tabs,
  ...o,
});

export const CL_TPL = {
  include: (o: { name: string }, n: number) => {
    const nm = `${o.name}_F0${n}`.slice(0, 40);
    return CN(
      clNodeId(),
      'code',
      nm,
      [
        code(
          'code',
          `*&---------------------------------------------------------------------*\n*& Include ${nm}\n*&---------------------------------------------------------------------*\n`,
        ),
      ],
      { user: true, sub: 'INCLUDE' },
    );
  },
  finc: (o: { name: string }, n: number) =>
    CN(
      clNodeId(),
      'inc',
      `L${o.name}F0${n}`.slice(0, 40),
      [
        code(
          'code',
          `*----------------------------------------------------------------------*\n***INCLUDE L${o.name}F0${n}.\n*----------------------------------------------------------------------*\n`,
        ),
      ],
      { user: true, sub: 'INCLUDE' },
    ),
  fm: () =>
    CN(
      clNodeId(),
      'fm',
      'Z_NEW_FUNCTION',
      [
        form('attr', 'fm_attr', { text: '', proc: 'Normal Function Module', upd: '—' }),
        grid('imp', 'fm_imp'),
        grid('exp', 'fm_exp'),
        grid('chg', 'fm_imp'),
        grid('tab', 'fm_tab'),
        grid('exc', 'fm_exc'),
        code('src', '\n\n\n\nENDFUNCTION.', 'fm'),
      ],
      { user: true },
    ),
  meth: (o: { type: ClType }) =>
    CN(
      clNodeId(),
      'meth',
      'NEW_METHOD',
      [
        form('attr', 'cl_meth', { level: 'Instance', vis: 'Public' }),
        grid('par', 'cl_par'),
        grid('exc', 'cl_exc'),
        ...(o.type === 'CLAS' ? [code('code', '  METHOD new_method.\n\n  ENDMETHOD.')] : []),
      ],
      { user: true },
    ),
};
/** Which template the "+" of a tree group adds, per object type. */
export const CL_ADD: Partial<Record<ClType, Partial<Record<ClGroup, keyof typeof CL_TPL>>>> = {
  PROG: { code: 'include' },
  FUGR: { fm: 'fm', inc: 'finc' },
  CLAS: { meth: 'meth' },
  INTF: { meth: 'meth' },
};

export const CL_NEW_NAME: Record<Exclude<ClType, 'SNIP'>, string> = {
  PROG: 'ZNEW_PROGRAM',
  FUGR: 'ZNEW_FUNCTION_GROUP',
  CLAS: 'ZCL_NEW_CLASS',
  INTF: 'ZIF_NEW_INTERFACE',
  TABL: 'ZNEW_TABLE',
  STRU: 'ZNEW_STRUCTURE',
  DTEL: 'ZNEW_DATA_ELEMENT',
  DOMA: 'ZNEW_DOMAIN',
};

/** Prototype CL_NEW: the initial nodes of a new object. */
export function clNewNodes(type: ClType, n: string): ClNode[] {
  const lo = n.toLowerCase();
  switch (type) {
    case 'PROG':
      return [
        CN(
          'main',
          'code',
          n,
          [
            code(
              'code',
              `REPORT ${lo}.\n\nINCLUDE ${lo}_top.\nINCLUDE ${lo}_f01.\n\nSTART-OF-SELECTION.\n\n`,
            ),
          ],
          { sub: 'Main program' },
        ),
        CN('attr', 'cfg', 'cl_n_attr', [
          form('attr', 'prog_attr', {
            type: '1 Executable program',
            status: 'K Customer Production Program',
            unicode: true,
            fixedPt: true,
          }),
        ]),
        CN('sym', 'cfg', 'cl_n_sym', [grid('grid', 'prog_sym')]),
        CN('selt', 'cfg', 'cl_n_selt', [grid('grid', 'prog_sel')]),
        CN('var', 'cfg', 'cl_n_var', [grid('grid', 'prog_var')]),
      ];
    case 'FUGR':
      return [
        CN('top', 'inc', `L${n}TOP`, [code('code', `FUNCTION-POOL ${lo}.            "MESSAGE-ID ..\n`)], {
          sub: 'Global data',
        }),
        CN('attr', 'cfg', 'cl_n_attr', [form('attr', 'fugr_attr', { main: `SAPL${n}` })]),
      ];
    case 'CLAS':
      return [
        CN('props', 'cfg', 'cl_n_props', [
          form('attr', 'cl_props', { inst: 'Public', final: true, fixedPt: true }),
        ]),
        CN('intf', 'cfg', 'cl_n_intf', [grid('grid', 'cl_intf')]),
        CN('attrs', 'cfg', 'cl_n_attrs', [grid('grid', 'cl_attr')]),
        CN('loc', 'code', 'cl_n_loc', [
          code(
            'code',
            '*"* use this source file for any type of declarations (class\n*"* definitions, interfaces or type declarations) you need for\n*"* the implementation part of the class\n',
          ),
        ]),
        CN('test', 'code', 'cl_n_test', [
          code('code', '*"* use this source file for your ABAP unit test classes\n'),
        ]),
        CN('pool', 'gen', 'cl_n_pool', [gen('class')]),
      ];
    case 'INTF':
      return [
        CN('props', 'cfg', 'cl_n_props', [form('attr', 'in_props')]),
        CN('attrs', 'cfg', 'cl_n_attrs', [grid('grid', 'cl_attr')]),
        CN('pool', 'gen', 'cl_n_def', [gen('intf')]),
      ];
    case 'TABL':
      return [
        CN('attr', 'cfg', 'cl_n_delv', [
          form('attr', 'tb_attr', {
            deliv: 'A Application table (master and transaction data)',
            browse: 'Display/Maintenance Allowed',
            enh: 'Cannot Be Enhanced',
          }),
        ]),
        CN('fields', 'cfg', 'cl_n_fields', [
          grid('grid', 'tb_fields', [
            {
              field: 'MANDT',
              key: true,
              ini: true,
              dtel: 'MANDT',
              dtype: 'CLNT',
              len: '3',
              dec: '0',
              text: 'Client',
            },
          ]),
        ]),
        CN('tech', 'cfg', 'cl_n_tech', [
          form('attr', 'tb_tech', {
            dclass: 'APPL1 Transaction data, transparent tables',
            size: '0',
            buff: 'Buffering not allowed',
            btype: '—',
          }),
        ]),
        CN('idx', 'cfg', 'cl_n_idx', [grid('grid', 'tb_idx')]),
        CN('fk', 'cfg', 'cl_n_fk', [grid('grid', 'tb_fk')]),
        CN('tmg', 'cfg', 'cl_n_tmg', [
          form('attr', 'tb_tmg', { mtype: 'One step', rec: 'Standard recording routine' }),
        ]),
        CN('ddl', 'gen', 'cl_n_ddl', [gen('table')]),
      ];
    case 'STRU':
      return [
        CN('attr', 'cfg', 'cl_n_attr', [
          form('attr', 'st_attr', { enh: 'Can be enhanced (character-type or numeric)' }),
        ]),
        CN('comp', 'cfg', 'cl_n_comp', [grid('grid', 'st_comp')]),
        CN('ddl', 'gen', 'cl_n_ddl', [gen('stru')]),
      ];
    case 'DTEL':
      return [
        CN('attr', 'cfg', 'cl_n_attr', [form('attr', 'de_attr', { kind: 'Elementary Type · Domain' })]),
        CN('lbl', 'cfg', 'cl_n_lbl', [
          grid('grid', 'de_lbl', [
            { kind: 'Short', len: '10', text: '' },
            { kind: 'Medium', len: '20', text: '' },
            { kind: 'Long', len: '40', text: '' },
            { kind: 'Heading', len: '20', text: '' },
          ]),
        ]),
        CN('more', 'cfg', 'cl_n_more', [form('attr', 'de_more')]),
      ];
    case 'DOMA':
      return [
        CN('def', 'cfg', 'cl_n_def2', [
          form('attr', 'do_def', { dtype: 'CHAR', nchar: '1', dec: '0', olen: '1' }),
        ]),
        CN('vals', 'cfg', 'cl_n_vals', [grid('grid', 'do_val')]),
      ];
    case 'SNIP':
      return [CN('code', 'code', 'cl_n_snip', [code('code', '')])];
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
export const clCodeLines = (s: string | undefined) => (s || '').split('\n').length;
const tabOf = (o: ClObject, id: string, k: string) =>
  o.nodes.find((x) => x.id === id)?.tabs.find((t) => t.k === k);
const valsOf = (o: ClObject, id: string): Row => {
  const t = tabOf(o, id, 'attr');
  return t?.view === 'form' ? t.vals : {};
};
const rowsOf = (o: ClObject, id: string, k = 'grid'): Row[] => {
  const t = tabOf(o, id, k);
  return t?.view === 'grid' ? t.rows : [];
};
const nodeRows = (n: ClNode, k: string): Row[] => {
  const t = n.tabs.find((x) => x.k === k);
  return t?.view === 'grid' ? t.rows : [];
};
const nodeVals = (n: ClNode): Row => {
  const t = n.tabs[0];
  return t?.view === 'form' ? t.vals : {};
};
const s = (v: Val | undefined) => (typeof v === 'string' ? v : '');
const clTyp = (t: Val | undefined, a: string) =>
  (t === 'Like' || t === 'LIKE'
    ? 'LIKE '
    : t === 'Type Ref To' || t === 'TYPE REF TO'
      ? 'TYPE REF TO '
      : 'TYPE ') + (a || '?');

/** Package shown in the object header (first form with one). */
export const clPackage = (o: ClObject) => {
  for (const n of o.nodes)
    for (const t of n.tabs)
      if (t.view === 'form' && typeof t.vals.pkg === 'string' && t.vals.pkg) return t.vals.pkg;
  return '';
};

/** Short count shown next to each object in the list (prototype oMeta). */
export function clMeta(o: ClObject): string {
  const n = o.nodes;
  switch (o.type) {
    case 'PROG':
      return `${n.filter((y) => y.g === 'code').length - 1} inc`;
    case 'FUGR':
      return `${n.filter((y) => y.g === 'fm').length} FM`;
    case 'CLAS':
    case 'INTF':
      return `${n.filter((y) => y.g === 'meth').length} met`;
    case 'TABL':
      return `${rowsOf(o, 'fields').length} camp`;
    case 'STRU':
      return `${rowsOf(o, 'comp').length} comp`;
    case 'DOMA':
      return `${rowsOf(o, 'vals').length} val`;
    case 'SNIP': {
      const t = n[0]?.tabs[0];
      return `${clCodeLines(t?.view === 'code' ? t.code : '')} L`;
    }
    default:
      return '';
  }
}

/** Function module interface comment block (prototype clFmHdr). */
export function clFmHdr(n: ClNode): string {
  const L = [`FUNCTION ${n.label.toLowerCase()}.`, `*"${'-'.repeat(68)}`, '*"*"Local Interface:'];
  const sec = (title: string, rows: Row[], f: (r: Row) => string) => {
    if (!rows.length) return;
    L.push(`*"  ${title}`);
    rows.forEach((rw) => L.push(`*"${f(rw)}`));
  };
  const pv = (rw: Row) => (rw.byval ? `VALUE(${s(rw.param)})` : `REFERENCE(${s(rw.param)})`);
  sec(
    'IMPORTING',
    nodeRows(n, 'imp'),
    (rw) =>
      `     ${pv(rw)} ${s(rw.typing) || 'TYPE'}  ${s(rw.atype)}${rw.def ? ` DEFAULT ${s(rw.def)}` : ''}${rw.opt ? ' OPTIONAL' : ''}`,
  );
  sec('EXPORTING', nodeRows(n, 'exp'), (rw) => `     ${pv(rw)} ${s(rw.typing) || 'TYPE'}  ${s(rw.atype)}`);
  sec(
    'CHANGING',
    nodeRows(n, 'chg'),
    (rw) => `     ${pv(rw)} ${s(rw.typing) || 'TYPE'}  ${s(rw.atype)}${rw.opt ? ' OPTIONAL' : ''}`,
  );
  sec(
    'TABLES',
    nodeRows(n, 'tab'),
    (rw) => `      ${s(rw.param)} ${s(rw.typing) || 'STRUCTURE'}  ${s(rw.atype)}${rw.opt ? ' OPTIONAL' : ''}`,
  );
  sec(nodeVals(n).excCls ? 'RAISING' : 'EXCEPTIONS', nodeRows(n, 'exc'), (rw) => `      ${s(rw.exc)}`);
  L.push(`*"${'-'.repeat(68)}`);
  return L.join('\n');
}

const ENH_ANNO: Record<string, string> = {
  'Can Be Enhanced (Deep)': '#EXTENSIBLE_ANY',
  'Can be enhanced (character-type or numeric)': '#EXTENSIBLE_CHARACTER_NUMERIC',
  'Can be enhanced (character-type)': '#EXTENSIBLE_CHARACTER',
  'Cannot Be Enhanced': '#NOT_EXTENSIBLE',
  'Not classified': '#NOT_CLASSIFIED',
};

/** Code generated from the configuration (prototype clGen). */
export function clGen(o: ClObject, kind: 'class' | 'intf' | 'table' | 'stru'): string {
  const nm = o.name.toLowerCase();
  const meths = o.nodes.filter((n) => n.g === 'meth');
  if (kind === 'class' || kind === 'intf') {
    const P = valsOf(o, 'props');
    const attrs = rowsOf(o, 'attrs');
    const intfs = kind === 'class' ? rowsOf(o, 'intf') : [];
    const aLine = (a: Row) =>
      '    ' +
      (a.level === 'Constant' ? 'CONSTANTS ' : a.level === 'Static' ? 'CLASS-DATA ' : 'DATA ') +
      (s(a.name) || '?').toLowerCase() +
      ' ' +
      clTyp(a.typing, s(a.atype).toLowerCase()) +
      (a.init ? ` VALUE ${s(a.init)}` : '') +
      (a.ro && a.level !== 'Constant' ? ' READ-ONLY' : '') +
      ' .';
    const mLine = (n: ClNode) => {
      const A = nodeVals(n);
      const par = nodeRows(n, 'par');
      const ex = nodeRows(n, 'exc');
      const out = [
        '    ' +
          (A.level === 'Static' ? 'CLASS-METHODS ' : 'METHODS ') +
          n.label.toLowerCase() +
          (A.abs ? ' ABSTRACT' : '') +
          (A.fin ? ' FINAL' : '') +
          (A.redef ? ' REDEFINITION' : ''),
      ];
      for (const kd of ['Importing', 'Exporting', 'Changing', 'Returning']) {
        const ps = par.filter((x) => x.kind === kd);
        if (!ps.length || A.redef) continue;
        out.push(`      ${kd.toUpperCase()}`);
        ps.forEach((x) => {
          const pn = (s(x.name) || '?').toLowerCase();
          out.push(
            '        ' +
              (x.byval || kd === 'Returning' ? `VALUE(${pn})` : pn) +
              ' ' +
              clTyp(x.typing, s(x.atype).toLowerCase()) +
              (x.def ? ` DEFAULT ${s(x.def)}` : x.opt ? ' OPTIONAL' : ''),
          );
        });
      }
      if (ex.length && !A.redef) {
        out.push('      RAISING');
        ex.forEach((x) =>
          out.push(`        ${x.resum ? `RESUMABLE(${s(x.exc).toLowerCase()})` : s(x.exc).toLowerCase()}`),
        );
      }
      out[out.length - 1] += ' .';
      return out.join('\n');
    };
    if (kind === 'intf')
      return [
        `INTERFACE ${nm}`,
        '  PUBLIC .',
        '',
        ...attrs.map((a) => aLine(a).slice(2)),
        ...(attrs.length ? [''] : []),
        ...meths.map((n) =>
          mLine(n)
            .split('\n')
            .map((l) => l.slice(2))
            .join('\n'),
        ),
        'ENDINTERFACE.',
      ].join('\n');
    const inst = s(P.inst) || 'Public';
    const L = [
      `CLASS ${nm} DEFINITION`,
      '  PUBLIC' +
        (P.super ? `\n  INHERITING FROM ${s(P.super).toLowerCase()}` : '') +
        (P.final ? '\n  FINAL' : '') +
        (inst === 'Abstract' ? '\n  ABSTRACT' : '') +
        `\n  CREATE ${inst === 'Abstract' ? 'public' : inst.toLowerCase()}` +
        (P.shared ? '\n  SHARED MEMORY ENABLED' : '') +
        ' .',
      '',
    ];
    for (const v of VIS) {
      L.push(`  ${v.toUpperCase()} SECTION.`);
      if (v === 'Public')
        intfs.forEach((i) =>
          L.push(
            `    INTERFACES ${s(i.intf).toLowerCase()}${i.abs ? ' ALL METHODS ABSTRACT' : ''}${i.fin ? ' ALL METHODS FINAL' : ''} .`,
          ),
        );
      const as = attrs.filter((a) => (s(a.vis) || 'Public') === v);
      const ms = meths.filter((n) => (s(nodeVals(n).vis) || 'Public') === v);
      if (as.length) {
        L.push('');
        as.forEach((a) => L.push(aLine(a)));
      }
      if (ms.length) {
        L.push('');
        ms.forEach((n) => L.push(mLine(n)));
      }
      L.push('');
    }
    L.push('ENDCLASS.', '', '', `CLASS ${nm} IMPLEMENTATION.`, '');
    meths.forEach((n) => {
      const c = n.tabs.find((t) => t.k === 'code');
      if (c?.view === 'code' && !nodeVals(n).abs) L.push(c.code, '');
    });
    L.push('ENDCLASS.');
    return L.join('\n');
  }
  const A = valsOf(o, 'attr');
  const F = kind === 'table' ? rowsOf(o, 'fields') : rowsOf(o, 'comp');
  const L = [
    `@EndUserText.label : '${s(A.text) || o.description || ''}'`,
    `@AbapCatalog.enhancement.category : ${ENH_ANNO[s(A.enh)] ?? '#NOT_CLASSIFIED'}`,
  ];
  if (kind === 'table')
    L.push(
      '@AbapCatalog.tableCategory : #TRANSPARENT',
      `@AbapCatalog.deliveryClass : #${(s(A.deliv) || 'A')[0]}`,
      `@AbapCatalog.dataMaintenance : ${
        (
          {
            'Display/Maintenance Allowed': '#ALLOWED',
            'Display/Maintenance Not Allowed': '#NOT_ALLOWED',
          } as Record<string, string>
        )[s(A.browse)] ?? '#RESTRICTED'
      }`,
    );
  L.push(`define ${kind === 'table' ? 'table ' : 'structure '}${nm} {`);
  const w = Math.max(8, ...F.map((f) => (s(f.field) || s(f.comp)).length + (f.key ? 4 : 0)));
  F.forEach((f) => {
    const n = (f.key ? 'key ' : '') + (s(f.field) || s(f.comp) || '?').toLowerCase();
    const ty =
      (s(f.dtel) || s(f.ctype)).toLowerCase() ||
      `abap.${(s(f.dtype) || 'char').toLowerCase()}(${s(f.len) || '1'}${f.dec && f.dec !== '0' ? `,${s(f.dec)}` : ''})`;
    L.push(`  ${n.padEnd(w + 1)}: ${ty}${f.key || f.ini ? ' not null' : ''};`);
  });
  L.push('}');
  return L.join('\n');
}

/** Whole object as one .abap text (copy all / download; prototype clFullCode). */
export function clFullCode(o: ClObject): string {
  if (o.type === 'CLAS')
    return [
      clGen(o, 'class'),
      ...o.nodes
        .filter((n) => n.g === 'code')
        .map((n) => {
          const t = n.tabs[0];
          return `*&--- ${n.label}\n${t?.view === 'code' ? t.code : ''}`;
        }),
    ].join('\n\n');
  const out: string[] = [];
  o.nodes.forEach((n) =>
    n.tabs.forEach((tb) => {
      if (tb.view === 'code' && tb.code)
        out.push(
          (o.type === 'SNIP' ? '' : `*&--- ${n.label}${tb.k === 'code' ? '' : ` · ${tb.k}`}\n`) +
            (tb.hdr === 'fm' ? `${clFmHdr(n)}\n` : '') +
            tb.code,
        );
      if (tb.view === 'gen') out.push(clGen(o, tb.gen));
    }),
  );
  return out.join('\n\n');
}

/** Text the list search looks in (prototype match: name, description, tags, labels and code). */
export const clSearchText = (o: ClObject & { tags: string[] }) =>
  [
    o.name,
    o.description,
    o.tags.join(' '),
    ...o.nodes.map((n) => `${n.label} ${n.tabs.map((t) => (t.view === 'code' ? t.code : '')).join(' ')}`),
  ]
    .join(' ')
    .toLowerCase();

/** File name of the .abap download. */
export const clFileName = (name: string) =>
  `${name.replace(/[^\w.-]+/g, '_').toLowerCase() || 'object'}.abap`;

// ── ABAP highlighting (prototype clKw / clHl) ──────────────────────────────────
export const CL_KW = new Set(
  'REPORT PROGRAM INCLUDE DATA TYPES TYPE TABLE OF REF TO LIKE BEGIN END CONSTANTS VALUE PARAMETERS PARAMETER SELECT-OPTIONS SELECTION-SCREEN BLOCK FRAME TITLE FOR DEFAULT OBLIGATORY NO-DISPLAY START-OF-SELECTION END-OF-SELECTION INITIALIZATION AT FORM ENDFORM PERFORM USING CHANGING TABLES FUNCTION ENDFUNCTION FUNCTION-POOL IMPORTING EXPORTING RETURNING RAISING EXCEPTIONS CLASS ENDCLASS DEFINITION IMPLEMENTATION PUBLIC PROTECTED PRIVATE SECTION METHODS METHOD ENDMETHOD CLASS-METHODS CLASS-DATA INTERFACES INTERFACE ENDINTERFACE INHERITING FROM CREATE FINAL ABSTRACT REDEFINITION READ-ONLY OPTIONAL SELECT SINGLE INTO CORRESPONDING FIELDS WHERE AND OR NOT IN IS INITIAL BOUND ASSIGNED ORDER BY UP ROWS APPENDING GROUP HAVING INNER JOIN LEFT OUTER ON AS ALL ENTRIES IF ELSEIF ELSE ENDIF CASE WHEN OTHERS ENDCASE LOOP ENDLOOP ASSIGNING FIELD-SYMBOL FIELD-SYMBOLS DO ENDDO WHILE ENDWHILE CHECK EXIT CONTINUE RETURN APPEND INSERT MODIFY DELETE UPDATE CLEAR FREE REFRESH READ WITH KEY BINARY SEARCH SORT DESCENDING ASCENDING MOVE MOVE-CORRESPONDING WRITE MESSAGE TRY CATCH ENDTRY CLEANUP RAISE EXCEPTION NEW CAST CONV COND SWITCH THEN REDUCE INIT NEXT LINES CALL CONCATENATE SEPARATED SPLIT CONDENSE TRANSLATE UPPER LOWER REPLACE EQ NE LT GT LE GE CO CN CA NA CS NP CP BETWEEN COMMIT WORK ROLLBACK ME SUPER DESTINATION STARTING TASK MODULE ENDMODULE OUTPUT INPUT FRIENDS EVENTS HANDLER RECEIVING STANDARD SORTED HASHED UNIQUE NON-UNIQUE EMPTY LINE INDEX TRANSPORTING DISPLAY-LIKE GET TIME STAMP FIELD ZONE DISPLAY UNIT TESTING RISK LEVEL HARMLESS DURATION SHORT DEFINE KEY'.split(
    ' ',
  ),
);
export type HlTok = { t: string; c?: 'cm' | 'str' | 'num' | 'kw' | 'sy' | 'ref'; ref?: string };
const TOK = /("[^\n]*$)|('(?:[^']|'')*'|`[^`]*`|\|[^|]*\|)|(\b\d+\b)|([A-Za-z_/][A-Za-z0-9_\-/~]*)|([\s\S])/g;
/**
 * Tokens of one line for the highlighter. `refs` are the names that link to
 * another object or node (Ctrl/⌘ + click); "NAME-FIELD" links by its first part.
 */
export function clTokens(line: string, refs?: ReadonlySet<string>): HlTok[] {
  if (/^\*/.test(line)) return [{ t: line, c: 'cm' }];
  const out: HlTok[] = [];
  for (const m of line.matchAll(TOK)) {
    const [, c, str, n, w, o] = m;
    if (c) out.push({ t: c, c: 'cm' });
    else if (str) out.push({ t: str, c: 'str' });
    else if (n) out.push({ t: n, c: 'num' });
    else if (w) {
      const U = w.toUpperCase();
      const head = U.split('-')[0]!;
      const ref = refs?.has(U) ? U : refs?.has(head) ? head : null;
      if (ref) out.push({ t: w, c: 'ref', ref });
      else if (CL_KW.has(U)) out.push({ t: w, c: 'kw' });
      else if (/^sy-/i.test(w) || /^abap_(true|false)$/i.test(w)) out.push({ t: w, c: 'sy' });
      else out.push({ t: w });
    } else if (o) {
      const last = out[out.length - 1];
      if (last && !last.c) last.t += o;
      else out.push({ t: o });
    }
  }
  return out;
}

/** Names in `code` that match an index of known objects/nodes (prototype "Referências"). */
export function clFindRefs(code: string, index: ReadonlyMap<string, unknown>): string[] {
  const found: string[] = [];
  for (const m of code.matchAll(/"[^\n]*|'(?:[^']|'')*'|[A-Za-z_/][A-Za-z0-9_/]*/g)) {
    const U = m[0].toUpperCase();
    if (index.has(U) && !found.includes(U)) found.push(U);
  }
  return found;
}
