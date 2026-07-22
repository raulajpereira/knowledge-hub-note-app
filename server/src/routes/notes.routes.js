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
      cb(null, `${req.userId}-${crypto.randomUUID()}${ext}`);
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
    where: { userId: req.userId, deletedAt: trashed ? { not: null } : null },
    orderBy: trashed ? { deletedAt: 'desc' } : [{ pinned: 'desc' }, { updatedAt: 'desc' }],
  });
  res.json({ notes });
});

router.get('/:id', async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.json({ note });
});

router.post('/', async (req, res) => {
  const { title, content, blocks, folderId, tags } = req.body || {};
  const note = await prisma.note.create({
    data: {
      userId: req.userId,
      title: title?.trim() || 'Untitled note',
      content: content || '',
      blocks: Array.isArray(blocks) ? blocks : undefined,
      folderId: folderId || null,
      tags: Array.isArray(tags) ? tags : [],
    },
  });
  res.status(201).json({ note });
});

router.patch('/:id', async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId, deletedAt: null } });
  if (!note) return res.status(404).json({ error: 'Note not found' });

  const { title, content, blocks, folderId, tags, pinned } = req.body || {};
  const data = {};
  if (title !== undefined) data.title = title.trim() || 'Untitled note';
  if (content !== undefined) data.content = content;
  if (blocks !== undefined) data.blocks = Array.isArray(blocks) ? blocks : null;
  if (folderId !== undefined) data.folderId = folderId || null;
  if (tags !== undefined) data.tags = Array.isArray(tags) ? tags : [];
  if (pinned !== undefined) data.pinned = !!pinned;

  const updated = await prisma.note.update({ where: { id: note.id }, data });
  res.json({ note: updated });
});

// Soft delete (move to trash)
router.post('/:id/trash', async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId, deletedAt: null } });
  if (!note) return res.status(404).json({ error: 'Note not found' });
  const updated = await prisma.note.update({ where: { id: note.id }, data: { deletedAt: new Date() } });
  res.json({ note: updated });
});

router.post('/:id/restore', async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId, deletedAt: { not: null } } });
  if (!note) return res.status(404).json({ error: 'Note not found in trash' });
  const updated = await prisma.note.update({ where: { id: note.id }, data: { deletedAt: null } });
  res.json({ note: updated });
});

// Permanent delete
router.delete('/:id', async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!note) return res.status(404).json({ error: 'Note not found' });
  await prisma.note.delete({ where: { id: note.id } });
  res.status(204).end();
});

export default router;
