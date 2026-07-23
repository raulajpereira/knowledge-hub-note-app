import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const voiceDir = path.join(__dirname, '..', '..', 'uploads', 'voice');

const upload = multer({
  storage: multer.diskStorage({
    destination: voiceDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.webm';
      cb(null, `${req.effectiveUserId}-${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const trashed = req.query.trashed === 'true';
  const voiceNotes = await prisma.voiceNote.findMany({
    where: { userId: req.effectiveUserId, deletedAt: trashed ? { not: null } : null },
    orderBy: trashed ? { deletedAt: 'desc' } : { createdAt: 'desc' },
  });
  res.json({ voiceNotes });
});

router.post('/', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });
  const { title, duration } = req.body || {};
  const voiceNote = await prisma.voiceNote.create({
    data: {
      userId: req.effectiveUserId,
      title: title?.trim() || `Recording ${new Date().toLocaleString()}`,
      audioUrl: `/uploads/voice/${req.file.filename}`,
      duration: Number(duration) || 0,
    },
  });
  res.status(201).json({ voiceNote });
});

router.patch('/:id', async (req, res) => {
  const voiceNote = await prisma.voiceNote.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: null } });
  if (!voiceNote) return res.status(404).json({ error: 'Voice note not found' });

  const { title, notes } = req.body || {};
  const data = {};
  if (title !== undefined) data.title = title.trim() || voiceNote.title;
  if (notes !== undefined) data.notes = notes;

  const updated = await prisma.voiceNote.update({ where: { id: voiceNote.id }, data });
  res.json({ voiceNote: updated });
});

// Soft delete (move to trash)
router.post('/:id/trash', async (req, res) => {
  const voiceNote = await prisma.voiceNote.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: null } });
  if (!voiceNote) return res.status(404).json({ error: 'Voice note not found' });
  const updated = await prisma.voiceNote.update({ where: { id: voiceNote.id }, data: { deletedAt: new Date() } });
  res.json({ voiceNote: updated });
});

router.post('/:id/restore', async (req, res) => {
  const voiceNote = await prisma.voiceNote.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: { not: null } } });
  if (!voiceNote) return res.status(404).json({ error: 'Voice note not found in trash' });
  const updated = await prisma.voiceNote.update({ where: { id: voiceNote.id }, data: { deletedAt: null } });
  res.json({ voiceNote: updated });
});

// Permanent delete
router.delete('/:id', async (req, res) => {
  const voiceNote = await prisma.voiceNote.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!voiceNote) return res.status(404).json({ error: 'Voice note not found' });
  await prisma.voiceNote.delete({ where: { id: voiceNote.id } });
  res.status(204).end();
});

export default router;
