import QRCode from 'qrcode';
import { handler, json } from '@/server/http';
import { requireAuth, requireRecentReauth } from '@/server/auth/request';
import { beginTotpSetup } from '@/server/auth/service';

// Starts 2FA setup: the secret lives 10 min in Redis until /2fa/enable.
// The QR (otpauth URI) is rendered here as SVG so the secret never goes to
// a third-party QR service.
export const POST = handler(async () => {
  const auth = await requireAuth();
  requireRecentReauth(auth);
  const { secret, uri } = await beginTotpSetup(auth);
  const qrSvg = await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return json({ secret, uri, qrSvg });
});
