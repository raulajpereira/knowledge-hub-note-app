import { z } from 'zod';

// user_prefs.data (DATA_MODEL.md: "tema, fundo, blur, accent, escala, idioma,
// nav layout, larguras, dashboard…"). Shared by the API (validation) and the
// client (defaults). Unknown keys are refused so the JSON can't become a
// free-for-all store; `ui.*` holds component-level state (table columns,
// drawer widths) written by usePersistentState.

export const COL_LIMITS = {
  side: [180, 480],
  list: [240, 640],
  insp: [200, 520],
} as const;
export const COL_DEFAULTS = { side: 236, list: 340, insp: 270 } as const;
export type ColKey = keyof typeof COL_LIMITS;

const col = (k: ColKey) => z.number().int().min(COL_LIMITS[k][0]).max(COL_LIMITS[k][1]);

export const NavEntry = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('item'),
    id: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
    nested: z.boolean().optional(),
    hidden: z.boolean().optional(),
    label: z.string().max(60).optional(),
  }),
  z.object({ type: z.literal('group'), name: z.string().max(60), open: z.boolean() }),
  z.object({ type: z.literal('spacer') }),
]);
export type NavEntry = z.infer<typeof NavEntry>;

export const NewsSource = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(60),
  url: z
    .string()
    .max(500)
    .regex(/^https?:\/\//i),
  on: z.boolean(),
});
export type NewsSource = z.infer<typeof NewsSource>;

export const PREF_SCHEMAS = {
  cols: z.object({ side: col('side'), list: col('list'), insp: col('insp') }).partial(),
  nav: z.array(NavEntry).max(120),
  newsSources: z.array(NewsSource).max(30),
} satisfies Record<string, z.ZodTypeAny>;

export type KnownPrefs = { [K in keyof typeof PREF_SCHEMAS]?: z.infer<(typeof PREF_SCHEMAS)[K]> };
export type Prefs = KnownPrefs & Record<string, unknown>;

export const UI_KEY = /^ui\.[A-Za-z0-9_.-]{1,60}$/;
export const MAX_UI_VALUE_BYTES = 8 * 1024;
export const MAX_PREFS_BYTES = 64 * 1024;

/** Validates a merge-patch (null deletes a key). Throws ZodError / Error('pref_*'). */
export function parsePrefsPatch(input: unknown): Record<string, unknown> {
  const raw = z.record(z.string().max(80), z.unknown()).parse(input);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null) {
      out[key] = null;
      continue;
    }
    if (key in PREF_SCHEMAS) {
      out[key] = PREF_SCHEMAS[key as keyof typeof PREF_SCHEMAS].parse(value);
    } else if (UI_KEY.test(key)) {
      if (JSON.stringify(value).length > MAX_UI_VALUE_BYTES) throw new Error('pref_too_large');
      out[key] = value;
    } else {
      throw new Error('pref_unknown_key');
    }
  }
  return out;
}

/** Applies a validated patch: top-level merge, null removes. */
export function mergePrefs(current: Prefs, patch: Record<string, unknown>): Prefs {
  const next: Prefs = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  return next;
}
