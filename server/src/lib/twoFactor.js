import crypto from 'node:crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

export function generateSecret() {
  return authenticator.generateSecret();
}

export async function generateEnrollmentQr(email, secret) {
  const otpauth = authenticator.keyuri(email, 'Knowledge Hub', secret);
  return QRCode.toDataURL(otpauth);
}

export function verifyToken(token, secret) {
  try {
    return authenticator.verify({ token: String(token || ''), secret });
  } catch {
    return false;
  }
}

// Codes like "A1B2C-D3E4F", easy to read/type once, hashed for storage.
export function generateBackupCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  });
}
