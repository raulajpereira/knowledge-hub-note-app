import { describe, expect, it } from 'vitest';
import { htmlThemeAttrs, parseDensity, parseThemePref, resolveTheme, THEME_BOOT_SCRIPT } from '@/lib/theme';
import { canStartAt, itemOfPath, startPath } from '@/lib/startPage';
import { parsePrefsPatch } from '@/lib/prefs';
import { autoTagIndex, chosenTagIndex, tagColors, tagIndex, tagStyle, TAG_PALETTE } from '@/lib/tags';

describe('theme', () => {
  it('parses the preference with dark as the default', () => {
    expect(parseThemePref('light')).toBe('light');
    expect(parseThemePref('system')).toBe('system');
    expect(parseThemePref('pink')).toBe('dark');
    expect(parseThemePref(undefined)).toBe('dark');
  });
  it('resolves "system" from prefers-color-scheme', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
  });
  it('renders <html> attributes from the cookies (system starts dark until the boot script runs)', () => {
    expect(htmlThemeAttrs('light', 'compact')).toEqual({
      'data-theme': 'light',
      'data-theme-pref': 'light',
      'data-density': 'compact',
    });
    expect(htmlThemeAttrs('system', undefined)).toEqual({
      'data-theme': 'dark',
      'data-theme-pref': 'system',
      'data-density': 'comfortable',
    });
    expect(htmlThemeAttrs('"><script>', 'x')['data-theme']).toBe('dark');
  });
  it('the boot script only touches data-theme', () => {
    expect(THEME_BOOT_SCRIPT).toContain("setAttribute('data-theme'");
    expect(THEME_BOOT_SCRIPT).toContain('prefers-color-scheme: light');
  });
});

describe('density', () => {
  it('is comfortable unless compact', () => {
    expect(parseDensity('compact')).toBe('compact');
    expect(parseDensity('comfortable')).toBe('comfortable');
    expect(parseDensity('tiny')).toBe('comfortable');
  });
});

describe('look prefs', () => {
  it('validates theme, density, start page and tag colours', () => {
    expect(parsePrefsPatch({ theme: 'light', density: 'compact', startPage: 'notes' })).toEqual({
      theme: 'light',
      density: 'compact',
      startPage: 'notes',
    });
    expect(() => parsePrefsPatch({ theme: 'blue' })).toThrow();
    expect(() => parsePrefsPatch({ density: 'huge' })).toThrow();
    expect(() => parsePrefsPatch({ startPage: '/evil' })).toThrow();
    expect(parsePrefsPatch({ tagColors: { sap: 3 } })).toEqual({ tagColors: { sap: 3 } });
    expect(() => parsePrefsPatch({ tagColors: { sap: 10 } })).toThrow();
    expect(() => parsePrefsPatch({ tagColors: { sap: 'red' } })).toThrow();
  });
});

describe('start page', () => {
  const mods = new Set(['notes', 'tasks', 'mg_overview']);
  it('maps app paths to nav items', () => {
    expect(itemOfPath('/app/notes')).toBe('notes');
    expect(itemOfPath('/app/mg-overview')).toBe('mg_overview');
    expect(itemOfPath('/app')).toBeNull();
    expect(itemOfPath('/app/notes/x')).toBeNull();
    expect(itemOfPath('https://evil.example/app/notes')).toBeNull();
    expect(itemOfPath(42)).toBeNull();
  });
  it('only allows module pages the plan has', () => {
    expect(canStartAt('notes', mods)).toBe(true);
    expect(canStartAt('tags', mods)).toBe(true); // tied to notes
    expect(canStartAt('emails', mods)).toBe(false);
    expect(canStartAt('home', mods)).toBe(false);
    expect(canStartAt('nope', mods)).toBe(false);
  });
  it('resolves the preference to a path (null = stay on Início)', () => {
    expect(startPath('home', '/app/notes', mods)).toBeNull();
    expect(startPath(undefined, undefined, mods)).toBeNull();
    expect(startPath('tasks', undefined, mods)).toBe('/app/tasks');
    expect(startPath('mg_overview', undefined, mods)).toBe('/app/mg-overview');
    expect(startPath('emails', undefined, mods)).toBeNull();
    expect(startPath('last', '/app/notes', mods)).toBe('/app/notes');
    expect(startPath('last', '/app/emails', mods)).toBeNull();
    expect(startPath('last', undefined, mods)).toBeNull();
  });
});

describe('chosen tag colours', () => {
  it('override the automatic colour, case-insensitively', () => {
    const auto = autoTagIndex('SAP');
    const other = (auto + 3) % TAG_PALETTE.length;
    const chosen = { sap: other };
    expect(tagIndex('SAP')).toBe(auto);
    expect(tagIndex('SAP', chosen)).toBe(other);
    expect(tagIndex(' sap ', chosen)).toBe(other);
    expect(chosenTagIndex('Sap', chosen)).toBe(other);
    expect(tagColors('SAP', chosen)).toEqual(tagColors('x', { x: other }));
    expect(tagStyle('SAP', chosen)).not.toEqual(tagStyle('SAP'));
  });
  it('ignore invalid entries', () => {
    expect(tagIndex('api', { api: 99 })).toBe(autoTagIndex('api'));
    expect(tagIndex('api', { api: -1 })).toBe(autoTagIndex('api'));
    expect(chosenTagIndex('api', null)).toBeUndefined();
  });
});
