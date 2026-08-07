import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import MsgReaderPkg from '@kenjiuno/msgreader';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireFeature } from '../middleware/auth.js';

// Node's CJS/ESM interop double-wraps this package's TS-compiled default
// export (module.exports.default is itself an object with its own
// .default holding the actual class) — importing it directly gives an
// object, not a constructor.
const MsgReader = MsgReaderPkg.default;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const emailDir = path.join(__dirname, '..', '..', 'uploads', 'emails');
const attachmentDir = path.join(__dirname, '..', '..', 'uploads', 'email-attachments');

const upload = multer({
  storage: multer.diskStorage({
    destination: emailDir,
    filename: (req, file, cb) => cb(null, `${req.effectiveUserId}-${crypto.randomUUID()}.msg`),
  }),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/\.msg$/i.test(file.originalname)) return cb(new Error('Só são aceites ficheiros .msg do Outlook'));
    cb(null, true);
  },
});

function diskPathFromUrl(url) {
  return path.join(__dirname, '..', '..', url.replace(/^\//, ''));
}

const router = Router();
router.use(requireAuth);
router.use(requireFeature('emails'));

router.get('/', async (req, res) => {
  const emails = await prisma.email.findMany({
    where: { userId: req.effectiveUserId },
    orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true, subject: true, fromName: true, fromAddress: true, sentAt: true,
      fileName: true, fileSize: true, favorite: true, attachments: true, createdAt: true,
    },
  });
  res.json({ emails });
});

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro enviado' });

  try {
    const buffer = await readFile(req.file.path);
    const reader = new MsgReader(buffer);
    const data = reader.getFileData();
    if (data.error) throw new Error(data.error);

    const attachments = [];
    for (const att of data.attachments || []) {
      try {
        const extracted = reader.getAttachment(att);
        const safeName = (extracted.fileName || att.fileName || 'anexo').replace(/[/\\]/g, '_');
        const savedName = `${req.effectiveUserId}-${crypto.randomUUID()}-${safeName}`;
        await writeFile(path.join(attachmentDir, savedName), Buffer.from(extracted.content));
        attachments.push({ name: safeName, size: extracted.content.length, url: `/uploads/email-attachments/${savedName}` });
      } catch {
        // Skip attachments that fail to extract rather than failing the whole import.
      }
    }

    const recipients = data.recipients || [];
    const toRecipients = recipients.filter((r) => !r.recipType || r.recipType === 'to').map((r) => ({ name: r.name || null, email: r.email || r.smtpAddress || null }));
    const ccRecipients = recipients.filter((r) => r.recipType === 'cc').map((r) => ({ name: r.name || null, email: r.email || r.smtpAddress || null }));
    const sentAtSource = data.messageDeliveryTime || data.clientSubmitTime || null;

    const email = await prisma.email.create({
      data: {
        userId: req.effectiveUserId,
        subject: data.subject?.trim() || '(sem assunto)',
        fromName: data.senderName || null,
        fromAddress: data.senderEmail || null,
        toRecipients,
        ccRecipients,
        sentAt: sentAtSource ? new Date(sentAtSource) : null,
        bodyHtml: data.bodyHtml || null,
        bodyText: data.body || null,
        fileUrl: `/uploads/emails/${req.file.filename}`,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        attachments,
      },
    });
    res.status(201).json({ email });
  } catch (err) {
    await unlink(req.file.path).catch(() => {});
    res.status(400).json({ error: err.message || 'Não foi possível ler este ficheiro .msg' });
  }
});

router.get('/:id', async (req, res) => {
  const email = await prisma.email.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!email) return res.status(404).json({ error: 'Email not found' });
  res.json({ email });
});

router.patch('/:id', async (req, res) => {
  const email = await prisma.email.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!email) return res.status(404).json({ error: 'Email not found' });
  const { favorite } = req.body || {};
  const data = {};
  if (favorite !== undefined) data.favorite = !!favorite;
  const updated = await prisma.email.update({ where: { id: email.id }, data });
  res.json({ email: updated });
});

router.delete('/:id', async (req, res) => {
  const email = await prisma.email.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!email) return res.status(404).json({ error: 'Email not found' });
  await prisma.email.delete({ where: { id: email.id } });
  await unlink(diskPathFromUrl(email.fileUrl)).catch(() => {});
  for (const att of email.attachments || []) {
    await unlink(diskPathFromUrl(att.url)).catch(() => {});
  }
  res.status(204).end();
});

export default router;
