import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const transactions = await prisma.sapTransaction.findMany({
    where: { userId: req.effectiveUserId },
    orderBy: [{ favorite: 'desc' }, { usageCount: 'desc' }, { tcode: 'asc' }],
  });
  res.json({ transactions });
});

router.post('/', async (req, res) => {
  const { tcode, description, module, moduleGroup, program, type, notes, favorite } = req.body || {};
  if (!tcode?.trim()) return res.status(400).json({ error: 'tcode is required' });
  const transaction = await prisma.sapTransaction.create({
    data: {
      userId: req.effectiveUserId,
      tcode: tcode.trim(),
      description: description || '',
      module: module || 'Outros',
      moduleGroup: moduleGroup || 'Outros',
      program: program || null,
      type: type || 'Transação Standard',
      notes: notes || null,
      favorite: !!favorite,
    },
  });
  res.status(201).json({ transaction });
});

router.patch('/:id', async (req, res) => {
  const transaction = await prisma.sapTransaction.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

  const { tcode, description, module, moduleGroup, program, type, notes, favorite } = req.body || {};
  const data = {};
  if (tcode !== undefined) data.tcode = tcode.trim() || transaction.tcode;
  if (description !== undefined) data.description = description || '';
  if (module !== undefined) data.module = module || transaction.module;
  if (moduleGroup !== undefined) data.moduleGroup = moduleGroup || transaction.moduleGroup;
  if (program !== undefined) data.program = program || null;
  if (type !== undefined) data.type = type || transaction.type;
  if (notes !== undefined) data.notes = notes || null;
  if (favorite !== undefined) data.favorite = !!favorite;

  const updated = await prisma.sapTransaction.update({ where: { id: transaction.id }, data });
  res.json({ transaction: updated });
});

// Bumps usageCount — called when an entry is opened from the quick-search
// popup or clicked in the table, so "mais pesquisadas" reflects real usage.
router.post('/:id/use', async (req, res) => {
  const transaction = await prisma.sapTransaction.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
  const updated = await prisma.sapTransaction.update({ where: { id: transaction.id }, data: { usageCount: { increment: 1 } } });
  res.json({ transaction: updated });
});

router.delete('/:id', async (req, res) => {
  const transaction = await prisma.sapTransaction.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
  await prisma.sapTransaction.delete({ where: { id: transaction.id } });
  res.status(204).end();
});

export default router;
