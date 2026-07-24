// Maps a cross-entity link/source reference ({type, id, folderId?}) to the
// route + router state needed to open that exact item, shared by anything
// that renders clickable entity references (link panels, AI citations).
const ROUTES = {
  note: (e) => ['/notes', { noteId: e.id }],
  issue: (e) => ['/issues', { issueId: e.id }],
  task: (e) => ['/tasks', { taskId: e.id }],
  code: (e) => ['/code-library', { folderId: e.folderId, itemId: e.id }],
};

export function entityRoute(entity) {
  const build = ROUTES[entity.type];
  return build ? build(entity) : null;
}

export function navigateToEntity(navigate, entity) {
  const route = entityRoute(entity);
  if (!route) return;
  const [path, state] = route;
  navigate(path, { state });
}
