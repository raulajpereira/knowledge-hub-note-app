'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import type { AiStatus } from '@/lib/ai';
import { useShell } from '@/components/shell/ShellContext';

/** Fired after the AI settings change, so the top bar and pages refresh. */
export const AI_EVENT = 'kh-ai';
export const aiChanged = () => window.dispatchEvent(new Event(AI_EVENT));

/** The person's assistant set-up; `ready` = module in the plan + key configured and on. */
export function useAi() {
  const { modules } = useShell();
  const has = modules.has('ai');
  const [ai, setAi] = useState<AiStatus | null>(null);
  const load = useCallback(() => {
    if (!has) return;
    api<{ ai: AiStatus }>('/ai/settings')
      .then((r) => setAi(r.ai))
      .catch(() => setAi(null));
  }, [has]);
  useEffect(() => {
    load();
    window.addEventListener(AI_EVENT, load);
    return () => window.removeEventListener(AI_EVENT, load);
  }, [load]);
  return { ai, has, ready: has && !!ai?.configured && !!ai.enabled, reload: load };
}

const ERR: Record<string, string> = {
  ai_key_invalid: 'ai_errKey',
  ai_rate_limited: 'ai_errRate',
  too_many_requests: 'ai_errRate',
  ai_model_invalid: 'ai_errModel',
  ai_refused: 'ai_errRefused',
  ai_not_configured: 'ai_needSetup',
  ai_disabled: 'ai_needSetup',
  ai_bad_output: 'ai_errOutput',
  ai_no_audio: 'ai_noAudioErr',
  ai_empty_audio: 'ai_emptyAudio',
  file_too_large: 'ai_audioBig',
};
/** The message for a failed assistant call. */
export const aiError = (t: (k: string) => string, e: unknown) =>
  t(
    (typeof e === 'object' && e && 'code' in e ? ERR[String((e as { code: string }).code)] : undefined) ??
      'ai_errProvider',
  );
