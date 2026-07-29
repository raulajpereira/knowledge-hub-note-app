import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docImageDir = path.join(__dirname, '..', '..', 'uploads', 'documentacao');

const uploadImage = multer({
  storage: multer.diskStorage({
    destination: docImageDir,
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
  res.status(201).json({ url: `/uploads/documentacao/${req.file.filename}` });
});

async function isDescendant(userId, folderId, candidateAncestorId) {
  let current = candidateAncestorId;
  while (current) {
    if (current === folderId) return true;
    const parent = await prisma.docFolder.findFirst({ where: { id: current, userId }, select: { parentId: true } });
    current = parent?.parentId || null;
  }
  return false;
}

// --- Folders ---

router.get('/folders', async (req, res) => {
  const folders = await prisma.docFolder.findMany({
    where: { userId: req.effectiveUserId },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { documents: { where: { deletedAt: null } } } } },
  });
  res.json({
    folders: folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, createdAt: f.createdAt, documentCount: f._count.documents })),
  });
});

router.post('/folders', async (req, res) => {
  const { name, parentId } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  let validParentId = null;
  if (parentId) {
    const parent = await prisma.docFolder.findFirst({ where: { id: parentId, userId: req.effectiveUserId } });
    if (parent) validParentId = parent.id;
  }
  const folder = await prisma.docFolder.create({ data: { userId: req.effectiveUserId, name: name.trim(), parentId: validParentId } });
  res.status(201).json({ folder: { ...folder, documentCount: 0 } });
});

router.patch('/folders/:id', async (req, res) => {
  const folder = await prisma.docFolder.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!folder) return res.status(404).json({ error: 'Folder not found' });
  const { name, parentId } = req.body || {};
  const data = { name: name?.trim() || folder.name };
  if (parentId !== undefined) {
    if (!parentId) {
      data.parentId = null;
    } else if (parentId === folder.id) {
      return res.status(400).json({ error: 'A folder cannot be its own parent' });
    } else {
      const parent = await prisma.docFolder.findFirst({ where: { id: parentId, userId: req.effectiveUserId } });
      if (!parent) return res.status(404).json({ error: 'Parent folder not found' });
      if (await isDescendant(req.effectiveUserId, folder.id, parentId)) {
        return res.status(400).json({ error: 'Cannot move a folder inside its own descendant' });
      }
      data.parentId = parentId;
    }
  }
  const updated = await prisma.docFolder.update({ where: { id: folder.id }, data });
  res.json({ folder: updated });
});

router.delete('/folders/:id', async (req, res) => {
  const folder = await prisma.docFolder.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!folder) return res.status(404).json({ error: 'Folder not found' });
  await prisma.docFolder.updateMany({ where: { parentId: folder.id, userId: req.effectiveUserId }, data: { parentId: folder.parentId } });
  await prisma.document.updateMany({ where: { folderId: folder.id }, data: { folderId: null } });
  await prisma.docFolder.delete({ where: { id: folder.id } });
  res.status(204).end();
});

// --- Templates (read-only for regular users; visible unless restricted) ---

router.get('/templates', async (req, res) => {
  const templates = await prisma.docTemplate.findMany({
    where: { restrictions: { none: { userId: req.effectiveUserId } } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, description: true, fields: true, createdAt: true },
  });
  res.json({ templates });
});

// --- Documents ---

router.get('/', async (req, res) => {
  const trashed = req.query.trashed === 'true';
  const documents = await prisma.document.findMany({
    where: { userId: req.effectiveUserId, deletedAt: trashed ? { not: null } : null },
    orderBy: trashed ? { deletedAt: 'desc' } : { updatedAt: 'desc' },
    include: { template: { select: { id: true, name: true } } },
  });
  res.json({ documents });
});

router.get('/:id', async (req, res) => {
  const document = await prisma.document.findFirst({
    where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: null },
    include: { template: true },
  });
  if (!document) return res.status(404).json({ error: 'Document not found' });
  res.json({ document });
});

router.post('/', async (req, res) => {
  const { templateId, title, folderId } = req.body || {};
  if (!templateId) return res.status(400).json({ error: 'templateId is required' });
  const template = await prisma.docTemplate.findFirst({
    where: { id: templateId, restrictions: { none: { userId: req.effectiveUserId } } },
  });
  if (!template) return res.status(404).json({ error: 'Template not found' });

  let validFolderId = null;
  if (folderId) {
    const folder = await prisma.docFolder.findFirst({ where: { id: folderId, userId: req.effectiveUserId } });
    if (folder) validFolderId = folder.id;
  }

  const fieldsData = {};
  for (const field of template.fields || []) {
    fieldsData[field.key] = field.type === 'table' ? [] : field.type === 'block' ? [] : '';
  }

  const document = await prisma.document.create({
    data: {
      userId: req.effectiveUserId,
      templateId: template.id,
      folderId: validFolderId,
      title: title?.trim() || template.name,
      fieldsData,
    },
    include: { template: { select: { id: true, name: true } } },
  });
  res.status(201).json({ document });
});

router.patch('/:id', async (req, res) => {
  const document = await prisma.document.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: null } });
  if (!document) return res.status(404).json({ error: 'Document not found' });

  const { title, fieldsData, folderId, favorite } = req.body || {};
  const data = {};
  if (title !== undefined) data.title = title.trim() || document.title;
  if (fieldsData !== undefined) data.fieldsData = fieldsData;
  if (favorite !== undefined) data.favorite = !!favorite;
  if (folderId !== undefined) {
    if (!folderId) {
      data.folderId = null;
    } else {
      const folder = await prisma.docFolder.findFirst({ where: { id: folderId, userId: req.effectiveUserId } });
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
      data.folderId = folder.id;
    }
  }

  const updated = await prisma.document.update({
    where: { id: document.id },
    data,
    include: { template: { select: { id: true, name: true } } },
  });
  res.json({ document: updated });
});

router.post('/:id/trash', async (req, res) => {
  const document = await prisma.document.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: null } });
  if (!document) return res.status(404).json({ error: 'Document not found' });
  const updated = await prisma.document.update({ where: { id: document.id }, data: { deletedAt: new Date() } });
  res.json({ document: updated });
});

router.post('/:id/restore', async (req, res) => {
  const document = await prisma.document.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: { not: null } } });
  if (!document) return res.status(404).json({ error: 'Document not found in trash' });
  const updated = await prisma.document.update({ where: { id: document.id }, data: { deletedAt: null } });
  res.json({ document: updated });
});

router.delete('/:id', async (req, res) => {
  const document = await prisma.document.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: { not: null } } });
  if (!document) return res.status(404).json({ error: 'Document not found in trash' });
  await prisma.document.delete({ where: { id: document.id } });
  res.status(204).end();
});

export default router;
