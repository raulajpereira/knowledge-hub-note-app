import { createHmac } from 'node:crypto';

// The worker's embedding endpoint is internal (Docker network / loopback) and
// also checks this header: derived from ENCRYPTION_KEY, which web and worker
// already share, so no new secret is needed.
export const EMBED_AUTH_HEADER = 'x-kh-embed';
export const embedToken = (encryptionKey: string) =>
  createHmac('sha256', Buffer.from(encryptionKey, 'hex')).update('kh-embed-v1').digest('base64url');
