'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';

const EVT = 'kh:counts';

/** Pages that create or delete items call this so the sidebar badges refresh. */
export const refreshCounts = () => window.dispatchEvent(new Event(EVT));

export function useCounts(): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    let live = true;
    const load = () =>
      api<{ counts: Record<string, number> }>('/me/counts')
        .then((r) => live && setCounts(r.counts))
        .catch(() => {});
    void load();
    window.addEventListener(EVT, load);
    return () => {
      live = false;
      window.removeEventListener(EVT, load);
    };
  }, []);
  return counts;
}
