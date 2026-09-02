import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireFeature } from '../middleware/auth.js';

const TOPIC_CATEGORIES = ['Decisão', 'Risco', 'Bloqueio', 'Follow-up'];
const TOPIC_STATUSES = ['Aberto', 'Em curso', 'Resolvido'];
const TASK_STATUSES = ['todo', 'in_progress', 'done'];
const TASK_PRIORITIES = ['Low', 'Medium', 'High'];

const personSelect = { id: true, name: true, role: true };
const projectSelect = { id: true, name: true, color: true };

const router = Router();
router.use(requireAuth);
router.use(requireFeature('management'));

async function assertOwnedPerson(userId, personId) {
  if (!personId) return true;
  const person = await prisma.person.findFirst({ where: { id: personId, userId } });
  return !!person;
}

async function assertOwnedProject(userId, projectId) {
  if (!projectId) return true;
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  return !!project;
}

async function assertOwnedTopic(userId, topicId) {
  if (!topicId) return true;
  const topic = await prisma.managementTopic.findFirst({ where: { id: topicId, userId } });
  return !!topic;
}

// ---- People ----------------------------------------------------------

router.get('/people', async (req, res) => {
  const people = await prisma.person.findMany({
    where: { userId: req.effectiveUserId },
    orderBy: [{ archived: 'asc' }, { name: 'asc' }],
  });
  res.json({ people });
});

router.post('/people', async (req, res) => {
  const { name, role, email, phone, weeklyCapacityHours, skills, notes } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const person = await prisma.person.create({
    data: {
      userId: req.effectiveUserId,
      name: name.trim(),
      role: role || null,
      email: email || null,
      phone: phone || null,
      weeklyCapacityHours: weeklyCapacityHours != null ? Number(weeklyCapacityHours) : null,
      skills: Array.isArray(skills) ? skills : [],
      notes: notes || null,
    },
  });
  res.status(201).json({ person });
});

router.patch('/people/:id', async (req, res) => {
  const person = await prisma.person.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!person) return res.status(404).json({ error: 'Person not found' });

  const { name, role, email, phone, weeklyCapacityHours, skills, notes, archived } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = name.trim() || person.name;
  if (role !== undefined) data.role = role || null;
  if (email !== undefined) data.email = email || null;
  if (phone !== undefined) data.phone = phone || null;
  if (weeklyCapacityHours !== undefined) data.weeklyCapacityHours = weeklyCapacityHours != null ? Number(weeklyCapacityHours) : null;
  if (skills !== undefined) data.skills = Array.isArray(skills) ? skills : [];
  if (notes !== undefined) data.notes = notes || null;
  if (archived !== undefined) data.archived = !!archived;

  const updated = await prisma.person.update({ where: { id: person.id }, data });
  res.json({ person: updated });
});

router.delete('/people/:id', async (req, res) => {
  const person = await prisma.person.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!person) return res.status(404).json({ error: 'Person not found' });
  await prisma.person.delete({ where: { id: person.id } });
  res.status(204).end();
});

// ---- Management topics -------------------------------------------------

router.get('/topics', async (req, res) => {
  const topics = await prisma.managementTopic.findMany({
    where: { userId: req.effectiveUserId },
    include: { owner: { select: personSelect }, project: { select: projectSelect } },
    orderBy: [{ createdAt: 'desc' }],
  });
  res.json({ topics });
});

router.post('/topics', async (req, res) => {
  const { title, category, status, ownerId, projectId, due, notes } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  if (!(await assertOwnedPerson(req.effectiveUserId, ownerId))) return res.status(400).json({ error: 'Invalid ownerId' });
  if (!(await assertOwnedProject(req.effectiveUserId, projectId))) return res.status(400).json({ error: 'Invalid projectId' });

  const topic = await prisma.managementTopic.create({
    data: {
      userId: req.effectiveUserId,
      title: title.trim(),
      category: TOPIC_CATEGORIES.includes(category) ? category : TOPIC_CATEGORIES[0],
      status: TOPIC_STATUSES.includes(status) ? status : TOPIC_STATUSES[0],
      ownerId: ownerId || null,
      projectId: projectId || null,
      due: due || null,
      notes: notes || null,
    },
    include: { owner: { select: personSelect }, project: { select: projectSelect } },
  });
  res.status(201).json({ topic });
});

