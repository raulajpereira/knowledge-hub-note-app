import { describe, expect, it } from 'vitest';
import { allowedPort, safeRequest } from '@/server/net/safeFetch';

// API Playground proxy (SECURITY.md §7): the checks that run before, and at,
// connect time. A success path needs a public host, so it is left to E2E.
const reason = (url: string) =>
  safeRequest({ method: 'GET', url, headers: [] }).then(
    () => 'ok',
    (e: Error) => e.message,
  );

describe('safeRequest', () => {
  it.each([
    ['ftp://example.com/', 'bad_url'],
    ['not a url', 'bad_url'],
    ['http://user:pw@example.com/', 'bad_url'],
    ['http://example.com:22/', 'bad_port'],
    ['http://example.com:25/', 'bad_port'],
    ['http://127.0.0.1/', 'blocked_address'],
    ['http://10.0.0.8:8080/', 'blocked_address'],
    ['http://169.254.169.254/latest/meta-data/', 'blocked_address'],
    ['http://[::1]:3000/', 'blocked_address'],
    ['http://localhost:3100/', 'blocked_address'], // resolved, then refused at connect
  ])('%s → %s', async (url, why) => expect(await reason(url)).toBe(why));

  it('port policy', () => {
    expect(['', '80', '443', '1024', '8080', '65535'].every(allowedPort)).toBe(true);
    expect(['21', '25', '110', '1023'].some(allowedPort)).toBe(false);
  });
});
