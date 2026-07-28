// Single source of truth for every reorderable block on the Home dashboard.
// Blocks live in one of two columns; unlike the sidebar reorder (a single
// list), a block here can be dragged into either column and to any position
// within it, so the user controls both the order and how many blocks sit in
// each column (e.g. 3 left / 4 right instead of a fixed split).
export const HOME_BLOCKS = ['quickCapture', 'myTasks', 'issuesByStatus', 'recentNotes', 'favorites', 'resurfacing', 'weeklySummary', 'sapNewsTeaser', 'vpsDiskUsage'];

// Only used to place a block the first time it's ever seen (brand new
// account, or a block added to the app after the user last saved a layout).
const DEFAULT_COLUMN = {
  quickCapture: 'left',
  myTasks: 'left',
  issuesByStatus: 'left',
  recentNotes: 'right',
  favorites: 'right',
  resurfacing: 'right',
  weeklySummary: 'right',
  sapNewsTeaser: 'right',
  vpsDiskUsage: 'right',
};

export function resolveHomeLayout(saved) {
  const known = new Set(HOME_BLOCKS);
  const seen = new Set();
  const left = [];
  const right = [];
  if (saved && Array.isArray(saved.left) && Array.isArray(saved.right)) {
    for (const key of saved.left) {
      if (known.has(key) && !seen.has(key)) {
        left.push(key);
        seen.add(key);
      }
    }
    for (const key of saved.right) {
      if (known.has(key) && !seen.has(key)) {
        right.push(key);
        seen.add(key);
      }
    }
  }
  for (const key of HOME_BLOCKS) {
    if (!seen.has(key)) (DEFAULT_COLUMN[key] === 'left' ? left : right).push(key);
  }
  return { left, right };
}
