import { describe, expect, it } from 'vitest';
import { withAppScrollbars } from '@/lib/scrollbars';

describe('artifact scrollbars', () => {
  it('goes first in <head>, so the page’s own CSS wins', () => {
    const out = withAppScrollbars(
      '<!doctype html><html><head><title>x</title><style>a{}</style></head></html>',
    );
    expect(out.indexOf('data-kh-scrollbars')).toBeLessThan(out.indexOf('<title>'));
    expect(out.startsWith('<!doctype html><html><head><style data-kh-scrollbars>')).toBe(true);
    expect(out).toContain('data-scrolling');
  });
  it('works without <head> (after the doctype) and on fragments', () => {
    expect(withAppScrollbars('<!DOCTYPE html><p>x</p>')).toMatch(
      /^<!DOCTYPE html><style data-kh-scrollbars>/,
    );
    expect(withAppScrollbars('<p>x</p>')).toMatch(/^<style data-kh-scrollbars>.*<\/script><p>x<\/p>$/s);
  });
});
