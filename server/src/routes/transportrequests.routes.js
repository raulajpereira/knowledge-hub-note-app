import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const includeRefs = {
  project: { select: { id: true, name: true, color: true } },
  system: { select: { id: true, name: true, sid: true, environment: true } },
};

router.get('/', async (req, res) => {
  const { projectId } = req.query;
  const transportRequests = await prisma.transportRequest.findMany({
    where: { userId: req.effectiveUserId, ...(projectId ? { projectId } : {}) },
    include: includeRefs,
    orderBy: [{ createdAt: 'desc' }],
  });
  res.json({ transportRequests });
});

router.post('/', async (req, res) => {
  const { code, description, projectId, systemId, environment, liberada, transportQas, transportPrd, plannedDate, notes } = req.body || {};
  if (!code?.trim()) return res.status(400).json({ error: 'code is required' });
  if (projectId) {
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: req.effectiveUserId } });
    if (!project) return res.status(400).json({ error: 'Invalid projectId' });
  }
  if (systemId) {
    const system = await prisma.sapSystem.findFirst({ where: { id: systemId, userId: req.effectiveUserId } });
    if (!system) return res.status(400).json({ error: 'Invalid systemId' });
  }
  const tr = await prisma.transportRequest.create({
    data: {
      userId: req.effectiveUserId,
      projectId: projectId || null,
      systemId: systemId || null,
      code: code.trim(),
      description: description || '',
      environment: environment || null,
      liberada: !!liberada,
      transportQas: !!transportQas,
      transportPrd: !!transportPrd,
      plannedDate: plannedDate || null,
      notes: notes || null,
    },
    include: includeRefs,
  });
  res.status(201).json({ transportRequest: tr });
});

router.patch('/:id', async (req, res) => {
  const tr = await prisma.transportRequest.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!tr) return res.status(404).json({ error: 'Transport request not found' });

  const { code, description, projectId, systemId, environment, liberada, transportQas, transportPrd, plannedDate, notes, icon } = req.body || {};
  if (projectId !== undefined && projectId) {
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: req.effectiveUserId } });
    if (!project) return res.status(400).json({ error: 'Invalid projectId' });
  }
  if (systemId !== undefined && systemId) {
    const system = await prisma.sapSystem.findFirst({ where: { id: systemId, userId: req.effectiveUserId } });
    if (!system) return res.status(400).json({ error: 'Invalid systemId' });
  }
  const data = {};
  if (code !== undefined) data.code = code.trim() || tr.code;
  if (icon !== undefined) data.icon = icon || null;
  if (description !== undefined) data.description = description || '';
  if (projectId !== undefined) data.projectId = projectId || null;
  if (systemId !== undefined) data.systemId = systemId || null;
  if (environment !== undefined) data.environment = environment || null;
  if (liberada !== undefined) data.liberada = !!liberada;
  if (transportQas !== undefined) data.transportQas = !!transportQas;
  if (transportPrd !== undefined) data.transportPrd = !!transportPrd;
  if (plannedDate !== undefined) data.plannedDate = plannedDate || null;
  if (notes !== undefined) data.notes = notes || null;

  const updated = await prisma.transportRequest.update({ where: { id: tr.id }, data, include: includeRefs });
  res.json({ transportRequest: updated });
});

router.delete('/:id', async (req, res) => {
  const tr = await prisma.transportRequest.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!tr) return res.status(404).json({ error: 'Transport request not found' });
  await prisma.transportRequest.delete({ where: { id: tr.id } });
  res.status(204).end();
});

export default router;
