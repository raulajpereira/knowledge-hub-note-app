'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import { useToast } from '@/components/ui';

// Definições › Assistente IA › Pesquisa por significado e OCR: how much of the
// person's content is indexed, what is waiting, and "Reindexar". The status
// refreshes on its own while something is queued.
type Status = {
  semantic: boolean;
  ocr: boolean;
  service: 'up' | 'loading' | 'down' | 'off';
  indexed: number;
  pending: number;
  ocrDone: number;
  ocrPending: number;
  ocrFailed: number;
};

export function SemanticCard() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const fmt = (n: number) => n.toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT');

  const load = useCallback(
    () =>
      api<{ status: Status }>('/ai/index')
        .then((r) => setSt(r.status))
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const queued = (st?.pending ?? 0) + (st?.ocrPending ?? 0);
  useEffect(() => {
    if (!queued) return;
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [queued, load]);

  const reindex = async () => {
    setBusy(true);
    try {
      const r = await api<{ queued: number; status: Status }>('/ai/index', {}, 'POST');
      setSt(r.status);
      toast({ message: t('sem_reindexed').replace('{n}', fmt(r.queued)), tone: 'success' });
    } catch (e) {
      toast({
        message: t(isApiFailure(e) && e.status === 429 ? 'sem_reindexRate' : 'sem_reindexFail'),
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const row = { gridTemplateColumns: 'minmax(120px,30%) minmax(0,1fr)' };
  const val = { fontSize: 13.5, color: 'rgb(var(--t) / calc(.85 * var(--t-k)))' };
  const state = st ? t(`sem_${st.service}`) : '…';
  const dot =
    st?.service === 'up' || st?.service === 'loading'
      ? 'oklch(0.78 0.15 150)'
      : st?.service === 'down'
        ? 'oklch(0.8 0.15 75)'
        : 'rgb(var(--t) / calc(.4 * var(--t-k)))';

  return (
    <div className="kh-set__card" data-testid="semantic-card">
      <div className="kh-set__head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="kh-set__title">{t('sem_title')}</div>
          <div className="kh-set__desc">{t('sem_desc')}</div>
        </div>
      </div>
      <div className="kh-set__rows">
        <div className="kh-set__row" style={row}>
          <span style={{ fontSize: 14 }}>{t('sem_state')}</span>
          <span
            style={{ ...val, display: 'flex', alignItems: 'center', gap: 8 }}
            data-testid="semantic-state"
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flex: 'none' }} />
            {state}
          </span>
        </div>
        {st?.semantic && (
          <div className="kh-set__row" style={row}>
            <span style={{ fontSize: 14 }}>{t('sem_indexed')}</span>
            <span style={val} data-testid="semantic-indexed">
              {fmt(st.indexed)}
              {st.pending > 0 && (
                <span style={{ color: 'rgb(var(--t) / calc(.6 * var(--t-k)))' }}>
                  {' '}
                  · {t('sem_pending')}: {fmt(st.pending)}
                </span>
              )}
            </span>
          </div>
        )}
        <div className="kh-set__row" style={row}>
          <span style={{ fontSize: 14 }}>{t('sem_ocr')}</span>
          <span style={val}>
            {!st ? (
              '…'
            ) : !st.ocr ? (
              t('sem_ocrOff')
            ) : (
              <>
                {fmt(st.ocrDone)}
                {st.ocrPending > 0 && (
                  <span style={{ color: 'rgb(var(--t) / calc(.6 * var(--t-k)))' }}>
                    {' '}
                    · {t('sem_pending')}: {fmt(st.ocrPending)}
                  </span>
                )}
                {st.ocrFailed > 0 && (
                  <span style={{ color: 'rgb(var(--t) / calc(.6 * var(--t-k)))' }}>
                    {' '}
                    · {t('sem_ocrFailed').replace('{n}', fmt(st.ocrFailed))}
                  </span>
                )}
              </>
            )}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className="kh-set__ghost"
          disabled={busy || !st?.semantic}
          onClick={() => void reindex()}
        >
          {t('sem_reindex')}
        </button>
        <span style={{ fontSize: 12.5, color: 'rgb(var(--t) / calc(.62 * var(--t-k)))', flex: '1 1 260px' }}>
          {t('sem_reindexHint')}
        </span>
      </div>
    </div>
  );
}
