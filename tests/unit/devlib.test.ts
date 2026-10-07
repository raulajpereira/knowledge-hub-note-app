import { describe, expect, it } from 'vitest';
import { DEV_LANGS, highlight, langOf } from '@/lib/devlib';

// Phase 6.2: the prototype's languages and highlighter.
describe('code library', () => {
  it('30 languages, unknown ids fall back to plain text', () => {
    expect(DEV_LANGS).toHaveLength(30);
    expect(langOf('nope').id).toBe('plain');
  });

  it('highlights comments, strings, numbers and keywords; escapes everything else', () => {
    const out = highlight('const x = "<b>" + 42; // done', langOf('javascript'));
    expect(out).toContain('<span class="kh-hl-k">const</span>');
    expect(out).toContain('<span class="kh-hl-s">"&lt;b&gt;"</span>');
    expect(out).toContain('<span class="kh-hl-n">42</span>');
    expect(out).toContain('<span class="kh-hl-c">// done</span>');
    expect(out).not.toContain('<b>');
  });

  it('SQL keywords are case-insensitive; plain text is only escaped', () => {
    expect(highlight('select 1 from dual', langOf('sql'))).toContain('<span class="kh-hl-k">select</span>');
    expect(highlight('<script>', langOf('plain'))).toBe('&lt;script&gt;');
  });
});
