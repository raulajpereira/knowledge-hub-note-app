import { createContext, useContext, useMemo } from 'react';
import { translations } from '../i18n/translations.js';
import { api } from '../api.js';
import { useAuth } from './AuthContext.jsx';

const LanguageContext = createContext(null);

function lookup(dict, path) {
  let cur = dict;
  for (const part of path.split('.')) {
    cur = cur?.[part];
    if (cur === undefined) return undefined;
  }
  return cur;
}

export function LanguageProvider({ children }) {
  const { user, updateUserSettings } = useAuth();
  const lang = user?.settings?.language || 'pt';

  const t = useMemo(() => {
    const dict = translations[lang] || translations.pt;
    return (path, vars) => {
      let value = lookup(dict, path);
      if (value === undefined) value = lookup(translations.en, path);
      if (value === undefined) return path;
      if (typeof value === 'string' && vars) {
        return Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), value);
      }
      return value;
    };
  }, [lang]);

  const setLanguage = async (nextLang) => {
    const { settings } = await api.updateSettings({ language: nextLang });
    updateUserSettings(settings);
  };

  return <LanguageContext.Provider value={{ lang, t, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
