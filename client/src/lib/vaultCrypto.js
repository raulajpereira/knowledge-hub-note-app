// All key material and plaintext stays in the browser. The server only ever
// receives base64 ciphertext blobs it cannot decrypt.

const PBKDF2_ITERATIONS = 300_000;

function toBase64(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(len) {
  return crypto.getRandomValues(new Uint8Array(len));
}

async function importRawAesKey(bytes) {
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function deriveKeyFromPassword(password, saltBytes, iterations) {
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function aesEncryptBytes(key, plainBytes) {
  const iv = randomBytes(12);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes);
  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.length);
  return toBase64(combined);
}

async function aesDecryptBytes(key, base64) {
  const combined = fromBase64(base64);
  const iv = combined.slice(0, 12);
  const cipherBytes = combined.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBytes);
  return new Uint8Array(plainBuf);
}

export function generateMasterKeyBytes() {
  return randomBytes(32);
}

export function generateRecoveryKey() {
  const bytes = randomBytes(32);
  const b32 = toBase64(bytes).replace(/[+/=]/g, '').toUpperCase().slice(0, 40);
  const formatted = b32.match(/.{1,5}/g).join('-');
  return { bytes, formatted };
}

// Recovery key is high-entropy already; import it directly as an AES key (no KDF needed).
export async function recoveryStringToKey(formatted) {
  const clean = formatted.replace(/-/g, '');
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(clean));
  return importRawAesKey(new Uint8Array(digest));
}

export async function setupVault(vaultPassword) {
  const masterKeyBytes = generateMasterKeyBytes();
  const saltBytes = randomBytes(16);
  const passwordKey = await deriveKeyFromPassword(vaultPassword, saltBytes, PBKDF2_ITERATIONS);
  const wrappedKey = await aesEncryptBytes(passwordKey, masterKeyBytes);

  const recovery = generateRecoveryKey();
  const recoveryKey = await recoveryStringToKey(recovery.formatted);
  const recoveryWrappedKey = await aesEncryptBytes(recoveryKey, masterKeyBytes);

  return {
    masterKeyBytes,
    recoveryFormatted: recovery.formatted,
    payload: {
      salt: toBase64(saltBytes),
      wrappedKey,
      recoveryWrappedKey,
      iterations: PBKDF2_ITERATIONS,
    },
  };
}

export async function unlockWithPassword(vaultPassword, vaultInfo) {
  const saltBytes = fromBase64(vaultInfo.salt);
  const passwordKey = await deriveKeyFromPassword(vaultPassword, saltBytes, vaultInfo.iterations);
  const masterKeyBytes = await aesDecryptBytes(passwordKey, vaultInfo.wrappedKey);
  return masterKeyBytes;
}

export async function unlockWithRecoveryKey(recoveryFormatted, vaultInfo) {
  const recoveryKey = await recoveryStringToKey(recoveryFormatted);
  const masterKeyBytes = await aesDecryptBytes(recoveryKey, vaultInfo.recoveryWrappedKey);
  return masterKeyBytes;
}

export async function rewrapMasterKey(masterKeyBytes, newVaultPassword, { regenerateRecovery = false } = {}) {
  const saltBytes = randomBytes(16);
  const passwordKey = await deriveKeyFromPassword(newVaultPassword, saltBytes, PBKDF2_ITERATIONS);
  const wrappedKey = await aesEncryptBytes(passwordKey, masterKeyBytes);

  let recoveryWrappedKey;
  let recoveryFormatted;
  if (regenerateRecovery) {
    const recovery = generateRecoveryKey();
    recoveryFormatted = recovery.formatted;
    const recoveryKey = await recoveryStringToKey(recoveryFormatted);
    recoveryWrappedKey = await aesEncryptBytes(recoveryKey, masterKeyBytes);
  }

  return {
    recoveryFormatted,
    payload: { salt: toBase64(saltBytes), wrappedKey, recoveryWrappedKey, iterations: PBKDF2_ITERATIONS },
  };
}

export async function encryptEntry(masterKeyBytes, entryObj) {
  const key = await importRawAesKey(masterKeyBytes);
  const plainBytes = new TextEncoder().encode(JSON.stringify(entryObj));
  return aesEncryptBytes(key, plainBytes);
}

export async function decryptEntry(masterKeyBytes, envelopeBase64) {
  const key = await importRawAesKey(masterKeyBytes);
  const plainBytes = await aesDecryptBytes(key, envelopeBase64);
  return JSON.parse(new TextDecoder().decode(plainBytes));
}
