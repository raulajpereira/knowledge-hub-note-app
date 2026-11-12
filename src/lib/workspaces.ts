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

/**
 * Modules separated per workspace (fases 2b–4): every module of the plan. The others still show
 * everything the person has, so (never mixing workspaces) they are offered
 * only in the first workspace until their phase (docs/AMBIENTES.md).
 */
export const WS_SEPARATED = [
  // fase 2b
  'calendar',
  'notes',
  'voice',
  'tasks',
  'meetings',
  'files',
  // fase 3a
  'emails',
  'artifacts',
  'devlib',
  'api',
  'whiteboard',
  'issues',
  'news',
  // fase 3b (SAP: the first workspace is the team's, the others private)
  'codelib',
  'systems',
  'tcodes',
  'transports',
  'sapnotes',
  'tickets',
  'fn_proc',
  'fn_test',
  'fn_mig',
  'fn_cut',
  // fase 3c
  'mg_overview',
  'mg_teams',
  'mg_people',
  'mg_skills',
  'mg_projects',
  'mg_dash',
  'mg_alloc',
  'mg_staff',
  'mg_time',
  'mg_clients',
  // fase 4: one vault per workspace
  'passwords',
] as const;
/** Features with no items of their own: available in every workspace. */
export const WS_EVERYWHERE = [
  'ai',
  'share',
  'brand',
  'bgphoto',
  'typeface',
  'glass',
  'accent',
  'sidebar',
  // features added later (migration 0058): they follow the plan, not the workspace
  'push',
  'mailnotify',
  'inbound',
  'import',
  'xlsx',
  'publiclinks',
  'templates',
  'views',
  'history',
  'mg_profit',
  'timelog',
  'mg_budget',
] as const;

/** The modules a workspace shows: the plan's, the ones chosen for it, and (outside the first one) only the separated ones. */
export function wsModules(entitled: readonly string[], w: Pick<Workspace, 'modules'>, isFirst: boolean) {
  const ok = new Set<string>([...WS_SEPARATED, ...WS_EVERYWHERE]);
  return entitled.filter(
    (m) =>
      (isFirst || ok.has(m)) &&
      ((WS_EVERYWHERE as readonly string[]).includes(m) || !w.modules || w.modules.includes(m)),
  );
}

/** What can be moved between workspaces (fases 2b, 3a). */
export const WS_MOVABLE = [
  'note',
  'task',
  'voice',
  'meeting',
  'file',
  'issue',
  'artifact',
  'email',
  'snippet',
  'whiteboard',
  'folder',
] as const;
export type WsMovable = (typeof WS_MOVABLE)[number];
