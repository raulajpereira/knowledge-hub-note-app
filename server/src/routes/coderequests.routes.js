import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { FEATURE_KEYS, normalizeFeatureList } from '../lib/features.js';

const RATE_LIMIT_MS = 24 * 60 * 60 * 1000;
const MAX_NAME_LEN = 200;
const MAX_AREA_LEN = 200;
const MAX_REASON_LEN = 2000;

function generateInviteCode() {
  return crypto.randomBytes(6).toString('base64url').toUpperCase();
}

const router = Router();

// Public: the "Request a code" form on the Login page. No auth — anyone
// can reach this, so keep it cheap to abuse-check (one request per email
// per day) and cap every field length before it ever touches the DB.
router.post('/', async (req, res) => {
  const { name, email, professionalArea, reason } = req.body || {};
  if (!name?.trim() || !email?.trim() || !reason?.trim()) {
    return res.status(400).json({ error: 'name, email and reason are required' });
  }
  if (name.trim().length > MAX_NAME_LEN || (professionalArea && professionalArea.length > MAX_AREA_LEN) || reason.trim().length > MAX_REASON_LEN) {
    return res.status(400).json({ error: 'One of the fields is too long' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const recent = await prisma.codeRequest.findFirst({
    where: { email: normalizedEmail, createdAt: { gt: new Date(Date.now() - RATE_LIMIT_MS) } },
  });
  if (recent) {
    return res.status(429).json({ error: 'A request from this email was already submitted in the last 24 hours', code: 'RATE_LIMITED' });
  }

  await prisma.codeRequest.create({
    data: {
      name: name.trim(),
      email: normalizedEmail,
      professionalArea: professionalArea?.trim() || null,
      reason: reason.trim(),
    },
  });
  res.status(201).json({ ok: true });
});

// Everything past this point is super_admin-only account provisioning —
// deliberately not gated by requireFeature like the rest of the app, same
// as the invite-code endpoints it hands off to.
router.use(requireAuth, requireSuperAdmin);

router.get('/', async (req, res) => {
  const requests = await prisma.codeRequest.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: { inviteCode: { select: { id: true, code: true, usedAt: true, revokedAt: true } } },
  });
  res.json({ requests });
});

router.post('/:id/approve', async (req, res) => {
  const request = await prisma.codeRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'pending') return res.status(400).json({ error: 'This request has already been handled' });

  let code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    code = generateInviteCode();
    // eslint-disable-next-line no-await-in-loop
    const clash = await prisma.inviteCode.findUnique({ where: { code } });
    if (!clash) break;
    code = null;
  }
  if (!code) return res.status(500).json({ error: 'Could not generate a unique code, try again' });

  const allowedFeatures = normalizeFeatureList(req.body?.allowedFeatures) ?? FEATURE_KEYS;
  const invite = await prisma.inviteCode.create({ data: { code, createdById: req.userId, allowedFeatures } });
  const updated = await prisma.codeRequest.update({
    where: { id: request.id },
    data: { status: 'approved', inviteCodeId: invite.id, handledAt: new Date() },
    include: { inviteCode: { select: { id: true, code: true, usedAt: true, revokedAt: true } } },
  });
  res.status(201).json({ request: updated });
});

router.post('/:id/reject', async (req, res) => {
  const request = await prisma.codeRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'pending') return res.status(400).json({ error: 'This request has already been handled' });

  const updated = await prisma.codeRequest.update({
    where: { id: request.id },
    data: { status: 'rejected', handledAt: new Date() },
  });
  res.json({ request: updated });
});

router.delete('/:id', async (req, res) => {
  const request = await prisma.codeRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (request.status === 'pending') return res.status(400).json({ error: 'Approve or reject this request before dismissing it' });

  await prisma.codeRequest.delete({ where: { id: request.id } });
  res.status(204).end();
});

export default router;
