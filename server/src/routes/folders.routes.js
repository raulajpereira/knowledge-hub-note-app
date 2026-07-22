import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const folders = await prisma.folder.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { notes: { where: { deletedAt: null } } } } },
  });
  res.json({
    folders: folders.map((f) => ({ id: f.id, name: f.name, createdAt: f.createdAt, noteCount: f._count.notes })),
  });
});

router.post('/', async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  const folder = await prisma.folder.create({ data: { userId: req.userId, name: name.trim() } });
  res.status(201).json({ folder });
});

router.patch('/:id', async (req, res) => {
  const folder = await prisma.folder.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!folder) return res.status(404).json({ error: 'Folder not found' });
  const { name } = req.body || {};
  const updated = await prisma.folder.update({
    where: { id: folder.id },
    data: { name: name?.trim() || folder.name },
  });
  res.json({ folder: updated });
});

router.delete('/:id', async (req, res) => {
  const folder = await prisma.folder.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!folder) return res.status(404).json({ error: 'Folder not found' });
  await prisma.note.updateMany({ where: { folderId: folder.id }, data: { folderId: null } });
  await prisma.folder.delete({ where: { id: folder.id } });
  res.status(204).end();
});

export default router;
