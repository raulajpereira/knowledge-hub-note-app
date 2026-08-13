import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getTheme, fontStackFor } from '../../../client/src/styles/theme.js';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'kh-backoffice-settings';
const FONT_SCALE_ZOOM = { small: 0.94, medium: 1, large: 1.1 };

// Backoffice appearance is deliberately its own localStorage blob, never the
// account's `user.settings` row the main app reads/writes — same account,
// same browser, but a theme change here must never bleed into the app your
// clients use, and vice versa. Amber/70 (not the product's purple) is the
// backoffice's own default, distinct out of the box even before anyone
// opens Aparência.
function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const DEFAULTS = {
  theme: 'dark',
  accentHue: 70,
  fontFamily: 'inter',
  fontScale: 'medium',
  radiusStyle: 'default',
  density: 'comfortable',
  sidebarWidth: 232,
};

export function ThemeProvider({ children }) {
  const [settings, setSettings] = useState(() => ({ ...DEFAULTS, ...loadSettings() }));

  const persist = (patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const { theme: mode, accentHue, fontFamily, fontScale, radiusStyle, density, sidebarWidth } = settings;
  const theme = useMemo(() => getTheme(mode, null, accentHue), [mode, accentHue]);

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

  return (
    <ThemeContext.Provider
      value={{
        theme, mode, accentHue, fontFamily, fontScale, radiusStyle, density, sidebarWidth,
        setMode: (v) => persist({ theme: v }),
        setAccentHue: (v) => persist({ accentHue: v }),
        setFontFamily: (v) => persist({ fontFamily: v }),
        setFontScale: (v) => persist({ fontScale: v }),
        setRadiusStyle: (v) => persist({ radiusStyle: v }),
        setDensity: (v) => persist({ density: v }),
        setSidebarWidth: (v) => persist({ sidebarWidth: v }),
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
