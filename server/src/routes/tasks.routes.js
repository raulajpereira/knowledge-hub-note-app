import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const PRIORITIES = ['Low', 'Medium', 'High'];

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const tasks = await prisma.task.findMany({
    where: { userId: req.userId },
    orderBy: [{ done: 'asc' }, { updatedAt: 'desc' }],
  });
  res.json({ tasks });
});

router.post('/', async (req, res) => {
  const { title, priority, due, project, notes } = req.body || {};
  const task = await prisma.task.create({
    data: {
      userId: req.userId,
      title: title?.trim() || 'New task',
      priority: PRIORITIES.includes(priority) ? priority : 'Medium',
      due: due || null,
      project: project || null,
      notes: notes || null,
    },
  });
  res.status(201).json({ task });
});

router.patch('/:id', async (req, res) => {
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { title, done, priority, due, project, notes } = req.body || {};
  const data = {};
  if (title !== undefined) data.title = title.trim() || 'New task';
  if (done !== undefined) data.done = !!done;
  if (priority !== undefined) {
    if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Invalid priority' });
    data.priority = priority;
  }
  if (due !== undefined) data.due = due || null;
  if (project !== undefined) data.project = project || null;
  if (notes !== undefined) data.notes = notes || null;

  const updated = await prisma.task.update({ where: { id: task.id }, data });
  res.json({ task: updated });
});

router.delete('/:id', async (req, res) => {
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  await prisma.task.delete({ where: { id: task.id } });
  res.status(204).end();
});

export default router;
