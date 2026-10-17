'use client';

import { useEffect } from 'react';
import { applyLook, parseDensity, parseThemePref } from '@/lib/theme';
import { usePrefsContext } from './PrefsProvider';

// Keeps <html data-theme / data-density> and their cookies in step with the
// user's prefs (changed in Definições, or on another device), and follows
// the system colour scheme live when the theme is "system".
export function ThemeSync() {
  const prefs = usePrefsContext()!.prefs;
  const pref = parseThemePref(prefs.theme);
  const density = parseDensity(prefs.density);
  useEffect(() => {
    applyLook(pref, density);
    if (pref !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: light)');
    const on = () => applyLook(pref, density);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [pref, density]);
  return null;
}
