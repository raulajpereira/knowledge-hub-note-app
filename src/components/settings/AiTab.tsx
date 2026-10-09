'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import { AI_PROVIDERS, aiProvider, type AiProviderId } from '@/lib/ai';
import { useConfirm, useToast } from '@/components/ui';
import { aiChanged, useAi } from '@/components/ai/useAi';
import '@/components/sap/sap.css';

// Definições › Assistente IA: each person brings their own provider and key.
// The key goes to the server once (checked with the provider, then stored
// encrypted); the browser only ever sees its last 4 characters.
export function AiTab() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const { ai } = useAi();
  const [provider, setProvider] = useState<AiProviderId | ''>('');
  const [key, setKey] = useState('');
  const [models, setModels] = useState<string[] | null>(null);
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const prov = (provider || ai?.provider || 'groq') as AiProviderId;
  const p = aiProvider(prov)!;
  const sameProv = !!ai?.configured && ai.provider === prov;
  const curModel = model || (sameProv ? ai!.model : '');
  const row = { gridTemplateColumns: 'minmax(120px,30%) minmax(0,1fr)' };

  const msg = (e: unknown) =>
    t(
      isApiFailure(e)
        ? ({
            ai_key_invalid: 'ai_errKey',
            ai_rate_limited: 'ai_errRate',
            ai_model_invalid: 'ai_errModel',
            ai_key_required: 'ai_errKeyNeeded',
          }[e.code] ?? 'ai_errProvider')
        : 'ai_errProvider',
    );
  const loadModels = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await api<{ models: string[] }>('/ai/models', { provider: prov, apiKey: key || undefined });
      setModels(r.models);
      if (!r.models.includes(curModel))
        setModel(r.models.includes(p.suggested) ? p.suggested : (r.models[0] ?? ''));
    } catch (e) {
      setModels(null);
      setErr(msg(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async (enabled = ai?.configured ? ai.enabled : true) => {
    setBusy(true);
    setErr('');
    try {
      await api(
        '/ai/settings',
        { provider: prov, apiKey: key || undefined, model: curModel, enabled },
        'PUT',
      );
      setKey('');
      aiChanged();
      toast({ message: t('ai_saved'), tone: 'success' });
    } catch (e) {
      setErr(msg(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    const ok = await confirm({
      title: t('ai_removeT'),
      body: t('ai_removeB'),
      confirmLabel: t('ai_remove'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    await api('/ai/settings', undefined, 'DELETE').catch(() => {});
    setProvider('');
    setModels(null);
    setModel('');
    aiChanged();
  };

  return (
    <div className="kh-set__card">
      <div className="kh-set__head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="kh-set__title">{t('ai_title')}</div>
          <div className="kh-set__desc">{t('ai_desc')}</div>
        </div>
        {ai?.configured && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, flex: 'none' }}>
            <span style={{ color: 'rgba(255,248,240,.75)' }}>{ai.enabled ? t('ai_on') : t('ai_off')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={ai.enabled}
              aria-label={t('ai_title')}
              className="kh-toggle"
              onClick={() => void save(!ai.enabled)}
            />
          </span>
        )}
      </div>
      <div className="kh-set__rows">
        <div className="kh-set__row" style={row}>
          <span style={{ fontSize: 14 }}>{t('ai_provider')}</span>
          <select
            className="kh-sap-select"
            style={{ maxWidth: 320, height: 38, justifySelf: 'start' }}
            value={prov}
            aria-label={t('ai_provider')}
            onChange={(e) => {
              setProvider(e.target.value as AiProviderId);
              setModels(null);
              setModel('');
              setErr('');
            }}
          >
            {AI_PROVIDERS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        <div className="kh-set__row" style={row}>
          <span style={{ fontSize: 14 }}>{t('ai_key')}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="kh-sap-input"
              data-mono
              type="password"
              autoComplete="off"
              spellCheck={false}
              style={{ maxWidth: 360, height: 38 }}
              value={key}
              placeholder={sameProv ? `•••• ${ai!.keyHint}` : t('ai_keyPh')}
              aria-label={t('ai_key')}
              onChange={(e) => setKey(e.target.value.trim())}
            />
            <button
              type="button"
              className="kh-set__ghost"
              disabled={busy || (!key && !sameProv)}
              onClick={() => void loadModels()}
            >
              {t('ai_test')}
            </button>
            <a className="kh-ai-link" href={p.keysUrl} target="_blank" rel="noopener noreferrer">
              {t('ai_getKey')}
            </a>
          </div>
        </div>
        <div className="kh-set__row" style={row}>
          <span style={{ fontSize: 14 }}>{t('ai_model')}</span>
          {models ? (
            <select
              className="kh-sap-select"
              style={{ maxWidth: 360, height: 38, justifySelf: 'start' }}
              value={curModel}
              aria-label={t('ai_model')}
              onChange={(e) => setModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 13.5, color: 'rgba(255,248,240,.65)' }}>
              {sameProv ? ai!.model : t('ai_modelHint')}
            </span>
          )}
        </div>
      </div>
      {err && (
        <div className="kh-ai-err" role="alert">
          {err}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className="kh-set__solid"
          disabled={busy || !curModel || (!key && !sameProv)}
          onClick={() => void save()}
        >
          {t('ai_save')}
        </button>
        {ai?.configured && (
          <button type="button" className="kh-set__ghost" onClick={() => void remove()}>
            {t('ai_remove')}
          </button>
        )}
        {ai?.configured && (
          <span style={{ fontSize: 13, color: 'rgba(255,248,240,.7)' }}>
            {t('ai_current')
              .replace('{p}', aiProvider(ai.provider!)?.name ?? '')
              .replace('{m}', ai.model)}
            {!ai.audio && ` · ${t('ai_noAudio')}`}
          </span>
        )}
      </div>
      <div className="kh-sg-tip">
        <span>{t('ai_privacyT')}</span>
        <span>{t('ai_privacy')}</span>
      </div>
    </div>
  );
}
