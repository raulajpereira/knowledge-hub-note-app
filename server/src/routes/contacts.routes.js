import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const contacts = await prisma.contact.findMany({
    where: { userId: req.effectiveUserId },
    include: {
      client: { select: { id: true, name: true } },
      system: { select: { id: true, name: true } },
    },
    orderBy: [{ name: 'asc' }],
  });
  res.json({ contacts });
});

router.post('/', async (req, res) => {
  const { name, clientId, systemId, role, email, phone, notes } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (clientId) {
    const client = await prisma.client.findFirst({ where: { id: clientId, userId: req.effectiveUserId } });
    if (!client) return res.status(400).json({ error: 'Invalid clientId' });
  }
  if (systemId) {
    const system = await prisma.sapSystem.findFirst({ where: { id: systemId, userId: req.effectiveUserId } });
    if (!system) return res.status(400).json({ error: 'Invalid systemId' });
  }
  const contact = await prisma.contact.create({
    data: {
      userId: req.effectiveUserId,
      clientId: clientId || null,
      systemId: systemId || null,
      name: name.trim(),
      role: role || null,
      email: email || null,
      phone: phone || null,
      notes: notes || null,
    },
    include: { client: { select: { id: true, name: true } }, system: { select: { id: true, name: true } } },
  });
  res.status(201).json({ contact });
});

router.patch('/:id', async (req, res) => {
  const contact = await prisma.contact.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const { name, clientId, systemId, role, email, phone, notes, icon } = req.body || {};
  if (clientId !== undefined && clientId) {
    const client = await prisma.client.findFirst({ where: { id: clientId, userId: req.effectiveUserId } });
    if (!client) return res.status(400).json({ error: 'Invalid clientId' });
  }
  if (systemId !== undefined && systemId) {
    const system = await prisma.sapSystem.findFirst({ where: { id: systemId, userId: req.effectiveUserId } });
    if (!system) return res.status(400).json({ error: 'Invalid systemId' });
  }
  const data = {};
  if (name !== undefined) data.name = name.trim() || contact.name;
  if (icon !== undefined) data.icon = icon || null;
  if (clientId !== undefined) data.clientId = clientId || null;
  if (systemId !== undefined) data.systemId = systemId || null;
  if (role !== undefined) data.role = role || null;
  if (email !== undefined) data.email = email || null;
  if (phone !== undefined) data.phone = phone || null;
  if (notes !== undefined) data.notes = notes || null;

  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data,
    include: { client: { select: { id: true, name: true } }, system: { select: { id: true, name: true } } },
  });
  res.json({ contact: updated });
});

router.delete('/:id', async (req, res) => {
  const contact = await prisma.contact.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  await prisma.contact.delete({ where: { id: contact.id } });
  res.status(204).end();
});

export default router;
