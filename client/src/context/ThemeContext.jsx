import { createContext, useContext, useMemo } from 'react';
import { getTheme } from '../styles/theme.js';
import { api } from '../api.js';
import { useAuth } from './AuthContext.jsx';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const { user, updateUserSettings } = useAuth();
  const mode = user?.settings?.theme || 'dark';
  const accentColor = user?.settings?.accentColor || 'purple';

  const theme = useMemo(() => getTheme(mode, accentColor), [mode, accentColor]);

  const setMode = async (nextMode) => {
    const { settings } = await api.updateSettings({ theme: nextMode });
    updateUserSettings(settings);
  };

  const setAccentColor = async (nextAccent) => {
    const { settings } = await api.updateSettings({ accentColor: nextAccent });
    updateUserSettings(settings);
  };

  return (
    <ThemeContext.Provider value={{ theme, mode, accentColor, setMode, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
