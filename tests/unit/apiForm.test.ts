import { describe, expect, it } from 'vitest';
import { encodeFormBody, parseFormBody, storeFormBody } from '@/lib/apiForm';

describe('API Playground form body', () => {
  it('reads the stored rows, keeping the switched-off ones', () => {
    const rows = [
      { k: 'grant_type', v: 'client_credentials', on: true },
      { k: 'scope', v: 'x', on: false },
    ];
    expect(parseFormBody(storeFormBody(rows))).toEqual(rows);
  });
  it('reads a plain urlencoded body', () => {
    expect(parseFormBody('a=1&b=hello+world&c=%C3%A7')).toEqual([
      { k: 'a', v: '1', on: true },
      { k: 'b', v: 'hello world', on: true },
      { k: 'c', v: 'ç', on: true },
    ]);
    expect(parseFormBody('')).toEqual([]);
  });
  it('sends only the switched-on rows, resolved and encoded', () => {
    const rows = [
      { k: 'user', v: '{{u}}', on: true },
      { k: 'pw', v: 'a&b=c', on: true },
      { k: 'off', v: '1', on: false },
      { k: '', v: 'no key', on: true },
    ];
    expect(encodeFormBody(rows, (s) => s.replace('{{u}}', 'ana maria'))).toBe(
      'user=ana%20maria&pw=a%26b%3Dc',
    );
  });
});
