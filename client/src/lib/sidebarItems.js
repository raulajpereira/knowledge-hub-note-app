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
  { key: 'projects', to: '/projects', icon: 'users', countKey: 'projects' },
  { key: 'issues', to: '/issues', icon: 'archive', countKey: 'issues' },
  { key: 'artifacts', to: '/artifacts', icon: 'code', countKey: 'artifacts' },
  { key: 'codeLibrary', to: '/code-library', icon: 'folder', countKey: 'codeLibrary' },
  { key: 'documentacao', to: '/documentacao', icon: 'doc' },
  { key: 'transactions', to: '/transactions', icon: 'terminal' },
  { key: 'clients', to: '/clients', icon: 'building' },
  { key: 'sapSystems', to: '/sap-systems', icon: 'server', countKey: 'sapSystems' },
  { key: 'transportRequests', to: '/transport-requests', icon: 'truck', countKey: 'transportRequests' },
  { key: 'contacts', to: '/contacts', icon: 'idCard', countKey: 'contacts' },
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
      if (entry?.type === 'spacer') {
        ordered.push({ key: entry.key, type: 'spacer' });
        continue;
      }
      if (entry?.type === 'group-start') {
        ordered.push({ key: entry.key, type: 'group-start', groupId: entry.groupId || entry.key, labelPt: entry.labelPt || '', labelEn: entry.labelEn || '', collapsed: !!entry.collapsed });
        continue;
      }
      if (entry?.type === 'group-end') {
        ordered.push({ key: entry.key, type: 'group-end', groupId: entry.groupId });
        continue;
      }
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

// Groups have no built-in translation (they're entirely user-created), so
// they fall back to a generic "Group" label instead of a nav.* key.
export function sidebarGroupLabel(group, lang, t) {
  const custom = lang === 'pt' ? group.labelPt : group.labelEn;
  return custom?.trim() || t('sidebarSettings.groupDefaultLabel');
}
