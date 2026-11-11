'use client';

import { useEffect, useState } from 'react';

/** The live time and date (client-only: server and browser clocks differ → no hydration mismatch). */
export function useClock(lang: string) {
  // Client-only (server and browser clocks differ → no hydration mismatch).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const loc = lang === 'en' ? 'en-GB' : 'pt-PT';
  return {
    clock: now?.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) ?? ' ',
    date:
      now?.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) ?? '',
  };
}
