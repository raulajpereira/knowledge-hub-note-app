import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { encryptSecret, decryptSecret } from '../lib/crypto.js';

const ANTHROPIC_MODEL = 'claude-3-5-haiku-20241022';
const OPENAI_MODEL = 'gpt-4o-mini';

// OpenAI-compatible providers don't share a model catalog — "gpt-4o-mini"
// only exists on OpenAI itself. Pick a sensible default per provider by
// hostname so a freshly-detected agent works without the user having to
// know or configure a model name.
function modelForBaseUrl(baseUrl) {
  const host = (() => {
    try {
      return new URL(baseUrl || 'https://api.openai.com/v1').hostname;
    } catch {
      return '';
    }
  })();
  if (host.includes('groq.com')) return 'llama-3.3-70b-versatile';
  if (host.includes('openrouter.ai')) return 'openai/gpt-4o-mini';
  if (host.includes('perplexity.ai')) return 'llama-3.1-sonar-small-128k-online';
  return OPENAI_MODEL;
}

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
  return { ...rest, hasToken: !!tokenCipher };
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

  const { name, token, active } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = name.trim() || agent.name;
  if (token !== undefined && token !== '') {
    const { provider, baseUrl } = detectFromToken(token);
    data.provider = provider;
    data.baseUrl = baseUrl;
    data.tokenCipher = encryptSecret(token);
  }
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
    body: JSON.stringify({ model: modelForBaseUrl(agent.baseUrl), messages }),
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
