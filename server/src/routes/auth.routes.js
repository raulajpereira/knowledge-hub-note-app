import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    isTeamMember: !!user.teamOwnerId,
    settings: user.settings
      ? {
          theme: user.settings.theme,
          accentColor: user.settings.accentColor,
          logoUrl: user.settings.logoUrl,
          avatarUrl: user.settings.avatarUrl,
          vaultAutoLockSeconds: user.settings.vaultAutoLockSeconds,
          issueStatuses: user.settings.issueStatuses,
        }
      : null,
  };
}

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password and name are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name,
      settings: { create: {} },
    },
    include: { settings: true },
  });

  const token = signToken(user.id);
  res.status(201).json({ token, user: publicUser(user) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { settings: true },
  });
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  const token = signToken(user.id);
  res.json({ token, user: publicUser(user) });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    include: { settings: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

router.patch('/me', requireAuth, async (req, res) => {
  const { name } = req.body || {};
  const data = {};
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
    data.name = name.trim();
  }
  const user = await prisma.user.update({
    where: { id: req.userId },
    data,
    include: { settings: true },
  });
  res.json({ user: publicUser(user) });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ ok: true });
});

// Passwords (zero-knowledge ciphertext, useless outside this app) and Agent
// tokens (sensitive) are deliberately excluded from the export.
router.get('/export', requireAuth, async (req, res) => {
  const userId = req.effectiveUserId;
  const [user, notes, folders, tasks, tags, voiceNotes, issues, artifacts] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.note.findMany({ where: { userId } }),
    prisma.folder.findMany({ where: { userId } }),
    prisma.task.findMany({ where: { userId } }),
    prisma.tag.findMany({ where: { userId } }),
    prisma.voiceNote.findMany({ where: { userId } }),
    prisma.issue.findMany({ where: { userId } }),
    prisma.artifact.findMany({ where: { userId } }),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    account: { email: user.email, name: user.name, createdAt: user.createdAt },
    notes,
    folders,
    tasks,
    tags,
    voiceNotes,
    issues,
    artifacts,
  };

  res.setHeader('Content-Disposition', 'attachment; filename="knowledge-hub-export.json"');
  res.json(exportData);
});

// Team members share the inviter's workspace data (Notes/Tasks/Tags/Voice/
// Folders/Issues/Artifacts) via req.effectiveUserId, but keep their own
// login, Passwords vault and Agent tokens — see middleware/auth.js.
router.get('/team', requireAuth, async (req, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.userId } });
  const ownerId = me.teamOwnerId || me.id;
  const owner = me.teamOwnerId ? await prisma.user.findUnique({ where: { id: ownerId } }) : me;
  const members = await prisma.user.findMany({ where: { teamOwnerId: ownerId }, orderBy: { createdAt: 'asc' } });
  res.json({
    isOwner: !me.teamOwnerId,
    owner: { id: owner.id, name: owner.name, email: owner.email },
    members: members.map((m) => ({ id: m.id, name: m.name, email: m.email, createdAt: m.createdAt })),
  });
});

router.post('/team/invite', requireAuth, async (req, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.userId } });
  if (me.teamOwnerId) return res.status(403).json({ error: 'Only the team owner can invite members' });

  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const passwordHash = await bcrypt.hash(password, 12);
  const member = await prisma.user.create({
    data: { email: email.toLowerCase(), passwordHash, name, teamOwnerId: me.id, settings: { create: {} } },
  });
  res.status(201).json({ member: { id: member.id, name: member.name, email: member.email, createdAt: member.createdAt } });
});

router.delete('/team/:memberId', requireAuth, async (req, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.userId } });
  if (me.teamOwnerId) return res.status(403).json({ error: 'Only the team owner can remove members' });

  const member = await prisma.user.findFirst({ where: { id: req.params.memberId, teamOwnerId: me.id } });
  if (!member) return res.status(404).json({ error: 'Team member not found' });

  await prisma.user.delete({ where: { id: member.id } });
  res.status(204).end();
});

export default router;
