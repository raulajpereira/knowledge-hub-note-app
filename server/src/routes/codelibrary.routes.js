import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const FOLDER_KINDS = ['program', 'class', 'function_module', 'other'];
const ITEM_TYPES = ['snippet', 'characteristics', 'table', 'data_element', 'domain'];

const router = Router();
router.use(requireAuth);

router.get('/folders', async (req, res) => {
  const folders = await prisma.codeFolder.findMany({
    where: { userId: req.effectiveUserId },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { items: true } } },
  });
  res.json({ folders: folders.map(({ _count, ...f }) => ({ ...f, itemCount: _count.items })) });
});

router.post('/folders', async (req, res) => {
  const { name, kind, description, tags } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const folder = await prisma.codeFolder.create({
    data: {
      userId: req.effectiveUserId,
      name: name.trim(),
      kind: FOLDER_KINDS.includes(kind) ? kind : 'program',
      description: description?.trim() || null,
      tags: Array.isArray(tags) ? tags : undefined,
    },
  });
  res.status(201).json({ folder: { ...folder, itemCount: 0 } });
});

router.patch('/folders/:id', async (req, res) => {
  const folder = await prisma.codeFolder.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!folder) return res.status(404).json({ error: 'Folder not found' });

  const { name, kind, description, tags, favorite } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = name.trim() || folder.name;
  if (kind !== undefined && FOLDER_KINDS.includes(kind)) data.kind = kind;
  if (description !== undefined) data.description = description?.trim() || null;
  if (tags !== undefined) data.tags = Array.isArray(tags) ? tags : null;
  if (favorite !== undefined) data.favorite = !!favorite;

  const updated = await prisma.codeFolder.update({ where: { id: folder.id }, data });
  res.json({ folder: updated });
});

router.delete('/folders/:id', async (req, res) => {
  const folder = await prisma.codeFolder.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!folder) return res.status(404).json({ error: 'Folder not found' });
  await prisma.codeFolder.delete({ where: { id: folder.id } });
  res.status(204).end();
});

router.get('/folders/:id/items', async (req, res) => {
  const folder = await prisma.codeFolder.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!folder) return res.status(404).json({ error: 'Folder not found' });
  const items = await prisma.codeItem.findMany({
    where: { folderId: folder.id },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ items });
});

router.post('/folders/:id/items', async (req, res) => {
  const folder = await prisma.codeFolder.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!folder) return res.status(404).json({ error: 'Folder not found' });

  const { type, name, language, content, attributes } = req.body || {};
  if (!ITEM_TYPES.includes(type)) return res.status(400).json({ error: 'invalid type' });
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  const position = await prisma.codeItem.count({ where: { folderId: folder.id } });
  const item = await prisma.codeItem.create({
    data: {
      folderId: folder.id,
      userId: req.effectiveUserId,
      type,
      name: name.trim(),
      language: language || 'abap',
      content: content ?? null,
      attributes: attributes ?? undefined,
      position,
    },
  });
  await prisma.codeFolder.update({ where: { id: folder.id }, data: { updatedAt: new Date() } });
  res.status(201).json({ item });
});

router.patch('/items/:id', async (req, res) => {
  const item = await prisma.codeItem.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const { name, language, content, attributes } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = name.trim() || item.name;
  if (language !== undefined) data.language = language;
  if (content !== undefined) data.content = content;
  if (attributes !== undefined) data.attributes = attributes;

  const updated = await prisma.codeItem.update({ where: { id: item.id }, data });
  res.json({ item: updated });
});

router.delete('/items/:id', async (req, res) => {
  const item = await prisma.codeItem.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  await prisma.codeItem.delete({ where: { id: item.id } });
  res.status(204).end();
});

export default router;
