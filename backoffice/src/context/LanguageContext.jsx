import { createContext, useContext, useMemo, useState } from 'react';
import { translate } from '../../../client/src/i18n/translations.js';

const LanguageContext = createContext(null);
const STORAGE_KEY = 'kh-backoffice-lang';

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem(STORAGE_KEY) || 'pt');

  const t = useMemo(() => (path, vars) => translate(lang, path, vars), [lang]);

  const setLanguage = (next) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  };

  return <LanguageContext.Provider value={{ lang, t, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
