import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { encryptSecret, decryptSecret } from '../lib/crypto.js';

// Providers don't share a model catalog — "gpt-4o-mini" only exists on
// OpenAI itself, for example. Each provider/host gets a short list of
// sensible models; the first entry is the default used until the user
// picks a different one in the chat widget.
const MODEL_CATALOG = {
  anthropic: [
    { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
  ],
  'api.openai.com': [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  ],
  'api.groq.com': [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
    { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
    { id: 'gemma2-9b-it', label: 'Gemma 2 9B' },
  ],
  'openrouter.ai': [
    { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini (OpenRouter)' },
    { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (OpenRouter)' },
    { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (OpenRouter)' },
    { id: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash (OpenRouter)' },
  ],
  'api.perplexity.ai': [
    { id: 'llama-3.1-sonar-small-128k-online', label: 'Sonar Small (online)' },
    { id: 'llama-3.1-sonar-large-128k-online', label: 'Sonar Large (online)' },
  ],
};

function modelOptionsFor(agent) {
  if (agent.provider === 'anthropic') return MODEL_CATALOG.anthropic;
  const host = (() => {
    try {
      return new URL(agent.baseUrl || 'https://api.openai.com/v1').hostname;
    } catch {
      return '';
    }
  })();
  return MODEL_CATALOG[host] || MODEL_CATALOG['api.openai.com'];
}

function defaultModelFor(agent) {
  return modelOptionsFor(agent)[0].id;
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

async function callProvider(agent, messages) {
  const token = decryptSecret(agent.tokenCipher);
  const model = agent.model || defaultModelFor(agent);

  if (agent.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': token, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 512, messages }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Anthropic API error (${res.status})`);
    return data.content?.[0]?.text || '';
  }

  const base = agent.baseUrl || 'https://api.openai.com/v1';
  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ model, messages }),
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
