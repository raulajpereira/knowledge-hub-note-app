// Assistente IA: the providers a person can use with their own API key. All
// but Claude speak the OpenAI-compatible chat API; Claude goes through the
// official Anthropic SDK. The list is fixed (no free URLs: the server only
// ever calls these hosts). `audio` = the provider can transcribe voice notes.

export type AiProviderId =
  'groq' | 'openai' | 'anthropic' | 'xai' | 'mistral' | 'gemini' | 'deepseek' | 'openrouter';

export type AiProvider = {
  id: AiProviderId;
  name: string;
  /** OpenAI-compatible base URL (unused for Claude) */
  base: string;
  /** a sensible first choice; the person picks from the provider's own list */
  suggested: string;
  /** speech-to-text model, when the provider has one */
  audio: string | null;
  /** where to create a key */
  keysUrl: string;
};

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: 'groq',
    name: 'Groq',
    base: 'https://api.groq.com/openai/v1',
    suggested: 'llama-3.3-70b-versatile',
    audio: 'whisper-large-v3-turbo',
    keysUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT)',
    base: 'https://api.openai.com/v1',
    suggested: '',
    audio: 'whisper-1',
    keysUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    base: '',
    suggested: 'claude-opus-5-5',
    audio: null,
    keysUrl: 'https://platform.claude.com/settings/keys',
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    base: 'https://api.x.ai/v1',
    suggested: '',
    audio: null,
    keysUrl: 'https://console.x.ai',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    base: 'https://api.mistral.ai/v1',
    suggested: '',
    audio: null,
    keysUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    suggested: '',
    audio: null,
    keysUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    base: 'https://api.deepseek.com/v1',
    suggested: 'deepseek-chat',
    audio: null,
    keysUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (vários modelos)',
    base: 'https://openrouter.ai/api/v1',
    suggested: '',
    audio: null,
    keysUrl: 'https://openrouter.ai/keys',
  },
];

export const AI_PROVIDER_IDS = AI_PROVIDERS.map((p) => p.id) as [AiProviderId, ...AiProviderId[]];
export const aiProvider = (id: string) => AI_PROVIDERS.find((p) => p.id === id) ?? null;

/** What the browser learns about the person's set-up (never the key). */
export type AiStatus = {
  configured: boolean;
  enabled: boolean;
  provider: AiProviderId | null;
  model: string;
  keyHint: string;
  audio: boolean;
};

/** Item kinds the assistant reads from (everything but the password vault). */
export const AI_SOURCE_HREF: Record<string, (id: string) => string> = {
  note: (id) => `/app/notes?n=${id}`,
  meeting: (id) => `/app/meetings?m=${id}`,
  task: (id) => `/app/tasks?t=${id}`,
  issue: (id) => `/app/issues?i=${id}`,
  voice: (id) => `/app/voice?v=${id}`,
  artifact: (id) => `/app/artifacts?a=${id}`,
  email: (id) => `/app/emails?m=${id}`,
  snippet: (id) => `/app/devlib?s=${id}`,
  code: (id) => `/app/codelib?o=${id}`,
  transport: (id) => `/app/transports?o=${id}`,
  file: (id) => `/app/files?f=${id}`,
};
