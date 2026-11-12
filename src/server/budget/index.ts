import 'server-only';
import { and, desc, eq, isNotNull, isNull, like, sql } from 'drizzle-orm';
import { z } from 'zod';
import { budgets, budgetSettings } from '@/db/schema';
import { ApiError } from '@/server/errors';
import type { AuthContext } from '@/server/auth/session';
import { asUser, type Tx } from '@/server/content/tenant';
import {
  BLOCKS,
  buildLines,
  CELL_RE,
  COL_RE,
  defaultMatrix,
  MAP_COLS,
  PROFILE_KEYS,
  SCENARIOS,
  type Line,
  type Mapping,
  type Matrix,
} from '@/lib/budget';
import { fillTemplate, guessMapping, MAX_TEMPLATE, previewTemplate, TemplateError } from './xlsx';

// "Orçamentos": the person's matrix, Excel model and budgets (RLS: their own).

const txt = (n: number) => z.string().trim().max(n);
const num = z.number().finite().min(0).max(1_000_000_000);
const days = z.number().finite().min(0).max(100_000).nullable();

const CellZ = z.object({ gf: days, bf: days, n: z.number().int().min(1).max(100) });
const ProfileZ = z.object({
  key: z.enum(PROFILE_KEYS),
  label: txt(200).min(1),
  type: txt(60),
  block: z.enum(BLOCKS),
  rate: num,
  mode: z.enum(['module', 'sum', 'perModule']),
});
const ModuleZ = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .regex(/^[A-Za-z0-9_-]+$/),
  name: txt(120).min(1),
  group: txt(80),
  label: txt(200),
  rate: num,
  active: z.boolean(),
  days: z.partialRecord(z.enum(PROFILE_KEYS), CellZ),
});
export const MatrixZ = z
  .object({ profiles: z.array(ProfileZ).length(PROFILE_KEYS.length), modules: z.array(ModuleZ).max(100) })
  .refine((m) => new Set(m.profiles.map((p) => p.key)).size === PROFILE_KEYS.length, 'profiles')
  .refine((m) => new Set(m.modules.map((x) => x.code.toUpperCase())).size === m.modules.length, 'codes');

const row = z.number().int().min(1).max(1_048_576);
export const MappingZ = z.object({
  sheet: txt(100).min(1),
  fields: z.object({
    client: z.string().regex(CELL_RE).optional(),
    ref: z.string().regex(CELL_RE).optional(),
  }),
  cols: z.partialRecord(z.enum(MAP_COLS), z.string().regex(COL_RE)),
  blocks: z.partialRecord(
    z.enum(BLOCKS),
    z.object({ from: row, to: row }).refine((b) => b.to >= b.from && b.to - b.from < 500, 'rows'),
  ),
});

export const LineZ = z.object({
  block: z.enum(BLOCKS),
  desc: txt(200),
  type: txt(60),
  days: num,
  count: z.number().int().min(1).max(100),
  rate: num,
  origin: z.array(z.string().max(12)).max(100),
});

export const BudgetCreate = z.object({
  client: txt(200).min(1),
  scenario: z.enum(SCENARIOS),
  modules: z.array(z.string().max(12)).min(1).max(100),
});
export const BudgetPatch = z.object({
  client: txt(200).min(1).optional(),
  scenario: z.enum(SCENARIOS).optional(),
  /** "Mudar para Brownfield": the lines are made again from the matrix */
  rebuild: z.boolean().optional(),
  lines: z.array(LineZ).max(300).optional(),
});

export type Settings = {
  matrix: Matrix;
  mapping: Mapping | null;
  template: { name: string; size: number; at: string } | null;
};
export type Budget = {
  id: string;
  ref: string;
  client: string;
  scenario: 'gf' | 'bf';
  modules: string[];
  lines: Line[];
  createdAt: string;
  updatedAt: string;
};

async function settingsRow(tx: Tx, auth: AuthContext) {
  const [r] = await tx.select().from(budgetSettings).where(eq(budgetSettings.ownerId, auth.user.id));
  return r ?? null;
}

