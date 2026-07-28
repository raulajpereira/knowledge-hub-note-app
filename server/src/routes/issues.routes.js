import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { callProvider } from '../lib/aiProvider.js';

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

const REPORT_SYSTEM_PROMPT =
  'Escreve um relatório de estado profissional em português, para partilhar com um cliente, com base nos issues, notas e ' +
  'código fornecidos. Estrutura com estes títulos: "Resumo", "Progresso", "Bloqueios / À espera de", "Próximos passos". ' +
  'Sê conciso e factual — usa apenas a informação fornecida, não inventes datas nem nomes que não estejam no texto.';

router.post('/report', async (req, res) => {
  const { project } = req.body || {};
  const agent = await prisma.agent.findFirst({ where: { userId: req.effectiveUserId, active: true } });
  if (!agent) return res.status(400).json({ error: 'Configura um agente de IA ativo em Definições para usar esta funcionalidade.' });

  const issueWhere = { userId: req.effectiveUserId, ...(project ? { project } : {}) };
  const issues = await prisma.issue.findMany({ where: issueWhere, orderBy: { updatedAt: 'desc' }, take: 60 });
  if (issues.length === 0) return res.status(400).json({ error: 'Não há issues para este projeto.' });

  const keyword = (project || '').toLowerCase();
  const [notes, codeItems] = await Promise.all([
    keyword
      ? prisma.note.findMany({
          where: { userId: req.effectiveUserId, deletedAt: null, OR: [{ title: { contains: project } }, { content: { contains: project } }] },
          select: { title: true, content: true },
          take: 15,
        })
      : Promise.resolve([]),
    keyword
      ? prisma.codeItem.findMany({
          where: { userId: req.effectiveUserId, OR: [{ name: { contains: project } }, { content: { contains: project } }] },
          select: { name: true },
          take: 15,
        })
      : Promise.resolve([]),
  ]);

  const issuesText = issues
    .map((i) => `- [${i.status}/${i.priority}] ${i.title}${i.due ? ` (prazo ${i.due})` : ''}${i.waitingOn ? ` — à espera de: ${i.waitingOn}` : ''}${i.description ? `\n  ${i.description}` : ''}`)
    .join('\n');
  const notesText = notes.map((n) => `- ${n.title}: ${(n.content || '').replace(/<[^>]+>/g, ' ').slice(0, 300)}`).join('\n');
  const codeText = codeItems.map((c) => `- ${c.name}`).join('\n');

  const userContent =
    `Projeto: ${project || '(todos os projetos)'}\n\nISSUES:\n${issuesText}` +
    (notesText ? `\n\nNOTAS RELACIONADAS:\n${notesText}` : '') +
    (codeText ? `\n\nCÓDIGO RELACIONADO:\n${codeText}` : '');

  try {
    const report = await callProvider(agent, [{ role: 'user', content: userContent }], { systemPrompt: REPORT_SYSTEM_PROMPT, maxTokens: 1200 });
    res.json({ report });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Não foi possível gerar o relatório.' });
  }
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
