import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.join(__dirname, '..', '..', 'uploads');

const ACCENT_COLORS = ['purple', 'blue', 'green', 'yellow', 'pink', 'orange', 'red', 'teal'];
const SIDEBAR_KEYS = new Set([
  'home', 'notes', 'voice', 'tasks', 'tags', 'passwords', 'issues',
  'artifacts', 'codeLibrary', 'calendar', 'graph', 'sapNews',
]);

function makeUpload(subdir) {
  const storage = multer.diskStorage({
    destination: path.join(uploadsRoot, subdir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `${req.userId}-${crypto.randomUUID()}${ext}`);
    },
  });
  return multer({
    storage,
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.mimetype)) {
        return cb(new Error('Only PNG, JPG, WEBP or SVG images are allowed'));
      }
      cb(null, true);
    },
  });
}

const uploadLogo = makeUpload('logos');
const uploadAvatar = makeUpload('avatars');

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const settings = await prisma.settings.upsert({
    where: { userId: req.userId },
    update: {},
    create: { userId: req.userId },
  });
  res.json({ settings });
});

const FONT_FAMILIES = ['inter', 'grotesk', 'system', 'serif', 'mono'];
const LANGUAGES = ['pt', 'en'];

router.patch('/', async (req, res) => {
  const { theme, accentColor, accentHue, fontFamily, language, vaultAutoLockSeconds, issueStatuses, trashRetentionDays, sidebarLayout } = req.body || {};
  const data = {};
  if (theme !== undefined) {
    if (!['dark', 'light'].includes(theme)) return res.status(400).json({ error: 'Invalid theme' });
    data.theme = theme;
  }
  if (accentColor !== undefined) {
    if (!ACCENT_COLORS.includes(accentColor)) return res.status(400).json({ error: 'Invalid accent color' });
    data.accentColor = accentColor;
  }
  if (accentHue !== undefined) {
    const n = Number(accentHue);
    if (accentHue !== null && (!Number.isFinite(n) || n < 0 || n > 360)) {
      return res.status(400).json({ error: 'accentHue must be a number between 0 and 360' });
    }
    data.accentHue = accentHue === null ? null : Math.round(n);
  }
  if (fontFamily !== undefined) {
    if (fontFamily !== null && !FONT_FAMILIES.includes(fontFamily)) return res.status(400).json({ error: 'Invalid fontFamily' });
    data.fontFamily = fontFamily;
  }
  if (language !== undefined) {
    if (!LANGUAGES.includes(language)) return res.status(400).json({ error: 'Invalid language' });
    data.language = language;
  }
  if (vaultAutoLockSeconds !== undefined) {
    const n = Number(vaultAutoLockSeconds);
    if (!Number.isInteger(n) || n < 5 || n > 3600) {
      return res.status(400).json({ error: 'Auto-lock duration must be an integer between 5 and 3600 seconds' });
    }
    data.vaultAutoLockSeconds = n;
  }
  if (issueStatuses !== undefined) {
    const valid =
      Array.isArray(issueStatuses) &&
      issueStatuses.length > 0 &&
      issueStatuses.every((s) => s && typeof s.name === 'string' && s.name.trim() && Number.isFinite(s.hue));
    if (!valid) return res.status(400).json({ error: 'issueStatuses must be a non-empty array of { name, hue }' });
    data.issueStatuses = issueStatuses.map((s) => ({ name: s.name.trim(), hue: s.hue }));
  }
  if (trashRetentionDays !== undefined) {
    const n = Number(trashRetentionDays);
    if (!Number.isInteger(n) || n < 0 || n > 365) {
      return res.status(400).json({ error: 'trashRetentionDays must be an integer between 0 and 365' });
    }
    data.trashRetentionDays = n;
  }
  if (sidebarLayout !== undefined) {
    const valid =
      sidebarLayout === null ||
      (Array.isArray(sidebarLayout) && sidebarLayout.every((s) => s && SIDEBAR_KEYS.has(s.key)));
    if (!valid) return res.status(400).json({ error: 'sidebarLayout must be an array of { key, hidden? } with known keys' });
    data.sidebarLayout = sidebarLayout === null ? null : sidebarLayout.map((s) => ({ key: s.key, hidden: !!s.hidden }));
  }
  const settings = await prisma.settings.upsert({
    where: { userId: req.userId },
    update: data,
    create: { userId: req.userId, ...data },
  });
  res.json({ settings });
});

router.post('/logo', uploadLogo.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const logoUrl = `/uploads/logos/${req.file.filename}`;
  const settings = await prisma.settings.upsert({
    where: { userId: req.userId },
    update: { logoUrl },
    create: { userId: req.userId, logoUrl },
  });
  res.json({ settings });
});

router.delete('/logo', async (req, res) => {
  const settings = await prisma.settings.upsert({
    where: { userId: req.userId },
    update: { logoUrl: null },
    create: { userId: req.userId },
  });
  res.json({ settings });
});

router.post('/avatar', uploadAvatar.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  const settings = await prisma.settings.upsert({
    where: { userId: req.userId },
    update: { avatarUrl },
    create: { userId: req.userId, avatarUrl },
  });
  res.json({ settings });
});

export default router;
