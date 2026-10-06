import { randomInt } from 'node:crypto';

export const CODE_RE = /^KH-(INV|LIC)-\d{6}$/;
export type CodeType = 'invite' | 'license';

/** Normalises user input: trims, uppercases, accepts missing dashes. */
export function normalizeCode(input: string): string {
  const s = input.trim().toUpperCase().replace(/\s+/g, '');
  const m = /^KH-?(INV|LIC)-?(\d{6})$/.exec(s);
  return m ? `KH-${m[1]}-${m[2]}` : s;
}

export function codeType(code: string): CodeType | null {
  const m = CODE_RE.exec(code);
  if (!m) return null;
  return m[1] === 'INV' ? 'invite' : 'license';
}

export function randomCode(type: CodeType): string {
  return `KH-${type === 'invite' ? 'INV' : 'LIC'}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
}
