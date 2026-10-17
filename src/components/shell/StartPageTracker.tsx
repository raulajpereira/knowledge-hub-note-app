'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { LAST_PAGE_KEY } from '@/lib/prefs';
import { itemOfPath } from '@/lib/startPage';
import { usePrefsContext } from './PrefsProvider';

// "Página inicial: última página usada": remembers the module page in use
// (prefs['ui.lastPage']) — only while that option is chosen, so other users
// don't write a pref on every navigation.
export function StartPageTracker() {
  const ctx = usePrefsContext()!;
  const path = usePathname();
  const on = ctx.prefs.startPage === 'last';
  const last = ctx.prefs[LAST_PAGE_KEY];
  const { setPref } = ctx;
  useEffect(() => {
    if (on && itemOfPath(path) && path !== last) setPref(LAST_PAGE_KEY, path);
  }, [on, path, last, setPref]);
  return null;
}
