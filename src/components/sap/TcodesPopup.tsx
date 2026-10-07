'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { modColor } from '@/lib/sap';
import type { Tcode } from './TcodesView';
import './sap.css';

// Header "SAP TCodes" popup (prototype tcOpen): the most picked transactions,
// search over code/description/program/module, click or Enter copies the code.

export function TcodesPopup({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [items, setItems] = useState<Tcode[] | null>(null);
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const tm = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    void api<{ tcodes: Tcode[] }>('/sap/tcodes')
      .then((r) => setItems(r.tcodes))
      .catch(() => setItems([]));
    return () => clearTimeout(tm.current);
  }, []);
  const query = q.trim().toLowerCase();
  const all = items ?? [];
  const list = query
    ? all
        .filter((x) =>
          [x.code, x.description, x.program, x.module, x.notes].join(' ').toLowerCase().includes(query),
        )
        .sort(
          (a, b) =>
            Number(b.code.toLowerCase().startsWith(query)) - Number(a.code.toLowerCase().startsWith(query)) ||
            b.uses - a.uses ||
            a.code.localeCompare(b.code),
        )
        .slice(0, 40)
    : all
        .slice()
        .sort((a, b) => b.uses - a.uses || Number(b.fav) - Number(a.fav))
        .slice(0, 8);
  const pick = (x: Tcode) => {
    void navigator.clipboard?.writeText(x.code).catch(() => {});
    setItems((cur) => cur && cur.map((y) => (y.id === x.id ? { ...y, uses: y.uses + 1 } : y)));
    void api(`/sap/tcodes/${x.id}/touch`, { use: true }).catch(() => {});
    setCopied(x.id);
    clearTimeout(tm.current);
    tm.current = setTimeout(() => setCopied(null), 1400);
  };
  return (
    <div className="kh-tcp-dim" onClick={onClose}>
      <div
        className="kh-tcp"
        role="dialog"
        aria-modal="true"
        aria-label="SAP TCodes"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kh-tcp__head">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <path d="M7 10l3 2.5L7 15" />
            <line x1="12.5" y1="15" x2="17" y2="15" />
          </svg>
          <span>SAP TCodes</span>
          <button type="button" title={t('tc_close')} aria-label={t('tc_close')} onClick={onClose}>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
        <label className="kh-tcp__search">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,248,240,.7)"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          <input
            autoFocus
            value={q}
            spellCheck={false}
            placeholder={t('tc_ph')}
            aria-label={t('tc_ph')}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'Enter' && list[0]) pick(list[0]);
            }}
          />
        </label>
        <div className="kh-tcp__cap">
          <span>{query ? `${t('tc_res')} · ${list.length}` : `✦ ${t('tc_most')}`}</span>
          <span>{t('tc_hint')}</span>
        </div>
        <div className="kh-tcp__list">
          {list.map((x, i) => (
            <button
              key={x.id}
              type="button"
              data-first={(query && i === 0) || undefined}
              onClick={() => pick(x)}
            >
              <span className="kh-tcp__code">{x.code}</span>
              <span className="kh-tcp__desc">{x.description}</span>
              {copied === x.id && <span className="kh-tcp__ok">✓ {t('tc_copied')}</span>}
              <span className="kh-tcp__mod">
                <span style={{ background: modColor(x.module) }} />
                {x.module || '—'}
              </span>
            </button>
          ))}
          {items && !list.length && <div className="kh-tcp__none">{t('tc_none')}</div>}
        </div>
      </div>
    </div>
  );
}
