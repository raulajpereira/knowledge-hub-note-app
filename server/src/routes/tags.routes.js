import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const HUE_ROTATION = [290, 250, 190, 150, 70, 20, 340, 25];

const router = Router();
router.use(requireAuth);

async function countsByTagName(userId) {
  const notes = await prisma.note.findMany({
    where: { userId, deletedAt: null },
    select: { tags: true },
  });
  const counts = {};
  for (const note of notes) {
    const tags = Array.isArray(note.tags) ? note.tags : [];
    for (const t of tags) counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}

router.get('/', async (req, res) => {
  const [tags, counts] = await Promise.all([
    prisma.tag.findMany({ where: { userId: req.effectiveUserId }, orderBy: { createdAt: 'asc' } }),
    countsByTagName(req.effectiveUserId),
  ]);
  res.json({ tags: tags.map((t) => ({ ...t, count: counts[t.name] || 0 })) });
});

router.post('/', async (req, res) => {
  const { name } = req.body || {};
  const clean = name?.trim();
  if (!clean) return res.status(400).json({ error: 'name is required' });

  const existing = await prisma.tag.findUnique({ where: { userId_name: { userId: req.effectiveUserId, name: clean } } });
  if (existing) return res.status(409).json({ error: 'A tag with this name already exists' });

  const count = await prisma.tag.count({ where: { userId: req.effectiveUserId } });
  const hue = HUE_ROTATION[count % HUE_ROTATION.length];

  const tag = await prisma.tag.create({ data: { userId: req.effectiveUserId, name: clean, hue } });
  res.status(201).json({ tag: { ...tag, count: 0 } });
});

router.patch('/:id', async (req, res) => {
  const tag = await prisma.tag.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!tag) return res.status(404).json({ error: 'Tag not found' });

  const { name } = req.body || {};
  const clean = name?.trim();
  if (!clean) return res.status(400).json({ error: 'name is required' });

  if (clean !== tag.name) {
    const notes = await prisma.note.findMany({ where: { userId: req.effectiveUserId }, select: { id: true, tags: true } });
    await Promise.all(
      notes
        .filter((n) => Array.isArray(n.tags) && n.tags.includes(tag.name))
        .map((n) =>
          prisma.note.update({
            where: { id: n.id },
            data: { tags: n.tags.map((t) => (t === tag.name ? clean : t)) },
          })
        )
    );
  }

  const updated = await prisma.tag.update({ where: { id: tag.id }, data: { name: clean } });
  res.json({ tag: updated });
});

router.delete('/:id', async (req, res) => {
  const tag = await prisma.tag.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!tag) return res.status(404).json({ error: 'Tag not found' });

  const notes = await prisma.note.findMany({ where: { userId: req.effectiveUserId }, select: { id: true, tags: true } });
  await Promise.all(
    notes
      .filter((n) => Array.isArray(n.tags) && n.tags.includes(tag.name))
      .map((n) =>
        prisma.note.update({ where: { id: n.id }, data: { tags: n.tags.filter((t) => t !== tag.name) } })
      )
  );

  await prisma.tag.delete({ where: { id: tag.id } });
  res.status(204).end();
});

export default router;
