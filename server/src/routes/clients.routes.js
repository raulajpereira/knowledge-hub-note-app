import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const clients = await prisma.client.findMany({
    where: { userId: req.effectiveUserId },
    include: { _count: { select: { systems: true, contacts: true } } },
    orderBy: [{ favorite: 'desc' }, { name: 'asc' }],
  });
  res.json({ clients });
});

router.post('/', async (req, res) => {
  const { name, industry, notes, color, favorite } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const client = await prisma.client.create({
    data: {
      userId: req.effectiveUserId,
      name: name.trim(),
      industry: industry || null,
      notes: notes || null,
      color: color || null,
      favorite: !!favorite,
    },
  });
  res.status(201).json({ client });
});

router.patch('/:id', async (req, res) => {
  const client = await prisma.client.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const { name, industry, notes, color, favorite } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = name.trim() || client.name;
  if (industry !== undefined) data.industry = industry || null;
  if (notes !== undefined) data.notes = notes || null;
  if (color !== undefined) data.color = color || null;
  if (favorite !== undefined) data.favorite = !!favorite;

  const updated = await prisma.client.update({ where: { id: client.id }, data });
  res.json({ client: updated });
});

router.delete('/:id', async (req, res) => {
  const client = await prisma.client.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  await prisma.client.delete({ where: { id: client.id } });
  res.status(204).end();
});

export default router;
