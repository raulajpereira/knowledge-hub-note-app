import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { aiProvider, type AiProviderId } from '@/lib/ai';
import { ApiError } from '@/server/errors';
import { isLoopback } from '@/lib/env';

// One way to talk to every provider: a chat that streams text, the list of
// models a key can use, and speech-to-text where the provider has it. Claude
// through the official SDK; the rest through the OpenAI-compatible API.

export type AiCfg = { provider: AiProviderId; apiKey: string; model: string };
export type AiMsg = { role: 'user' | 'assistant'; content: string };

const TIMEOUT = 120_000;

/**
 * Tests point every provider at a local fake (server env only, never set in
 * production). Only a loopback address is honoured, so a stray value can never
 * send people's keys to another host.
 */
function testBase() {
  const u = process.env.AI_TEST_BASE_URL;
  return u && isLoopback(u) ? u : undefined;
}
function baseOf(p: AiProviderId) {
  return testBase() || aiProvider(p)!.base;
}

function fail(status: number): never {
  if (status === 401 || status === 403) throw new ApiError(400, 'ai_key_invalid');
  if (status === 429) throw new ApiError(429, 'ai_rate_limited');
  if (status === 404) throw new ApiError(400, 'ai_model_invalid');
  throw new ApiError(502, 'ai_provider_error', undefined, { status });
}

function anthropic(cfg: { apiKey: string }) {
  return new Anthropic({
    apiKey: cfg.apiKey,
    maxRetries: 1,
    timeout: TIMEOUT,
    ...(testBase() ? { baseURL: testBase() } : {}),
  });
}

function anthropicFail(e: unknown): never {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) fail(401);
  if (e instanceof Anthropic.RateLimitError) fail(429);
  if (e instanceof Anthropic.NotFoundError) fail(404);
  if (e instanceof Anthropic.APIError) fail(e.status ?? 502);
  throw new ApiError(502, 'ai_provider_error');
}

/** The chat models a key can use (sorted by name). */
export async function listModels(provider: AiProviderId, apiKey: string): Promise<string[]> {
  if (provider === 'anthropic') {
    try {
      const out: string[] = [];
      for await (const m of anthropic({ apiKey }).models.list()) out.push(m.id);
      return out.sort();
    } catch (e) {
      anthropicFail(e);
    }
  }
  const res = await fetch(`${baseOf(provider)}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => fail(502));
  if (!res.ok) fail(res.status);
  const data = (await res.json().catch(() => ({}))) as { data?: Array<{ id?: string }> };
  return (data.data ?? [])
    .map((m) => String(m.id ?? '').replace(/^models\//, ''))
    .filter(
      (id) => id && !/whisper|tts|embed|moderation|dall-e|image|audio|transcribe|guard|rerank/i.test(id),
    )
    .sort();
}

/** Streams the answer as text chunks. */
export async function* streamChat(
  cfg: AiCfg,
  input: { system: string; messages: AiMsg[]; maxTokens?: number },
): AsyncGenerator<string> {
  const maxTokens = input.maxTokens ?? 4096;
  if (cfg.provider === 'anthropic') {
    try {
      const stream = anthropic(cfg).messages.stream({
        model: cfg.model,
        max_tokens: maxTokens,
        system: input.system,
        messages: input.messages,
      });
      let refused = false;
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') yield ev.delta.text;
        else if (ev.type === 'message_delta' && ev.delta.stop_reason === 'refusal') refused = true;
      }
      if (refused) throw new ApiError(422, 'ai_refused');
      return;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      anthropicFail(e);
    }
  }
  const res = await fetch(`${baseOf(cfg.provider)}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      stream: true,
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [{ role: 'system', content: input.system }, ...input.messages],
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  }).catch(() => fail(502));
  if (!res.ok || !res.body) fail(res.status);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const j = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
        const t = j.choices?.[0]?.delta?.content;
        if (t) yield t;
      } catch {
        // keep-alive or partial line
      }
    }
  }
}

/** The whole answer at once (for actions that return structured content). */
export async function complete(cfg: AiCfg, input: { system: string; messages: AiMsg[]; maxTokens?: number }) {
  let out = '';
  for await (const t of streamChat(cfg, input)) out += t;
  return out;
}

/** Speech to text (Groq / OpenAI only). */
export async function transcribe(
  cfg: AiCfg,
  audio: Uint8Array,
  mime: string,
  lang?: string,
): Promise<string> {
  const model = aiProvider(cfg.provider)?.audio;
  if (!model) throw new ApiError(400, 'ai_no_audio');
  const form = new FormData();
  const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : 'webm';
  form.append('file', new Blob([audio as BlobPart], { type: mime }), `audio.${ext}`);
  form.append('model', model);
  form.append('response_format', 'json');
  if (lang) form.append('language', lang);
  const res = await fetch(`${baseOf(cfg.provider)}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT),
  }).catch(() => fail(502));
  if (!res.ok) fail(res.status);
  const data = (await res.json().catch(() => ({}))) as { text?: string };
  return (data.text ?? '').trim();
}
