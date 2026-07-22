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

router.patch('/', async (req, res) => {
  const { theme, accentColor } = req.body || {};
  const data = {};
  if (theme !== undefined) {
    if (!['dark', 'light'].includes(theme)) return res.status(400).json({ error: 'Invalid theme' });
    data.theme = theme;
  }
  if (accentColor !== undefined) {
    if (!ACCENT_COLORS.includes(accentColor)) return res.status(400).json({ error: 'Invalid accent color' });
    data.accentColor = accentColor;
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
