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

// Definições › Aparência (prototype AMB, FONTS, accent swatches, ranges).
export const AMBIENT_NAMES = ['Areia', 'Grafite', 'Crepúsculo'] as const;
export const FONTS = [
  'Geist',
  'Plus Jakarta Sans',
  'DM Sans',
  'Manrope',
  'IBM Plex Sans',
  'Space Grotesk',
  'Outfit',
  'Nunito Sans',
] as const;
export const DEFAULT_ACCENT = 'oklch(0.76 0.17 245)';
export const ACCENT_SWATCHES = [
  'oklch(0.76 0.17 245)',
  'oklch(0.78 0.15 200)',
  'oklch(0.8 0.16 150)',
  'oklch(0.86 0.15 90)',
  'oklch(0.78 0.16 55)',
  'oklch(0.7 0.19 25)',
  'oklch(0.74 0.17 340)',
  'oklch(0.72 0.16 300)',
] as const;
export const BG_DEFAULTS = { mode: 'Areia' as const, blur: 40, dim: 35 };

const pct = z.number().int().min(0).max(80);
// Values end up in CSS, so only exact swatches or a #rrggbb colour are accepted.
const Accent = z.union([z.enum(ACCENT_SWATCHES), z.string().regex(/^#[0-9a-fA-F]{6}$/)]);

// Início (prototype HOME_DEF / HOME_TYPES / QUICK_DEF / SC_DEF / HOME_SPAN).
export const HOME_TYPES = [
  'today',
  'capture',
  'shortcuts',
  'tcodes',
  'tasks',
  'deadlines',
  'notes',
  'favs',
  'focus',
  'transports',
  'issues',
  'systems',
  'qnotes',
  'emails',
] as const;
export type HomeType = (typeof HOME_TYPES)[number];
export const HOME_SIZES = ['S', 'M', 'L', 'XL'] as const;
export const HOME_SPAN = { S: 4, M: 6, L: 8, XL: 12 } as const;

const Widget = z.object({
  id: z.string().regex(/^[\w-]{1,40}$/),
  type: z.enum(HOME_TYPES),
  size: z.enum(HOME_SIZES),
  fr: z.number().min(0).max(1).optional(),
});
const Shortcut = z.object({
  id: z.string().regex(/^[\w-]{1,40}$/),
  title: z.string().max(80),
  url: z
    .string()
    .max(500)
    .regex(/^https?:\/\/[^\s]+$/i),
});
export const HomePrefs = z.object({
  widgets: z.array(Widget).max(40),
  showWx: z.boolean().optional(),
  quick: z
    .array(z.string().regex(/^[a-z][a-z0-9_]{1,31}$/))
    .max(24)
    .optional(),
  shortcuts: z.array(Shortcut).max(40).optional(),
  pomoDone: z.number().int().min(0).max(500).optional(),
  pomoDay: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type HomePrefs = z.infer<typeof HomePrefs>;
export const WeatherLoc = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  city: z.string().max(80),
  manual: z.boolean().optional(),
});
export type WeatherLoc = z.infer<typeof WeatherLoc>;

export const PREF_SCHEMAS = {
  cols: z.object({ side: col('side'), list: col('list'), insp: col('insp') }).partial(),
  nav: z.array(NavEntry).max(120),
  newsSources: z.array(NewsSource).max(30),
  bg: z.object({ mode: z.enum([...AMBIENT_NAMES, 'photo']), blur: pct, dim: pct }),
  font: z.enum(FONTS),
  fontScale: z.number().min(0.85).max(1.25),
  uiScale: z.number().min(0.8).max(1.2),
  glassBlur: z.number().int().min(0).max(80),
  accent: Accent,
  home: HomePrefs,
  weatherLoc: WeatherLoc,
} satisfies Record<string, z.ZodTypeAny>;

/**
 * Customisation add-ons (module group "Personalização"): a key may only be
 * set when the tenant has the module, and is ignored when it doesn't (e.g.
 * after a downgrade). `bg` is special-cased: only the photo mode needs it.
 */
export const PREF_MODULE: Partial<Record<keyof typeof PREF_SCHEMAS, string>> = {
  nav: 'sidebar',
  font: 'typeface',
  glassBlur: 'glass',
  accent: 'accent',
};

export function prefAllowed(key: string, value: unknown, modules: ReadonlySet<string>): boolean {
  if (key === 'bg') return (value as { mode?: string } | null)?.mode !== 'photo' || modules.has('bgphoto');
  const m = PREF_MODULE[key as keyof typeof PREF_SCHEMAS];
  return !m || modules.has(m);
}

/** Prefs as they apply right now: entries the plan no longer covers are dropped. */
export function effectivePrefs(prefs: Prefs, modules: ReadonlySet<string>): Prefs {
  const out: Prefs = {};
  for (const [k, v] of Object.entries(prefs)) {
    if (prefAllowed(k, v, modules)) out[k] = v;
    else if (k === 'bg') out[k] = { ...BG_DEFAULTS, ...(v as object), mode: BG_DEFAULTS.mode };
  }
  return out;
}

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
