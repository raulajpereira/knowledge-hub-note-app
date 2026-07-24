import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const PRIORITIES = ['Low', 'Medium', 'High'];
const STATUSES = ['todo', 'in_progress', 'done'];
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
  const trashed = req.query.trashed === 'true';
  const tasks = await prisma.task.findMany({
    where: { userId: req.effectiveUserId, deletedAt: trashed ? { not: null } : null },
    orderBy: trashed ? { deletedAt: 'desc' } : [{ done: 'asc' }, { updatedAt: 'desc' }],
  });
  res.json({ tasks });
});

router.post('/', async (req, res) => {
  const { title, priority, due, project, notes, recurrence } = req.body || {};
  const task = await prisma.task.create({
    data: {
      userId: req.effectiveUserId,
      title: title?.trim() || 'New task',
      priority: PRIORITIES.includes(priority) ? priority : 'Medium',
      due: due || null,
      project: project || null,
      notes: notes || null,
      recurrence: RECURRENCES.includes(recurrence) ? recurrence : null,
    },
  });
  res.status(201).json({ task });
});

router.patch('/:id', async (req, res) => {
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: null } });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { title, done, status, priority, due, project, notes, favorite, recurrence } = req.body || {};
  const data = {};
  if (title !== undefined) data.title = title.trim() || 'New task';
  if (favorite !== undefined) data.favorite = !!favorite;
  if (done !== undefined) {
    data.done = !!done;
    data.status = data.done ? 'done' : 'todo';
  }
  if (status !== undefined && STATUSES.includes(status)) {
    data.status = status;
    data.done = status === 'done';
  }
  if (priority !== undefined) {
    if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Invalid priority' });
    data.priority = priority;
  }
  if (due !== undefined) data.due = due || null;
  if (project !== undefined) data.project = project || null;
  if (notes !== undefined) data.notes = notes || null;
  if (recurrence !== undefined) data.recurrence = RECURRENCES.includes(recurrence) ? recurrence : null;

  const becameDone = data.done === true && !task.done;
  const updated = await prisma.task.update({ where: { id: task.id }, data });

  let nextTask = null;
  if (becameDone && updated.recurrence && updated.due) {
    const due = nextDueDate(updated.due, updated.recurrence);
    if (due) {
      nextTask = await prisma.task.create({
        data: {
          userId: req.effectiveUserId,
          title: updated.title,
          priority: updated.priority,
          due,
          project: updated.project,
          notes: updated.notes,
          recurrence: updated.recurrence,
        },
      });
    }
  }

  res.json({ task: updated, nextTask });
});

// Soft delete (move to trash)
router.post('/:id/trash', async (req, res) => {
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: null } });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const updated = await prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
  res.json({ task: updated });
});

router.post('/:id/restore', async (req, res) => {
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId, deletedAt: { not: null } } });
  if (!task) return res.status(404).json({ error: 'Task not found in trash' });
  const updated = await prisma.task.update({ where: { id: task.id }, data: { deletedAt: null } });
  res.json({ task: updated });
});

// Permanent delete
router.delete('/:id', async (req, res) => {
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  await prisma.task.delete({ where: { id: task.id } });
  res.status(204).end();
});

export default router;