router.patch('/topics/:id', async (req, res) => {
  const topic = await prisma.managementTopic.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!topic) return res.status(404).json({ error: 'Topic not found' });

  const { title, category, status, ownerId, projectId, due, notes } = req.body || {};
  if (ownerId !== undefined && !(await assertOwnedPerson(req.effectiveUserId, ownerId))) return res.status(400).json({ error: 'Invalid ownerId' });
  if (projectId !== undefined && !(await assertOwnedProject(req.effectiveUserId, projectId))) return res.status(400).json({ error: 'Invalid projectId' });

  const data = {};
  if (title !== undefined) data.title = title.trim() || topic.title;
  if (category !== undefined) data.category = TOPIC_CATEGORIES.includes(category) ? category : topic.category;
  if (status !== undefined) data.status = TOPIC_STATUSES.includes(status) ? status : topic.status;
  if (ownerId !== undefined) data.ownerId = ownerId || null;
  if (projectId !== undefined) data.projectId = projectId || null;
  if (due !== undefined) data.due = due || null;
  if (notes !== undefined) data.notes = notes || null;

  const updated = await prisma.managementTopic.update({
    where: { id: topic.id },
    data,
    include: { owner: { select: personSelect }, project: { select: projectSelect } },
  });
  res.json({ topic: updated });
});

router.delete('/topics/:id', async (req, res) => {
  const topic = await prisma.managementTopic.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!topic) return res.status(404).json({ error: 'Topic not found' });
  await prisma.managementTopic.delete({ where: { id: topic.id } });
  res.status(204).end();
});

// ---- Management tasks ----------------------------------------------

router.get('/tasks', async (req, res) => {
  const tasks = await prisma.managementTask.findMany({
    where: { userId: req.effectiveUserId },
    include: { owner: { select: personSelect }, project: { select: projectSelect } },
    orderBy: [{ createdAt: 'desc' }],
  });
  res.json({ tasks });
});

router.post('/tasks', async (req, res) => {
  const { title, status, priority, ownerId, projectId, topicId, due, notes, favorite } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  if (!(await assertOwnedPerson(req.effectiveUserId, ownerId))) return res.status(400).json({ error: 'Invalid ownerId' });
  if (!(await assertOwnedProject(req.effectiveUserId, projectId))) return res.status(400).json({ error: 'Invalid projectId' });
  if (!(await assertOwnedTopic(req.effectiveUserId, topicId))) return res.status(400).json({ error: 'Invalid topicId' });

  const task = await prisma.managementTask.create({
    data: {
      userId: req.effectiveUserId,
      title: title.trim(),
      status: TASK_STATUSES.includes(status) ? status : TASK_STATUSES[0],
      priority: TASK_PRIORITIES.includes(priority) ? priority : TASK_PRIORITIES[1],
      favorite: !!favorite,
      ownerId: ownerId || null,
      projectId: projectId || null,
      topicId: topicId || null,
      due: due || null,
      notes: notes || null,
    },
    include: { owner: { select: personSelect }, project: { select: projectSelect } },
  });
  res.status(201).json({ task });
});

router.patch('/tasks/:id', async (req, res) => {
  const task = await prisma.managementTask.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { title, status, priority, ownerId, projectId, topicId, due, notes, favorite } = req.body || {};
  if (ownerId !== undefined && !(await assertOwnedPerson(req.effectiveUserId, ownerId))) return res.status(400).json({ error: 'Invalid ownerId' });
  if (projectId !== undefined && !(await assertOwnedProject(req.effectiveUserId, projectId))) return res.status(400).json({ error: 'Invalid projectId' });
  if (topicId !== undefined && !(await assertOwnedTopic(req.effectiveUserId, topicId))) return res.status(400).json({ error: 'Invalid topicId' });

  const data = {};
  if (title !== undefined) data.title = title.trim() || task.title;
  if (status !== undefined) data.status = TASK_STATUSES.includes(status) ? status : task.status;
  if (priority !== undefined) data.priority = TASK_PRIORITIES.includes(priority) ? priority : task.priority;
  if (favorite !== undefined) data.favorite = !!favorite;
  if (ownerId !== undefined) data.ownerId = ownerId || null;
  if (projectId !== undefined) data.projectId = projectId || null;
  if (topicId !== undefined) data.topicId = topicId || null;
  if (due !== undefined) data.due = due || null;
  if (notes !== undefined) data.notes = notes || null;

  const updated = await prisma.managementTask.update({
    where: { id: task.id },
    data,
    include: { owner: { select: personSelect }, project: { select: projectSelect } },
  });
  res.json({ task: updated });
});

