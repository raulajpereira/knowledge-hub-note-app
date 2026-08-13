import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth, requireSuperAdmin);

const PAGE_SIZE = 50;

router.get('/', async (req, res) => {
  const { entityType, action, actorEmail, cursor } = req.query;
  const where = {
    ...(entityType ? { entityType } : {}),
    ...(action ? { action } : {}),
    ...(actorEmail ? { actorEmail: { contains: actorEmail } } : {}),
  };
  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = entries.length > PAGE_SIZE;
  const page = hasMore ? entries.slice(0, PAGE_SIZE) : entries;
  const [entityTypes, actorEmails] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } }),
    prisma.auditLog.findMany({ where: { actorEmail: { not: null } }, distinct: ['actorEmail'], select: { actorEmail: true }, orderBy: { actorEmail: 'asc' } }),
  ]);
  res.json({
    entries: page,
    nextCursor: hasMore ? page[page.length - 1].id : null,
    entityTypes: entityTypes.map((e) => e.entityType),
    actorEmails: actorEmails.map((a) => a.actorEmail),
  });
});

router.delete('/', async (req, res) => {
  const olderThanDays = Number(req.query.olderThanDays);
  if (!Number.isFinite(olderThanDays) || olderThanDays < 0) {
    return res.status(400).json({ error: 'olderThanDays must be a non-negative number' });
  }
  const threshold = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const { count } = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: threshold } } });
  res.json({ deleted: count });
});

export default router;
