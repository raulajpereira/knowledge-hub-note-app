import { describe, expect, it, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

beforeAll(() => {
  Object.assign(process.env, {
    APP_URL: 'https://knowledge-hub.cloud/v2',
    DATABASE_URL: 'postgres://x:y@localhost/z',
    REDIS_URL: 'redis://localhost:6379',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_BUCKET: 'kh-files',
    S3_ACCESS_KEY: 'kh-minio',
    S3_SECRET_KEY: 'secret-secret',
    ENCRYPTION_KEY: 'a'.repeat(64),
  });
});

const req = (headers: Record<string, string>) =>
  new NextRequest('http://127.0.0.1:3100/v2/api/v1/auth/login', { method: 'POST', headers });

describe('assertSameOrigin (CSRF)', () => {
  it('accepts the public origin, the proxied host and requests without Origin', async () => {
    const { assertSameOrigin } = await import('@/server/http');
    expect(() =>
      assertSameOrigin(req({ origin: 'https://knowledge-hub.cloud', host: '127.0.0.1:3100' })),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(req({ origin: 'http://127.0.0.1:3100', host: '127.0.0.1:3100' })),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(
        req({
          origin: 'https://knowledge-hub.cloud',
          'x-forwarded-host': 'knowledge-hub.cloud',
          host: '127.0.0.1:3100',
        }),
      ),
    ).not.toThrow();
    expect(() => assertSameOrigin(req({}))).not.toThrow();
  });
  it('rejects other sites', async () => {
    const { assertSameOrigin } = await import('@/server/http');
    expect(() => assertSameOrigin(req({ origin: 'https://evil.example', host: '127.0.0.1:3100' }))).toThrow(
      'bad_origin',
    );
    expect(() => assertSameOrigin(req({ origin: 'null', host: '127.0.0.1:3100' }))).toThrow('bad_origin');
  });
});
