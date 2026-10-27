'use client';

import { useEffect, useMemo, useState } from 'react';
import { searchTerms } from '@/lib/search/fold';
import type { SearchResponse } from '@/lib/search/global';

// Live results of the global search while the person types: one request per
// pause (DEBOUNCE_MS), the previous one aborted, and a response only ever
// shown for the text that asked for it — a slow answer for "reu" never
// replaces the one for "reuni". Recent answers are kept briefly, so deleting
// characters shows the earlier results at once.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
export const DEBOUNCE_MS = 180;
const CACHE_MS = 30_000;
const CACHE_MAX = 40;
const cache = new Map<string, { at: number; data: SearchResponse }>();

/** Forget cached answers (an item was created/changed/deleted). */
export function clearSearchCache() {
  cache.clear();
}

function cached(key: string): SearchResponse | null {
  const c = cache.get(key);
  if (!c || Date.now() - c.at > CACHE_MS) return null;
  // most recent last (oldest goes first when full)
  cache.delete(key);
  cache.set(key, c);
  return c.data;
}

export type GlobalSearchState = {
  /** results for `forQ` (kept while the next ones load, so the list never blinks empty) */
  data: SearchResponse | null;
  /** the query `data` answers */
  forQ: string;
  /** a request for the current text is pending */
  loading: boolean;
  error: boolean;
};

export function useGlobalSearch(
  q: string,
  { limit, type, enabled = true }: { limit: number; type?: string; enabled?: boolean },
): GlobalSearchState & { terms: string[] } {
  const query = q.trim().replace(/\s+/g, ' ');
  const terms = useMemo(() => searchTerms(query), [query]);
  const key = terms.length && enabled ? `${limit}|${type ?? ''}|${query}` : '';
  const [st, setSt] = useState<GlobalSearchState>({ data: null, forQ: '', loading: false, error: false });

  useEffect(() => {
    if (!key) {
      setSt({ data: null, forQ: '', loading: false, error: false });
      return;
    }
    const hit = cached(key);
    if (hit) {
      setSt({ data: hit, forQ: query, loading: false, error: false });
      return;
    }
    setSt((s) => ({ ...s, loading: true, error: false }));
    const ctl = new AbortController();
    const h = setTimeout(() => {
      const qs = new URLSearchParams({ q: query, limit: String(limit) });
      if (type) qs.set('type', type);
      fetch(`${BASE}/api/v1/search?${qs}`, { credentials: 'same-origin', signal: ctl.signal })
        .then(async (r) => {
          if (!r.ok) throw new Error(String(r.status));
          return (await r.json()) as SearchResponse;
        })
        .then((data) => {
          cache.set(key, { at: Date.now(), data });
          while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
          if (!ctl.signal.aborted) setSt({ data, forQ: query, loading: false, error: false });
        })
        .catch(() => {
          if (!ctl.signal.aborted) setSt((s) => ({ ...s, loading: false, error: true }));
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(h);
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key covers query, limit and type
  }, [key]);

  return { ...st, terms };
}
