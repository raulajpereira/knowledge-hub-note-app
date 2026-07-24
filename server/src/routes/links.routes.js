import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { searchWorkspace } from '../lib/workspaceSearch.js';

const ENTITY_TYPES = new Set(['note', 'issue', 'task', 'code']);

async function fetchEntities(effectiveUserId, type, ids) {
  if (ids.length === 0) return new Map();
  if (type === 'note') {
    const rows = await prisma.note.findMany({
      where: { userId: effectiveUserId, id: { in: ids }, deletedAt: null },
      select: { id: true, title: true },
    });
    return new Map(rows.map((r) => [r.id, { title: r.title }]));
  }
  if (type === 'issue') {
    const rows = await prisma.issue.findMany({
      where: { userId: effectiveUserId, id: { in: ids } },
      select: { id: true, title: true, status: true },
    });
    return new Map(rows.map((r) => [r.id, { title: `${r.title} [${r.status}]` }]));
  }
  if (type === 'task') {
    const rows = await prisma.task.findMany({
      where: { userId: effectiveUserId, id: { in: ids }, deletedAt: null },
      select: { id: true, title: true, status: true },
    });
    return new Map(rows.map((r) => [r.id, { title: `${r.title} [${r.status}]` }]));
  }
  if (type === 'code') {
    const rows = await prisma.codeItem.findMany({
      where: { userId: effectiveUserId, id: { in: ids } },
      select: { id: true, name: true, folderId: true, folder: { select: { name: true } } },
    });
    return new Map(rows.map((r) => [r.id, { title: r.folder?.name ? `${r.name} (${r.folder.name})` : r.name, folderId: r.folderId }]));
  }
  return new Map();
}

async function entityExists(effectiveUserId, type, id) {
  const found = await fetchEntities(effectiveUserId, type, [id]);
  return found.has(id);
}

// Builds the free-text blob used both to feed the similarity search and,
// via workspaceSearch's own keyword extraction, to find lexically related
// content elsewhere in the workspace — no embeddings needed.
async function entityQueryText(effectiveUserId, type, id) {
  if (type === 'note') {
    const n = await prisma.note.findFirst({ where: { userId: effectiveUserId, id, deletedAt: null }, select: { title: true, content: true } });
    return n ? `${n.title} ${n.content || ''}` : null;
  }
  if (type === 'issue') {
    const i = await prisma.issue.findFirst({ where: { userId: effectiveUserId, id }, select: { title: true, description: true, notes: true } });
    return i ? `${i.title} ${i.description || ''} ${i.notes || ''}` : null;
  }
  if (type === 'task') {
    const tk = await prisma.task.findFirst({ where: { userId: effectiveUserId, id, deletedAt: null }, select: { title: true, notes: true } });
    return tk ? `${tk.title} ${tk.notes || ''}` : null;
  }
  if (type === 'code') {
    const c = await prisma.codeItem.findFirst({ where: { userId: effectiveUserId, id }, select: { name: true, content: true } });
    return c ? `${c.name} ${c.content || ''}` : null;
  }
  return null;
}

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { type, id } = req.query;
  if (!ENTITY_TYPES.has(type) || !id) return res.status(400).json({ error: 'type and id are required' });

  const [outgoing, incoming] = await Promise.all([
    prisma.link.findMany({ where: { userId: req.effectiveUserId, fromType: type, fromId: id } }),
    prisma.link.findMany({ where: { userId: req.effectiveUserId, toType: type, toId: id } }),
  ]);

  const byType = {};
  for (const l of outgoing) (byType[l.toType] ||= new Set()).add(l.toId);
  for (const l of incoming) (byType[l.fromType] ||= new Set()).add(l.fromId);

  const resolved = {};
  await Promise.all(
    Object.entries(byType).map(async ([t, idSet]) => {
      resolved[t] = await fetchEntities(req.effectiveUserId, t, [...idSet]);
    })
  );

  const outItems = outgoing
    .map((l) => {
      const meta = resolved[l.toType]?.get(l.toId);
      if (!meta) return null;
      return { linkId: l.id, type: l.toType, id: l.toId, label: l.label, ...meta };
    })
    .filter(Boolean);

  const inItems = incoming
    .map((l) => {
      const meta = resolved[l.fromType]?.get(l.fromId);
      if (!meta) return null;
      return { linkId: l.id, type: l.fromType, id: l.fromId, label: l.label, ...meta };
    })
    .filter(Boolean);

  res.json({ outgoing: outItems, incoming: inItems });
});

