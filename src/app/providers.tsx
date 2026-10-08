'use client';

import { useEffect } from 'react';
import { z } from 'zod';
import { I18nProvider, useI18n } from '@/i18n/client';
import type { Lang } from '@/i18n';
import { ConfirmProvider, ToastProvider } from '@/components/ui';
import { watchScrollbars } from '@/lib/scrollbars';

// Zod probes `new Function` to pick its fast path; the CSP forbids eval, so
// the browser takes the plain path from the start (no blocked-eval report).
if (typeof window !== 'undefined') z.config({ jitless: true });

/** The browser's time zone in a cookie, so the server can greet by the local hour. */
function useTimeZoneCookie() {
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && !document.cookie.includes(`kh_tz=${encodeURIComponent(tz)}`))
        document.cookie = `kh_tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // no Intl time zone
    }
  }, []);
}

function UiProviders({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <ToastProvider dismissLabel={t('ui_dismiss')}>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}

export function Providers({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  useTimeZoneCookie();
  // scrollbars appear while scrolling and fade away after (ui.css)
  useEffect(() => watchScrollbars(document), []);
  return (
    <I18nProvider initialLang={lang}>
      <UiProviders>{children}</UiProviders>
    </I18nProvider>
  );
}
