// Internal endpoint for query vectors: the web app posts the search text and
// gets the 384 numbers back (a few ms once the model is loaded). Bound to
// loopback by default, to the Docker network in production (EMBED_HOST);
// never published on the host. Every request must carry the shared token.
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { EMBED_AUTH_HEADER, embedToken } from '@/lib/search/embedAuth';
import { embed, modelId, modelLoaded, warmModel } from './embedder';

const MAX_BODY = 8 * 1024;

function authorised(req: http.IncomingMessage, token: Buffer) {
  const got = Buffer.from(String(req.headers[EMBED_AUTH_HEADER] ?? ''));
  return got.length === token.length && timingSafeEqual(got, token);
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function startEmbedServer(): Promise<http.Server> {
  const e = env();
  const token = Buffer.from(embedToken(e.ENCRYPTION_KEY));
  const server = http.createServer((req, res) => {
    if (!authorised(req, token)) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET' && req.url === '/health')
      return send(res, 200, { ok: true, loaded: modelLoaded(), model: modelId() });
    if (req.method !== 'POST' || req.url !== '/embed') return send(res, 404, { error: 'not_found' });
    const parts: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) req.destroy();
      else parts.push(c);
    });
    req.on('end', () => {
      let text = '';
      try {
        const j = JSON.parse(Buffer.concat(parts).toString('utf8')) as { text?: unknown };
        text = typeof j.text === 'string' ? j.text.trim().slice(0, 2000) : '';
      } catch {
        // falls through to 400
      }
      if (!text) return send(res, 400, { error: 'bad_request' });
      // not loaded yet: load in the background and let the caller use keywords this time
      if (!modelLoaded()) {
        warmModel();
        return send(res, 503, { error: 'loading' });
      }
      embed([text], 'query')
        .then(([vector]) => send(res, 200, { vector }))
        .catch((err: unknown) => {
          console.error('[search] query embedding failed:', err);
          send(res, 500, { error: 'failed' });
        });
    });
  });
  server.requestTimeout = 10_000;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(e.EMBED_PORT, e.EMBED_HOST, () => {
      console.log(`[search] embedding endpoint on ${e.EMBED_HOST}:${e.EMBED_PORT}`);
      resolve(server);
    });
  });
}
