'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Prefs } from '@/lib/prefs';

// user_prefs on the client: starts from the server-rendered copy, writes go
// to the API as a debounced merge-patch, and the latest copy is re-read when
// the window regains focus — so another device's changes show up
// ("preferências sincronizadas entre dispositivos").

type PrefsValue = {
  prefs: Prefs;
  setPref: (key: string, value: unknown) => void;
};

const PrefsContext = createContext<PrefsValue | null>(null);
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const URL_ = `${BASE}/api/v1/me/prefs`;
const DEBOUNCE_MS = 500;

export function PrefsProvider({ initial, children }: { initial: Prefs; children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback((keepalive = false) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    fetch(URL_, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
      credentials: 'same-origin',
      keepalive,
    }).catch(() => {
      // offline: keep the edit for the next flush
      pending.current = { ...patch, ...pending.current };
    });
  }, []);

  const setPref = useCallback(
    (key: string, value: unknown) => {
      setPrefs((p) => {
        const next = { ...p };
        if (value === null || value === undefined) delete next[key];
        else next[key] = value;
        return next;
      });
      pending.current[key] = value ?? null;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(), DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => {
    const onHide = () => flush(true);
    const onFocus = async () => {
      if (Object.keys(pending.current).length) return; // local edits win until saved
      try {
        const r = await fetch(URL_, { credentials: 'same-origin' });
        if (!r.ok) return;
        const { prefs: fresh } = (await r.json()) as { prefs: Prefs };
        if (!Object.keys(pending.current).length) setPrefs(fresh);
      } catch {
        // offline
      }
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('focus', onFocus);
      flush(true);
    };
  }, [flush]);

  const value = useMemo(() => ({ prefs, setPref }), [prefs, setPref]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

/** The whole prefs context, or null outside the signed-in app (component catalogue, auth pages). */
export function usePrefsContext(): PrefsValue | null {
  return useContext(PrefsContext);
}

export function usePref<T>(key: string, fallback: T): [T, (v: T | null) => void] {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePref must be used inside <PrefsProvider>');
  const value = (ctx.prefs[key] as T | undefined) ?? fallback;
  const set = useCallback((v: T | null) => ctx.setPref(key, v), [ctx, key]);
  return [value, set];
}
