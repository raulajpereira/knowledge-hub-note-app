import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireFeature } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', '..', 'uploads', 'password-icons');

const uploadIcon = multer({
  storage: multer.diskStorage({
    destination: iconsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `${req.userId}-${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.mimetype)) {
      return cb(new Error('Only PNG, JPG, WEBP or SVG images are allowed'));
    }
    cb(null, true);
  },
});

const router = Router();
router.use(requireAuth);
router.use(requireFeature('passwords'));

// The server never sees a vault password, recovery key, or master key.
// It only stores opaque ciphertext blobs produced by the browser (Web Crypto).

router.get('/vault-info', async (req, res) => {
  const settings = await prisma.settings.findUnique({ where: { userId: req.userId } });
  if (!settings || !settings.vaultWrappedKey) {
    return res.json({ hasVault: false });
  }
  res.json({
    hasVault: true,
    salt: settings.vaultSalt,
    wrappedKey: settings.vaultWrappedKey,
    recoveryWrappedKey: settings.vaultRecoveryWrappedKey,
    iterations: settings.vaultKdfIterations,
  });
});

router.post('/setup', async (req, res) => {
  const { salt, wrappedKey, recoveryWrappedKey, iterations } = req.body || {};
  if (!salt || !wrappedKey || !recoveryWrappedKey || !iterations) {
    return res.status(400).json({ error: 'salt, wrappedKey, recoveryWrappedKey and iterations are required' });
  }

  const existing = await prisma.settings.findUnique({ where: { userId: req.userId } });
  if (existing?.vaultWrappedKey) {
    return res.status(409).json({ error: 'Vault is already set up' });
  }

  await prisma.settings.upsert({
    where: { userId: req.userId },
    update: { vaultSalt: salt, vaultWrappedKey: wrappedKey, vaultRecoveryWrappedKey: recoveryWrappedKey, vaultKdfIterations: iterations },
    create: { userId: req.userId, vaultSalt: salt, vaultWrappedKey: wrappedKey, vaultRecoveryWrappedKey: recoveryWrappedKey, vaultKdfIterations: iterations },
  });
  res.status(201).json({ ok: true });
});

// Re-wrap the same master key under a new password (used both for a normal
// password change and after a successful recovery-key unlock). The client
// proves it already holds the master key simply by being able to produce a
// new wrappedKey blob for it — the server cannot verify this cryptographically
// and doesn't need to, since it can never decrypt anything either way.
router.post('/rewrap', async (req, res) => {
  const { salt, wrappedKey, recoveryWrappedKey, iterations } = req.body || {};
  if (!salt || !wrappedKey || !iterations) {
    return res.status(400).json({ error: 'salt, wrappedKey and iterations are required' });
  }
  const data = { vaultSalt: salt, vaultWrappedKey: wrappedKey, vaultKdfIterations: iterations };
  if (recoveryWrappedKey) data.vaultRecoveryWrappedKey = recoveryWrappedKey;

  await prisma.settings.update({ where: { userId: req.userId }, data });
  res.json({ ok: true });
});

router.get('/', async (req, res) => {
  const entries = await prisma.passwordEntry.findMany({
    where: { userId: req.userId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ entries });
});

router.post('/', async (req, res) => {
  const { envelope } = req.body || {};
  if (!envelope) return res.status(400).json({ error: 'envelope is required' });
  const entry = await prisma.passwordEntry.create({ data: { userId: req.userId, envelope } });
  res.status(201).json({ entry });
});

router.patch('/:id', async (req, res) => {
  const entry = await prisma.passwordEntry.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  const { envelope } = req.body || {};
  if (!envelope) return res.status(400).json({ error: 'envelope is required' });
  const updated = await prisma.passwordEntry.update({ where: { id: entry.id }, data: { envelope } });
  res.json({ entry: updated });
});

router.delete('/:id', async (req, res) => {
  const entry = await prisma.passwordEntry.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  await prisma.passwordEntry.delete({ where: { id: entry.id } });
  res.status(204).end();
});

// Custom icon overrides the auto site favicon — this is the only entry field
// that isn't part of the encrypted envelope, since it's just a decorative image.
router.post('/:id/icon', uploadIcon.single('icon'), async (req, res) => {
  const entry = await prisma.passwordEntry.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const iconUrl = `/uploads/password-icons/${req.file.filename}`;
  const updated = await prisma.passwordEntry.update({ where: { id: entry.id }, data: { iconUrl } });
  res.json({ entry: updated });
});

router.delete('/:id/icon', async (req, res) => {
  const entry = await prisma.passwordEntry.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  const updated = await prisma.passwordEntry.update({ where: { id: entry.id }, data: { iconUrl: null } });
  res.json({ entry: updated });
});

export default router;
