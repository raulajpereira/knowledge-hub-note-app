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

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function isImageAttachment(att) {
  if (att.attachMimeTag) return /^image\//i.test(att.attachMimeTag);
  return /\.(png|jpe?g|gif|bmp|webp)$/i.test(att.extension || att.fileName || '');
}

// Outlook references an inline image from the HTML body as `cid:<contentId>`
// (angle brackets on the id itself are optional depending on how the message
// was authored). Rewriting these to the saved attachment's URL is what makes
// the image render inline instead of only being reachable as a download.
function inlineCidIntoHtml(html, contentId, url) {
  const cid = contentId.replace(/^<|>$/g, '');
  if (!cid) return { html, matched: false };
  const pattern = new RegExp(`cid:${escapeRegExp(cid)}`, 'gi');
  if (!pattern.test(html)) return { html, matched: false };
  return { html: html.replace(pattern, url), matched: true };
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
      fileName: true, fileSize: true, favorite: true, attachments: true, createdAt: true, folderId: true,
    },
  });
  res.json({ emails });
});

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum ficheiro enviado' });

  let folderId = null;
  if (req.body?.folderId) {
    const folder = await prisma.emailFolder.findFirst({ where: { id: req.body.folderId, userId: req.effectiveUserId } });
    if (folder) folderId = folder.id;
  }

  try {
    const buffer = await readFile(req.file.path);
    const reader = new MsgReader(buffer);
    const data = reader.getFileData();
    if (data.error) throw new Error(data.error);

    // Outlook stores an inline image (one referenced by the HTML body via
    // `cid:...`) as a regular attachment with a PidTagAttachContentId, same
    // as any other attachment — the only way to tell them apart is whether
    // that content id is actually referenced in the body. Those get spliced
    // into bodyHtml and dropped from the downloadable attachments list;
    // anything else (including a pidContentId that isn't actually used in
    // the body) stays a normal attachment.
    let bodyHtml = data.bodyHtml || null;
    const attachments = [];
    // Hidden images (PidTagAttachmentHidden) that couldn't be cid-matched
    // into an HTML body — e.g. a Rich Text format message, which has no
    // HTML/cid to match against at all. Outlook doesn't list these as
    // attachments either, so instead of dropping them (losing the picture
    // entirely) they get appended to the body below, after the loop.
    const strayInlineImages = [];
    for (const att of data.attachments || []) {
      try {
        const extracted = reader.getAttachment(att);
        const safeName = (extracted.fileName || att.fileName || 'anexo').replace(/[/\\]/g, '_');
        const savedName = `${req.effectiveUserId}-${crypto.randomUUID()}-${safeName}`;
        await writeFile(path.join(attachmentDir, savedName), Buffer.from(extracted.content));
        const url = `/uploads/email-attachments/${savedName}`;

        let inlined = false;
        if (bodyHtml && att.pidContentId) {
          const result = inlineCidIntoHtml(bodyHtml, att.pidContentId, url);
          if (result.matched) {
            bodyHtml = result.html;
            inlined = true;
          }
        }
        if (!inlined && att.attachmentHidden && isImageAttachment(att)) {
          strayInlineImages.push(url);
        } else if (!inlined) {
          attachments.push({ name: safeName, size: extracted.content.length, url });
        }
      } catch {
        // Skip attachments that fail to extract rather than failing the whole import.
      }
    }

    if (strayInlineImages.length) {
      const imgTags = strayInlineImages.map((url) => `<img src="${url}" style="max-width:100%;" />`).join('<br/>');
      if (bodyHtml) {
        bodyHtml = /<\/body>/i.test(bodyHtml) ? bodyHtml.replace(/<\/body>/i, `${imgTags}</body>`) : `${bodyHtml}${imgTags}`;
      } else {
        const textHtml = data.body ? `<pre style="white-space:pre-wrap;font-family:inherit;margin:0;">${escapeHtml(data.body)}</pre>` : '';
        bodyHtml = `${textHtml}${imgTags}`;
      }
    }

    // PidTagXEmailAddress can hold an unreadable Exchange DN (e.g.
    // "/o=ExchangeLabs/ou=.../cn=...") instead of a real address when the
    // message came from an on-prem/Exchange sender — the SMTP-specific
    // property is the one that reliably holds a readable address in that case.
    const recipients = data.recipients || [];
    const toRecipients = recipients.filter((r) => !r.recipType || r.recipType === 'to').map((r) => ({ name: r.name || null, email: r.smtpAddress || r.email || null }));
    const ccRecipients = recipients.filter((r) => r.recipType === 'cc').map((r) => ({ name: r.name || null, email: r.smtpAddress || r.email || null }));
    const sentAtSource = data.messageDeliveryTime || data.clientSubmitTime || null;

    const email = await prisma.email.create({
      data: {
        userId: req.effectiveUserId,
        folderId,
        subject: data.subject?.trim() || '(sem assunto)',
        fromName: data.senderName || null,
        fromAddress: data.senderSmtpAddress || data.senderEmail || null,
        toRecipients,
        ccRecipients,
        sentAt: sentAtSource ? new Date(sentAtSource) : null,
        bodyHtml,
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
  const { favorite, folderId } = req.body || {};
  const data = {};
  if (favorite !== undefined) data.favorite = !!favorite;
  if (folderId !== undefined) {
    if (folderId === null) {
      data.folderId = null;
    } else {
      const folder = await prisma.emailFolder.findFirst({ where: { id: folderId, userId: req.effectiveUserId } });
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
      data.folderId = folder.id;
    }
  }
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
