import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const systems = await prisma.sapSystem.findMany({
    where: { userId: req.effectiveUserId },
    include: { client: { select: { id: true, name: true } } },
    orderBy: [{ favorite: 'desc' }, { name: 'asc' }],
  });
  res.json({ systems });
});

router.post('/', async (req, res) => {
  const { name, clientId, sid, instanceNumber, saprouter, applicationServer, environment, url, notes, favorite } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (clientId) {
    const client = await prisma.client.findFirst({ where: { id: clientId, userId: req.effectiveUserId } });
    if (!client) return res.status(400).json({ error: 'Invalid clientId' });
  }
  const system = await prisma.sapSystem.create({
    data: {
      userId: req.effectiveUserId,
      clientId: clientId || null,
      name: name.trim(),
      sid: sid || null,
      instanceNumber: instanceNumber || null,
      saprouter: saprouter || null,
      applicationServer: applicationServer || null,
      environment: environment || 'PRD',
      url: url || null,
      notes: notes || null,
      favorite: !!favorite,
    },
    include: { client: { select: { id: true, name: true } } },
  });
  res.status(201).json({ system });
});

router.patch('/:id', async (req, res) => {
  const system = await prisma.sapSystem.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!system) return res.status(404).json({ error: 'System not found' });

  const { name, clientId, sid, instanceNumber, saprouter, applicationServer, environment, url, notes, favorite, icon } = req.body || {};
  if (clientId !== undefined && clientId) {
    const client = await prisma.client.findFirst({ where: { id: clientId, userId: req.effectiveUserId } });
    if (!client) return res.status(400).json({ error: 'Invalid clientId' });
  }
  const data = {};
  if (name !== undefined) data.name = name.trim() || system.name;
  if (icon !== undefined) data.icon = icon || null;
  if (clientId !== undefined) data.clientId = clientId || null;
  if (sid !== undefined) data.sid = sid || null;
  if (instanceNumber !== undefined) data.instanceNumber = instanceNumber || null;
  if (saprouter !== undefined) data.saprouter = saprouter || null;
  if (applicationServer !== undefined) data.applicationServer = applicationServer || null;
  if (environment !== undefined) data.environment = environment || system.environment;
  if (url !== undefined) data.url = url || null;
  if (notes !== undefined) data.notes = notes || null;
  if (favorite !== undefined) data.favorite = !!favorite;

  const updated = await prisma.sapSystem.update({ where: { id: system.id }, data, include: { client: { select: { id: true, name: true } } } });
  res.json({ system: updated });
});

router.delete('/:id', async (req, res) => {
  const system = await prisma.sapSystem.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!system) return res.status(404).json({ error: 'System not found' });
  await prisma.sapSystem.delete({ where: { id: system.id } });
  res.status(204).end();
});

export default router;
