// Code Library (DevLibrary.dc.html + devlib-langs.js): languages, snippet
// types and the prototype's lightweight highlighter (dlHL), shared by the
// view and the server-side validation.

export type DevLang = { id: string; name: string; ext: string; color: string; cm: string[]; kw: string[] };

const K = (s: string) => s.split(' ');
const C = ['//', '/*'],
  H = ['#'],
  D = ['--'];
const L: Array<[string, string, string, string, string[], string[]]> = [
  [
    'javascript',
    'JavaScript',
    'js',
    '#f2d34f',
    C,
    K(
      'const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this null undefined true false yield delete',
    ),
  ],
  [
    'typescript',
    'TypeScript',
    'ts',
    '#4f9cf2',
    C,
    K(
      'const let var function return if else for while switch case break continue new class extends implements interface type enum import export from default async await try catch finally throw typeof keyof in of this null undefined true false public private protected readonly as any string number boolean void never unknown',
    ),
  ],
  [
    'python',
    'Python',
    'py',
    '#5a9fd4',
    H,
    K(
      'def return if elif else for while in not and or is import from as class try except finally raise with lambda yield pass break continue global nonlocal None True False async await self',
    ),
  ],
  [
    'java',
    'Java',
    'java',
    '#e8873a',
    C,
    K(
      'public private protected static final class interface extends implements new return if else for while switch case break continue try catch finally throw throws import package void int long double float boolean char byte short null true false this super',
    ),
  ],
  [
    'csharp',
    'C#',
    'cs',
    '#9b6be0',
    C,
    K(
      'public private protected internal static readonly class interface struct enum namespace using new return if else for foreach while switch case break continue try catch finally throw void int long double float bool string var null true false this base async await get set',
    ),
  ],
  [
    'c',
    'C',
    'c',
    '#8aa1b8',
    C,
    K(
      'int char float double long short void struct union enum typedef static const extern return if else for while do switch case break continue sizeof unsigned signed include define NULL',
    ),
  ],
  [
    'cpp',
    'C++',
    'cpp',
    '#5c8fd6',
    C,
    K(
      'int char float double long void bool auto class struct namespace using template typename public private protected virtual override const static return if else for while switch case break continue new delete try catch throw nullptr true false this std include',
    ),
  ],
  [
    'go',
    'Go',
    'go',
    '#5ac8e0',
    C,
    K(
      'package import func return if else for range switch case break continue go defer select chan map struct interface type var const nil true false make new',
    ),
  ],
  [
    'rust',
    'Rust',
    'rs',
    '#e0876a',
    C,
    K(
      'fn let mut const static struct enum impl trait pub use mod crate return if else for while loop match break continue as ref move self Self Some None Ok Err true false async await where',
    ),
  ],
  [
    'php',
    'PHP',
    'php',
    '#8a92d6',
    C,
    K(
      'function return if else elseif foreach for while switch case break continue class public private protected static new echo use namespace try catch throw null true false array',
    ),
  ],
  [
    'ruby',
    'Ruby',
    'rb',
    '#e05a5a',
    H,
    K(
      'def end class module if elsif else unless while until for in do return yield begin rescue ensure raise nil true false self require attr_accessor',
    ),
  ],
  [
    'kotlin',
    'Kotlin',
    'kt',
    '#b07ae8',
    C,
    K(
      'fun val var class object interface data sealed return if else when for while in is as try catch finally throw null true false this super import package private public override suspend',
    ),
  ],
  [
    'swift',
    'Swift',
    'swift',
    '#f07a4a',
    C,
    K(
      'func let var class struct enum protocol extension return if else guard for while in switch case break continue import public private static self nil true false try catch throw async await',
    ),
  ],
  [
    'dart',
    'Dart',
    'dart',
    '#4fb8d6',
    C,
    K(
      'void var final const class extends implements return if else for while switch case break new import async await null true false this',
    ),
  ],
  [
    'sql',
    'SQL',
    'sql',
    '#e0b04f',
    D,
    K(
      'SELECT FROM WHERE AND OR NOT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP INDEX JOIN LEFT RIGHT INNER OUTER ON GROUP BY ORDER HAVING LIMIT AS DISTINCT UNION NULL IS IN LIKE BETWEEN COUNT SUM AVG MIN MAX CASE WHEN THEN ELSE END WITH',
    ),
  ],
  [
    'html',
    'HTML',
    'html',
    '#e8734a',
    ['<!--'],
    K(
      'html head body div span a p img script style link meta title section header footer nav main ul ol li table tr td th form input button label',
    ),
  ],
  [
    'css',
    'CSS',
    'css',
    '#4f8fe0',
    ['/*'],
    K(
      'display flex grid position absolute relative color background margin padding border width height font none auto important',
    ),
  ],
  [
    'scss',
    'SCSS',
    'scss',
    '#d66a9c',
    C,
    K(
      'mixin include extend if else each for function return display flex grid color background margin padding',
    ),
  ],
  ['json', 'JSON', 'json', '#a0a0a0', [], K('true false null')],
  ['yaml', 'YAML', 'yml', '#cb6a6a', H, K('true false null yes no')],
  ['xml', 'XML', 'xml', '#7aa86a', ['<!--'], []],
  ['markdown', 'Markdown', 'md', '#c8c8c8', [], []],
  [
    'bash',
    'Bash',
    'sh',
    '#7ac36a',
    H,
    K('if then else elif fi for in do done while case esac function return export local echo exit'),
  ],
  [
    'powershell',
    'PowerShell',
    'ps1',
    '#4a8ad6',
    H,
    K(
      'function param if else elseif foreach for while switch return try catch finally throw Write-Host Get-Item Set-Item',
    ),
  ],
  [
    'dockerfile',
    'Dockerfile',
    'Dockerfile',
    '#3a9ad6',
    H,
    K('FROM RUN CMD COPY ADD WORKDIR ENV EXPOSE ENTRYPOINT ARG VOLUME USER LABEL'),
  ],
  [
    'graphql',
    'GraphQL',
    'graphql',
    '#e05aa8',
    H,
    K('query mutation subscription fragment on type input enum interface schema extend implements'),
  ],
  [
    'r',
    'R',
    'r',
    '#4a7ad6',
    H,
    K('function return if else for while repeat in next break TRUE FALSE NULL NA library'),
  ],
  [
    'lua',
    'Lua',
    'lua',
    '#5a6ad6',
    D,
    K('function local return if then else elseif end for in do while repeat until nil true false and or not'),
  ],
  [
    'scala',
    'Scala',
    'scala',
    '#d6504a',
    C,
    K(
      'def val var class object trait extends with case match return if else for while yield import package new null true false this',
    ),
  ],
  ['plain', 'Texto simples', 'txt', '#9a9a9a', [], []],
];

