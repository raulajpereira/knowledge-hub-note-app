// Canonical list of admin-gatable app features. Keys mirror
// server/src/lib/features.js and, where a feature has one, its
// client/src/lib/sidebarItems.js key — keep both files in sync by hand.
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

// null/undefined enabledFeatures means "every feature" (grandfathered
// accounts, and the response shape before /me has loaded). super_admin is
// always exempt regardless of the stored value.
export function hasFeature(user, key) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  if (!Array.isArray(user.enabledFeatures)) return true;
  return user.enabledFeatures.includes(key);
}
