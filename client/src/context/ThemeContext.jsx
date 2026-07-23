import { createContext, useContext, useEffect, useMemo } from 'react';
import { getTheme, fontStackFor } from '../styles/theme.js';
import { api } from '../api.js';
import { useAuth } from './AuthContext.jsx';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const { user, updateUserSettings } = useAuth();
  const mode = user?.settings?.theme || 'dark';
  const accentColor = user?.settings?.accentColor || 'purple';
  const accentHue = user?.settings?.accentHue;
  const fontFamily = user?.settings?.fontFamily || 'inter';

  const theme = useMemo(() => getTheme(mode, accentColor, accentHue), [mode, accentColor, accentHue]);

  useEffect(() => {
    const stack = fontStackFor(fontFamily);
    document.documentElement.style.setProperty('--font-body', stack.body);
    document.documentElement.style.setProperty('--font-display', stack.display);
  }, [fontFamily]);

  const setMode = async (nextMode) => {
    const { settings } = await api.updateSettings({ theme: nextMode });
    updateUserSettings(settings);
  };

  const setAccentColor = async (nextAccent) => {
    const { settings } = await api.updateSettings({ accentColor: nextAccent, accentHue: null });
    updateUserSettings(settings);
  };

  const setAccentHue = async (nextHue) => {
    const { settings } = await api.updateSettings({ accentHue: nextHue });
    updateUserSettings(settings);
  };

  const setFontFamily = async (nextFont) => {
    const { settings } = await api.updateSettings({ fontFamily: nextFont });
    updateUserSettings(settings);
  };

  return (
    <ThemeContext.Provider value={{ theme, mode, accentColor, accentHue, fontFamily, setMode, setAccentColor, setAccentHue, setFontFamily }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
