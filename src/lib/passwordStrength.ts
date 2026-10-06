// Password strength exactly as the Register / ResetPassword prototypes score
// it (0–4) and the three rules shown on ResetPassword. Client and server.
export const STRENGTH_COLORS = [
  'oklch(0.66 0.17 25)',
  'oklch(0.72 0.15 50)',
  'oklch(0.8 0.13 85)',
  'oklch(0.78 0.14 150)',
  'oklch(0.76 0.15 160)',
] as const;

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 256;

export function strengthScore(pw: string): 0 | 1 | 2 | 3 | 4 {
  let sc = 0;
  if (pw.length >= 8) sc++;
  if (pw.length >= 12) sc++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) sc++;
  if (/\d/.test(pw)) sc++;
  if (/[^A-Za-z0-9]/.test(pw)) sc++;
  return Math.min(4, sc) as 0 | 1 | 2 | 3 | 4;
}

export function passwordRules(pw: string) {
  return {
    length: pw.length >= MIN_PASSWORD,
    cases: /[A-Z]/.test(pw) && /[a-z]/.test(pw),
    digitOrSymbol: /[\d\W_]/.test(pw),
  };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
