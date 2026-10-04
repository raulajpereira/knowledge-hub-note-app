import { describe, expect, it } from 'vitest';
import appPt from '@/i18n/dict/app.pt.json';
import appEn from '@/i18n/dict/app.en.json';
import uiPt from '@/i18n/dict/ui.pt.json';
import uiEn from '@/i18n/dict/ui.en.json';
import { isLang, langFromAcceptLanguage, translate, translateList, trAdmin, trMg } from '@/i18n';

describe('app dictionary', () => {
  it('has the same keys in PT and EN', () => {
    expect(Object.keys(appEn).sort()).toEqual(Object.keys(appPt).sort());
  });

  it('has the same keys in the hand-written ui dictionaries', () => {
    expect(Object.keys(uiEn).sort()).toEqual(Object.keys(uiPt).sort());
  });

  it('returns lists for list entries and the key for non-strings', () => {
    expect(translateList('en', 'o_cols').length).toBeGreaterThan(0);
    expect(translate('en', 'o_cols')).toBe('o_cols');
  });

  it('translates by key with PT fallback and key fallback', () => {
    expect(translate('pt', 'newNote')).toBe('Nova Nota');
    expect(translate('en', 'newNote')).toBe('New Note');
    expect(translate('en', 'does.not.exist')).toBe('does.not.exist');
  });

  it('uses Title Case for EN labels (prototype rule)', () => {
    expect(translate('en', 'resetLogo')).toBe('Reset Logo');
  });
});

describe('PT → EN exact translators', () => {
  it('returns PT unchanged', () => {
    expect(trAdmin('pt', 'Voltar à App')).toBe('Voltar à App');
  });

  it('uses exact matches first', () => {
    expect(trAdmin('en', 'Voltar à App')).toBe('Back To App');
    expect(trMg('en', 'Recursos')).toBe('Resources');
  });

  it('applies regex rules with captures', () => {
    expect(trAdmin('en', '3 de 10 lugares vendidos')).toBe('3 of 10 seats sold');
    expect(trAdmin('en', 'há 5 dias')).toBe('5 days ago');
    expect(trMg('en', 'alvo 90%')).toBe('target 90%');
  });

  it('skips rules in exact-only mode and leaves non-text alone', () => {
    expect(trMg('en', 'alvo 90%', true)).toBe('alvo 90%');
    expect(trAdmin('en', '42')).toBe('42');
  });
});

describe('language detection', () => {
  it.each([
    ['en-GB,en;q=0.9', 'en'],
    ['pt-PT,pt;q=0.9,en;q=0.8', 'pt'],
    ['fr-FR,de;q=0.9', 'pt'],
    [null, 'pt'],
  ] as const)('%s → %s', (header, expected) => {
    expect(langFromAcceptLanguage(header)).toBe(expected);
  });

  it('validates language codes', () => {
    expect(isLang('en')).toBe(true);
    expect(isLang('es')).toBe(false);
  });
});
