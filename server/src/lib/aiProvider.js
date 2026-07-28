import { decryptSecret } from './crypto.js';

// Providers don't share a model catalog — "gpt-4o-mini" only exists on
// OpenAI itself, for example. Each provider/host gets a short list of
// sensible models; the first entry is the default used until the user
// picks a different one in the chat widget.
export const MODEL_CATALOG = {
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

export function modelOptionsFor(agent) {
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

export function defaultModelFor(agent) {
  return modelOptionsFor(agent)[0].id;
}

export async function callProvider(agent, messages, { systemPrompt, maxTokens } = {}) {
  const token = decryptSecret(agent.tokenCipher);
  const model = agent.model || defaultModelFor(agent);

  if (agent.provider === 'anthropic') {
    const body = { model, max_tokens: maxTokens || 512, messages };
    if (systemPrompt) body.system = systemPrompt;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': token, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Anthropic API error (${res.status})`);
    return data.content?.[0]?.text || '';
  }

  const base = agent.baseUrl || 'https://api.openai.com/v1';
  const chatMessages = systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages;
  const body = { model, messages: chatMessages };
  if (maxTokens) body.max_tokens = maxTokens;
  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI-compatible API error (${res.status})`);
  return data.choices?.[0]?.message?.content || '';
}
