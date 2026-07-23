import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const artifacts = await prisma.artifact.findMany({
    where: { userId: req.effectiveUserId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ artifacts });
});

router.post('/', async (req, res) => {
  const { title, html } = req.body || {};
  const artifact = await prisma.artifact.create({
    data: {
      userId: req.effectiveUserId,
      title: title?.trim() || 'Untitled artifact',
      html: html || '<div style="padding:40px;font-family:sans-serif;">New artifact</div>',
    },
  });
  res.status(201).json({ artifact });
});

router.patch('/:id', async (req, res) => {
  const artifact = await prisma.artifact.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' });

  const { title, html } = req.body || {};
  const data = {};
  if (title !== undefined) data.title = title.trim() || 'Untitled artifact';
  if (html !== undefined) data.html = html;

  const updated = await prisma.artifact.update({ where: { id: artifact.id }, data });
  res.json({ artifact: updated });
});

router.delete('/:id', async (req, res) => {
  const artifact = await prisma.artifact.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' });
  await prisma.artifact.delete({ where: { id: artifact.id } });
  res.status(204).end();
});

export default router;
