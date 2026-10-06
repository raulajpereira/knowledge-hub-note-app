// Vault helpers without secrets (prototype pwScore / pwGen / totpCode).

export type VaultEntry = {
  name: string;
  user: string;
  pass: string;
  url: string;
  totp: string;
  notes: string;
  folder: string;
  fav: boolean;
  /** ms epoch of the last password change (age / "Com mais de 90 dias") */
  changedTs: number;
  createdTs: number;
  usedTs: number | null;
};

export const emptyEntry = (now = Date.now()): VaultEntry => ({
  name: '',
  user: '',
  pass: '',
  url: '',
  totp: '',
  notes: '',
  folder: '',
  fav: false,
  changedTs: now,
  createdTs: now,
  usedTs: null,
});

/** 0 very weak … 4 very strong, -1 empty (prototype pwScore). */
export function pwScore(p: string): number {
  if (!p) return -1;
  let pool = 0;
  if (/[a-z]/.test(p)) pool += 26;
  if (/[A-Z]/.test(p)) pool += 26;
  if (/\d/.test(p)) pool += 10;
  if (/[^A-Za-z0-9]/.test(p)) pool += 32;
  let bits = p.length * Math.log2(pool || 1);
  if (/^(.)\1+$/.test(p) || /(password|summer|winter|1234|qwerty|jira|sap)\d*/i.test(p)) bits -= 25;
  return bits < 28 ? 0 : bits < 45 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
}

export type GenOpts = {
  len: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
  amb: boolean;
};
export const GEN_DEFAULT: GenOpts = {
  len: 20,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  amb: true,
};

/** Prototype pwGen with rejection sampling (no modulo bias). amb = avoid ambiguous characters. */
export function pwGen(o: GenOpts): string {
  let cs = '';
  if (o.lower) cs += 'abcdefghijkmnopqrstuvwxyz' + (o.amb ? '' : 'l');
  if (o.upper) cs += 'ABCDEFGHJKLMNPQRSTUVWXYZ' + (o.amb ? '' : 'IO');
  if (o.digits) cs += '23456789' + (o.amb ? '' : '01');
  if (o.symbols) cs += '!@#$%&*?-_=+';
  if (!cs) cs = 'abcdefghijkmnopqrstuvwxyz';
  const limit = Math.floor(2 ** 32 / cs.length) * cs.length;
  let out = '';
  while (out.length < o.len) {
    const a = globalThis.crypto.getRandomValues(new Uint32Array(o.len * 2));
    for (const n of a) if (n < limit && out.length < o.len) out += cs[n % cs.length];
  }
  return out;
}

function b32(secret: string): Uint8Array {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const s = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let val = 0;
  const out: number[] = [];
  for (const c of s) {
    val = (val << 5) | A.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — computed locally, the secret never leaves the browser. */
export async function totpCode(secret: string, step: number): Promise<string> {
  const k = b32(secret);
  if (!k.length) return '——————';
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    k as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  dv.setUint32(0, Math.floor(step / 2 ** 32));
  dv.setUint32(4, step >>> 0);
  const sig = new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', key, buf));
  const o = sig[19]! & 15;
  const n = (((sig[o]! & 127) << 24) | (sig[o + 1]! << 16) | (sig[o + 2]! << 8) | sig[o + 3]!) % 1e6;
  return String(n).padStart(6, '0');
}
