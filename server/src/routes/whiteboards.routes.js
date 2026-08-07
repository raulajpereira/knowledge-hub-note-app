import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireFeature } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);
router.use(requireFeature('whiteboard'));

router.get('/', async (req, res) => {
  const archived = req.query.archived === 'true';
  const boards = await prisma.whiteboard.findMany({
    where: { userId: req.effectiveUserId, archived },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, archived: true, createdAt: true, updatedAt: true },
  });
  res.json({ boards });
});

router.post('/', async (req, res) => {
  const { name } = req.body || {};
  const board = await prisma.whiteboard.create({
    data: { userId: req.effectiveUserId, name: name?.trim() || 'Untitled board', data: { strokes: [], viewport: { x: 0, y: 0, scale: 1 } } },
  });
  res.status(201).json({ board });
});

router.get('/:id', async (req, res) => {
  const board = await prisma.whiteboard.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!board) return res.status(404).json({ error: 'Board not found' });
  res.json({ board });
});

router.patch('/:id', async (req, res) => {
  const board = await prisma.whiteboard.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!board) return res.status(404).json({ error: 'Board not found' });

  const { name, data, archived } = req.body || {};
  const patch = {};
  if (name !== undefined) patch.name = name.trim() || board.name;
  if (data !== undefined) patch.data = data;
  if (archived !== undefined) patch.archived = !!archived;

  const updated = await prisma.whiteboard.update({ where: { id: board.id }, data: patch });
  res.json({ board: updated });
});

router.delete('/:id', async (req, res) => {
  const board = await prisma.whiteboard.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!board) return res.status(404).json({ error: 'Board not found' });
  await prisma.whiteboard.delete({ where: { id: board.id } });
  res.status(204).end();
});

export default router;
