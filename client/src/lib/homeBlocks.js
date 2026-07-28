// Single source of truth for every reorderable block on the Home dashboard.
// Blocks are split into two fixed columns (matching the page's two-column
// layout); the user can drag to reorder blocks within each column, and any
// new block always appears in the appropriate default column.
export const HOME_COLUMNS = {
  left: ['quickCapture', 'myTasks', 'issuesByStatus'],
  right: ['recentNotes', 'favorites', 'weeklySummary', 'sapNewsTeaser', 'vpsDiskUsage'],
};

function resolveColumn(saved, key) {
  const known = new Set(HOME_COLUMNS[key]);
  const ordered = [];
  const seen = new Set();
  if (Array.isArray(saved)) {
    for (const blockKey of saved) {
      if (known.has(blockKey) && !seen.has(blockKey)) {
        ordered.push(blockKey);
        seen.add(blockKey);
      }
    }
  }
  for (const blockKey of HOME_COLUMNS[key]) {
    if (!seen.has(blockKey)) ordered.push(blockKey);
  }
  return ordered;
}

// Merges the user's saved column layout with the master list above, so a
// block added to the app after the user last saved their layout still shows
// up (appended in its default column) instead of silently disappearing.
export function resolveHomeLayout(saved) {
  return {
    left: resolveColumn(saved?.left, 'left'),
    right: resolveColumn(saved?.right, 'right'),
  };
}
