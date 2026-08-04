import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { callProvider } from '../lib/aiProvider.js';

const FOLDER_KINDS = ['program', 'class', 'function_module', 'other'];
const ITEM_TYPES = ['snippet', 'characteristics', 'table', 'data_element', 'domain'];

const router = Router();
router.use(requireAuth);

async function isCodeFolderDescendant(userId, folderId, candidateAncestorId) {
  let current = candidateAncestorId;
  while (current) {
    if (current === folderId) return true;
    const parent = await prisma.codeFolder.findFirst({ where: { id: current, userId }, select: { parentId: true } });
    current = parent?.parentId || null;
  }
  return false;
}

router.get('/folders', async (req, res) => {
  const folders = await prisma.codeFolder.findMany({
    where: { userId: req.effectiveUserId },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { items: true } } },
  });
  res.json({ folders: folders.map(({ _count, ...f }) => ({ ...f, itemCount: _count.items })) });
});

router.post('/folders', async (req, res) => {
  const { name, kind, description, tags, parentId } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  let validParentId = null;
  if (parentId) {
    const parent = await prisma.codeFolder.findFirst({ where: { id: parentId, userId: req.effectiveUserId } });
    if (parent) validParentId = parent.id;
  }
  const folder = await prisma.codeFolder.create({
    data: {
      userId: req.effectiveUserId,
      name: name.trim(),
      kind: FOLDER_KINDS.includes(kind) ? kind : 'program',
      description: description?.trim() || null,
      tags: Array.isArray(tags) ? tags : undefined,
      parentId: validParentId,
    },
  });
  res.status(201).json({ folder: { ...folder, itemCount: 0 } });
});

router.patch('/folders/:id', async (req, res) => {
  const folder = await prisma.codeFolder.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!folder) return res.status(404).json({ error: 'Folder not found' });

  const { name, kind, description, tags, favorite, linkedFolderIds, parentId } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = name.trim() || folder.name;
  if (kind !== undefined && FOLDER_KINDS.includes(kind)) data.kind = kind;
  if (description !== undefined) data.description = description?.trim() || null;
  if (tags !== undefined) data.tags = Array.isArray(tags) ? tags : null;
  if (favorite !== undefined) data.favorite = !!favorite;
  if (linkedFolderIds !== undefined) {
    const ids = Array.isArray(linkedFolderIds) ? linkedFolderIds.filter((id) => id !== folder.id) : [];
    if (ids.length > 0) {
      const valid = await prisma.codeFolder.findMany({
        where: { id: { in: ids }, userId: req.effectiveUserId },
        select: { id: true },
      });
      data.linkedFolderIds = valid.map((f) => f.id);
    } else {
      data.linkedFolderIds = [];
    }
  }
  if (parentId !== undefined) {
    if (!parentId) {
      data.parentId = null;
    } else if (parentId === folder.id) {
      return res.status(400).json({ error: 'A folder cannot be its own parent' });
    } else {
      const parent = await prisma.codeFolder.findFirst({ where: { id: parentId, userId: req.effectiveUserId } });
      if (!parent) return res.status(404).json({ error: 'Parent folder not found' });
      if (await isCodeFolderDescendant(req.effectiveUserId, folder.id, parentId)) {
        return res.status(400).json({ error: 'Cannot move a folder inside its own descendant' });
      }
      data.parentId = parentId;
    }
  }

  const updated = await prisma.codeFolder.update({ where: { id: folder.id }, data });
  res.json({ folder: updated });
});

