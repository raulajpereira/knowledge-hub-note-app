import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const STATUSES = ['Ativo', 'Pausado', 'Concluído'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coversDir = path.join(__dirname, '..', '..', 'uploads', 'project-covers');

const uploadCover = multer({
  storage: multer.diskStorage({
    destination: coversDir,
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

router.post('/covers', uploadCover.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.status(201).json({ url: `/uploads/project-covers/${req.file.filename}` });
});

router.get('/', async (req, res) => {
  const projects = await prisma.project.findMany({
    where: { userId: req.effectiveUserId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ projects });
});

router.post('/', async (req, res) => {
  const { name, scope, description, company, notes, manager, contacts, status, startDate, endDate, color } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const project = await prisma.project.create({
    data: {
      userId: req.effectiveUserId,
      name: name.trim(),
      scope: scope || null,
      description: description || null,
      company: company || null,
      notes: notes || null,
      manager: manager || null,
      contacts: Array.isArray(contacts) ? contacts : [],
      status: STATUSES.includes(status) ? status : STATUSES[0],
      startDate: startDate || null,
      endDate: endDate || null,
      color: color || null,
    },
  });
  res.status(201).json({ project });
});

router.patch('/:id', async (req, res) => {
  const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { name, scope, description, company, notes, manager, contacts, status, startDate, endDate, color, favorite, icon, coverUrl } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = name.trim() || project.name;
  if (icon !== undefined) data.icon = icon || null;
  if (coverUrl !== undefined) data.coverUrl = coverUrl || null;
  if (scope !== undefined) data.scope = scope || null;
  if (description !== undefined) data.description = description || null;
  if (company !== undefined) data.company = company || null;
  if (notes !== undefined) data.notes = notes || null;
  if (manager !== undefined) data.manager = manager || null;
  if (contacts !== undefined) data.contacts = Array.isArray(contacts) ? contacts : [];
  if (status !== undefined) data.status = STATUSES.includes(status) ? status : project.status;
  if (startDate !== undefined) data.startDate = startDate || null;
  if (endDate !== undefined) data.endDate = endDate || null;
  if (color !== undefined) data.color = color || null;
  if (favorite !== undefined) data.favorite = !!favorite;

  const updated = await prisma.project.update({ where: { id: project.id }, data });
  res.json({ project: updated });
});

router.delete('/:id', async (req, res) => {
  const project = await prisma.project.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!project) return res.status(404).json({ error: 'Project not found' });
  await prisma.project.delete({ where: { id: project.id } });
  res.status(204).end();
});

export default router;
