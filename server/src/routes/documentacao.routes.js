import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { fillDocx } from '../lib/docxFill/engine.js';
import { convertDocxToPdf } from '../lib/docxFill/pdfConvert.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docImageDir = path.join(__dirname, '..', '..', 'uploads', 'documentacao');
const templatesDir = path.join(__dirname, '..', '..', 'templates');

function resolveImagePath(url) {
  if (!url || !url.startsWith('/uploads/documentacao/')) return null;
  return path.join(docImageDir, path.basename(url));
}

function safeFilename(title) {
  return (title || 'documento').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'documento';
}

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

// Admin-only: full list (ignores restrictions) for management screens.
router.get('/templates/admin', requireAdmin, async (req, res) => {
  const templates = await prisma.docTemplate.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, description: true, createdAt: true, updatedAt: true },
  });
  res.json({ templates });
});

// Admin-only: rename/redescribe a template. The field schema and source
// docx are only ever changed via a deploy (scripts/seed-doc-templates.js).
router.patch('/templates/:id', requireAdmin, async (req, res) => {
  const template = await prisma.docTemplate.findUnique({ where: { id: req.params.id } });
  if (!template) return res.status(404).json({ error: 'Template not found' });
  const { name, description } = req.body || {};
  const data = {};
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
    data.name = name.trim();
  }
  if (description !== undefined) data.description = description?.trim() || null;
  const updated = await prisma.docTemplate.update({ where: { id: template.id }, data });
  res.json({ template: updated });
});

// Admin-only: per-user template access (default-allow blacklist model).
router.get('/template-access/:userId', requireAdmin, async (req, res) => {
  const [templates, restrictions] = await Promise.all([
    prisma.docTemplate.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.docTemplateRestriction.findMany({ where: { userId: req.params.userId }, select: { templateId: true } }),
  ]);
  const deniedIds = new Set(restrictions.map((r) => r.templateId));
  res.json({
    templates: templates.map((t) => ({ id: t.id, name: t.name, allowed: !deniedIds.has(t.id) })),
  });
});

router.put('/template-access/:userId', requireAdmin, async (req, res) => {
  const { allowedTemplateIds } = req.body || {};
  if (!Array.isArray(allowedTemplateIds)) return res.status(400).json({ error: 'allowedTemplateIds must be an array' });
  const templates = await prisma.docTemplate.findMany({ select: { id: true } });
  const allowedSet = new Set(allowedTemplateIds);
  const deniedIds = templates.map((t) => t.id).filter((id) => !allowedSet.has(id));

  await prisma.$transaction([
    prisma.docTemplateRestriction.deleteMany({ where: { userId: req.params.userId } }),
    ...(deniedIds.length
      ? [prisma.docTemplateRestriction.createMany({
          data: deniedIds.map((templateId) => ({ userId: req.params.userId, templateId })),
        })]
      : []),
  ]);
  res.status(204).end();
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

async function generateDocxBuffer(document) {
  const sourceBuffer = await fs.readFile(path.join(templatesDir, document.template.sourceDocx));
  return fillDocx(sourceBuffer, document.template, document.fieldsData || {}, { resolveImagePath });
}

router.post('/:id/generate', async (req, res) => {
  const document = await prisma.document.findFirst({
    where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: null },
    include: { template: true },
  });
  if (!document) return res.status(404).json({ error: 'Document not found' });

  let buffer;
  try {
    buffer = await generateDocxBuffer(document);
  } catch (err) {
    console.error('Failed to generate document', err);
    return res.status(500).json({ error: 'Failed to generate document' });
  }

  await prisma.$transaction([
    prisma.documentVersion.create({ data: { documentId: document.id, fieldsData: document.fieldsData } }),
    prisma.document.update({ where: { id: document.id }, data: { exportedAt: new Date() } }),
  ]);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(document.title)}.docx"`);
  res.send(buffer);
});

router.post('/:id/pdf', async (req, res) => {
  const document = await prisma.document.findFirst({
    where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: null },
    include: { template: true },
  });
  if (!document) return res.status(404).json({ error: 'Document not found' });

  let docxBuffer;
  try {
    docxBuffer = await generateDocxBuffer(document);
  } catch (err) {
    console.error('Failed to generate document for PDF conversion', err);
    return res.status(500).json({ error: 'Failed to generate document' });
  }

  let pdfBuffer;
  try {
    pdfBuffer = await convertDocxToPdf(docxBuffer);
  } catch (err) {
    console.error('PDF conversion failed', err);
    return res.status(503).json({ error: 'PDF export is not available on this server right now.' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(document.title)}.pdf"`);
  res.send(pdfBuffer);
});

router.get('/:id/versions', async (req, res) => {
  const document = await prisma.document.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: null } });
  if (!document) return res.status(404).json({ error: 'Document not found' });
  const versions = await prisma.documentVersion.findMany({
    where: { documentId: document.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true },
  });
  res.json({ versions });
});

router.get('/:id/versions/:versionId/download', async (req, res) => {
  const document = await prisma.document.findFirst({
    where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: null },
    include: { template: true },
  });
  if (!document) return res.status(404).json({ error: 'Document not found' });
  const version = await prisma.documentVersion.findFirst({ where: { id: req.params.versionId, documentId: document.id } });
  if (!version) return res.status(404).json({ error: 'Version not found' });

  let buffer;
  try {
    buffer = await fillDocx(
      await fs.readFile(path.join(templatesDir, document.template.sourceDocx)),
      document.template,
      version.fieldsData || {},
      { resolveImagePath },
    );
  } catch (err) {
    console.error('Failed to regenerate document version', err);
    return res.status(500).json({ error: 'Failed to regenerate document' });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(document.title)}.docx"`);
  res.send(buffer);
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
