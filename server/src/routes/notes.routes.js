import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const notesImageDir = path.join(__dirname, '..', '..', 'uploads', 'notes');

const uploadImage = multer({
  storage: multer.diskStorage({
    destination: notesImageDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `${req.effectiveUserId}-${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error('Only PNG, JPG, WEBP or GIF images are allowed'));
    }
    cb(null, true);
  },
});

const router = Router();
router.use(requireAuth);

router.post('/images', uploadImage.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.status(201).json({ url: `/uploads/notes/${req.file.filename}` });
});

router.get('/', async (req, res) => {
  const trashed = req.query.trashed === 'true';
  const notes = await prisma.note.findMany({
    where: { userId: req.effectiveUserId, deletedAt: trashed ? { not: null } : null },
    orderBy: trashed ? { deletedAt: 'desc' } : [{ pinned: 'desc' }, { updatedAt: 'desc' }],
  });
  res.json({ notes });
});

router.get('/:id', async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.json({ note });
});

router.post('/', async (req, res) => {
  const { title, content, blocks, folderId, tags, links } = req.body || {};
  const note = await prisma.note.create({
    data: {
      userId: req.effectiveUserId,
      title: title?.trim() || 'Untitled note',
      content: content || '',
      blocks: Array.isArray(blocks) ? blocks : undefined,
      folderId: folderId || null,
      tags: Array.isArray(tags) ? tags : [],
      links: Array.isArray(links) ? links : [],
    },
  });
  res.status(201).json({ note });
});

// A new version snapshot (of the state *before* this update) is kept
// whenever content actually changes, throttled to once per this window
// so continuous typing doesn't create a version per keystroke.
const VERSION_SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

router.patch('/:id', async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: null } });
  if (!note) return res.status(404).json({ error: 'Note not found' });

  const { title, content, blocks, folderId, tags, links, pinned } = req.body || {};
  const data = {};
  if (title !== undefined) data.title = title.trim() || 'Untitled note';
  if (content !== undefined) data.content = content;
  if (blocks !== undefined) data.blocks = Array.isArray(blocks) ? blocks : null;
  if (folderId !== undefined) data.folderId = folderId || null;
  if (tags !== undefined) data.tags = Array.isArray(tags) ? tags : [];
  if (links !== undefined) data.links = Array.isArray(links) ? links : [];
  if (pinned !== undefined) data.pinned = !!pinned;

  const contentChanged = data.title !== undefined || data.content !== undefined || data.blocks !== undefined;
  if (contentChanged) {
    const lastVersion = await prisma.noteVersion.findFirst({ where: { noteId: note.id }, orderBy: { createdAt: 'desc' } });
    if (!lastVersion || Date.now() - new Date(lastVersion.createdAt).getTime() > VERSION_SNAPSHOT_INTERVAL_MS) {
      await prisma.noteVersion.create({
        data: { noteId: note.id, title: note.title, content: note.content, blocks: note.blocks ?? undefined },
      });
    }
  }

  const updated = await prisma.note.update({ where: { id: note.id }, data });
  res.json({ note: updated });
});

router.get('/:id/versions', async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!note) return res.status(404).json({ error: 'Note not found' });
  const versions = await prisma.noteVersion.findMany({ where: { noteId: note.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ versions });
});

router.post('/:id/versions/:versionId/restore', async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: null } });
  if (!note) return res.status(404).json({ error: 'Note not found' });
  const version = await prisma.noteVersion.findFirst({ where: { id: req.params.versionId, noteId: note.id } });
  if (!version) return res.status(404).json({ error: 'Version not found' });

  // Snapshot the current state too, so restoring is itself undoable.
  await prisma.noteVersion.create({
    data: { noteId: note.id, title: note.title, content: note.content, blocks: note.blocks ?? undefined },
  });

  const updated = await prisma.note.update({
    where: { id: note.id },
    data: { title: version.title, content: version.content, blocks: version.blocks ?? null },
  });
  res.json({ note: updated });
});

// Soft delete (move to trash)
router.post('/:id/trash', async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: null } });
  if (!note) return res.status(404).json({ error: 'Note not found' });
  const updated = await prisma.note.update({ where: { id: note.id }, data: { deletedAt: new Date() } });
  res.json({ note: updated });
});

router.post('/:id/restore', async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: { not: null } } });
  if (!note) return res.status(404).json({ error: 'Note not found in trash' });
  const updated = await prisma.note.update({ where: { id: note.id }, data: { deletedAt: null } });
  res.json({ note: updated });
});

// Permanent delete
router.delete('/:id', async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!note) return res.status(404).json({ error: 'Note not found' });
  await prisma.note.delete({ where: { id: note.id } });
  res.status(204).end();
});

export default router;