router.delete('/tasks/:id', async (req, res) => {
  const task = await prisma.managementTask.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  await prisma.managementTask.delete({ where: { id: task.id } });
  res.status(204).end();
});

// ---- Allocations -----------------------------------------------------
// startMonth/endMonth are "YYYY-MM" strings (inclusive); percent is 1-100+
// (allowing >100 lets an overallocation actually show as one on the UI).

router.get('/allocations', async (req, res) => {
  const allocations = await prisma.allocation.findMany({
    where: { userId: req.effectiveUserId },
    include: { person: { select: personSelect }, project: { select: projectSelect } },
    orderBy: [{ startMonth: 'asc' }],
  });
  res.json({ allocations });
});

router.post('/allocations', async (req, res) => {
  const { personId, projectId, startMonth, endMonth, percent, notes } = req.body || {};
  if (!personId?.trim()) return res.status(400).json({ error: 'personId is required' });
  if (!projectId?.trim()) return res.status(400).json({ error: 'projectId is required' });
  if (!/^\d{4}-\d{2}$/.test(startMonth || '') || !/^\d{4}-\d{2}$/.test(endMonth || '')) {
    return res.status(400).json({ error: 'startMonth and endMonth must be "YYYY-MM"' });
  }
  if (!(await assertOwnedPerson(req.effectiveUserId, personId))) return res.status(400).json({ error: 'Invalid personId' });
  if (!(await assertOwnedProject(req.effectiveUserId, projectId))) return res.status(400).json({ error: 'Invalid projectId' });

  const allocation = await prisma.allocation.create({
    data: {
      userId: req.effectiveUserId,
      personId,
      projectId,
      startMonth,
      endMonth: endMonth >= startMonth ? endMonth : startMonth,
      percent: Number.isFinite(Number(percent)) ? Math.max(1, Math.round(Number(percent))) : 100,
      notes: notes || null,
    },
    include: { person: { select: personSelect }, project: { select: projectSelect } },
  });
  res.status(201).json({ allocation });
});

router.patch('/allocations/:id', async (req, res) => {
  const allocation = await prisma.allocation.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!allocation) return res.status(404).json({ error: 'Allocation not found' });

  const { personId, projectId, startMonth, endMonth, percent, notes } = req.body || {};
  if (personId !== undefined && !(await assertOwnedPerson(req.effectiveUserId, personId))) return res.status(400).json({ error: 'Invalid personId' });
  if (projectId !== undefined && !(await assertOwnedProject(req.effectiveUserId, projectId))) return res.status(400).json({ error: 'Invalid projectId' });
  if (startMonth !== undefined && !/^\d{4}-\d{2}$/.test(startMonth || '')) return res.status(400).json({ error: 'startMonth must be "YYYY-MM"' });
  if (endMonth !== undefined && !/^\d{4}-\d{2}$/.test(endMonth || '')) return res.status(400).json({ error: 'endMonth must be "YYYY-MM"' });

  const data = {};
  if (personId !== undefined) data.personId = personId;
  if (projectId !== undefined) data.projectId = projectId;
  if (startMonth !== undefined) data.startMonth = startMonth;
  if (endMonth !== undefined) data.endMonth = endMonth;
  if (data.startMonth && data.endMonth && data.endMonth < data.startMonth) data.endMonth = data.startMonth;
  if (percent !== undefined) data.percent = Number.isFinite(Number(percent)) ? Math.max(1, Math.round(Number(percent))) : allocation.percent;
  if (notes !== undefined) data.notes = notes || null;

  const updated = await prisma.allocation.update({
    where: { id: allocation.id },
    data,
    include: { person: { select: personSelect }, project: { select: projectSelect } },
  });
  res.json({ allocation: updated });
});

router.delete('/allocations/:id', async (req, res) => {
  const allocation = await prisma.allocation.findFirst({ where: { id: req.params.id, userId: req.effectiveUserId } });
  if (!allocation) return res.status(404).json({ error: 'Allocation not found' });
  await prisma.allocation.delete({ where: { id: allocation.id } });
  res.status(204).end();
});

export default router;
