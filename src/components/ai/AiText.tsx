'use client';

import { Fragment, type ReactNode } from 'react';
import { codeHtml } from '@/lib/codeHighlight';

// The assistant's answer as React elements (never raw HTML): paragraphs,
// headings, lists, **bold**, `code`, fenced code blocks (highlighted) and
// citations [n] that open the source they point at.

function inline(text: string, cite: (n: number) => ReactNode, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[(\d{1,2})\](?!\())/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={`${key}b${i++}`}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={`${key}c${i++}`}>{tok.slice(1, -1)}</code>);
    else out.push(<Fragment key={`${key}n${i++}`}>{cite(Number(m[2]))}</Fragment>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function AiText({ text, cite }: { text: string; cite: (n: number) => ReactNode }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const fence = /^```\s*([\w+-]*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) body.push(lines[i++]!);
      i++;
      const lang = fence[1]?.toLowerCase() || null;
      blocks.push(
        <pre key={k++} className="kh-ai-code">
          <code dangerouslySetInnerHTML={{ __html: codeHtml(body.join('\n'), lang) }} />
        </pre>,
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push(
        <p key={k} className="kh-ai-h">
          {inline(h[2]!, cite, `h${k}`)}
        </p>,
      );
      k++;
      i++;
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i]!))
        items.push(lines[i++]!.replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
      const L = ordered ? 'ol' : 'ul';
      blocks.push(
        <L key={k}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, cite, `l${k}.${j}`)}</li>
          ))}
        </L>,
      );
      k++;
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^```|^#{1,4}\s|^\s*([-*•]|\d+[.)])\s+/.test(lines[i]!))
      para.push(lines[i++]!);
    blocks.push(<p key={k}>{inline(para.join('\n'), cite, `p${k}`)}</p>);
    k++;
  }
  return <>{blocks}</>;
}
