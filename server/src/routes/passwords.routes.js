import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

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

export default router;
