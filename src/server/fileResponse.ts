import 'server-only';
import { NextResponse } from 'next/server';
import { inlineType } from '@/lib/drive';

/**
 * A stored file as an HTTP response (Ficheiros, public links). Inline only for
 * an allow-list of types decided by the name (PDF, images, audio/video, text
 * shown as text/plain); everything else — HTML and SVG included — is a
 * download. PDFs are not sandboxed (the browser's viewer refuses that) but may
 * only be framed by the app itself.
 */
export function fileResponse(
  f: { name: string; size: number; stream: ReadableStream; length: number; range: string | null },
  opts: { download?: boolean; publicLink?: boolean } = {},
) {
  const type = opts.download ? null : inlineType(f.name);
  const ascii = f.name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const how = type ? 'inline' : 'attachment';
  const headers: Record<string, string> = {
    'Content-Type': type ?? 'application/octet-stream',
    'Content-Length': String(f.length),
    'Content-Disposition': `${how}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy':
      type === 'application/pdf'
        ? "default-src 'none'; frame-ancestors 'self'"
        : "default-src 'none'; frame-ancestors 'self'; sandbox",
  };
  if (opts.publicLink) headers['X-Robots-Tag'] = 'noindex';
  if (f.range) headers['Content-Range'] = f.range;
  return new NextResponse(f.stream, { status: f.range ? 206 : 200, headers });
}
