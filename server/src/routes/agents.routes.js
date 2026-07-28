import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { encryptSecret } from '../lib/crypto.js';
import { searchWorkspace, buildWorkspaceContext } from '../lib/workspaceSearch.js';
import { modelOptionsFor, defaultModelFor, callProvider } from '../lib/aiProvider.js';

// The user just names an agent and pastes an API key — nothing else. We
// figure out which endpoint and request shape to use from the key's own
// prefix, since every provider mints keys with a distinct one. Anything we
// don't recognize falls back to OpenAI's endpoint (the most common
// OpenAI-compatible shape), same as an unset base URL always did.
const KEY_PROVIDERS = [
  { test: (k) => k.startsWith('sk-ant-'), provider: 'anthropic', baseUrl: null },
  { test: (k) => k.startsWith('gsk_'), provider: 'openai', baseUrl: 'https://api.groq.com/openai/v1' },
  { test: (k) => k.startsWith('sk-or-'), provider: 'openai', baseUrl: 'https://openrouter.ai/api/v1' },
  { test: (k) => k.startsWith('pplx-'), provider: 'openai', baseUrl: 'https://api.perplexity.ai' },
];

function detectFromToken(token) {
  const match = KEY_PROVIDERS.find((p) => p.test(token || ''));
  return match ? { provider: match.provider, baseUrl: match.baseUrl } : { provider: 'openai', baseUrl: null };
}

const router = Router();
router.use(requireAuth);

function toPublic(agent) {
  const { tokenCipher, ...rest } = agent;
  return { ...rest, hasToken: !!tokenCipher, modelOptions: modelOptionsFor(agent) };
}

router.get('/', async (req, res) => {
  const agents = await prisma.agent.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'asc' } });
  res.json({ agents: agents.map(toPublic) });
});

router.post('/', async (req, res) => {
  const { name, token } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!token?.trim()) return res.status(400).json({ error: 'token is required' });

  const { provider, baseUrl } = detectFromToken(token.trim());
  const agent = await prisma.agent.create({
    data: {
      userId: req.userId,
      name: name.trim(),
      provider,
      baseUrl,
      tokenCipher: encryptSecret(token.trim()),
    },
  });
  res.status(201).json({ agent: toPublic(agent) });
});

router.patch('/:id', async (req, res) => {
  const agent = await prisma.agent.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { name, token, active, model } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = name.trim() || agent.name;
  if (token !== undefined && token !== '') {
    const { provider, baseUrl } = detectFromToken(token);
    data.provider = provider;
    data.baseUrl = baseUrl;
    data.tokenCipher = encryptSecret(token);
    data.model = null; // provider changed with the new token — fall back to its default model
  }
  if (active !== undefined) data.active = !!active;
  if (model !== undefined) {
    const options = modelOptionsFor({ ...agent, ...data });
    data.model = options.some((o) => o.id === model) ? model : null;
  }

  const updated = await prisma.agent.update({ where: { id: agent.id }, data });
  res.json({ agent: toPublic(updated) });
});

router.delete('/:id', async (req, res) => {
  const agent = await prisma.agent.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  await prisma.agent.delete({ where: { id: agent.id } });
  res.status(204).end();
});

router.post('/:id/test', async (req, res) => {
  const agent = await prisma.agent.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  try {
    await callProvider(agent, [{ role: 'user', content: 'ping' }]);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/:id/messages', async (req, res) => {
  const agent = await prisma.agent.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const messages = await prisma.agentMessage.findMany({ where: { agentId: agent.id }, orderBy: { createdAt: 'asc' } });
  res.json({ messages });
});

router.delete('/:id/messages', async (req, res) => {
  const agent = await prisma.agent.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  await prisma.agentMessage.deleteMany({ where: { agentId: agent.id } });
  res.status(204).end();
});

router.post('/:id/chat', async (req, res) => {
  const agent = await prisma.agent.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { message } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'message is required' });

  const priorMessages = await prisma.agentMessage.findMany({
    where: { agentId: agent.id },
    orderBy: { createdAt: 'asc' },
    take: 40,
  });

  const userMessage = await prisma.agentMessage.create({
    data: { agentId: agent.id, role: 'user', content: message.trim() },
  });

  const providerMessages = [
    ...priorMessages.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage.content },
  ];

  try {
    const reply = await callProvider(agent, providerMessages);
    const assistantMessage = await prisma.agentMessage.create({
      data: { agentId: agent.id, role: 'assistant', content: reply },
    });
    res.json({ userMessage, assistantMessage });
  } catch (err) {
    res.status(400).json({ error: err.message, userMessage });
  }
});

const WORKSPACE_SYSTEM_PROMPT =
  'Estás a ajudar o utilizador com o conteúdo do seu próprio workspace (notas, snippets de código, issues, tarefas). ' +
  'Abaixo é fornecido o conteúdo mais relevante que foi encontrado. Responde à pergunta com base nesse conteúdo, ' +
  'citando as fontes pelo título entre parênteses (ex: "(Nota: Título)"). Se o conteúdo fornecido não tiver a resposta, ' +
  'diz claramente que não encontraste isso no workspace — não inventes informação.';

router.post('/:id/ask-workspace', async (req, res) => {
  const agent = await prisma.agent.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { message } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'message is required' });
  const question = message.trim();

  const results = await searchWorkspace(req.effectiveUserId, question);
  const context = buildWorkspaceContext(results);

  const userMessage = await prisma.agentMessage.create({ data: { agentId: agent.id, role: 'user', content: question } });

  const augmentedContent = context
    ? `Conteúdo relevante do workspace:\n\n${context}\n\n---\n\nPergunta do utilizador: ${question}`
    : `(Não foi encontrado conteúdo relevante no workspace para esta pergunta.)\n\nPergunta do utilizador: ${question}`;

  try {
    const reply = await callProvider(agent, [{ role: 'user', content: augmentedContent }], {
      systemPrompt: WORKSPACE_SYSTEM_PROMPT,
      maxTokens: 900,
    });
    const assistantMessage = await prisma.agentMessage.create({ data: { agentId: agent.id, role: 'assistant', content: reply } });
    res.json({
      userMessage,
      assistantMessage,
      sources: results.map((r) => ({ type: r.type, id: r.id, folderId: r.folderId, title: r.title })),
    });
  } catch (err) {
    res.status(400).json({ error: err.message, userMessage });
  }
});

export default router;
