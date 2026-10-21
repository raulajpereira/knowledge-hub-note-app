// "Email para a app": the pure checks on an incoming message, kept apart from
// IMAP and the database so they are unit-tested on their own.
import { INBOUND_CODE_CHARS } from '@/lib/notify';

export type HeaderLine = { key: string; line: string };

/** Header values by lower-case name, unfolded, in message order (topmost first). */
export function headerValues(lines: HeaderLine[], name: string): string[] {
  const n = name.toLowerCase();
  return lines
    .filter((h) => h.key.toLowerCase() === n)
    .map((h) =>
      h.line
        .replace(/^[^:]*:/, '')
        .replace(/\r?\n[ \t]+/g, ' ')
        .trim(),
    );
}

/** Where the token may be: the visible recipients and the delivery headers servers add. */
export const RECIPIENT_HEADERS = [
  'to',
  'cc',
  'delivered-to',
  'x-original-to',
  'envelope-to',
  'x-envelope-to',
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The code of `<local>+<code>@<domain>` (base = `<local>@<domain>`) found in
 * the recipient headers, case-insensitive; null when there is none. The code
 * is a random token or one the person chose (letters, digits, . - _): it
 * reaches us verbatim (Gmail ignores dots only in the local part before the
 * "+"), and it can't contain "+" or "@", so the address boundaries are exact.
 */
export function findToken(lines: HeaderLine[], base: string): string | null {
  const at = base.lastIndexOf('@');
  if (at < 1) return null;
  const re = new RegExp(
    `(?:^|[^a-z0-9._%+-])${esc(base.slice(0, at))}\\+(${INBOUND_CODE_CHARS})@${esc(base.slice(at + 1))}(?![a-z0-9.-])`,
    'gi',
  );
  for (const h of RECIPIENT_HEADERS)
    for (const v of headerValues(lines, h))
      for (const m of v.matchAll(re)) if (!m[1]!.includes('..')) return m[1]!.toLowerCase();
  return null;
}

/**
 * The sender is on the person's list: full addresses, or "@domain" for a
 * whole domain. An empty list means the account's own email only.
 */
export function senderAllowed(from: string, allow: string[], accountEmail: string): boolean {
  const f = from.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(f)) return false;
  const list = (allow.length ? allow : [accountEmail]).map((x) => x.trim().toLowerCase()).filter(Boolean);
  return list.some((a) => (a.startsWith('@') ? f.endsWith(a) : f === a));
}

export type AuthVerdict = 'pass' | 'none' | 'fail';

/**
 * Reads the topmost Authentication-Results header — the one our own mail
 * server added on receipt (headers further down could have been written by
 * the sender, so they are ignored). DMARC fail → fail. SPF fail/softfail
 * without a passing DKIM signature → fail. SPF or DKIM pass → pass. No header
 * (or nothing conclusive) → none, accepted: the allowlist still applies.
 */
export function authVerdict(lines: HeaderLine[]): AuthVerdict {
  const top = headerValues(lines, 'authentication-results')[0];
  if (!top) return 'none';
  const res = (method: string) =>
    new RegExp(`(?:^|[;\\s])${method}\\s*=\\s*([a-z]+)`, 'i').exec(top)?.[1]?.toLowerCase();
  const dmarc = res('dmarc');
  const spf = res('spf');
  const dkim = res('dkim');
  if (dmarc === 'fail') return 'fail';
  if ((spf === 'fail' || spf === 'softfail') && dkim !== 'pass') return 'fail';
  if (dkim === 'pass' || spf === 'pass' || dmarc === 'pass') return 'pass';
  return 'none';
}

type PMNode = { type: string; content?: PMNode[]; text?: string; attrs?: Record<string, unknown> };

/** Plain text → a TipTap document: blank lines split paragraphs, single line breaks stay. */
export function textToDoc(text: string, extra: PMNode[] = []): { type: 'doc'; content: PMNode[] } {
  const paras = text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .split(/\n{2,}/)
    .map((p) => p.replace(/[ \t]+\n/g, '\n').trim())
    .filter(Boolean)
    .slice(0, 2000);
  const content: PMNode[] = paras.map((p) => {
    const parts: PMNode[] = [];
    p.split('\n').forEach((l, i) => {
      if (i) parts.push({ type: 'hardBreak' });
      if (l) parts.push({ type: 'text', text: l });
    });
    return { type: 'paragraph', content: parts };
  });
  return { type: 'doc', content: [...content, ...extra] };
}