router.get('/suggestions', async (req, res) => {
  const { type, id, limit } = req.query;
  if (!ENTITY_TYPES.has(type) || !id) return res.status(400).json({ error: 'type and id are required' });

  const queryText = await entityQueryText(req.effectiveUserId, type, id);
  if (!queryText) return res.status(404).json({ error: 'Entity not found' });

  const [outgoing, incoming] = await Promise.all([
    prisma.link.findMany({ where: { userId: req.effectiveUserId, fromType: type, fromId: id }, select: { toType: true, toId: true } }),
    prisma.link.findMany({ where: { userId: req.effectiveUserId, toType: type, toId: id }, select: { fromType: true, fromId: true } }),
  ]);
  const exclude = new Set([`${type}:${id}`, ...outgoing.map((l) => `${l.toType}:${l.toId}`), ...incoming.map((l) => `${l.fromType}:${l.fromId}`)]);

  const take = Number(limit) || 5;
  const results = await searchWorkspace(req.effectiveUserId, queryText, take + exclude.size);
  const filtered = results.filter((r) => !exclude.has(`${r.type}:${r.id}`)).slice(0, take);

  res.json({ suggestions: filtered });
});

router.post('/', async (req, res) => {
  const { fromType, fromId, toType, toId, label } = req.body || {};
  if (!ENTITY_TYPES.has(fromType) || !ENTITY_TYPES.has(toType) || !fromId || !toId) {
    return res.status(400).json({ error: 'fromType, fromId, toType and toId are required' });
  }
  if (fromType === toType && fromId === toId) return res.status(400).json({ error: 'Cannot link an item to itself' });

  const [fromOk, toOk] = await Promise.all([
    entityExists(req.effectiveUserId, fromType, fromId),
    entityExists(req.effectiveUserId, toType, toId),
  ]);
  if (!fromOk || !toOk) return res.status(404).json({ error: 'Entity not found' });

  const existing = await prisma.link.findFirst({ where: { userId: req.effectiveUserId, fromType, fromId, toType, toId } });
  if (existing) return res.status(201).json({ link: existing });

  const link = await prisma.link.create({ data: { userId: req.effectiveUserId, fromType, fromId, toType, toId, label: label || null } });
  res.status(201).json({ link });
});

router.delete('/:id', async (req, res) => {
  const link = await prisma.link.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!link) return res.status(404).json({ error: 'Link not found' });
  await prisma.link.delete({ where: { id: link.id } });
  res.status(204).end();
});

router.get('/graph', async (req, res) => {
  const [links, notesWithLegacyLinks] = await Promise.all([
    prisma.link.findMany({ where: { userId: req.effectiveUserId } }),
    prisma.note.findMany({ where: { userId: req.effectiveUserId, deletedAt: null }, select: { id: true, links: true } }),
  ]);

  const edges = links.map((l) => ({ fromType: l.fromType, fromId: l.fromId, toType: l.toType, toId: l.toId, label: l.label }));
  for (const n of notesWithLegacyLinks) {
    for (const l of Array.isArray(n.links) ? n.links : []) {
      if (l?.noteId) edges.push({ fromType: 'note', fromId: n.id, toType: 'note', toId: l.noteId, label: l.label || null });
    }
  }

  const idsByType = {};
  for (const e of edges) {
    (idsByType[e.fromType] ||= new Set()).add(e.fromId);
    (idsByType[e.toType] ||= new Set()).add(e.toId);
  }

  const resolved = {};
  await Promise.all(
    Object.entries(idsByType).map(async ([t, idSet]) => {
      resolved[t] = await fetchEntities(req.effectiveUserId, t, [...idSet]);
    })
  );

  const nodes = [];
  for (const [t, idSet] of Object.entries(idsByType)) {
    for (const nodeId of idSet) {
      const meta = resolved[t]?.get(nodeId);
      if (meta) nodes.push({ type: t, id: nodeId, title: meta.title, folderId: meta.folderId });
    }
  }

  const validEdges = edges.filter((e) => resolved[e.fromType]?.has(e.fromId) && resolved[e.toType]?.has(e.toId));

  res.json({ nodes, edges: validEdges });
});

export default router;
