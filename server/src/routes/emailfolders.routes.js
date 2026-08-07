import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireFeature } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);
router.use(requireFeature('emails'));

async function isDescendant(userId, folderId, candidateAncestorId) {
  let current = candidateAncestorId;
  while (current) {
    if (current === folderId) return true;
    const parent = await prisma.emailFolder.findFirst({ where: { id: current, userId }, select: { parentId: true } });
    current = parent?.parentId || null;
  }
  return false;
}

router.get('/', async (req, res) => {
  const folders = await prisma.emailFolder.findMany({
    where: { userId: req.effectiveUserId },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { emails: true } } },
  });
  res.json({
    folders: folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, createdAt: f.createdAt, emailCount: f._count.emails })),
  });
});

router.post('/', async (req, res) => {
  const { name, parentId } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  let validParentId = null;
  if (parentId) {
    const parent = await prisma.emailFolder.findFirst({ where: { id: parentId, userId: req.effectiveUserId } });
    if (parent) validParentId = parent.id;
  }
  const folder = await prisma.emailFolder.create({ data: { userId: req.effectiveUserId, name: name.trim(), parentId: validParentId } });
  res.status(201).json({ folder });
});

router.patch('/:id', async (req, res) => {
  const folder = await prisma.emailFolder.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!folder) return res.status(404).json({ error: 'Folder not found' });
  const { name, parentId } = req.body || {};
  const data = { name: name?.trim() || folder.name };
  if (parentId !== undefined) {
    if (!parentId) {
      data.parentId = null;
    } else if (parentId === folder.id) {
      return res.status(400).json({ error: 'A folder cannot be its own parent' });
    } else {
      const parent = await prisma.emailFolder.findFirst({ where: { id: parentId, userId: req.effectiveUserId } });
      if (!parent) return res.status(404).json({ error: 'Parent folder not found' });
      if (await isDescendant(req.effectiveUserId, folder.id, parentId)) {
        return res.status(400).json({ error: 'Cannot move a folder inside its own descendant' });
      }
      data.parentId = parentId;
    }
  }
  const updated = await prisma.emailFolder.update({ where: { id: folder.id }, data });
  res.json({ folder: updated });
});

router.delete('/:id', async (req, res) => {
  const folder = await prisma.emailFolder.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!folder) return res.status(404).json({ error: 'Folder not found' });
  await prisma.emailFolder.updateMany({ where: { parentId: folder.id, userId: req.effectiveUserId }, data: { parentId: folder.parentId } });
  await prisma.email.updateMany({ where: { folderId: folder.id }, data: { folderId: null } });
  await prisma.emailFolder.delete({ where: { id: folder.id } });
  res.status(204).end();
});

export default router;
