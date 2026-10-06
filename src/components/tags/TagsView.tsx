'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { useToast } from '@/components/ui';
import './tags.css';

// Etiquetas: not designed in the prototype — built with the Lixo page's
// look (user decision): the tags used in notes with their counts, rename only.

type Tag = { name: string; count: number };

function Row({ tag, onRename }: { tag: Tag; onRename: (to: string) => Promise<void> }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(tag.name);
  const save = async () => {
    const v = val.trim();
    setEditing(false);
    if (v && v !== tag.name) await onRename(v);
    else setVal(tag.name);
  };
  return (
    <div className="kh-tg__row">
      {editing ? (
        <input
          className="kh-tg__edit"
          autoFocus
          value={val}
          maxLength={40}
          aria-label={t('rename')}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            else if (e.key === 'Escape') {
              setVal(tag.name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <span className="kh-tg__chip">{tag.name}</span>
      )}
      <span className="kh-tg__count">
        {tag.count}
        {tag.count === 1 ? t('note1') : t('noteN')}
      </span>
      <button
        type="button"
        className="kh-tg__btn"
        title={t('rename')}
        aria-label={`${t('rename')} ${tag.name}`}
        onClick={() => {
          setVal(tag.name);
          setEditing(true);
        }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 20h4L19 9l-4-4L4 16z" />
        </svg>
      </button>
    </div>
  );
}

export function TagsView() {
  const { t } = useI18n();
  const toast = useToast();
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(
    () =>
      api<{ tags: Tag[] }>('/tags')
        .then((r) => setTags(r.tags))
        .catch(() => setTags([])),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (tags ?? []).filter((x) => !s || x.name.toLowerCase().includes(s));
  }, [tags, q]);

  const rename = async (from: string, to: string) => {
    try {
      const r = await api<{ renamed: number }>('/tags', { from, to }, 'PATCH');
      toast({ message: t('tg_saved').replace('{n}', String(r.renamed)), tone: 'success' });
    } catch {
      toast({ message: t('ne_saveFail'), tone: 'error' });
    }
    await load();
  };

  return (
    <section className="kh-tg">
      <div className="kh-tg__head">
        <div className="kh-tg__titles">
          <div className="kh-tg__title">{t('nav_tags')}</div>
          <div className="kh-tg__sub">{t('tg_sub')}</div>
        </div>
        <label className="kh-tg__search">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,248,240,.6)"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('tg_search')}
            aria-label={t('tg_search')}
          />
        </label>
      </div>
      <div className="kh-tg__scroll">
        <div className="kh-tg__table">
          <div className="kh-tg__th">
            <span>{t('tg_name')}</span>
            <span>{t('tg_count')}</span>
            <span />
          </div>
          {list.map((x) => (
            <Row key={x.name} tag={x} onRename={(to) => rename(x.name, to)} />
          ))}
          {tags && list.length === 0 && (
            <div className="kh-tg__none">
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12V4h8l10 10-8 8z" />
                <circle cx="7.5" cy="8.5" r="1.3" />
              </svg>
              <span className="kh-tg__noneT">{t('tg_empty')}</span>
              <span>{t('tg_emptyBody')}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
