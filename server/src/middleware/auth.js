import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

// req.userId is always the real, logged-in account (used for identity, own
// login/password, Passwords vault, Agent tokens). req.effectiveUserId is
// whose *workspace data* (Notes, Tasks, Tags, Voice, Folders, Issues,
// Artifacts) to read/write — the team owner's, if this account was invited
// onto a team, otherwise the same as req.userId. Passwords/Agents/own
// login deliberately never use effectiveUserId — those aren't shared.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { teamOwnerId: true } });
    if (!user) return res.status(401).json({ error: 'Invalid or expired token' });
    req.effectiveUserId = user.teamOwnerId || req.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
