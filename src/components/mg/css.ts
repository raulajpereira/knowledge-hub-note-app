import type { CSSProperties } from 'react';

// Management.dc.html is styled inline; its style strings are reused as they are
// (1:1 with the prototype) and turned into React style objects here, cached.
const cache = new Map<string, CSSProperties>();
const camel = (p: string) =>
  p.startsWith('--')
    ? p
    : p
        .replace(/^-(webkit|moz|ms)-/, (_m, v: string) => `${v[0]!.toUpperCase()}${v.slice(1)}-`)
        .replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());

export function css(s: string): CSSProperties {
  const hit = cache.get(s);
  if (hit) return hit;
  const out: Record<string, string> = {};
  let depth = 0;
  let cur = '';
  const flush = () => {
    const i = cur.indexOf(':');
    if (i > 0) out[camel(cur.slice(0, i).trim())] = cur.slice(i + 1).trim();
    cur = '';
  };
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ';' && depth === 0) flush();
    else cur += ch;
  }
  flush();
  if (cache.size > 5000) cache.clear();
  cache.set(s, out as CSSProperties);
  return out as CSSProperties;
}

/** The prototype's select chevron. */
export const CHEV =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23fbf8f5' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")";
export const OPT = css('background-color:#2b2c33;color:#f4f2f0;');
