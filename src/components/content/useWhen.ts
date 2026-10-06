'use client';

import { useCallback } from 'react';
import { useI18n } from '@/i18n/client';

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** Prototype dates: "Hoje, 12:05", "Ontem, 09:10" or "29/09/2026, 11:30" (full = always the date). */
export function useWhen() {
  const { t, lang } = useI18n();
  const loc = lang === 'en' ? 'en-GB' : 'pt-PT';
  return useCallback(
    (iso: string, full = false) => {
      const d = new Date(iso);
      const hm = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
      const now = new Date();
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      if (!full && sameDay(d, now)) return `${t('t_today')}, ${hm}`;
      if (!full && sameDay(d, y)) return `${t('c_yesterday')}, ${hm}`;
      return `${d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' })}, ${hm}`;
    },
    [loc, t],
  );
}
