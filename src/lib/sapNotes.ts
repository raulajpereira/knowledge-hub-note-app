// Notas SAP (OSS notes): the fields kept for each note and their options,
// shared by the client (form, filters, matrix, CSV) and the server (validation).
//
// Essentials, as on me.sap.com: number and version, short text, application
// component, category and priority, release date, the software components /
// releases / support packages it is valid for, how it is implemented (SNOTE,
// manual activities, or only with a Support Package), prerequisite notes, and
// the team's own data: status per system, related transports, project, tags
// and notes.
import { z } from 'zod';

type Lbl = { pt: string; en: string };
const L = (pt: string, en: string): Lbl => ({ pt, en });

/** SAP note categories (me.sap.com "Category"). */
export const NOTE_CATEGORIES: Array<[string, Lbl]> = [
  ['fix', L('Correção de programa', 'Program error')],
  ['consult', L('Consultoria', 'Consulting')],
  ['legal', L('Atualização legal', 'Legal change')],
  ['perf', L('Performance', 'Performance')],
  ['security', L('Segurança (Security Note)', 'Security (Security Note)')],
  ['doc', L('Documentação / FAQ', 'Documentation / FAQ')],
  ['other', L('Outra', 'Other')],
];
/** SAP note priorities (me.sap.com "Priority"), the most urgent first. */
export const NOTE_PRIORITIES: Array<[string, Lbl, string]> = [
  ['hot', L('HotNews', 'HotNews'), 'oklch(0.68 0.2 25)'],
  ['high', L('Correção com prioridade alta', 'Correction with high priority'), 'oklch(0.76 0.16 50)'],
  ['medium', L('Correção com prioridade média', 'Correction with medium priority'), 'oklch(0.84 0.13 85)'],
  ['low', L('Correção com prioridade baixa', 'Correction with low priority'), 'oklch(0.8 0.08 200)'],
  [
    'info',
    L('Recomendações / informação adicional', 'Recommendations / additional info'),
    'oklch(0.8 0.03 250)',
  ],
];
export const NOTE_IMPL: Array<[string, Lbl]> = [
  ['snote', L('SNOTE (automática)', 'SNOTE (automatic)')],
  ['manual', L('Atividades manuais', 'Manual activities')],
  ['sp', L('Só com Support Package', 'Support Package only')],
];
/** Status of the note in one system: [key, label, colour]. */
export const NOTE_STATUS: Array<[string, Lbl, string]> = [
  ['new', L('Não avaliada', 'Not assessed'), 'rgba(255,255,255,.14)'],
  ['nrel', L('Não relevante', 'Not relevant'), 'oklch(0.6 0.02 250 / .55)'],
  ['todo', L('Por implementar', 'To implement'), 'oklch(0.8 0.14 75 / .6)'],
  ['done', L('Implementada', 'Implemented'), 'oklch(0.74 0.15 150 / .65)'],
  ['obs', L('Obsoleta / substituída', 'Obsolete / replaced'), 'oklch(0.66 0.13 300 / .55)'],
];
export const NOTE_STATUS_IDS = NOTE_STATUS.map((s) => s[0]) as [string, ...string[]];
export const statusColor = (k: string) => NOTE_STATUS.find((s) => s[0] === k)?.[2] ?? NOTE_STATUS[0]![2];
export const priorityColor = (k: string) =>
  NOTE_PRIORITIES.find((s) => s[0] === k)?.[2] ?? 'rgba(255,255,255,.3)';

/** Application components often met (autocomplete starts with these plus the ones used). */
export const COMMON_COMPONENTS = [
  'BC-UPG-NA',
  'BC-UPG-OCS',
  'BC-CTS-TMS',
  'BC-SEC',
  'BC-SEC-USR',
  'BC-ABA',
  'BC-BASIS',
  'BC-DB-HDB',
  'BC-FES-GUI',
  'BC-MID-RFC',
  'BC-SRV-COM',
  'CA-GTF',
  'FI-GL',
  'FI-AP',
  'FI-AR',
  'FI-AA',
  'FI-LOC',
  'CO-OM',
  'CO-PA',
  'SD-BIL',
  'SD-SLS',
  'MM-PUR',
  'MM-IM',
  'PP-SFC',
  'PY-PT',
  'PA-PA',
  'XX-SER-REL',
];
export const COMPONENT_RE = /^[A-Z0-9][A-Z0-9_-]{0,38}[A-Z0-9]?$/;

/** The note on SAP for Me (opens in a new tab). */
export const meSapUrl = (n: number) => `https://me.sap.com/notes/${n}`;

/** "2984567, 3099876\n0003127189" → unique note numbers in the order given (max 500). */
export function parseNoteNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\d{1,10}/g)) {
    const n = Number(m[0]);
    if (n >= 1 && n <= 99_999_999 && !out.includes(n)) out.push(n);
    if (out.length >= 500) break;
  }
  return out;
}

// ── Validation (server edge) ─────────────────────────────────────────────────
const line = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .regex(/^[^\r\n]*$/);
export const ValidityRow = z.strictObject({ swc: line(40), rel: line(40), sp: line(80) });
export const NoteNumber = z.number().int().min(1).max(99_999_999);
export const SapNoteFields = z.strictObject({
  number: NoteNumber,
  version: z.number().int().min(1).max(9999),
  title: line(300),
  component: z
    .string()
    .trim()
    .max(40)
    .transform((s) => s.toUpperCase())
    .pipe(z.union([z.literal(''), z.string().regex(COMPONENT_RE)])),
  category: z.enum(['', ...NOTE_CATEGORIES.map((c) => c[0])] as [string, ...string[]]),
  priority: z.enum(['', ...NOTE_PRIORITIES.map((c) => c[0])] as [string, ...string[]]),
  releasedOn: z.union([z.iso.date(), z.null()]),
  validity: z.array(ValidityRow).max(50),
  impl: z.array(z.enum(NOTE_IMPL.map((c) => c[0]) as [string, ...string[]])).max(3),
  prereqs: z.array(NoteNumber).max(50),
  projectId: z.uuid().nullable(),
  tags: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(40)
        .regex(/^[^\r\n,]*$/),
    )
    .max(30),
  // a rich document like a note's (checked by the service)
  body: z.unknown(),
  transportIds: z.array(z.uuid()).max(100),
});
export type SapNoteFieldsT = z.infer<typeof SapNoteFields>;
export const NoteSystemInput = z.strictObject({
  status: z.enum(NOTE_STATUS_IDS),
  implOn: z.union([z.iso.date(), z.null()]).optional(),
  transportId: z.uuid().nullable().optional(),
});

// ── CSV export ───────────────────────────────────────────────────────────────
const cell = (v: string | number) => {
  const s = String(v);
  // a leading = + - @ would be read as a formula by spreadsheets
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export function toCsv(rows: Array<Array<string | number>>): string {
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}
