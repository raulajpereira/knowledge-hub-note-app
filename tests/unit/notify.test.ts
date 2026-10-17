import { describe, expect, it } from 'vitest';
import {
  inboundAddress,
  inboundToken,
  localParts,
  notifyPrefs,
  NOTIFY_DEFAULTS,
  reminderAt,
  validTz,
  zonedInstant,
} from '@/lib/notify';
import { authVerdict, findToken, headerValues, senderAllowed, textToDoc } from '@/server/inbound/parse';

const H = (...lines: string[]) =>
  lines.map((l) => ({ key: l.slice(0, l.indexOf(':')).toLowerCase(), line: l }));
const TOKEN = 'abcdefghijklmnopqr27';
const BASE = 'entrada@knowledge-hub.cloud';

describe('notification prefs', () => {
  it('fills defaults and drops malformed values', () => {
    expect(notifyPrefs(undefined)).toEqual(NOTIFY_DEFAULTS);
    const p = notifyPrefs({ email: true, meetingLead: 7, summaryTime: '25:00', taskDue: false, junk: 1 });
    expect(p).toEqual({ ...NOTIFY_DEFAULTS, email: true, taskDue: false });
  });

  it('knows time zones', () => {
    expect(validTz('Europe/Lisbon')).toBe(true);
    expect(validTz('America/Sao_Paulo')).toBe(true);
    expect(validTz('Mars/Olympus')).toBe(false);
    expect(validTz("x'; drop")).toBe(false);
  });

  it('converts between instants and local wall-clock time (DST included)', () => {
    expect(localParts(new Date('2026-07-01T23:30:00Z'), 'Europe/Lisbon')).toEqual({
      day: '2026-07-02',
      minutes: 30,
    });
    expect(zonedInstant('2026-07-02', '09:00', 'Europe/Lisbon').toISOString()).toBe(
      '2026-07-02T08:00:00.000Z',
    );
    expect(zonedInstant('2026-12-02', '09:00', 'Europe/Lisbon').toISOString()).toBe(
      '2026-12-02T09:00:00.000Z',
    );
    expect(zonedInstant('2026-12-02', '09:00', 'America/New_York').toISOString()).toBe(
      '2026-12-02T14:00:00.000Z',
    );
  });

  it('computes reminder times', () => {
    const tz = 'Europe/Lisbon';
    expect(reminderAt({ remind: 'none', remindAt: null, dueOn: '2026-07-02' }, tz)).toBeNull();
    expect(reminderAt({ remind: 'due', remindAt: null, dueOn: null }, tz)).toBeNull();
    expect(reminderAt({ remind: 'due', remindAt: null, dueOn: '2026-07-02' }, tz)?.toISOString()).toBe(
      '2026-07-02T08:00:00.000Z',
    );
    expect(reminderAt({ remind: 'day_before', remindAt: null, dueOn: '2026-03-01' }, tz)?.toISOString()).toBe(
      '2026-02-28T09:00:00.000Z',
    );
    expect(
      reminderAt({ remind: 'custom', remindAt: '2026-05-05T10:15:00Z', dueOn: null }, tz)?.toISOString(),
    ).toBe('2026-05-05T10:15:00.000Z');
  });
});

