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
    if (payload.purpose) {
      // A single-purpose token (e.g. the 2FA pending token) — never valid as
      // a normal bearer credential.
      res.status(401).json({ error: 'Invalid or expired token' });
      return null;
    }
    // Older tokens signed before session tracking existed carry no jti —
    // they're grandfathered in without a Session row rather than forced to
    // log out on deploy.
    if (payload.jti) {
      const session = await prisma.session.findUnique({ where: { jti: payload.jti } });
      if (!session || session.revokedAt) {
        res.status(401).json({ error: 'Session revoked' });
        return null;
      }
      prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { teamOwnerId: true, role: true, status: true, name: true, email: true, enabledFeatures: true } });
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return null;
    }
    req.userId = payload.sub;
    req.userRole = user.role;
    req.userStatus = user.status;
    req.userName = user.name;
    req.userEmail = user.email;
    // null means "every feature" — grandfathers accounts that predate this
    // system, and super_admin is always exempt regardless of this value.
    req.userEnabledFeatures = Array.isArray(user.enabledFeatures) ? user.enabledFeatures : null;
    req.sessionJti = payload.jti || null;
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

export async function requireSuperAdmin(req, res, next) {
  if (req.userRole !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
}

// Blocks a whole route file's worth of endpoints for accounts that don't
// have this feature enabled (see lib/features.js for the key catalog).
// super_admin is always exempt; every other account defaults to full access
// (req.userEnabledFeatures === null) unless an admin explicitly narrowed it.
export function requireFeature(key) {
  return (req, res, next) => {
    if (req.userRole === 'super_admin') return next();
    if (req.userEnabledFeatures && !req.userEnabledFeatures.includes(key)) {
      return res.status(403).json({ error: 'This feature is not enabled for your account', code: 'FEATURE_DISABLED', feature: key });
    }
    next();
  };
}
