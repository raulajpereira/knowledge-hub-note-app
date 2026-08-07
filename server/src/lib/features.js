// Canonical list of admin-gatable app features. Keys mirror
// client/src/lib/sidebarItems.js where a feature has a sidebar entry, plus
// keys for the features that live outside the sidebar (header buttons, the
// AI Agents widget, the Server Info card in Settings). Client and server
// must stay in sync manually — see client/src/lib/features.js.
export const FEATURE_KEYS = [
  'notes',
  'voice',
  'tasks',
  'calendar',
  'transactions',
  'passwords',
  'documentacao',
  'issues',
  'artifacts',
  'codeLibrary',
  'apiPlayground',
  'clients',
  'projects',
  'contacts',
  'sapSystems',
  'transportRequests',
  'emails',
  'graph',
  'whiteboard',
  'sapNews',
  'agents',
  'screenCapture',
  'serverInfo',
];

const FEATURE_KEY_SET = new Set(FEATURE_KEYS);

export function normalizeFeatureList(list) {
  if (!Array.isArray(list)) return null;
  return list.filter((key) => FEATURE_KEY_SET.has(key));
}