describe('inbound address token', () => {
  it('is 20 base32 characters and builds the address', () => {
    const t = inboundToken(new Uint8Array(16).fill(255));
    expect(t).toMatch(/^[a-z2-7]{20}$/);
    expect(inboundToken(crypto.getRandomValues(new Uint8Array(16)))).toMatch(/^[a-z2-7]{20}$/);
    expect(() => inboundToken(new Uint8Array(4))).toThrow();
    expect(inboundAddress(BASE, TOKEN)).toBe(`entrada+${TOKEN}@knowledge-hub.cloud`);
  });

  it('is found in To, Cc or the delivery headers, case-insensitive', () => {
    expect(findToken(H(`To: Ana <entrada+${TOKEN}@knowledge-hub.cloud>`), BASE)).toBe(TOKEN);
    expect(
      findToken(
        H('To: someone@else.pt', `Cc: x@y.pt, ENTRADA+${TOKEN.toUpperCase()}@Knowledge-Hub.Cloud`),
        BASE,
      ),
    ).toBe(TOKEN);
    // forwarded / Bcc: only the delivery headers have it (folded header too)
    expect(
      findToken(H('To: lista@empresa.pt', `Delivered-To:\r\n entrada+${TOKEN}@knowledge-hub.cloud`), BASE),
    ).toBe(TOKEN);
    expect(findToken(H(`X-Original-To: entrada+${TOKEN}@knowledge-hub.cloud`), BASE)).toBe(TOKEN);
  });

  it('ignores look-alikes', () => {
    expect(findToken(H('To: entrada@knowledge-hub.cloud'), BASE)).toBeNull();
    expect(findToken(H(`To: xentrada+${TOKEN}@knowledge-hub.cloud`), BASE)).toBeNull();
    expect(findToken(H(`To: entrada+${TOKEN}@knowledge-hub.cloud.evil.pt`), BASE)).toBeNull();
    expect(findToken(H(`To: entrada+${TOKEN.slice(0, 10)}@knowledge-hub.cloud`), BASE)).toBeNull();
    expect(findToken(H(`Subject: entrada+${TOKEN}@knowledge-hub.cloud`), BASE)).toBeNull();
    expect(findToken(H(`To: entrada+${TOKEN}@knowledge-hubXcloud`), BASE)).toBeNull();
  });

  it('reads unfolded header values in order', () => {
    expect(headerValues(H('Received: a\r\n\tb', 'Received: c'), 'received')).toEqual(['a b', 'c']);
  });
});

describe('inbound sender allowlist', () => {
  it('defaults to the account email', () => {
    expect(senderAllowed('Ana@Empresa.pt', [], 'ana@empresa.pt')).toBe(true);
    expect(senderAllowed('rui@empresa.pt', [], 'ana@empresa.pt')).toBe(false);
  });
  it('takes addresses and whole domains', () => {
    const list = ['ana@gmail.com', '@empresa.pt'];
    expect(senderAllowed('ana@gmail.com', list, 'x@y.pt')).toBe(true);
    expect(senderAllowed('rui@empresa.pt', list, 'x@y.pt')).toBe(true);
    expect(senderAllowed('rui@notempresa.pt', list, 'x@y.pt')).toBe(false);
    expect(senderAllowed('x@y.pt', list, 'x@y.pt')).toBe(false);
    expect(senderAllowed('', list, 'x@y.pt')).toBe(false);
    expect(senderAllowed('a b@empresa.pt', list, 'x@y.pt')).toBe(false);
  });
});

describe('inbound Authentication-Results', () => {
  const ar = (v: string) => H(`Authentication-Results: mx.hostinger.com; ${v}`);
  it('passes or is neutral', () => {
    expect(authVerdict([])).toBe('none');
    expect(authVerdict(ar('spf=pass smtp.mailfrom=gmail.com; dkim=pass header.d=gmail.com'))).toBe('pass');
    expect(authVerdict(ar('spf=softfail; dkim=pass header.d=gmail.com'))).toBe('pass');
    expect(authVerdict(ar('spf=none; dkim=none'))).toBe('none');
  });
  it('rejects obvious spoofs', () => {
    expect(authVerdict(ar('spf=fail; dkim=none'))).toBe('fail');
    expect(authVerdict(ar('spf=softfail'))).toBe('fail');
    expect(authVerdict(ar('dkim=pass; dmarc=fail'))).toBe('fail');
  });
  it('trusts only the topmost header (the receiving server)', () => {
    const lines = [
      ...H('Authentication-Results: mx.hostinger.com; spf=fail; dkim=none'),
      ...H('Authentication-Results: forged; spf=pass; dkim=pass'),
    ];
    expect(authVerdict(lines)).toBe('fail');
  });
});

describe('text → note document', () => {
  it('splits paragraphs and keeps line breaks', () => {
    expect(textToDoc('Olá\r\nlinha 2\n\n\nSegundo\u0007')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Olá' }, { type: 'hardBreak' }, { type: 'text', text: 'linha 2' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Segundo' }] },
      ],
    });
    expect(textToDoc('').content).toEqual([]);
  });
});
