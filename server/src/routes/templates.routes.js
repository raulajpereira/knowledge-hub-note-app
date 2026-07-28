import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const ENTITY_TYPES = new Set(['note', 'task', 'issue']);

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { type } = req.query;
  if (!ENTITY_TYPES.has(type)) return res.status(400).json({ error: 'type must be note, task or issue' });
  const templates = await prisma.template.findMany({
    where: { userId: req.effectiveUserId, entityType: type },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ templates });
});

router.post('/', async (req, res) => {
  const { entityType, name, data } = req.body || {};
  if (!ENTITY_TYPES.has(entityType)) return res.status(400).json({ error: 'entityType must be note, task or issue' });
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const template = await prisma.template.create({
    data: { userId: req.effectiveUserId, entityType, name: name.trim(), data: data || {} },
  });
  res.status(201).json({ template });
});

router.delete('/:id', async (req, res) => {
  const template = await prisma.template.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!template) return res.status(404).json({ error: 'Template not found' });
  await prisma.template.delete({ where: { id: template.id } });
  res.status(204).end();
});

export default router;
