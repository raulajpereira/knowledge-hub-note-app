import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

// Deliberately mounted with NO auth middleware — this is the one place in
// the API that's reachable by anyone with the link. It must never accept a
// userId/id lookup (only the unguessable shareToken), and must only ever
// return the handful of fields safe to show a stranger — never userId,
// email, folderId, tags, or anything else that identifies the owner or
// their workspace.
const router = Router();

router.get('/notes/:token', async (req, res) => {
  const note = await prisma.note.findFirst({
    where: { shareToken: req.params.token, deletedAt: null },
    select: { title: true, content: true, blocks: true, updatedAt: true },
  });
  if (!note) return res.status(404).json({ error: 'This shared note was not found, or is no longer shared.' });
  res.json({ note });
});

export default router;
