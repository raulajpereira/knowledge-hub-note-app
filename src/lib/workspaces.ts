// Ambientes (docs/AMBIENTES.md): shared between server and client.

export type Workspace = {
  id: string;
  name: string;
  /** one of WS_COLORS ('' = the default blue) */
  color: string;
  /** one of WS_ICONS ('' = none) */
  icon: string;
  sort: number;
  /** modules shown in this workspace (null = all of the plan) */
  modules: string[] | null;
};

/** Prefs kept per workspace (the look); the others are the person's, everywhere. */
export const WS_PREF_KEYS = ['bg', 'theme', 'accent', 'nav', 'home', 'startPage'] as const;

export const WS_COLORS = [
  'oklch(0.75 0.14 250)',
  'oklch(0.8 0.15 150)',
  'oklch(0.82 0.13 70)',
  'oklch(0.72 0.16 25)',
  'oklch(0.75 0.14 300)',
  'oklch(0.8 0.12 200)',
  'oklch(0.78 0.12 340)',
  'oklch(0.85 0.03 260)',
] as const;
export const WS_ICONS = ['💼', '🏡', '🎓', '✈️', '💪', '📚', '🧪', '🏢', '🚀', '⭐', '🎯', '🧩'] as const;

export const wsColor = (c: string) => c === '' || (WS_COLORS as readonly string[]).includes(c);
export const wsIcon = (i: string) => i === '' || (WS_ICONS as readonly string[]).includes(i);
/** the colour a workspace is shown with */
export const wsTint = (w: Pick<Workspace, 'color'>) => w.color || WS_COLORS[0];
