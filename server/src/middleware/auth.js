import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

// req.userId is always the real, logged-in account (used for identity, own
// login/password, Passwords vault, Agent tokens). req.effectiveUserId is
// whose *workspace data* (Notes, Tasks, Tags, Voice, Folders, Issues,
// Artifacts) to read/write — the team owner's, if this account was invited
// onto a team, otherwise the same as req.userId. Passwords/Agents/own
// login deliberately never use effectiveUserId — those aren't shared.
async function authenticate(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { teamOwnerId: true, role: true, status: true } });
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return null;
    }
    req.userId = payload.sub;
    req.userRole = user.role;
    req.userStatus = user.status;
    req.effectiveUserId = user.teamOwnerId || req.userId;
    return user;
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }
}

export async function requireAuth(req, res, next) {
  const user = await authenticate(req, res);
  if (!user) return;
  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'Account suspended', code: 'ACCOUNT_SUSPENDED' });
  }
  next();
}

// Used only by GET /auth/me — a suspended account still needs to fetch its
// own identity/status so the client can show the "account suspended" screen
// instead of silently failing.
export async function requireAuthAllowSuspended(req, res, next) {
  const user = await authenticate(req, res);
  if (!user) return;
  next();
}

export async function requireAdmin(req, res, next) {
  if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
