import { describe, expect, it } from 'vitest';
import { codeHtml, codeRanges, guessLang } from '@/lib/codeHighlight';

describe('note code highlighting', () => {
  it('guesses common languages', () => {
    expect(guessLang('DATA lv_x TYPE i.\nLOOP AT lt_tab INTO ls_row.\nENDLOOP.')).toBe('abap');
    expect(guessLang('{"a": 1, "b": [true]}')).toBe('json');
    expect(guessLang('SELECT name FROM users WHERE id = 1')).toBe('sql');
    expect(guessLang('const a = 1;\nfunction f() { return a; }')).toBe('javascript');
    expect(guessLang('interface A { x: string }')).toBe('typescript');
    expect(guessLang('def f(x):\n    return x\nimport os')).toBe('python');
    expect(guessLang('<div class="a">x</div>')).toBe('html');
    expect(guessLang('cd /opt/app\ndocker compose up -d')).toBe('bash');
    expect(guessLang('just some words')).toBeNull();
  });
  it('highlights ABAP and other languages with escaped HTML', () => {
    const r = codeRanges("WRITE 'Olá'. \" comentário", 'abap');
    expect(r.map((x) => x.cls)).toEqual(['kh-hl-k', 'kh-hl-s', 'kh-hl-c']);
    expect(codeHtml('if (a < b) { return "x"; }', 'javascript')).toBe(
      '<span class="kh-hl-k">if</span> (a &lt; b) { <span class="kh-hl-k">return</span> <span class="kh-hl-s">"x"</span>; }',
    );
    expect(codeHtml('<b>', 'plain')).toBe('&lt;b&gt;');
  });
});
