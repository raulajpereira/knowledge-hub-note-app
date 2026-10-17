// Theme and list density (Definições › Aparência). Both live in user prefs
// (`theme`, `density`) and are mirrored into cookies so the server can put
// them on <html> (data-theme / data-density) before anything is painted —
// on the app and on the public pages (login, landing) of the same browser.
// "system" follows prefers-color-scheme: the server can't know it, so a tiny
// inline script (THEME_BOOT_SCRIPT, nonce'd) resolves it before first paint
// and ThemeSync keeps it live afterwards.

export const THEMES = ['dark', 'light', 'system'] as const;
export type ThemePref = (typeof THEMES)[number];
export type Theme = 'dark' | 'light';

export const DENSITIES = ['comfortable', 'compact'] as const;
export type Density = (typeof DENSITIES)[number];

export const THEME_COOKIE = 'kh_theme';
export const DENSITY_COOKIE = 'kh_density';

export function parseThemePref(v: unknown): ThemePref {
  return THEMES.includes(v as ThemePref) ? (v as ThemePref) : 'dark';
}

export function parseDensity(v: unknown): Density {
  return DENSITIES.includes(v as Density) ? (v as Density) : 'comfortable';
}

/** The theme actually shown for a preference. */
export function resolveTheme(pref: ThemePref, prefersLight: boolean): Theme {
  if (pref === 'system') return prefersLight ? 'light' : 'dark';
  return pref;
}

/** Attributes of <html> rendered by the server from the two cookies. */
export function htmlThemeAttrs(themeCookie: string | undefined, densityCookie: string | undefined) {
  const pref = parseThemePref(themeCookie);
  return {
    'data-theme': resolveTheme(pref, false),
    'data-theme-pref': pref,
    'data-density': parseDensity(densityCookie),
  } as const;
}

/** Runs in <head> before the body is parsed: resolves "system" without a flash. */
export const THEME_BOOT_SCRIPT =
  "(function(){try{var d=document.documentElement;if(d.getAttribute('data-theme-pref')==='system')" +
  "d.setAttribute('data-theme',matchMedia('(prefers-color-scheme: light)').matches?'light':'dark')}catch(e){}})()";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** Browser only: shows a theme/density now and remembers it for the server's next render. */
export function applyLook(pref: ThemePref, density: Density) {
  const d = document.documentElement;
  const theme = resolveTheme(pref, matchMedia('(prefers-color-scheme: light)').matches);
  if (d.getAttribute('data-theme-pref') !== pref) d.setAttribute('data-theme-pref', pref);
  if (d.getAttribute('data-theme') !== theme) d.setAttribute('data-theme', theme);
  if (d.getAttribute('data-density') !== density) d.setAttribute('data-density', density);
  const keep = `; Path=${BASE || '/'}; Max-Age=31536000; SameSite=Lax`;
  if (!document.cookie.includes(`${THEME_COOKIE}=${pref}`))
    document.cookie = `${THEME_COOKIE}=${pref}${keep}`;
  if (!document.cookie.includes(`${DENSITY_COOKIE}=${density}`))
    document.cookie = `${DENSITY_COOKIE}=${density}${keep}`;
}
