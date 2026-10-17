import { hrefOf, idFromSegment, isKnownItem, moduleOf } from '@/components/shell/nav';

// Definições › Aparência › Página inicial: where /app opens (after login or
// when the address is typed). prefs.startPage is 'home' (Início, default),
// 'last' (the last module page used, prefs['ui.lastPage']) or a nav item id.
// A page the plan no longer has falls back to Início.

/** The nav item id of an app path ('/app/mg-overview' → 'mg_overview'), if it is one. */
export function itemOfPath(path: unknown): string | null {
  if (typeof path !== 'string') return null;
  const m = /^\/app\/([a-z][a-z0-9-]{1,31})\/?$/.exec(path);
  return m ? idFromSegment(m[1]!) : null;
}

/** Whether a nav item can be a start page for these modules. */
export function canStartAt(id: string, modules: ReadonlySet<string>): boolean {
  if (id === 'home' || !isKnownItem(id)) return false;
  const m = moduleOf(id);
  return m === null || modules.has(m);
}

/** Where /app should go instead of Início, or null to stay. */
export function startPath(pref: unknown, lastPage: unknown, modules: ReadonlySet<string>): string | null {
  const id = pref === 'last' ? itemOfPath(lastPage) : typeof pref === 'string' ? pref : null;
  return id && canStartAt(id, modules) ? hrefOf(id) : null;
}