export const DEV_LANGS: DevLang[] = L.map(([id, name, ext, color, cm, kw]) => ({
  id,
  name,
  ext,
  color,
  cm,
  kw,
}));
export const DEV_LANG_IDS = DEV_LANGS.map((l) => l.id) as [string, ...string[]];
const BY_ID = Object.fromEntries(DEV_LANGS.map((l) => [l.id, l]));
export const langOf = (id: string): DevLang => BY_ID[id] ?? BY_ID.plain!;

export const DEV_TYPES = [
  'snippet',
  'function',
  'class',
  'component',
  'hook',
  'script',
  'query',
  'regex',
  'config',
  'template',
  'command',
] as const;
export type DevType = (typeof DEV_TYPES)[number];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type HlRange = { from: number; to: number; cls: string };

/** Prototype dlHL as ranges: comments, strings, numbers, tags (markup) and keywords. */
export function highlightRanges(code: string, L: DevLang | undefined): HlRange[] {
  if (!L || L.id === 'plain' || L.id === 'markdown') return [];
  const parts: string[] = [];
  for (const c of L.cm) {
    if (c === '//') parts.push('\\/\\/[^\\n]*');
    else if (c === '/*') parts.push('\\/\\*[\\s\\S]*?(?:\\*\\/|$)');
    else if (c === '#') parts.push('#[^\\n]*');
    else if (c === '--') parts.push('--[^\\n]*');
    else if (c === '<!--') parts.push('<!--[\\s\\S]*?(?:-->|$)');
  }
  const cmN = parts.length;
  parts.push('"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`');
  parts.push('\\b\\d+(?:\\.\\d+)?\\b');
  const isMk = L.id === 'html' || L.id === 'xml';
  if (isMk) parts.push('<\\/?[\\w:-]+|\\/?>');
  const kw = L.kw.filter(Boolean);
  if (kw.length) parts.push(`\\b(?:${kw.map((k) => k.replace(/[-]/g, '\\-')).join('|')})\\b`);
  const re = new RegExp(parts.map((p) => `(${p})`).join('|'), L.id === 'sql' ? 'gi' : 'g');
  const col = (i: number) => {
    if (i < cmN) return 'kh-hl-c';
    const j = i - cmN;
    if (j === 0) return 'kh-hl-s';
    if (j === 1) return 'kh-hl-n';
    if (isMk && j === 2) return 'kh-hl-t';
    return 'kh-hl-k';
  };
  const out: HlRange[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (!m[0]) {
      re.lastIndex++;
      continue;
    }
    const gi = m.slice(1).findIndex((x) => x !== undefined);
    out.push({ from: m.index, to: m.index + m[0].length, cls: col(gi) });
  }
  return out;
}

/** Ranges as escaped HTML with coloured spans. */
export function rangesHtml(code: string, ranges: HlRange[]): string {
  let out = '';
  let last = 0;
  for (const r of ranges) {
    out += esc(code.slice(last, r.from));
    out += `<span class="${r.cls}">${esc(code.slice(r.from, r.to))}</span>`;
    last = r.to;
  }
  return out + esc(code.slice(last));
}

/** Prototype dlHL: comments, strings, numbers, tags (markup) and keywords as coloured spans (escaped HTML). */
export function highlight(code: string, L: DevLang | undefined): string {
  return rangesHtml(code, highlightRanges(code, L));
}
