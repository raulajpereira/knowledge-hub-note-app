// Single source of truth for every reorderable block on the Home dashboard.
// Blocks live in one of two columns (or in `hidden`, removed from the
// dashboard entirely); unlike the sidebar reorder (a single list), a visible
// block here can be dragged into either column and to any position within
// it, so the user controls both the order and how many blocks sit in each
// column (e.g. 3 left / 4 right instead of a fixed split).
export const HOME_BLOCKS = ['quickCapture', 'continueWorking', 'myTasks', 'issuesByStatus', 'recentNotes', 'favorites', 'resurfacing', 'weeklySummary', 'sapNewsTeaser', 'vpsDiskUsage', 'tagsHeatmap'];

// Reused both to render each block's own header and to label it in the
// "add block" picker, so the two names never drift apart.
export const HOME_BLOCK_LABEL_KEYS = {
  quickCapture: 'home.quickCapture',
  continueWorking: 'home.continueWorking',
  myTasks: 'home.myTasks',
  issuesByStatus: 'home.issuesByStatus',
  recentNotes: 'home.recentNotes',
  favorites: 'home.favorites',
  resurfacing: 'home.resurfacing',
  weeklySummary: 'home.weeklySummary',
  sapNewsTeaser: 'home.sapNewsTeaser',
  vpsDiskUsage: 'home.vpsDiskUsage',
  tagsHeatmap: 'home.tagsHeatmap',
};

// Only used to place a block the first time it's ever seen (brand new
// account, or a block added to the app after the user last saved a layout).
const DEFAULT_COLUMN = {
  quickCapture: 'left',
  continueWorking: 'left',
  myTasks: 'left',
  issuesByStatus: 'left',
  recentNotes: 'right',
  favorites: 'right',
  resurfacing: 'right',
  weeklySummary: 'right',
  sapNewsTeaser: 'right',
  vpsDiskUsage: 'right',
  tagsHeatmap: 'right',
};

export function resolveHomeLayout(saved) {
  const known = new Set(HOME_BLOCKS);
  const seen = new Set();
  const left = [];
  const right = [];
  const hidden = [];
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
    if (Array.isArray(saved.hidden)) {
      for (const key of saved.hidden) {
        if (known.has(key) && !seen.has(key)) {
          hidden.push(key);
          seen.add(key);
        }
      }
    }
  }
  for (const key of HOME_BLOCKS) {
    if (!seen.has(key)) (DEFAULT_COLUMN[key] === 'left' ? left : right).push(key);
  }
  return { left, right, hidden };
}
