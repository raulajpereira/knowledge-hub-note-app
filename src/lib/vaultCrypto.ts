// Password vault crypto (SECURITY.md §4, D9). Runs in the browser; also
// importable by unit tests (Node has WebCrypto). The server never sees the
// master password, the recovery key, the DEK or any plaintext.
//
//   master password ─Argon2id(salt, 64 MiB, t=3, p=1)→ KEK ─AES-GCM→ wrapped DEK (mp)
//   recovery key (256 bits) ─HKDF-SHA256→ RK-KEK ──────AES-GCM→ wrapped DEK (rk)
//   DEK (256 bits, random) ─AES-256-GCM→ every item / the folder list
import { argon2id } from 'hash-wasm';

export const KDF = { alg: 'argon2id', m: 65_536, t: 3, p: 1 } as const;
export type KdfParams = { alg: 'argon2id'; m: number; t: number; p: number };

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;
const rand = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

export const toB64 = (b: Uint8Array) => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const aesKey = (raw: Uint8Array, usages: KeyUsage[]) =>
  subtle().importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, usages);

/** base64(iv ‖ ciphertext) */
async function seal(key: CryptoKey, data: Uint8Array): Promise<string> {
  const iv = rand(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, data as BufferSource));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return toB64(out);
}
async function open(key: CryptoKey, b64: string): Promise<Uint8Array> {
  const all = fromB64(b64);
  return new Uint8Array(
    await subtle().decrypt(
      { name: 'AES-GCM', iv: all.subarray(0, 12) },
      key,
      all.subarray(12) as BufferSource,
    ),
  );
}

// ── Master password ────────────────────────────────────────────────────────
export const newSalt = () => toB64(rand(16));

export async function deriveKek(password: string, saltB64: string, p: KdfParams = KDF): Promise<CryptoKey> {
  const raw = await argon2id({
    password: password.normalize('NFKC'),
    salt: fromB64(saltB64),
    parallelism: p.p,
    iterations: p.t,
    memorySize: p.m,
    hashLength: 32,
    outputType: 'binary',
  });
  return aesKey(raw, ['encrypt', 'decrypt']);
}

// ── DEK ────────────────────────────────────────────────────────────────────
export type Dek = { key: CryptoKey; raw: Uint8Array };

export async function newDek(): Promise<Dek> {
  const raw = rand(32);
  return { raw, key: await aesKey(raw, ['encrypt', 'decrypt']) };
}
export const wrapDek = (dek: Dek, kek: CryptoKey) => seal(kek, dek.raw);
/** Throws (AES-GCM authentication) when the password / key is wrong. */
export async function unwrapDek(wrapped: string, kek: CryptoKey): Promise<Dek> {
  const raw = await open(kek, wrapped);
  return { raw, key: await aesKey(raw, ['encrypt', 'decrypt']) };
}

// ── Recovery key ───────────────────────────────────────────────────────────
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1

/** 256 random bits as "KHRK-XXXX-…" (13 groups of 4 base32 characters). */
export function newRecoveryKey(): string {
  const bytes = rand(32);
  let bits = 0;
  let val = 0;
  let out = '';
  for (const b of bytes) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return `KHRK-${out.match(/.{1,4}/g)!.join('-')}`;
}

/** Finds a recovery key in pasted text or an uploaded Recovery Kit file. */
export function parseRecoveryKey(text: string): string | null {
  const m = /KHRK(?:-[A-HJ-NP-Z2-9]{1,4}){13}/.exec(String(text).toUpperCase().replace(/\s+/g, ''));
  return m ? m[0] : null;
}

function rkBytes(key: string): Uint8Array {
  const chars = key.replace(/^KHRK-/, '').replace(/-/g, '');
  let bits = 0;
  let val = 0;
  const out: number[] = [];
  for (const c of chars) {
    const v = B32.indexOf(c);
    if (v < 0) throw new Error('bad key');
    val = (val << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out.slice(0, 32));
}

export async function recoveryKek(key: string): Promise<CryptoKey> {
  const ikm = await subtle().importKey('raw', rkBytes(key) as BufferSource, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode('KnowledgeHub vault v1'),
      info: enc.encode('recovery-wrap'),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** First 64 bits of SHA-256(key) as "ABCD 1234 …" — lets the user match a kit to the vault. */
export async function fingerprint(key: string): Promise<string> {
  const h = new Uint8Array(await subtle().digest('SHA-256', rkBytes(key) as BufferSource));
  const hex = Array.from(h.subarray(0, 8), (x) => x.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return hex.match(/.{4}/g)!.join(' ');
}

// ── Items ──────────────────────────────────────────────────────────────────
export const encryptJson = (dek: Dek, value: unknown) => seal(dek.key, enc.encode(JSON.stringify(value)));
export const decryptJson = async <T>(dek: Dek, b64: string): Promise<T> =>
  JSON.parse(dec.decode(await open(dek.key, b64))) as T;
