import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const artifacts = await prisma.artifact.findMany({
    where: { userId: req.effectiveUserId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ artifacts });
});

router.post('/', async (req, res) => {
  const { title, description, html, tags, folderId } = req.body || {};
  let validFolderId = null;
  if (folderId) {
    const folder = await prisma.artifactFolder.findFirst({ where: { id: folderId, userId: req.effectiveUserId } });
    if (folder) validFolderId = folder.id;
  }
  const artifact = await prisma.artifact.create({
    data: {
      userId: req.effectiveUserId,
      title: title?.trim() || 'Untitled artifact',
      description: description || null,
      html: html || '<div style="padding:40px;font-family:sans-serif;">New artifact</div>',
      tags: Array.isArray(tags) ? tags : undefined,
      folderId: validFolderId,
    },
  });
  res.status(201).json({ artifact });
});

// Same throttle window/rationale as Notes' auto version snapshots.
const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

function artifactSnapshotData(artifact) {
  return { title: artifact.title, description: artifact.description, html: artifact.html, tags: artifact.tags };
}

router.patch('/:id', async (req, res) => {
  const artifact = await prisma.artifact.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' });

  const { title, description, html, tags, favorite, folderId } = req.body || {};
  const data = {};
  if (title !== undefined) data.title = title.trim() || 'Untitled artifact';
  if (description !== undefined) data.description = description || null;
  if (html !== undefined) data.html = html;
  if (tags !== undefined) data.tags = Array.isArray(tags) ? tags : null;
  if (favorite !== undefined) data.favorite = !!favorite;
  if (folderId !== undefined) {
    if (!folderId) {
      data.folderId = null;
    } else {
      const folder = await prisma.artifactFolder.findFirst({ where: { id: folderId, userId: req.effectiveUserId } });
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
      data.folderId = folder.id;
    }
  }

  const contentChanged = data.title !== undefined || data.description !== undefined || data.html !== undefined;
  if (contentChanged) {
    const lastSnapshot = await prisma.snapshot.findFirst({
      where: { entityType: 'artifact', entityId: artifact.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastSnapshot || Date.now() - new Date(lastSnapshot.createdAt).getTime() > SNAPSHOT_INTERVAL_MS) {
      await prisma.snapshot.create({
        data: { userId: req.effectiveUserId, entityType: 'artifact', entityId: artifact.id, data: artifactSnapshotData(artifact) },
      });
    }
  }

  const updated = await prisma.artifact.update({ where: { id: artifact.id }, data });
  res.json({ artifact: updated });
});

router.get('/:id/snapshots', async (req, res) => {
  const artifact = await prisma.artifact.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' });
  const snapshots = await prisma.snapshot.findMany({
    where: { entityType: 'artifact', entityId: artifact.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ snapshots });
});

router.post('/:id/snapshots', async (req, res) => {
  const artifact = await prisma.artifact.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' });
  const label = typeof req.body?.label === 'string' ? req.body.label.trim().slice(0, 80) : '';
  const snapshot = await prisma.snapshot.create({
    data: { userId: req.effectiveUserId, entityType: 'artifact', entityId: artifact.id, manual: true, label: label || null, data: artifactSnapshotData(artifact) },
  });
  res.status(201).json({ snapshot });
});

router.post('/:id/snapshots/:snapshotId/restore', async (req, res) => {
  const artifact = await prisma.artifact.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' });
  const snapshot = await prisma.snapshot.findFirst({ where: { id: req.params.snapshotId, entityType: 'artifact', entityId: artifact.id } });
  if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });

  await prisma.snapshot.create({
    data: { userId: req.effectiveUserId, entityType: 'artifact', entityId: artifact.id, data: artifactSnapshotData(artifact) },
  });

  const snap = snapshot.data;
  const updated = await prisma.artifact.update({
    where: { id: artifact.id },
    data: { title: snap.title, description: snap.description ?? null, html: snap.html, tags: snap.tags ?? null },
  });
  res.json({ artifact: updated });
});

router.delete('/:id', async (req, res) => {
  const artifact = await prisma.artifact.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' });
  await prisma.snapshot.deleteMany({ where: { entityType: 'artifact', entityId: artifact.id } });
  await prisma.artifact.delete({ where: { id: artifact.id } });
  res.status(204).end();
});

export default router;
