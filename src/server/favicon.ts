import 'server-only';
import { redis } from '@/lib/redis';
import { safeFetchBytes } from '@/server/net/safeFetch';

// Shortcut icons (prototype used Google's favicon service, which leaks every
// shortcut's domain to Google). The server fetches /favicon.ico itself, with
// the SSRF guard, keeps only real raster images and caches them for a week.

const TTL_S = 7 * 24 * 3600;
export const DOMAIN_RE =
  /^(?=.{1,253}$)(?:(?!-)[a-z0-9-]{1,63}(?<!-)\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/i;

export function iconType(b: Uint8Array): string | null {
  if (b.length >= 4 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'image/x-icon';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && String.fromCharCode(...b.subarray(0, 4)) === 'GIF8') return 'image/gif';
  return null;
}

export async function favicon(domain: string): Promise<{ type: string; body: Buffer } | null> {
  const d = domain.toLowerCase();
  const key = `kh:fav:${d}`;
  try {
    const hit = await redis().getBuffer(key);
    if (hit) return hit.length ? { type: iconType(hit)!, body: hit } : null;
  } catch {
    // no cache
  }
  let out: { type: string; body: Buffer } | null = null;
  try {
    const r = await safeFetchBytes(`https://${d}/favicon.ico`, { timeoutMs: 4000, maxBytes: 256 * 1024 });
    const t = r.status === 200 ? iconType(r.body) : null;
    if (t) out = { type: t, body: r.body };
  } catch {
    out = null;
  }
  try {
    await redis().set(key, out ? out.body : Buffer.alloc(0), 'EX', out ? TTL_S : 24 * 3600);
  } catch {
    // ignore
  }
  return out;
}