const settingsOut = (r: Awaited<ReturnType<typeof settingsRow>>): Settings => ({
  matrix: r?.matrix ?? defaultMatrix(),
  mapping: r?.mapping ?? null,
  template:
    r?.templateAt && r.templateName
      ? { name: r.templateName, size: r.templateSize, at: r.templateAt.toISOString() }
      : null,
});

export function getSettings(auth: AuthContext): Promise<Settings> {
  return asUser(auth, async (tx) => settingsOut(await settingsRow(tx, auth)));
}

async function upsert(tx: Tx, auth: AuthContext, set: Partial<typeof budgetSettings.$inferInsert>) {
  const cur = await settingsRow(tx, auth);
  if (cur) {
    await tx
      .update(budgetSettings)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(budgetSettings.ownerId, auth.user.id));
  } else {
    await tx.insert(budgetSettings).values({
      tenantId: auth.tenant.id,
      ownerId: auth.user.id,
      matrix: defaultMatrix(),
      ...set,
    });
  }
}

export function saveMatrix(auth: AuthContext, matrix: z.infer<typeof MatrixZ>): Promise<Settings> {
  return asUser(auth, async (tx) => {
    await upsert(tx, auth, { matrix: matrix as Matrix });
    return settingsOut(await settingsRow(tx, auth));
  });
}

export function saveMapping(auth: AuthContext, mapping: z.infer<typeof MappingZ>): Promise<Settings> {
  return asUser(auth, async (tx) => {
    const cur = await settingsRow(tx, auth);
    if (!cur?.template) throw new ApiError(409, 'no_template');
    const sheets = previewTemplate(new Uint8Array(cur.template)).sheets;
    if (!sheets.includes(mapping.sheet)) throw new ApiError(400, 'invalid_input');
    // the blocks may not overlap
    const bs = Object.values(mapping.blocks).sort((a, z) => a!.from - z!.from);
    for (let i = 1; i < bs.length; i++)
      if (bs[i]!.from <= bs[i - 1]!.to) throw new ApiError(400, 'blocks_overlap');
    await upsert(tx, auth, { mapping: mapping as Mapping });
    return settingsOut(await settingsRow(tx, auth));
  });
}

const templateError = (e: unknown): never => {
  if (e instanceof TemplateError)
    throw new ApiError(e.message === 'file_too_large' ? 413 : 400, `template_${e.message}`);
  throw e;
};

/** A new Excel model: kept as is; the mapping is guessed from its labels (to confirm on screen). */
export function setTemplate(auth: AuthContext, name: string, data: Uint8Array): Promise<Settings> {
  if (data.byteLength > MAX_TEMPLATE)
    throw new ApiError(413, 'file_too_large', undefined, { max: MAX_TEMPLATE });
  let mapping: Mapping;
  try {
    mapping = guessMapping(previewTemplate(data));
  } catch (e) {
    return templateError(e);
  }
  return asUser(auth, async (tx) => {
    await upsert(tx, auth, {
      template: Buffer.from(data),
      templateName: name.slice(0, 200),
      templateSize: data.byteLength,
      templateAt: new Date(),
      mapping,
    });
    return settingsOut(await settingsRow(tx, auth));
  });
}

export function templatePreview(auth: AuthContext, sheet?: string) {
  return asUser(auth, async (tx) => {
    const cur = await settingsRow(tx, auth);
    if (!cur?.template) throw new ApiError(404, 'no_template');
    try {
      return previewTemplate(new Uint8Array(cur.template), sheet);
    } catch (e) {
      return templateError(e);
    }
  });
}

// ---------------------------------------------------------------- budgets

type BRow = typeof budgets.$inferSelect;
const out = (r: BRow): Budget => ({
  id: r.id,
  ref: r.ref,
  client: r.client,
  scenario: r.scenario,
  modules: r.modules,
  lines: r.lines,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export function listBudgets(auth: AuthContext): Promise<Budget[]> {
  return asUser(auth, async (tx) =>
    (
      await tx
        .select()
        .from(budgets)
        .where(isNull(budgets.deletedAt))
        .orderBy(desc(budgets.createdAt))
        .limit(1000)
    ).map(out),
  );
}

async function one(tx: Tx, id: string, deleted = false) {
  const [r] = await tx
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, id), deleted ? isNotNull(budgets.deletedAt) : isNull(budgets.deletedAt)));
  if (!r) throw new ApiError(404, 'not_found');
  return r;
}

