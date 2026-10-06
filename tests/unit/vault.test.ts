import { describe, expect, it } from 'vitest';
import {
  decryptJson,
  deriveKek,
  encryptJson,
  fingerprint,
  newDek,
  newRecoveryKey,
  newSalt,
  parseRecoveryKey,
  recoveryKek,
  unwrapDek,
  wrapDek,
} from '@/lib/vaultCrypto';
import { GEN_DEFAULT, pwGen, pwScore, totpCode } from '@/lib/vault';

// Phase 5.1: zero-knowledge vault (SECURITY.md §4, D9). Light Argon2 params in tests.
const FAST = { alg: 'argon2id', m: 1024, t: 2, p: 1 } as const;

describe('vault crypto', () => {
  it('master password wraps the DEK; a wrong password fails; change = re-wrap only', async () => {
    const salt = newSalt();
    const dek = await newDek();
    const wrapped = await wrapDek(dek, await deriveKek('Correct-Horse-9', salt, FAST));
    const ct = await encryptJson(dek, { name: 'SAP PRD', pass: 's3cr3t' });
    expect(ct).not.toContain('s3cr3t');

    const again = await unwrapDek(wrapped, await deriveKek('Correct-Horse-9', salt, FAST));
    expect(await decryptJson(again, ct)).toEqual({ name: 'SAP PRD', pass: 's3cr3t' });
    await expect(unwrapDek(wrapped, await deriveKek('wrong', salt, FAST))).rejects.toThrow();

    // Change master: same DEK, new salt/wrap — old items still open.
    const salt2 = newSalt();
    const wrapped2 = await wrapDek(again, await deriveKek('New-Master-77', salt2, FAST));
    const d2 = await unwrapDek(wrapped2, await deriveKek('New-Master-77', salt2, FAST));
    expect(await decryptJson(d2, ct)).toEqual({ name: 'SAP PRD', pass: 's3cr3t' });
  });

  it('recovery key: 256 bits, parsed from a kit, unwraps the DEK; fingerprint is stable', async () => {
    const rk = newRecoveryKey();
    expect(rk).toMatch(/^KHRK(-[A-HJ-NP-Z2-9]{4}){12}-[A-HJ-NP-Z2-9]{4}$/);
    expect(newRecoveryKey()).not.toBe(rk);
    const kit = `KnowledgeHub — Recovery Kit\n\nChave de recuperação:\n${rk.toLowerCase()}\n`;
    expect(parseRecoveryKey(kit)).toBe(rk);
    expect(parseRecoveryKey('KHRK-AAAA-BBBB')).toBeNull();

    const dek = await newDek();
    const w = await wrapDek(dek, await recoveryKek(rk));
    const back = await unwrapDek(w, await recoveryKek(rk));
    expect(back.raw).toEqual(dek.raw);
    await expect(unwrapDek(w, await recoveryKek(newRecoveryKey()))).rejects.toThrow();
    expect(await fingerprint(rk)).toMatch(/^[0-9A-F]{4}( [0-9A-F]{4}){3}$/);
    expect(await fingerprint(rk)).toBe(await fingerprint(rk));
  });

  it('every encryption uses a fresh IV', async () => {
    const dek = await newDek();
    expect(await encryptJson(dek, { a: 1 })).not.toBe(await encryptJson(dek, { a: 1 }));
  });
});

describe('vault helpers', () => {
  it('TOTP matches RFC 6238 (SHA-1)', async () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
    expect(await totpCode(secret, Math.floor(59 / 30))).toBe('287082');
    expect(await totpCode(secret, Math.floor(1111111109 / 30))).toBe('081804');
    expect(await totpCode(secret, Math.floor(20000000000 / 30))).toBe('353130');
  });
  it('generator respects length and character sets', () => {
    const p = pwGen({ ...GEN_DEFAULT, len: 40, symbols: false });
    expect(p).toHaveLength(40);
    expect(p).toMatch(/^[A-Za-z2-9]+$/);
    expect(pwGen({ len: 12, upper: false, lower: false, digits: true, symbols: false, amb: false })).toMatch(
      /^\d{12}$/,
    );
  });
  it('strength (prototype pwScore)', () => {
    expect(pwScore('')).toBe(-1);
    expect(pwScore('sap123')).toBe(0);
    expect(pwScore(pwGen(GEN_DEFAULT))).toBe(4);
  });
});
