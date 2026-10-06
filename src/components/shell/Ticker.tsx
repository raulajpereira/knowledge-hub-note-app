'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { useI18n } from '@/i18n/client';

type Item = { src: string; title: string; link: string };

const REFRESH_MS = 15 * 60 * 1000;

/** Footer news ticker (prototype newsTrack): two copies scroll for a seamless loop, hover pauses. */
export function Ticker() {
  const { t } = useI18n();
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ items: Item[] }>('/news/ticker')
        .then((r) => alive && setItems(r.items))
        .catch(() => alive && setItems((cur) => cur ?? []));
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const list = items ?? [];
  const duration = `${Math.max(60, list.length * 6)}s`;

  return (
    <footer className="kh-ticker">
      <span className="kh-ticker__badge">{t('latest')}</span>
      <div className="kh-ticker__viewport">
        {list.length ? (
          <div className="kh-ticker__track" style={{ animationDuration: duration }}>
            {[0, 1].map((k) => (
              <div key={k} className="kh-ticker__run" aria-hidden={k === 1 || undefined}>
                {list.map((n, i) =>
                  n.link ? (
                    <a
                      key={i}
                      className="kh-ticker__item"
                      href={n.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      tabIndex={k === 1 ? -1 : undefined}
                    >
                      <b>{n.src}</b>
                      <span>{n.title}</span>
                      <i />
                    </a>
                  ) : (
                    <span key={i} className="kh-ticker__item">
                      <b>{n.src}</b>
                      <span>{n.title}</span>
                      <i />
                    </span>
                  ),
                )}
              </div>
            ))}
          </div>
        ) : items ? (
          <span style={{ paddingLeft: 24, fontSize: 13, color: 'var(--text-3)' }}>{t('ticker_empty')}</span>
        ) : null}
      </div>
      <span className="kh-ticker__copy">
        <span>© {new Date().getFullYear()}</span>
        <strong>
          <span>Knowledge</span>
          <span style={{ color: 'var(--accent)' }}>Hub</span>
        </strong>
      </span>
    </footer>
  );
}
