// i18n core (server + client safe). Dictionaries are extracted from the
// prototypes by scripts/extract-i18n.mjs — edit the prototypes or the JSON,
// never hard-code UI strings in components.
import appPt from './dict/app.pt.json';
import appEn from './dict/app.en.json';
import uiPt from './dict/ui.pt.json';
import uiEn from './dict/ui.en.json';
import adminEx from './dict/admin.pt-en.json';
import adminRules from './dict/admin.rules.json';
import mgEx from './dict/mg.pt-en.json';
import mgRules from './dict/mg.rules.json';

export const LANGS = ['pt', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'pt';
export const LANG_COOKIE = 'kh_lang';

// app.*: extracted from the prototypes. ui.*: generic component labels the
// prototypes inline (e.g. "Pesquisar…" in initSelects) — maintained by hand.
const PT = { ...appPt, ...uiPt };
const EN = { ...appEn, ...uiEn };

export type AppKey = keyof typeof PT;
type Value = string | readonly string[];
export type Dict = Record<AppKey, Value>;

const DICTS: Record<Lang, Dict> = { pt: PT, en: EN as Dict };

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

export function dict(lang: Lang): Dict {
  return DICTS[lang];
}

function lookup(lang: Lang, key: string): Value | undefined {
  return (DICTS[lang] as Record<string, Value>)[key] ?? (DICTS.pt as Record<string, Value>)[key];
}

/** Keyed lookup; falls back to PT, then to the key itself (visible in dev). */
export function translate(lang: Lang, key: AppKey | (string & {})): string {
  const v = lookup(lang, key);
  return typeof v === 'string' ? v : key;
}

/** For the few entries that are lists (e.g. column names). */
export function translateList(lang: Lang, key: AppKey | (string & {})): readonly string[] {
  const v = lookup(lang, key);
  return Array.isArray(v) ? v : [];
}

type Rule = readonly [source: string, flags: string, to: string];

/**
 * PT → EN by exact string, then regex rules (Admin Console / Management
 * prototypes: adTr / mgTr). PT is the source language, so it's returned as is.
 */
export function exactTranslator(exact: Record<string, string>, rules: readonly Rule[]) {
  const compiled = rules.map(([src, flags, to]) => [new RegExp(src, flags), to] as const);
  return (lang: Lang, s: string, exactOnly = false): string => {
    if (lang === 'pt' || typeof s !== 'string' || !/[A-Za-zÀ-ú]/.test(s)) return s;
    if (exact[s] !== undefined) return exact[s];
    if (exactOnly) return s;
    let out = s;
    for (const [re, to] of compiled) out = out.replace(re, to);
    return out;
  };
}

export const trAdmin = exactTranslator(adminEx, adminRules as unknown as Rule[]);
export const trMg = exactTranslator(mgEx, mgRules as unknown as Rule[]);

/** Best match from an Accept-Language header, else the default. */
export function langFromAcceptLanguage(header: string | null | undefined): Lang {
  if (!header) return DEFAULT_LANG;
  for (const part of header.split(',')) {
    const code = part.split(';')[0]?.trim().slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return DEFAULT_LANG;
}
