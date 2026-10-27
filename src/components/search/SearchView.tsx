'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Chip, useViewport } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { Icon } from '@/components/shell/icons';
import { useShell } from '@/components/shell/ShellContext';
import { MAX_PER_GROUP, PAGE_PER_GROUP } from '@/lib/search/global';
import { GroupHead, ResultRow, useGroupLabel } from './SearchResults';
import { useGlobalSearch } from './useGlobalSearch';

// /app/search?q=&type= — every result of the header search, grouped by module,
// with a chip per module to see only that one (all its matches). The header
// box drives it live; on phones/tablets the page has its own box. The URL
// follows the text (replaceState: no navigation per keystroke).

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function SearchView() {
  const { t, lang } = useI18n();
  const sp = useSearchParams();
  const { query, setQuery } = useShell();
  const compact = useViewport() !== 'desktop';
  const label = useGroupLabel();
  const [type, setType] = useState(() => sp.get('type') || '');
  const first = useRef(true);

  // the text in the URL (Enter in the header, a link, a reload) fills the box
  useEffect(() => {
    const q = sp.get('q') ?? '';
    if (q && q !== query) setQuery(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const qs = new URLSearchParams();
    if (query.trim()) qs.set('q', query.trim());
    if (type) qs.set('type', type);
    window.history.replaceState(window.history.state, '', `${BASE}/app/search${qs.size ? `?${qs}` : ''}`);
  }, [query, type]);

  const all = useGlobalSearch(query, { limit: PAGE_PER_GROUP });
  const one = useGlobalSearch(query, { limit: MAX_PER_GROUP, type, enabled: !!type });
  const groups = all.data?.groups ?? [];
  const shown = type ? (one.data?.groups ?? groups.filter((g) => g.type === type)) : groups;
  const total = groups.reduce((n, g) => n + g.count, 0);
  const loading = all.loading || one.loading;
  const loc = lang === 'en' ? 'en-GB' : 'pt-PT';
  const day = (at: string) =>
    at ? new Date(at).toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  const q = query.trim();

  return (
    <section className="kh-gsp" aria-busy={loading}>
      <div className="kh-gsp__head">
        <div className="kh-gsp__titles">
          <h1 className="kh-gsp__title">{t('gs_title')}</h1>
          <div className="kh-gsp__sub" role="status">
            {!all.terms.length
              ? t('gs_hint')
              : all.data
                ? t(total === 1 ? 'gs_count1' : 'gs_countN')
                    .replace('{n}', String(total))
                    .replace('{q}', all.forQ)
                : t('gs_loading')}
          </div>
        </div>
        {compact && (
          <label className="kh-gsp__search">
            <Icon name="search" size={15} sw={2} />
            <input
              type="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              placeholder={t('search')}
              aria-label={t('gs_title')}
            />
            {loading && <span className="kh-gs__spin" aria-hidden="true" />}
          </label>
        )}
      </div>
      {groups.length > 1 && (
        <div className="kh-gsp__chips" role="group" aria-label={t('gs_filter')}>
          <Chip selected={!type} count={total} onClick={() => setType('')}>
            {t('gs_everything')}
          </Chip>
          {groups.map((g) => (
            <Chip key={g.type} selected={type === g.type} count={g.count} onClick={() => setType(g.type)}>
              {label(g)}
            </Chip>
          ))}
        </div>
      )}
      <div className="kh-gsp__scroll">
        {shown.map((g) => (
          <div key={g.type} className="kh-gsp__group" role="listbox" aria-label={label(g)}>
            <GroupHead group={g} />
            {g.items.map((item) => (
              <ResultRow key={item.id} type={g.type} item={item} terms={all.terms} date={day(item.at)} />
            ))}
            {!type && g.count > g.items.length && (
              <button type="button" className="kh-gsp__more" onClick={() => setType(g.type)}>
                {t('gs_showAll').replace('{n}', String(g.count))}
              </button>
            )}
          </div>
        ))}
        {q && all.data && !loading && !shown.length && (
          <div className="kh-gsp__none">
            <Icon name="search" size={34} sw={1.4} />
            <span className="kh-gsp__noneT">{t('gs_none').replace('{q}', q)}</span>
            <span>{t('gs_noneBody')}</span>
          </div>
        )}
        {all.error && <div className="kh-gsp__none">{t('gs_error')}</div>}
      </div>
    </section>
  );
}