router.delete('/folders/:id', async (req, res) => {
  const folder = await prisma.codeFolder.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!folder) return res.status(404).json({ error: 'Folder not found' });
  await prisma.codeFolder.updateMany({ where: { parentId: folder.id, userId: req.effectiveUserId }, data: { parentId: folder.parentId } });
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

router.patch('/folders/:id/items/reorder', async (req, res) => {
  const folder = await prisma.codeFolder.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!folder) return res.status(404).json({ error: 'Folder not found' });

  const { itemIds } = req.body || {};
  if (!Array.isArray(itemIds) || itemIds.length === 0) return res.status(400).json({ error: 'itemIds must be a non-empty array' });

  const existing = await prisma.codeItem.findMany({ where: { folderId: folder.id }, select: { id: true } });
  const existingIds = new Set(existing.map((i) => i.id));
  if (itemIds.length !== existingIds.size || !itemIds.every((id) => existingIds.has(id))) {
    return res.status(400).json({ error: 'itemIds must match exactly the items currently in this folder' });
  }

  await prisma.$transaction(itemIds.map((id, position) => prisma.codeItem.update({ where: { id }, data: { position } })));
  const items = await prisma.codeItem.findMany({ where: { folderId: folder.id }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
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

// Same throttle window/rationale as Notes' auto version snapshots.
const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

function codeItemSnapshotData(item) {
  return { name: item.name, language: item.language, content: item.content, attributes: item.attributes };
}

router.patch('/items/:id', async (req, res) => {
  const item = await prisma.codeItem.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const { name, language, content, attributes } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = name.trim() || item.name;
  if (language !== undefined) data.language = language;
  if (content !== undefined) data.content = content;
  if (attributes !== undefined) data.attributes = attributes;

  const contentChanged = data.name !== undefined || data.content !== undefined || data.attributes !== undefined;
  if (contentChanged) {
    const lastSnapshot = await prisma.snapshot.findFirst({
      where: { entityType: 'codeItem', entityId: item.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastSnapshot || Date.now() - new Date(lastSnapshot.createdAt).getTime() > SNAPSHOT_INTERVAL_MS) {
      await prisma.snapshot.create({
        data: { userId: req.effectiveUserId, entityType: 'codeItem', entityId: item.id, data: codeItemSnapshotData(item) },
      });
    }
  }

  const updated = await prisma.codeItem.update({ where: { id: item.id }, data });
  res.json({ item: updated });
});

router.get('/items/:id/snapshots', async (req, res) => {
  const item = await prisma.codeItem.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const snapshots = await prisma.snapshot.findMany({
    where: { entityType: 'codeItem', entityId: item.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ snapshots });
});

router.post('/items/:id/snapshots', async (req, res) => {
  const item = await prisma.codeItem.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const label = typeof req.body?.label === 'string' ? req.body.label.trim().slice(0, 80) : '';
  const snapshot = await prisma.snapshot.create({
    data: { userId: req.effectiveUserId, entityType: 'codeItem', entityId: item.id, manual: true, label: label || null, data: codeItemSnapshotData(item) },
  });
  res.status(201).json({ snapshot });
});

router.post('/items/:id/snapshots/:snapshotId/restore', async (req, res) => {
  const item = await prisma.codeItem.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const snapshot = await prisma.snapshot.findFirst({ where: { id: req.params.snapshotId, entityType: 'codeItem', entityId: item.id } });
  if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });

  await prisma.snapshot.create({
    data: { userId: req.effectiveUserId, entityType: 'codeItem', entityId: item.id, data: codeItemSnapshotData(item) },
  });

  const snap = snapshot.data;
  const updated = await prisma.codeItem.update({
    where: { id: item.id },
    data: { name: snap.name, language: snap.language, content: snap.content ?? null, attributes: snap.attributes ?? undefined },
  });
  res.json({ item: updated });
});

const DOC_SYSTEM_PROMPT =
  'Escreve um cabeçalho de documentação no estilo ABAP para o código fornecido, como um bloco de comentário ' +
  '(linhas a começar por "*"), incluindo: um separador, "Descrição:" com um resumo conciso do que o código faz, ' +
  'e se fizer sentido "Parâmetros:" ou "Notas:". Responde APENAS com o bloco de comentário ABAP, sem texto à volta, ' +
  'sem blocos de código markdown.';

router.post('/items/:id/document', async (req, res) => {
  const item = await prisma.codeItem.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (item.type !== 'snippet') return res.status(400).json({ error: 'Só é possível documentar snippets de código.' });
  if (!item.content?.trim()) return res.status(400).json({ error: 'Este item ainda não tem código.' });

  const agent = await prisma.agent.findFirst({ where: { userId: req.effectiveUserId, active: true } });
  if (!agent) return res.status(400).json({ error: 'Configura um agente de IA ativo em Definições para usar esta funcionalidade.' });

  try {
    const header = await callProvider(agent, [{ role: 'user', content: item.content.slice(0, 6000) }], { systemPrompt: DOC_SYSTEM_PROMPT, maxTokens: 500 });
    res.json({ header: header.trim() });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Não foi possível documentar este código.' });
  }
});

router.delete('/items/:id', async (req, res) => {
  const item = await prisma.codeItem.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  await prisma.snapshot.deleteMany({ where: { entityType: 'codeItem', entityId: item.id } });
  await prisma.codeItem.delete({ where: { id: item.id } });
  res.status(204).end();
});

export default router;
