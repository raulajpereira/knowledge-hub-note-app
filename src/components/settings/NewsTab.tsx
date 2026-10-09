'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePref } from '@/components/shell/PrefsProvider';
import { api } from '@/lib/client/api';
import { DEFAULT_NEWS_SOURCES } from '@/lib/news';
import type { NewsSource } from '@/lib/prefs';
import { useI18n } from '@/i18n/client';
import { Card } from './LookTab';

/** Feed de Notícias do Rodapé: the RSS sources the server reads for the ticker. */
export function NewsTab() {
  const { t } = useI18n();
  const [saved, setSaved] = usePref<NewsSource[] | undefined>('newsSources', undefined);
  const list = saved ?? DEFAULT_NEWS_SOURCES;
  const [status, setStatus] = useState<{ live: Set<string>; failed: string[] } | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const refresh = useCallback(() => {
    setStatus(null);
    api<{ items: Array<{ src: string }>; failed: string[] }>('/news/ticker')
      .then((r) => setStatus({ live: new Set(r.items.map((i) => i.src)), failed: r.failed }))
      .catch(() => setStatus({ live: new Set(), failed: [] }));
  }, []);
  useEffect(refresh, [refresh]);

  const save = (next: NewsSource[]) => {
    setSaved(next);
    setTimeout(refresh, 900); // after the debounced save reaches the server
  };
  const add = () => {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) return;
    const n = name.trim() || u.replace(/^https?:\/\//i, '').split('/')[0]!;
    save([...list, { id: `f${Date.now()}`, name: n.slice(0, 60), url: u.slice(0, 500), on: true }]);
    setName('');
    setUrl('');
  };
  const st = (s: NewsSource) =>
    !s.on
      ? [t('set_newsOff'), 'rgba(255,248,240,.45)']
      : status?.live.has(s.name)
        ? [t('set_newsLive'), 'oklch(0.84 0.13 150)']
        : status?.failed.includes(s.name)
          ? [t('set_newsErr'), 'oklch(0.82 0.14 40)']
          : ['…', 'rgba(255,248,240,.5)'];

  return (
    <Card
      title={t('set_newsTitle')}
      desc={t('set_newsDesc')}
      action={
        <button
          type="button"
          className="kh-set__ghost"
          style={{ fontSize: 12.5, fontWeight: 600 }}
          onClick={refresh}
        >
          {t('set_newsRefresh')}
        </button>
      }
    >
      {status && status.failed.length > 0 && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 14,
            background: 'oklch(0.75 0.13 60 / .14)',
            border: '1px solid oklch(0.8 0.13 70 / .35)',
            fontSize: 12.5,
          }}
        >
          {t('set_newsFails')}
          {status.failed.join(', ')}
        </div>
      )}
      <div className="kh-set__rows">
        {list.map((s) => {
          const [label, color] = st(s);
          return (
            <div key={s.id} className="kh-feed">
              <button
                type="button"
                role="switch"
                aria-checked={s.on}
                aria-label={s.name}
                className="kh-toggle"
                onClick={() => save(list.map((x) => (x.id === s.id ? { ...x, on: !x.on } : x)))}
              />
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span>
                <span
                  className="kh-mono"
                  style={{
                    fontSize: 11,
                    color: 'rgba(255,248,240,.55)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {s.url}
                </span>
              </span>
              <span style={{ fontSize: 11.5, color, whiteSpace: 'nowrap' }}>{label}</span>
              <button
                type="button"
                title={t('set_newsRemove')}
                aria-label={`${t('set_newsRemove')} ${s.name}`}
                onClick={() => save(list.filter((x) => x.id !== s.id))}
                style={{
                  width: 30,
                  height: 30,
                  flex: 'none',
                  borderRadius: '50%',
                  border: 0,
                  background: 'transparent',
                  color: 'rgba(255,248,240,.55)',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 16,
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.7fr) auto', gap: 8 }}>
        <input
          className="kh-set__field"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('set_newsName')}
          aria-label={t('set_newsName')}
        />
        <input
          className="kh-set__field kh-mono"
          style={{ fontSize: 12.5 }}
          value={url}
          maxLength={500}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="https://…/rss"
          aria-label={t('p_url')}
          spellCheck={false}
        />
        <button
          type="button"
          className="kh-set__solid"
          style={{ height: 38, padding: '0 16px', fontSize: 13 }}
          onClick={add}
          disabled={list.length >= 30}
        >
          {t('set_newsAdd')}
        </button>
      </div>
    </Card>
  );
}
