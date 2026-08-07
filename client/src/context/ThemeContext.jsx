import { createContext, useContext, useEffect, useMemo } from 'react';
import { getTheme, fontStackFor } from '../styles/theme.js';
import { api } from '../api.js';
import { useAuth } from './AuthContext.jsx';

const ThemeContext = createContext(null);

const FONT_SCALE_ZOOM = { small: 0.94, medium: 1, large: 1.1 };

export function ThemeProvider({ children }) {
  const { user, updateUserSettings } = useAuth();
  const mode = user?.settings?.theme || 'dark';
  const accentColor = user?.settings?.accentColor || 'purple';
  const accentHue = user?.settings?.accentHue;
  const fontFamily = user?.settings?.fontFamily || 'inter';
  const fontScale = user?.settings?.fontScale || 'medium';
  const radiusStyle = user?.settings?.radiusStyle || 'default';
  const density = user?.settings?.density || 'comfortable';
  const faviconUrl = user?.settings?.faviconUrl;

  const theme = useMemo(() => getTheme(mode, accentColor, accentHue), [mode, accentColor, accentHue]);

  useEffect(() => {
    const stack = fontStackFor(fontFamily);
    document.documentElement.style.setProperty('--font-body', stack.body);
    document.documentElement.style.setProperty('--font-display', stack.display);
  }, [fontFamily]);

  useEffect(() => {
    document.documentElement.style.setProperty('--app-zoom', String(FONT_SCALE_ZOOM[fontScale] ?? 1));
  }, [fontScale]);

  useEffect(() => {
    document.documentElement.setAttribute('data-radius', radiusStyle);
  }, [radiusStyle]);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
  }, [density]);

  useEffect(() => {
    const link = document.getElementById('dynamic-favicon');
    if (link) link.href = faviconUrl || '/icon.png?v=2';
  }, [faviconUrl]);

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

  const setFontScale = async (nextScale) => {
    const { settings } = await api.updateSettings({ fontScale: nextScale });
    updateUserSettings(settings);
  };

  const setRadiusStyle = async (nextStyle) => {
    const { settings } = await api.updateSettings({ radiusStyle: nextStyle });
    updateUserSettings(settings);
  };

  const setDensity = async (nextDensity) => {
    const { settings } = await api.updateSettings({ density: nextDensity });
    updateUserSettings(settings);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme, mode, accentColor, accentHue, fontFamily, fontScale, radiusStyle, density,
        setMode, setAccentColor, setAccentHue, setFontFamily, setFontScale, setRadiusStyle, setDensity,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
