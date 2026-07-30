import { prisma } from './prisma.js';

// Generic activity trail for every authenticated mutating request. Mounted
// as the very first app.use(), before routing — it registers a
// res.on('finish') listener up front, but that listener only actually fires
// after the whole downstream chain (including each router's own
// requireAuth) has run, so req.userId/req.userEmail/req.effectiveUserId are
// populated by the time it reads them. Bodies are never recorded, only
// method/path/status, so it stays safe even for sensitive entities like
// Passwords.
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function auditMiddleware(req, res, next) {
  const method = req.method;
  // req.originalUrl (not req.path/req.url) — Express mutates the latter as
  // the request descends through nested routers and never restores it once
  // a terminal handler sends the response, so by the time res.on('finish')
  // fires below, req.path would reflect whatever the deepest router saw
  // (e.g. "/setup" for POST /api/auth/2fa/setup) instead of the real route.
  const path = req.originalUrl.split('?')[0];
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  if (!path.startsWith('/api/')) return next();

  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    if (!req.userId) return; // pre-auth mutations (login/register) are logged explicitly by auth.routes.js
    const segments = path.split('/').filter(Boolean); // ["api", "clients", ":id", ...]
    const entityType = segments[1] || 'unknown';
    const entityId = segments[2] && ID_PATTERN.test(segments[2]) ? segments[2] : null;
    const action = method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'update';
    logAuditEvent({
      actorId: req.userId,
      actorName: req.userName || '',
      actorEmail: req.userEmail || '',
      teamId: req.effectiveUserId || req.userId,
      entityType,
      entityId,
      action,
      summary: `${method} ${path}`,
      ip: req.ip,
    });
  });

  next();
}

// Explicit call for events the generic middleware can't see (login before a
// session exists, login failures, registration) or that deserve a clearer
// summary than a raw method+path.
export function logAuditEvent(entry) {
  prisma.auditLog.create({ data: entry }).catch(() => {});
}
