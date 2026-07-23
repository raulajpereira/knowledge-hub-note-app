import { createContext, useContext, useMemo } from 'react';
import { translate } from '../i18n/translations.js';
import { api } from '../api.js';
import { useAuth } from './AuthContext.jsx';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const { user, updateUserSettings } = useAuth();
  const lang = user?.settings?.language || 'pt';

  const t = useMemo(() => (path, vars) => translate(lang, path, vars), [lang]);

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
