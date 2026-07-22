import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { encryptSecret, decryptSecret } from '../lib/crypto.js';

const PROVIDERS = ['anthropic', 'openai'];
const ANTHROPIC_MODEL = 'claude-3-5-haiku-20241022';
const OPENAI_MODEL = 'gpt-4o-mini';

const router = Router();
router.use(requireAuth);

function toPublic(agent) {
  const { tokenCipher, ...rest } = agent;
  return { ...rest, hasToken: !!tokenCipher };
}

router.get('/', async (req, res) => {
  const agents = await prisma.agent.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'asc' } });
  res.json({ agents: agents.map(toPublic) });
});

router.post('/', async (req, res) => {
  const { name, provider, token, baseUrl } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!PROVIDERS.includes(provider)) return res.status(400).json({ error: 'Invalid provider' });

  const agent = await prisma.agent.create({
    data: {
      userId: req.userId,
      name: name.trim(),
      provider,
      baseUrl: baseUrl || null,
      tokenCipher: encryptSecret(token || ''),
    },
  });
  res.status(201).json({ agent: toPublic(agent) });
});

router.patch('/:id', async (req, res) => {
  const agent = await prisma.agent.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { name, provider, token, baseUrl, active } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = name.trim() || agent.name;
  if (provider !== undefined) {
    if (!PROVIDERS.includes(provider)) return res.status(400).json({ error: 'Invalid provider' });
    data.provider = provider;
  }
  if (token !== undefined && token !== '') data.tokenCipher = encryptSecret(token);
  if (baseUrl !== undefined) data.baseUrl = baseUrl || null;
  if (active !== undefined) data.active = !!active;

  const updated = await prisma.agent.update({ where: { id: agent.id }, data });
  res.json({ agent: toPublic(updated) });
});

router.delete('/:id', async (req, res) => {
  const agent = await prisma.agent.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  await prisma.agent.delete({ where: { id: agent.id } });
  res.status(204).end();
});

async function callProvider(agent, messages) {
  const token = decryptSecret(agent.tokenCipher);

  if (agent.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': token, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 512, messages }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Anthropic API error (${res.status})`);
    return data.content?.[0]?.text || '';
  }

  const base = agent.baseUrl || 'https://api.openai.com/v1';
  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ model: OPENAI_MODEL, messages }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI-compatible API error (${res.status})`);
  return data.choices?.[0]?.message?.content || '';
}

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

export default router;
