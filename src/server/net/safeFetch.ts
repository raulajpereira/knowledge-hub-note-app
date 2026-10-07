import 'server-only';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

// Outbound HTTP for user-supplied URLs (RSS sources…) with SSRF protection
// (SECURITY.md): http/https only, no credentials in the URL, and every
// address the name resolves to is checked *at connect time* (the check runs
// inside the socket's DNS lookup, so DNS rebinding can't swap in a private
// address after validation). Redirects are followed manually and re-checked.

export class SafeFetchError extends Error {}

const V4_BLOCKED: Array<[number, number]> = [
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10/8
  [0x64400000, 10], // 100.64/10 CGNAT
  [0x7f000000, 8], // 127/8
  [0xa9fe0000, 16], // 169.254/16 link-local (cloud metadata)
  [0xac100000, 12], // 172.16/12
  [0xc0000000, 24], // 192.0.0/24
  [0xc0000200, 24], // 192.0.2/24
  [0xc0a80000, 16], // 192.168/16
  [0xc6120000, 15], // 198.18/15
  [0xc6336400, 24], // 198.51.100/24
  [0xcb007100, 24], // 203.0.113/24
  [0xe0000000, 3], // 224/3 multicast + reserved
];

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
}

export function isPrivateAddress(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) {
    const n = v4ToInt(ip);
    return V4_BLOCKED.some(
      ([base, bits]) => (n & (bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0)) >>> 0 === base,
    );
  }
  if (fam === 6) {
    const a = ip.toLowerCase();
    if (a === '::' || a === '::1') return true;
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return /^(fc|fd|fe[89ab]|ff)/.test(a) || a.startsWith('64:ff9b:') || a.startsWith('2001:db8');
  }
  return true;
}

const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 4);
    const list = addresses as unknown as LookupAddress[];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (!list.length || bad) return callback(new SafeFetchError('blocked_address'), '', 4);
    if ((options as { all?: boolean }).all)
      return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
};

type Raw = { status: number; contentType: string; body: Buffer; url: string };
type Result = { status: number; contentType: string; body: string; url: string };

function once(url: URL, timeoutMs: number, maxBytes: number): Promise<Raw & { location?: string }> {
  return new Promise((resolve, reject) => {
    if (isIP(url.hostname.replace(/^\[|\]$/g, '')) && isPrivateAddress(url.hostname.replace(/^\[|\]$/g, '')))
      return reject(new SafeFetchError('blocked_address'));
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.get(
      url,
      {
        lookup: guardedLookup,
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'KnowledgeHub/2.0 (+https://knowledge-hub.cloud)',
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({
            status,
            contentType: '',
            body: Buffer.alloc(0),
            url: url.href,
            location: res.headers.location,
          });
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy(new SafeFetchError('too_large'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () =>
          resolve({
            status,
            contentType: String(res.headers['content-type'] ?? ''),
            body: Buffer.concat(chunks),
            url: url.href,
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new SafeFetchError('timeout')));
    req.on('error', reject);
  });
}

export async function safeFetchText(input: string, opts: Opts = {}): Promise<Result> {
  const r = await safeFetchBytes(input, opts);
  return { ...r, body: r.body.toString('utf8') };
}

type Opts = { timeoutMs?: number; maxBytes?: number; maxRedirects?: number };

export async function safeFetchBytes(
  input: string,
  { timeoutMs = 6000, maxBytes = 2 * 1024 * 1024, maxRedirects = 3 }: Opts = {},
): Promise<Raw> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SafeFetchError('bad_url');
  }
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new SafeFetchError('bad_url');
    if (url.port && !['80', '443', '8080', '8443'].includes(url.port)) throw new SafeFetchError('bad_port');
    const r = await once(url, timeoutMs, maxBytes);
    if (!r.location) return r;
    url = new URL(r.location, url);
  }
  throw new SafeFetchError('too_many_redirects');
}

// ── API Playground proxy ───────────────────────────────────────────────────
export type ProxyRequest = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers: Array<[string, string]>;
  body?: string;
};
export type ProxyResponse = {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: string;
  truncated: boolean;
  ms: number;
};

// Headers the browser or the proxy own; a user value would be ignored or unsafe.
const DROP_REQ = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
  'keep-alive',
  'proxy-authorization',
  'proxy-connection',
  'expect',
]);
const DROP_RES = new Set(['set-cookie', 'set-cookie2']);

/** Port policy for user requests: web ports and the unprivileged range (no SMTP/SSH/DB well-known ports). */
export const allowedPort = (p: string) => !p || p === '80' || p === '443' || Number(p) >= 1024;

/**
 * One request to a user-supplied URL (API Playground): http/https only, the
 * address is checked at connect time (no private / loopback / metadata
 * ranges), redirects are *returned*, not followed, 20 s timeout, at most
 * `maxBytes` of body kept (the rest is dropped and `truncated` is set).
 */
export function safeRequest(req: ProxyRequest, maxBytes = 2 * 1024 * 1024): Promise<ProxyResponse> {
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return Promise.reject(new SafeFetchError('bad_url'));
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password)
    return Promise.reject(new SafeFetchError('bad_url'));
  if (!allowedPort(url.port)) return Promise.reject(new SafeFetchError('bad_port'));
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && isPrivateAddress(host)) return Promise.reject(new SafeFetchError('blocked_address'));
  const headers: Record<string, string> = { 'user-agent': 'KnowledgeHub-API-Playground/2.0' };
  for (const [k, v] of req.headers) {
    const key = k.trim().toLowerCase();
    if (!key || DROP_REQ.has(key) || !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(key) || /[\r\n]/.test(v)) continue;
    headers[key] = v;
  }
  const body = req.method === 'GET' ? undefined : req.body;
  if (body !== undefined) headers['content-length'] = String(Buffer.byteLength(body));
  const t0 = performance.now();
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const r = mod.request(
      url,
      { method: req.method, headers, lookup: guardedLookup, timeout: 20_000 },
      (res) => {
        let size = 0;
        let truncated = false;
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => {
          if (truncated) return;
          if (size + c.length > maxBytes) {
            chunks.push(c.subarray(0, maxBytes - size));
            size = maxBytes;
            truncated = true;
            res.destroy();
            finish();
            return;
          }
          size += c.length;
          chunks.push(c);
        });
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          const out: Array<[string, string]> = [];
          for (let i = 0; i < res.rawHeaders.length; i += 2) {
            const k = res.rawHeaders[i]!;
            if (!DROP_RES.has(k.toLowerCase())) out.push([k, res.rawHeaders[i + 1]!]);
          }
          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? '',
            headers: out,
            body: Buffer.concat(chunks).toString('utf8'),
            truncated,
            ms: Math.round(performance.now() - t0),
          });
        };
        res.on('end', finish);
        res.on('error', (e) => (done ? undefined : reject(e)));
      },
    );
    r.on('timeout', () => r.destroy(new SafeFetchError('timeout')));
    r.on('error', reject);
    if (body !== undefined) r.write(body);
    r.end();
  });
}
