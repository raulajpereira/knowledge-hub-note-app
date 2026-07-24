import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const RECURRENCES = ['daily', 'weekly', 'monthly'];

function nextDueDate(dueStr, recurrence) {
  const d = new Date(`${dueStr}T00:00:00`);
  if (recurrence === 'daily') d.setDate(d.getDate() + 1);
  else if (recurrence === 'weekly') d.setDate(d.getDate() + 7);
  else if (recurrence === 'monthly') d.setMonth(d.getMonth() + 1);
  else return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const issues = await prisma.issue.findMany({
    where: { userId: req.effectiveUserId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ issues });
});

router.post('/', async (req, res) => {
  const { title, description, status, priority, project, due, waitingOn, notes, recurrence } = req.body || {};
  const data = {
    userId: req.effectiveUserId,
    title: title?.trim() || 'New issue',
    description: description || null,
    priority: PRIORITIES.includes(priority) ? priority : 'Medium',
    project: project || null,
    due: due || null,
    waitingOn: waitingOn || null,
    notes: notes || null,
    recurrence: RECURRENCES.includes(recurrence) ? recurrence : null,
  };
  if (typeof status === 'string' && status.trim()) data.status = status.trim();
  const issue = await prisma.issue.create({ data });
  res.status(201).json({ issue });
});

router.patch('/:id', async (req, res) => {
  const issue = await prisma.issue.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!issue) return res.status(404).json({ error: 'Issue not found' });

  const { title, description, status, priority, project, due, waitingOn, notes, favorite, recurrence } = req.body || {};
  const data = {};
  if (title !== undefined) data.title = title.trim() || 'New issue';
  if (description !== undefined) data.description = description || null;
  if (favorite !== undefined) data.favorite = !!favorite;
  if (status !== undefined) {
    if (typeof status !== 'string' || !status.trim()) return res.status(400).json({ error: 'Invalid status' });
    data.status = status.trim();
    data.completedAt = status.trim() === 'Done' ? new Date() : null;
  }
  if (priority !== undefined) {
    if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Invalid priority' });
    data.priority = priority;
  }
  if (project !== undefined) data.project = project || null;
  if (due !== undefined) data.due = due || null;
  if (waitingOn !== undefined) data.waitingOn = waitingOn || null;
  if (notes !== undefined) data.notes = notes || null;
  if (recurrence !== undefined) data.recurrence = RECURRENCES.includes(recurrence) ? recurrence : null;

  const becameDone = data.status === 'Done' && issue.status !== 'Done';
  const updated = await prisma.issue.update({ where: { id: issue.id }, data });

  let nextIssue = null;
  if (becameDone && updated.recurrence && updated.due) {
    const due = nextDueDate(updated.due, updated.recurrence);
    if (due) {
      nextIssue = await prisma.issue.create({
        data: {
          userId: req.effectiveUserId,
          title: updated.title,
          description: updated.description,
          priority: updated.priority,
          project: updated.project,
          due,
          waitingOn: updated.waitingOn,
          notes: updated.notes,
          recurrence: updated.recurrence,
        },
      });
    }
  }

  res.json({ issue: updated, nextIssue });
});

router.delete('/:id', async (req, res) => {
  const issue = await prisma.issue.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  await prisma.issue.delete({ where: { id: issue.id } });
  res.status(204).end();
});

export default router;
