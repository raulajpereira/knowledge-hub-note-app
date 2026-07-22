import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const STATUSES = ['Open', 'In Progress', 'Waiting', 'Done'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const issues = await prisma.issue.findMany({
    where: { userId: req.userId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ issues });
});

router.post('/', async (req, res) => {
  const { title, description, priority, project, due, waitingOn, notes } = req.body || {};
  const issue = await prisma.issue.create({
    data: {
      userId: req.userId,
      title: title?.trim() || 'New issue',
      description: description || null,
      priority: PRIORITIES.includes(priority) ? priority : 'Medium',
      project: project || null,
      due: due || null,
      waitingOn: waitingOn || null,
      notes: notes || null,
    },
  });
  res.status(201).json({ issue });
});

router.patch('/:id', async (req, res) => {
  const issue = await prisma.issue.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!issue) return res.status(404).json({ error: 'Issue not found' });

  const { title, description, status, priority, project, due, waitingOn, notes } = req.body || {};
  const data = {};
  if (title !== undefined) data.title = title.trim() || 'New issue';
  if (description !== undefined) data.description = description || null;
  if (status !== undefined) {
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    data.status = status;
    data.completedAt = status === 'Done' ? new Date() : null;
  }
  if (priority !== undefined) {
    if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Invalid priority' });
    data.priority = priority;
  }
  if (project !== undefined) data.project = project || null;
  if (due !== undefined) data.due = due || null;
  if (waitingOn !== undefined) data.waitingOn = waitingOn || null;
  if (notes !== undefined) data.notes = notes || null;

  const updated = await prisma.issue.update({ where: { id: issue.id }, data });
  res.json({ issue: updated });
});

router.delete('/:id', async (req, res) => {
  const issue = await prisma.issue.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  await prisma.issue.delete({ where: { id: issue.id } });
  res.status(204).end();
});

export default router;
