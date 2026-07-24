// Single source of truth for every reorderable/hideable sidebar entry.
// Trash and Settings are intentionally NOT in this list — they always stay
// fixed at the bottom of the sidebar, unaffected by the user's layout. SAP
// News also isn't here — it lives as a fixed icon button next to the header
// search bar instead of a sidebar entry.
export const SIDEBAR_ITEMS = [
  { key: 'home', to: '/', icon: 'home', end: true },
  { key: 'notes', to: '/notes', icon: 'doc', countKey: 'notes' },
  { key: 'voice', to: '/voice', icon: 'mic', countKey: 'voice' },
  { key: 'tasks', to: '/tasks', icon: 'check', countKey: 'tasks' },
  { key: 'tags', to: '/tags', icon: 'tag', countKey: 'tags' },
  { key: 'passwords', to: '/passwords', icon: 'lock' },
  { key: 'issues', to: '/issues', icon: 'archive', countKey: 'issues' },
  { key: 'artifacts', to: '/artifacts', icon: 'code', countKey: 'artifacts' },
  { key: 'codeLibrary', to: '/code-library', icon: 'folder', countKey: 'codeLibrary' },
  { key: 'calendar', to: '/calendar', icon: 'calendar' },
  { key: 'graph', to: '/graph', icon: 'graph' },
];

// Merges the user's saved order/visibility/custom-labels with the master
// list above, so an item added to the app after the user last saved their
// layout still shows up (appended at the end, visible) instead of silently
// disappearing.
export function resolveSidebarLayout(saved) {
  const byKey = new Map(SIDEBAR_ITEMS.map((item) => [item.key, item]));
  const seen = new Set();
  const ordered = [];

  if (Array.isArray(saved)) {
    for (const entry of saved) {
      const item = byKey.get(entry?.key);
      if (item && !seen.has(item.key)) {
        ordered.push({ ...item, hidden: !!entry.hidden, labelPt: entry.labelPt || '', labelEn: entry.labelEn || '' });
        seen.add(item.key);
      }
    }
  }
  for (const item of SIDEBAR_ITEMS) {
    if (!seen.has(item.key)) ordered.push({ ...item, hidden: false, labelPt: '', labelEn: '' });
  }
  return ordered;
}

// A resolved item's display label: the user's custom name for the current
// language if they set one, otherwise the app's default translation.
export function sidebarItemLabel(item, lang, t) {
  const custom = lang === 'pt' ? item.labelPt : item.labelEn;
  return custom?.trim() || t(`nav.${item.key}`);
}
