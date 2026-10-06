import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hotp, newRecoveryCodes, totp, verifyTotp } from '@/server/auth/totp';
import { codeType, normalizeCode, randomCode } from '@/server/licensing/codeFormat';
import { passwordRules, strengthScore } from '@/lib/passwordStrength';
import { checkPasswordPolicy } from '@/server/auth/password';
import { accessProblem } from '@/server/auth/session';

describe('TOTP (RFC 6238 / RFC 4226 test vectors)', () => {
  const secret = Buffer.from('12345678901234567890');
  it('matches the RFC 4226 HOTP values', () => {
    expect([0, 1, 2, 9].map((c) => hotp(secret, c))).toEqual(['755224', '287082', '359152', '520489']);
  });
  it('matches RFC 6238 at T=59s (6 digits of 94287082)', () => {
    expect(totp(base32Encode(secret), 59_000)).toBe('287082');
  });
  it('accepts ±1 step of drift only', () => {
    const b32 = base32Encode(secret);
    const now = 1_700_000_000_000;
    expect(verifyTotp(b32, totp(b32, now - 30_000), now)).toBe(true);
    expect(verifyTotp(b32, totp(b32, now - 90_000), now)).toBe(false);
    expect(verifyTotp(b32, 'abcdef', now)).toBe(false);
  });
  it('round-trips base32 and makes unique recovery codes', () => {
    expect(base32Decode(base32Encode(secret)).equals(secret)).toBe(true);
    const codes = newRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{2}$/);
  });
});

describe('activation code format', () => {
  it.each([
    [' kh-lic-123456 ', 'KH-LIC-123456', 'license'],
    ['KHINV654321', 'KH-INV-654321', 'invite'],
    ['KH-ABC-123456', 'KH-ABC-123456', null],
  ] as const)('%s → %s', (input, norm, type) => {
    expect(normalizeCode(input)).toBe(norm);
    expect(codeType(norm)).toBe(type);
  });
  it('generates valid codes of the requested type', () => {
    for (let i = 0; i < 50; i++) {
      expect(codeType(randomCode('license'))).toBe('license');
      expect(codeType(randomCode('invite'))).toBe('invite');
    }
  });
});

describe('password strength (prototype scoring)', () => {
  it.each([
    ['', 0],
    ['abcdefgh', 1],
    ['abcdefghijkl', 2],
    ['Abcdefghijkl', 3],
    ['Abcdefghijk1!', 4],
  ] as const)('%s → %i', (pw, score) => expect(strengthScore(pw)).toBe(score));
  it('reports the three ResetPassword rules', () => {
    expect(passwordRules('Abcdefg1')).toEqual({ length: true, cases: true, digitOrSymbol: true });
    expect(passwordRules('abc')).toEqual({ length: false, cases: false, digitOrSymbol: false });
  });
});

describe('password policy', () => {
  // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
  const fakeHibp = (async () =>
    new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:9659365\r\nAAAA:1')) as unknown as typeof fetch;
  it('rejects short and breached passwords; fails open when HIBP is down', async () => {
    expect(await checkPasswordPolicy('short', fakeHibp, true)).toBe('too_short');
    expect(await checkPasswordPolicy('password', fakeHibp, true)).toBe('pwned');
    expect(await checkPasswordPolicy('Correct-Horse-9', fakeHibp, true)).toBeNull();
    const down = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await checkPasswordPolicy('password', down, true)).toBeNull();
  });
});

describe('access rules', () => {
  const ok = {
    emailVerifiedAt: new Date(),
    userStatus: 'active',
    tenantDeletedAt: null,
    tenantStatus: 'active',
    codeStatus: 'active',
  };
  it('allows a verified active user', () => expect(accessProblem(ok)).toBeNull());
  it.each([
    [{ emailVerifiedAt: null }, 'unverified'],
    [{ userStatus: 'paused' }, 'user_paused'],
    [{ codeStatus: 'paused' }, 'code_paused'],
    [{ codeStatus: 'revoked', tenantDeletedAt: new Date() }, 'code_revoked'],
    [{ tenantDeletedAt: new Date() }, 'tenant_deleted'],
  ] as const)('%o → %s', (patch, expected) => expect(accessProblem({ ...ok, ...patch })).toBe(expected));
});
