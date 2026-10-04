'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LANG_COOKIE, translate, trAdmin, trMg, type AppKey, type Lang } from '.';

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: AppKey | (string & {})) => string;
  tAdmin: (s: string, exactOnly?: boolean) => string;
  tMg: (s: string, exactOnly?: boolean) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function I18nProvider({ initialLang, children }: { initialLang: Lang; children: React.ReactNode }) {
  const router = useRouter();
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next);
      document.documentElement.lang = next;
      document.cookie = `${LANG_COOKIE}=${next}; Path=${basePath || '/'}; Max-Age=31536000; SameSite=Lax`;
      router.refresh(); // re-render server components in the new language
    },
    [router],
  );

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      t: (key) => translate(lang, key),
      tAdmin: (s, exactOnly) => trAdmin(lang, s, exactOnly),
      tMg: (s, exactOnly) => trMg(lang, s, exactOnly),
    }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
