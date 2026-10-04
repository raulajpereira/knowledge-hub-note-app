import { describe, expect, it } from 'vitest';
import { parseServerEnv } from '@/lib/env';

const valid = {
  APP_URL: 'https://knowledge-hub.cloud/v2',
  NEXT_PUBLIC_BASE_PATH: '/v2',
  DATABASE_URL: 'postgres://kh_app:x@postgres:5432/knowledgehub',
  REDIS_URL: 'redis://redis:6379',
  S3_ENDPOINT: 'http://minio:9000',
  S3_BUCKET: 'kh-files',
  S3_ACCESS_KEY: 'kh-minio',
  S3_SECRET_KEY: 'a-long-secret',
  ENCRYPTION_KEY: 'a'.repeat(64),
};

describe('parseServerEnv', () => {
  it('accepts a complete configuration and applies defaults', () => {
    const e = parseServerEnv(valid);
    expect(e.NODE_ENV).toBe('development');
    expect(e.S3_FORCE_PATH_STYLE).toBe(true);
    expect(e.SMTP_PORT).toBe(465);
  });

  it('rejects a missing database URL with a readable message', () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    expect(() => parseServerEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects a weak encryption key', () => {
    expect(() => parseServerEnv({ ...valid, ENCRYPTION_KEY: 'short' })).toThrow(/ENCRYPTION_KEY/);
  });

  it.each(['/v2/', 'v2', '/V2'])('rejects malformed base path %s', (p) => {
    expect(() => parseServerEnv({ ...valid, NEXT_PUBLIC_BASE_PATH: p })).toThrow(/NEXT_PUBLIC_BASE_PATH/);
  });

  it('allows an empty base path (served from the root)', () => {
    expect(parseServerEnv({ ...valid, NEXT_PUBLIC_BASE_PATH: '' }).NEXT_PUBLIC_BASE_PATH).toBe('');
  });
});
