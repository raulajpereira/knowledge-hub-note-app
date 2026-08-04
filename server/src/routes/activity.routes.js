import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Tasks marked Done + Issues marked Done within [from, to], for the
// Home "what did I do on this date/period" popup.
router.get('/', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required (YYYY-MM-DD)' });

  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T23:59:59.999`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return res.status(400).json({ error: 'from and to must be valid dates' });
  }

  const [tasks, issues] = await Promise.all([
    prisma.task.findMany({
      where: { userId: req.effectiveUserId, deletedAt: null, doneAt: { gte: start, lte: end } },
      orderBy: { doneAt: 'desc' },
    }),
    prisma.issue.findMany({
      where: { userId: req.effectiveUserId, status: 'Done', completedAt: { gte: start, lte: end } },
      orderBy: { completedAt: 'desc' },
    }),
  ]);

  res.json({ tasks, issues });
});

export default router;
