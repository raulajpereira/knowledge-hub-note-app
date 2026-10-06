'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePrefsContext } from '@/components/shell/PrefsProvider';

const PREFIX = 'kh.ui.';

/**
 * UI preference (column widths, panel sizes…). Inside the signed-in app it
 * lives in user_prefs under `ui.<key>` and syncs across devices; elsewhere
 * (component catalogue) it falls back to localStorage.
 */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T) => void, () => void] {
  const prefs = usePrefsContext();
  const [local, setLocal] = useState<T>(initial);

  // Read after mount so server and first client render match.
  useEffect(() => {
    if (prefs) return;
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw !== null) setLocal(JSON.parse(raw) as T);
    } catch {
      // storage unavailable or corrupt value: keep the default
    }
  }, [key, prefs]);

  const prefKey = `ui.${key}`;
  const value = prefs ? ((prefs.prefs[prefKey] as T | undefined) ?? initial) : local;

  const set = useCallback(
    (v: T) => {
      if (prefs) return prefs.setPref(prefKey, v);
      setLocal(v);
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(v));
      } catch {
        // quota / private mode: preference just won't persist
      }
    },
    [key, prefKey, prefs],
  );

  const reset = useCallback(() => {
    if (prefs) return prefs.setPref(prefKey, null);
    setLocal(initial);
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      // ignore
    }
    // `initial` is a default literal; callers pass a stable value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, prefKey, prefs]);

  return [value, set, reset];
}
