import { DEV_LANGS, highlightRanges, langOf, rangesHtml, type HlRange } from './devlib';
import { clTokens } from './codelib';

// Code blocks in notes: the Developer library's highlighter (30 languages)
// plus the ABAP one from Code Library SAP, with the same colours. A block
// without a chosen language is detected from its content.

export const NOTE_LANGS: Array<{ id: string; name: string }> = [
  { id: 'abap', name: 'ABAP' },
  ...DEV_LANGS.filter((l) => l.id !== 'plain' && l.id !== 'markdown').map((l) => ({
    id: l.id,
    name: l.name,
  })),
].sort((a, b) => a.name.localeCompare(b.name));

const ABAP_CLS: Record<string, string> = {
  cm: 'kh-hl-c',
  str: 'kh-hl-s',
  num: 'kh-hl-n',
  kw: 'kh-hl-k',
  sy: 'kh-hl-t',
};

function abapRanges(code: string): HlRange[] {
  const out: HlRange[] = [];
  let at = 0;
  for (const line of code.split('\n')) {
    let i = at;
    for (const k of clTokens(line)) {
      if (k.c && ABAP_CLS[k.c]) out.push({ from: i, to: i + k.t.length, cls: ABAP_CLS[k.c]! });
      i += k.t.length;
    }
    at += line.length + 1;
  }
  return out;
}

/** A best guess of the language of `code` (null = plain text). */
export function guessLang(code: string): string | null {
  const s = code.trim();
  if (!s) return null;
  const head = s.slice(0, 4000);
  const n = (re: RegExp) => (head.match(re) ?? []).length;
  if (/^[[{]/.test(s) && /[\]}]$/.test(s)) {
    try {
      JSON.parse(s);
      return 'json';
    } catch {
      // not JSON
    }
  }
  if (/^<\?xml|^<[a-z][\w:-]*[\s>]/i.test(s))
    return /<(html|div|body|span|p|head|script)\b/i.test(head) ? 'html' : 'xml';
  const abap =
    n(
      /^\s*(DATA|TYPES|SELECT|LOOP AT|ENDLOOP|IF|ENDIF|METHOD|ENDMETHOD|FORM|ENDFORM|CALL FUNCTION|READ TABLE|APPEND|WRITE|REPORT|CLASS|PERFORM|FIELD-SYMBOLS|MODIFY|CLEAR)\b[^\n]*\.\s*$/gim,
    ) +
    n(/\bsy-\w+/gi) +
    n(/^\*/gm);
  if (abap >= 2) return 'abap';
  if (
    n(/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|WITH)\b[\s\S]*?\b(FROM|INTO|TABLE|SET|AS)\b/gim) >= 1 &&
    !/[{};]\s*$/m.test(head.replace(/;\s*$/gm, ''))
  )
    return 'sql';
  if (/^#!.*\b(bash|sh|zsh)\b/.test(s) || n(/^\s*(sudo|apt|npm|cd|ls|echo|export|docker|git|curl)\b/gm) >= 2)
    return 'bash';
  if (n(/^\s*(def|class|import|from|elif|print\()\b.*:?\s*$/gm) >= 2 && !/[{};]\s*$/m.test(head))
    return 'python';
  if (/\b(interface|type)\s+\w+\s*[={<]|:\s*(string|number|boolean)\b/.test(head)) return 'typescript';
  if (n(/\b(const|let|function|=>|console\.log|import|export)\b/g) >= 2) return 'javascript';
  if (n(/\b(public|private|class|void|static)\b/g) >= 2 && /;\s*$/m.test(head))
    return /\bnamespace\b|\busing System/.test(head) ? 'csharp' : 'java';
  if (/^\s*[\w-]+\s*:\s*[^\n]+$/m.test(head) && n(/^\s*[\w-]+:\s/gm) >= 3 && !/[{};]/.test(head))
    return 'yaml';
  if (/[.#]?[\w-]+\s*\{[^}]*:[^}]*;[^}]*\}/.test(head)) return 'css';
  return null;
}

/** Highlight ranges for a code block (`lang` empty = detected). */
export function codeRanges(code: string, lang: string | null | undefined): HlRange[] {
  const id = lang || guessLang(code);
  if (!id || id === 'plain') return [];
  if (id === 'abap') return abapRanges(code);
  return highlightRanges(code, langOf(id));
}

export function codeHtml(code: string, lang: string | null | undefined): string {
  return rangesHtml(code, codeRanges(code, lang));
}

export const langName = (id: string | null | undefined) => NOTE_LANGS.find((l) => l.id === id)?.name ?? null;