export function getBudget(auth: AuthContext, id: string) {
  return asUser(auth, async (tx) => out(await one(tx, id)));
}

/** ORC-<year>-<n>: the person's next number of the year (deleted ones count, refs are never reused). */
async function nextRef(tx: Tx) {
  const y = new Date().getFullYear();
  const [r] = await tx
    .select({ n: sql<number>`coalesce(max(substring(${budgets.ref} from '\\d+$')::int), 0)` })
    .from(budgets)
    .where(like(budgets.ref, `ORC-${y}-%`));
  return `ORC-${y}-${String((r?.n ?? 0) + 1).padStart(3, '0')}`;
}

export function createBudget(auth: AuthContext, input: z.infer<typeof BudgetCreate>): Promise<Budget> {
  return asUser(auth, async (tx) => {
    const { matrix } = settingsOut(await settingsRow(tx, auth));
    const known = new Set(matrix.modules.map((m) => m.code));
    const mods = [...new Set(input.modules)].filter((c) => known.has(c));
    if (!mods.length) throw new ApiError(400, 'invalid_input');
    const [r] = await tx
      .insert(budgets)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        ref: await nextRef(tx),
        client: input.client,
        scenario: input.scenario,
        modules: mods,
        lines: buildLines(matrix, mods, input.scenario),
      })
      .returning();
    return out(r!);
  });
}

export function updateBudget(
  auth: AuthContext,
  id: string,
  input: z.infer<typeof BudgetPatch>,
): Promise<Budget> {
  return asUser(auth, async (tx) => {
    const cur = await one(tx, id);
    const scenario = input.scenario ?? cur.scenario;
    let lines = input.lines ?? cur.lines;
    if (input.rebuild) {
      const { matrix } = settingsOut(await settingsRow(tx, auth));
      lines = buildLines(matrix, cur.modules, scenario);
    }
    const [r] = await tx
      .update(budgets)
      .set({ client: input.client ?? cur.client, scenario, lines, updatedAt: new Date() })
      .where(eq(budgets.id, id))
      .returning();
    return out(r!);
  });
}

export function duplicateBudget(auth: AuthContext, id: string): Promise<Budget> {
  return asUser(auth, async (tx) => {
    const cur = await one(tx, id);
    const [r] = await tx
      .insert(budgets)
      .values({
        tenantId: auth.tenant.id,
        ownerId: auth.user.id,
        ref: await nextRef(tx),
        client: cur.client,
        scenario: cur.scenario,
        modules: cur.modules,
        lines: cur.lines,
      })
      .returning();
    return out(r!);
  });
}

/** Deleted with an undo (kept, marked): nothing is lost. */
export function deleteBudget(auth: AuthContext, id: string, restore = false) {
  return asUser(auth, async (tx) => {
    await one(tx, id, restore);
    await tx
      .update(budgets)
      .set({ deletedAt: restore ? null : new Date() })
      .where(eq(budgets.id, id));
  });
}

/** The budget in the person's Excel model. */
export function budgetXlsx(auth: AuthContext, id: string) {
  return asUser(auth, async (tx) => {
    const b = await one(tx, id);
    const s = await settingsRow(tx, auth);
    if (!s?.template || !s.mapping) throw new ApiError(409, 'no_template');
    try {
      const { file, report } = fillTemplate(new Uint8Array(s.template), s.mapping, {
        client: b.client,
        ref: b.ref,
        lines: b.lines,
      });
      const base = `Orcamento_${b.client}_${b.ref}`
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^\w.-]+/g, '_')
        .slice(0, 120);
      return { file, report, name: `${base}.xlsx` };
    } catch (e) {
      return templateError(e);
    }
  });
}
