'use client';

import { useCallback, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { useToast } from '@/components/ui';
import { AiText } from './AiText';
import { aiError, useAi } from './useAi';
import './ai.css';

/** "Explicar código": asks the assistant and shows the explanation under the code. */
export function useExplain() {
  const { t } = useI18n();
  const toast = useToast();
  const { ready } = useAi();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<{ key: string; text: string } | null>(null);
  const run = useCallback(
    async (key: string, code: string, lang?: string, name?: string) => {
      setBusy(true);
      setText(null);
      try {
        const r = await api<{ text: string }>('/ai/action', {
          kind: 'explain',
          code: code.slice(0, 60_000),
          lang,
          name,
        });
        setText({ key, text: r.text });
      } catch (e) {
        toast({ message: aiError(t, e), tone: 'error' });
      } finally {
        setBusy(false);
      }
    },
    [t, toast],
  );
  const out = (key: string) =>
    text?.key === key ? (
      <div className="kh-ai-out" role="region" aria-label={t('ai_explanation')}>
        <div className="kh-ai-out__h">
          {t('ai_explanation')}
          <button
            type="button"
            className="kh-ai__ic"
            aria-label={t('ai_close')}
            onClick={() => setText(null)}
          >
            ✕
          </button>
        </div>
        <AiText text={text.text} cite={(n) => `[${n}]`} />
      </div>
    ) : null;
  return { ready, busy, run, out };
}
