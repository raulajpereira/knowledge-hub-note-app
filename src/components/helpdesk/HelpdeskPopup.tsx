'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { refreshCounts } from '@/components/shell/counts';
import './helpdesk.css';

// "Helpdesk": after each read of the helpdesk with changes, a card on any page
// lists them (new tickets, changed fields, new comments, tickets that left the
// list). "OK" marks them seen; they stay in the Helpdesk page and the bell.

export type HdChange = {
  id: string;
  sourceId: string;
  itemId: string;
  number: string;
  summary: string;
  kind: 'new' | 'field' | 'comment' | 'gone' | 'back';
  field: string;
  from: string;
  to: string;
  syncAt: string;
  seen: boolean;
};

export const HD_EVENT = 'kh-helpdesk';
const POLL_MS = 60_000;

export function useChangeText() {
  const { t } = useI18n();
  return useCallback(
    (c: HdChange) => {
      switch (c.kind) {
        case 'new':
          return t('hd_cNew').replace('{s}', c.to || '—');
        case 'field':
          return `${t(`hd_f_${c.field}`)}: ${c.from || '—'} → ${c.to || '—'}`;
        case 'comment':
          return t('hd_cComment')
            .replace('{who}', c.from || '—')
            .replace('{when}', c.to ? ` (${fmtWhen(c.to)})` : '');
        case 'gone':
          return t('hd_cGone');
        case 'back':
          return t('hd_cBack');
      }
    },
    [t],
  );
}

/** "2026-11-16 11:20" → "16/11 11:20" */
export const fmtWhen = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?$/.exec(s);
  return m ? `${m[3]}/${m[2]}${m[4] ? ` ${m[4]}` : ''}` : s;
};

export function HelpdeskPopup() {
  const { t } = useI18n();
  const router = useRouter();
  const text = useChangeText();
  const [list, setList] = useState<HdChange[]>([]);
  const load = useCallback(() => {
    void api<{ changes: HdChange[] }>('/helpdesk/changes')
      .then((r) => {
        // a read with changes: the sidebar's badge may change too
        setList((cur) => {
          if (r.changes.some((c) => !cur.some((x) => x.id === c.id))) refreshCounts();
          return r.changes;
        });
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const i = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_MS);
    const on = () => load();
    window.addEventListener('focus', on);
    window.addEventListener(HD_EVENT, on);
    return () => {
      clearInterval(i);
      window.removeEventListener('focus', on);
      window.removeEventListener(HD_EVENT, on);
    };
  }, [load]);
  if (!list.length) return null;
  const seen = async () => {
    const ids = list.map((c) => c.id);
    setList([]);
    await api('/helpdesk/changes/seen', { ids }).catch(() => {});
    window.dispatchEvent(new Event(HD_EVENT));
  };
  const title = t('hd_popT').replace('{n}', String(new Set(list.map((c) => c.itemId)).size));
  return (
    <div className="kh-popover kh-hd-pop" role="alertdialog" aria-label={title}>
      <b>{title}</b>
      <ul>
        {list.slice(0, 8).map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className="kh-hd-pop__i"
              onClick={() => {
                void seen();
                router.push(`/app/helpdesk?i=${c.itemId}`);
              }}
            >
              <span className="kh-hd-mono">#{c.number}</span>{' '}
              <span className="kh-hd-pop__s">{c.summary}</span>
              <em data-k={c.kind}>{text(c)}</em>
            </button>
          </li>
        ))}
      </ul>
      {list.length > 8 && <p>{t('hd_popMore').replace('{n}', String(list.length - 8))}</p>}
      <div>
        <button
          type="button"
          className="kh-btn kh-btn--sm kh-btn--ghost"
          onClick={() => {
            void seen();
            router.push('/app/helpdesk?tab=changes');
          }}
        >
          {t('hd_popView')}
        </button>
        <button type="button" className="kh-btn kh-btn--sm kh-btn--primary" onClick={() => void seen()}>
          {t('hd_popOk')}
        </button>
      </div>
    </div>
  );
}
