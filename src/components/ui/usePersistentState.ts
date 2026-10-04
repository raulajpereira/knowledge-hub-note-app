'use client';

import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'kh.ui.';

/**
 * UI preference persisted per browser (column widths, panel sizes…).
 * Phase 3 moves these into user_prefs (synced across devices) behind the
 * same API, so components don't change.
 */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T) => void, () => void] {
  const [value, setValue] = useState<T>(initial);

  // Read after mount so server and first client render match.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // storage unavailable or corrupt value: keep the default
    }
  }, [key]);

  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(v));
      } catch {
        // quota / private mode: preference just won't persist
      }
    },
    [key],
  );

  const reset = useCallback(() => {
    setValue(initial);
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      // ignore
    }
    // `initial` is a default literal; callers pass a stable value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, set, reset];
}
