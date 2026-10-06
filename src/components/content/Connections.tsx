'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { Icon } from '@/components/shell/icons';
import { useWhen } from './useWhen';
import './content.css';

// "Ligações" (prototype cx_*): links between notes, tasks… shared by the
// notes inspector and the task detail. Dots/kinds per type as in the prototype.

export type ItemType = 'note' | 'task';
type Link = { type: ItemType; id: string; title: string };
type Candidate = Link & { sub: string };

export const ITEM_DOT: Record<ItemType, string> = { note: 'oklch(0.86 0.1 85)', task: 'oklch(0.8 0.13 30)' };
const ITEM_KIND: Record<ItemType, string> = { note: 'k_note', task: 'k_task' };
export const itemHref = (type: ItemType, id: string) =>
  type === 'task' ? `/app/tasks?t=${id}` : `/app/notes?n=${id}`;

export function Connections({
  type,
  id,
  variant = 'card',
  placeholder,
}: {
  type: ItemType;
  id: string;
  /** card: own glass card (notes inspector) · section: divider above (task detail) */
  variant?: 'card' | 'section';
  placeholder?: string;
}) {
  const { t } = useI18n();
  const when = useWhen();
  const router = useRouter();
  const [links, setLinks] = useState<Link[]>([]);
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const [results, setResults] = useState<Candidate[]>([]);
  const self = { type, id };

  useEffect(() => {
    let live = true;
    api<{ links: Link[] }>(`/links?type=${type}&id=${id}`)
      .then((r) => live && setLinks(r.links))
      .catch(() => live && setLinks([]));
    return () => {
      live = false;
    };
  }, [type, id]);

  useEffect(() => {
    if (!focus) return;
    let live = true;
    const h = setTimeout(() => {
      api<{ items: Candidate[] }>(`/links/candidates?type=${type}&id=${id}&q=${encodeURIComponent(q.trim())}`)
        .then(
          (r) =>
            live && setResults(r.items.filter((c) => !links.some((l) => l.type === c.type && l.id === c.id))),
        )
        .catch(() => live && setResults([]));
    }, 180);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [focus, q, type, id, links]);

  const add = async (c: Candidate) => {
    await api('/links', { a: self, b: { type: c.type, id: c.id } }).catch(() => {});
    setLinks((l) => [...l, { type: c.type, id: c.id, title: c.title }]);
    setQ('');
  };
  const remove = async (l: Link) => {
    await api('/links', { a: self, b: { type: l.type, id: l.id } }, 'DELETE').catch(() => {});
    setLinks((x) => x.filter((y) => !(y.type === l.type && y.id === l.id)));
  };
  const open = (l: Link) => router.push(itemHref(l.type, l.id));

  return (
    <div className={`kh-cx kh-cx--${variant}`}>
      <div className="kh-cx__cap">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
          <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
        </svg>
        {t('cx_title')}
        <span className="kh-cx__n">{links.length || ''}</span>
      </div>
      {links.length === 0 && <div className="kh-cx__empty">{t('cx_empty')}</div>}
      {links.length > 0 && (
        <div className="kh-cx__links">
          {links.map((l) => (
            <div key={`${l.type}:${l.id}`} className="kh-cx__link">
              <span
                className="kh-cx__dot"
                style={{ background: ITEM_DOT[l.type], boxShadow: `0 0 8px ${ITEM_DOT[l.type]}` }}
              />
              <span className="kh-cx__k">{t(ITEM_KIND[l.type])}</span>
              <span
                className="kh-cx__t"
                role="link"
                tabIndex={0}
                title={l.title}
                onClick={() => open(l)}
                onKeyDown={(e) => e.key === 'Enter' && open(l)}
              >
                {l.title || t('ne_untitled')}
              </span>
              <button
                type="button"
                title={t('cx_unlink')}
                aria-label={t('cx_unlink')}
                onClick={() => void remove(l)}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="kh-cx__search">
        <Icon name="search" size={15} sw={2} />
        <input
          value={q}
          placeholder={placeholder ?? t('cx_ph')}
          aria-label={placeholder ?? t('cx_ph')}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
        />
      </label>
      {focus && results.length > 0 && (
        <div className="kh-cx__results" role="listbox">
          {results.map((r) => (
            <div
              key={`${r.type}:${r.id}`}
              role="option"
              aria-selected={false}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void add(r)}
            >
              <span className="kh-cx__dot" style={{ background: ITEM_DOT[r.type] }} />
              <span className="kh-cx__rk">{t(ITEM_KIND[r.type])}</span>
              <span className="kh-cx__rt">{r.title || t('ne_untitled')}</span>
              <span className="kh-cx__rs">{when(r.sub)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
