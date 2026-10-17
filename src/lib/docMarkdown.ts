// TipTap / ProseMirror JSON (Notes, meeting topics) → Markdown (GFM), for
// "Exportar os meus dados". Covers the node set the editor produces (see
// server/content/doc.ts); anything unknown keeps its text.

type Node = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
};

export type MdOptions = {
  /** maps an image src to the path written in the Markdown (null: keep the src) */
  image?: (src: string) => string | null;
};

const esc = (s: string) => s.replace(/([\\`*[\]])/g, '\\$1');
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function inline(nodes: Node[] | undefined, o: MdOptions): string {
  let out = '';
  for (const n of nodes ?? []) {
    if (n.type === 'hardBreak') {
      out += '  \n';
      continue;
    }
    if (n.type === 'image') {
      out += image(n, o);
      continue;
    }
    if (n.type !== 'text') {
      out += inline(n.content, o);
      continue;
    }
    const marks = n.marks ?? [];
    const has = (t: string) => marks.some((m) => m.type === t);
    let t = has('code') ? `\`${(n.text ?? '').replace(/`/g, "'")}\`` : esc(n.text ?? '');
    if (!has('code') && t.trim()) {
      if (has('bold')) t = `**${t}**`;
      if (has('italic')) t = `*${t}*`;
      if (has('strike')) t = `~~${t}~~`;
    }
    const link = marks.find((m) => m.type === 'link');
    if (link && str(link.attrs?.href)) t = `[${t}](${str(link.attrs?.href).replace(/\)/g, '%29')})`;
    out += t;
  }
  return out;
}

function image(n: Node, o: MdOptions) {
  const src = str(n.attrs?.src);
  const to = (src && o.image?.(src)) || src;
  return `![${esc(str(n.attrs?.alt))}](${to.replace(/\)/g, '%29').replace(/ /g, '%20')})`;
}

const indent = (s: string, pad: string) =>
  s
    .split('\n')
    .map((l, i) => (i === 0 || !l ? l : pad + l))
    .join('\n');

function list(n: Node, o: MdOptions): string {
  const ordered = n.type === 'orderedList';
  let i = typeof n.attrs?.start === 'number' ? n.attrs.start : 1;
  return (n.content ?? [])
    .map((li) => {
      const task = li.type === 'taskItem';
      const marker = ordered ? `${i++}. ` : task ? `- [${li.attrs?.checked ? 'x' : ' '}] ` : '- ';
      const body = (li.content ?? []).map((c) => block(c, o)).join('\n');
      return marker + indent(body, ' '.repeat(ordered ? marker.length : 2));
    })
    .join('\n');
}

function table(n: Node, o: MdOptions): string {
  const rows = (n.content ?? []).map((r) =>
    (r.content ?? []).map((c) =>
      (c.content ?? [])
        .map((p) => inline(p.content, o))
        .join('<br>')
        .replace(/\|/g, '\\|')
        .replace(/\n/g, ' '),
    ),
  );
  if (!rows.length) return '';
  const w = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${Array.from({ length: w }, (_, i) => r[i] ?? '').join(' | ')} |`;
  return [line(rows[0]!), `|${' --- |'.repeat(w)}`, ...rows.slice(1).map(line)].join('\n');
}

function block(n: Node, o: MdOptions): string {
  switch (n.type) {
    case 'paragraph':
      return inline(n.content, o);
    case 'heading': {
      const l = Math.min(6, Math.max(1, Number(n.attrs?.level) || 1));
      return `${'#'.repeat(l)} ${inline(n.content, o)}`;
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return list(n, o);
    case 'codeBlock': {
      const code = (n.content ?? []).map((c) => c.text ?? '').join('');
      const fence = code.includes('```') ? '~~~~' : '```';
      return `${fence}${str(n.attrs?.language)}\n${code}\n${fence}`;
    }
    case 'blockquote':
    case 'callout':
      return blocks(n.content, o)
        .split('\n')
        .map((l) => (l ? `> ${l}` : '>'))
        .join('\n');
    case 'horizontalRule':
      return '---';
    case 'image':
      return image(n, o);
    case 'linkCard': {
      const href = str(n.attrs?.href);
      return href ? `[${esc(str(n.attrs?.title) || href)}](${href.replace(/\)/g, '%29')})` : '';
    }
    case 'table':
      return table(n, o);
    default:
      return n.content ? blocks(n.content, o) : esc(n.text ?? '');
  }
}

function blocks(nodes: Node[] | undefined, o: MdOptions): string {
  return (nodes ?? [])
    .map((n) => block(n, o))
    .filter((s, i, a) => s !== '' || (i > 0 && a[i - 1] !== ''))
    .join('\n\n');
}

export function docToMarkdown(doc: unknown, o: MdOptions = {}): string {
  if (!doc || typeof doc !== 'object') return '';
  return `${blocks((doc as Node).content, o).trim()}\n`;
}
