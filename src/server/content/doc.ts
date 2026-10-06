// TipTap JSON validation for notes, run on the server for every save: only
// the node/mark types the editor produces, safe link/image URLs, bounded
// size and depth. The browser renders the document through TipTap's schema
// (never as raw HTML), so this closes the remaining hole: hand-crafted API
// calls with javascript: links or huge payloads.
import { ApiError } from '@/server/errors';

export type PMNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
};

const NODE_ATTRS: Record<string, string[]> = {
  doc: [],
  paragraph: ['textAlign'],
  text: [],
  heading: ['level', 'textAlign'],
  bulletList: [],
  orderedList: ['start', 'type'],
  listItem: [],
  taskList: [],
  taskItem: ['checked'],
  codeBlock: ['language'],
  blockquote: [],
  horizontalRule: [],
  hardBreak: [],
  image: ['src', 'alt', 'title', 'width', 'height'],
  callout: [],
  linkCard: ['href', 'title', 'sub'],
  table: [],
  tableRow: [],
  tableCell: ['colspan', 'rowspan', 'colwidth'],
  tableHeader: ['colspan', 'rowspan', 'colwidth'],
};
const MARK_ATTRS: Record<string, string[]> = {
  bold: [],
  italic: [],
  underline: [],
  strike: [],
  code: [],
  link: ['href', 'target', 'rel', 'class'],
};

/** Image src as stored: app-relative, without the basePath (survives the /v2 cut-over). */
export const FILE_SRC = /^\/api\/v1\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export const MAX_DOC_BYTES = 1_000_000;
const MAX_DEPTH = 40;

/** http(s)/mailto, or an app-relative path (internal links, /api/v1/files/… images). */
export function safeUrl(u: unknown, kind: 'link' | 'image'): string | null {
  if (typeof u !== 'string' || u.length > 2048) return null;
  const v = u.trim();
  if (/^\/(?!\/)[^\s]*$/.test(v)) return v;
  if (kind === 'link' && /^mailto:[^\s]+$/i.test(v)) return v;
  if (/^https?:\/\/[^\s]+$/i.test(v)) return v;
  return null;
}

function clean(node: unknown, depth: number): PMNode {
  if (depth > MAX_DEPTH) throw new ApiError(400, 'doc_too_deep');
  if (!node || typeof node !== 'object') throw new ApiError(400, 'doc_invalid');
  const n = node as PMNode;
  const allowed = NODE_ATTRS[n.type];
  if (!allowed) throw new ApiError(400, 'doc_invalid', undefined, { node: String(n.type).slice(0, 30) });
  const out: PMNode = { type: n.type };
  if (n.type === 'text') {
    if (typeof n.text !== 'string') throw new ApiError(400, 'doc_invalid');
    out.text = n.text;
  }
  {
    const src = n.attrs && typeof n.attrs === 'object' ? (n.attrs as Record<string, unknown>) : {};
    const a: Record<string, unknown> = {};
    for (const k of allowed) {
      const v = src[k];
      if (typeof v === 'string') a[k] = v.slice(0, 2048);
      else if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) a[k] = v;
      else if (Array.isArray(v) && v.length <= 64 && v.every((x) => typeof x === 'number')) a[k] = v;
    }
    if (n.type === 'image') {
      // Only images stored with the note (imported by the server); no hot-linking
      // to third-party hosts, which would leak the reader's IP / track opens.
      if (typeof a.src !== 'string' || !FILE_SRC.test(a.src))
        throw new ApiError(400, 'doc_invalid', undefined, { node: 'image' });
    }
    if (n.type === 'linkCard') {
      const href = safeUrl(a.href, 'link');
      if (!href) throw new ApiError(400, 'doc_invalid', undefined, { node: 'linkCard' });
      a.href = href;
      a.title = String(a.title ?? '').slice(0, 200);
      a.sub = String(a.sub ?? '').slice(0, 300);
    }
    if (n.type === 'heading') a.level = Math.min(4, Math.max(1, Number(a.level) || 2));
    if (n.type === 'taskItem') a.checked = a.checked === true;
    if (Object.keys(a).length) out.attrs = a;
  }
  if (Array.isArray(n.marks)) {
    out.marks = n.marks.map((m) => {
      const ma = MARK_ATTRS[m?.type];
      if (!ma) throw new ApiError(400, 'doc_invalid', undefined, { mark: String(m?.type).slice(0, 30) });
      const mm: { type: string; attrs?: Record<string, unknown> } = { type: m.type };
      if (m.type === 'link') {
        const href = safeUrl(m.attrs?.href, 'link');
        if (!href) throw new ApiError(400, 'doc_invalid', undefined, { mark: 'link' });
        mm.attrs = { href };
      }
      return mm;
    });
  }
  if (Array.isArray(n.content)) out.content = n.content.map((c) => clean(c, depth + 1));
  return out;
}

export function validateDoc(input: unknown): PMNode {
  const size = JSON.stringify(input ?? null).length;
  if (size > MAX_DOC_BYTES) throw new ApiError(413, 'doc_too_large');
  const d = clean(input, 0);
  if (d.type !== 'doc') throw new ApiError(400, 'doc_invalid');
  return d;
}

const BLOCKS = new Set([
  'linkCard',
  'paragraph',
  'heading',
  'listItem',
  'taskItem',
  'codeBlock',
  'blockquote',
  'tableCell',
  'tableHeader',
  'callout',
]);

/** Plain text of a document (search + list summaries). */
export function docText(d: PMNode): string {
  const parts: string[] = [];
  const walk = (n: PMNode) => {
    if (n.type === 'text' && n.text) parts.push(n.text);
    if (n.type === 'linkCard') parts.push(`${n.attrs?.title ?? ''} ${n.attrs?.sub ?? ''}`);
    if (n.type === 'hardBreak') parts.push('\n');
    n.content?.forEach(walk);
    if (BLOCKS.has(n.type)) parts.push('\n');
  };
  walk(d);
  return parts
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Checklist progress in the document (prototype: % done above the checklist). */
export function docChecklist(d: PMNode): { done: number; total: number } {
  let done = 0;
  let total = 0;
  const walk = (n: PMNode) => {
    if (n.type === 'taskItem') {
      total++;
      if (n.attrs?.checked) done++;
    }
    n.content?.forEach(walk);
  };
  walk(d);
  return { done, total };
}

/** Attachment ids referenced by images (/api/v1/files/<id>) — used to delete orphans. */
export function docFileIds(d: PMNode): string[] {
  const ids: string[] = [];
  const walk = (n: PMNode) => {
    if (n.type === 'image' && typeof n.attrs?.src === 'string') {
      const m = FILE_SRC.exec(n.attrs.src);
      if (m) ids.push(m[1]!);
    }
    n.content?.forEach(walk);
  };
  walk(d);
  return ids;
}
