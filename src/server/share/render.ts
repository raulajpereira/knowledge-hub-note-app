import 'server-only';
import { FILE_SRC, safeUrl, type PMNode } from '@/server/content/doc';

// A note document (already validated by doc.ts) as static HTML for its public
// page. Every text and attribute is escaped here; only the allowlisted nodes
// and marks exist, links are http(s)/mailto (app-internal links become plain
// text: a visitor can't open them) and images go through the link's own URL.

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const ALIGN = new Set(['left', 'center', 'right', 'justify']);
const align = (n: PMNode) => {
  const a = n.attrs?.textAlign;
  return typeof a === 'string' && ALIGN.has(a) && a !== 'left' ? ` style="text-align:${a}"` : '';
};

function marks(text: string, ms: PMNode['marks']): string {
  let h = esc(text);
  for (const m of ms ?? []) {
    if (m.type === 'bold') h = `<strong>${h}</strong>`;
    else if (m.type === 'italic') h = `<em>${h}</em>`;
    else if (m.type === 'underline') h = `<u>${h}</u>`;
    else if (m.type === 'strike') h = `<s>${h}</s>`;
    else if (m.type === 'code') h = `<code>${h}</code>`;
    else if (m.type === 'link') {
      const href = safeUrl(m.attrs?.href, 'link');
      if (href && /^(https?:|mailto:)/i.test(href))
        h = `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow">${h}</a>`;
    }
  }
  return h;
}

export function docHtml(doc: PMNode, fileUrl: (fileId: string) => string): string {
  const kids = (n: PMNode) => (n.content ?? []).map(node).join('');
  const span = (n: PMNode) => {
    const cs = Number(n.attrs?.colspan) || 1;
    const rs = Number(n.attrs?.rowspan) || 1;
    return `${cs > 1 ? ` colspan="${Math.min(cs, 50)}"` : ''}${rs > 1 ? ` rowspan="${Math.min(rs, 500)}"` : ''}`;
  };
  function node(n: PMNode): string {
    switch (n.type) {
      case 'doc':
        return kids(n);
      case 'text':
        return marks(n.text ?? '', n.marks);
      case 'paragraph':
        return `<p${align(n)}>${kids(n)}</p>`;
      case 'heading': {
        const l = Math.min(4, Math.max(1, Number(n.attrs?.level) || 2));
        return `<h${l}${align(n)}>${kids(n)}</h${l}>`;
      }
      case 'bulletList':
        return `<ul>${kids(n)}</ul>`;
      case 'orderedList': {
        const st = Number(n.attrs?.start) || 1;
        return `<ol${st !== 1 ? ` start="${Math.trunc(st)}"` : ''}>${kids(n)}</ol>`;
      }
      case 'listItem':
        return `<li>${kids(n)}</li>`;
      case 'taskList':
        return `<ul data-type="taskList">${kids(n)}</ul>`;
      case 'taskItem': {
        const on = n.attrs?.checked === true;
        return `<li data-checked="${on}"><label><input type="checkbox" disabled${on ? ' checked' : ''}></label><div>${kids(n)}</div></li>`;
      }
      case 'codeBlock':
        return `<pre><code>${kids(n)}</code></pre>`;
      case 'blockquote':
        return `<blockquote>${kids(n)}</blockquote>`;
      case 'horizontalRule':
        return '<hr>';
      case 'hardBreak':
        return '<br>';
      case 'callout':
        return `<div class="kh-ne-callout">${kids(n)}</div>`;
      case 'image': {
        const m = typeof n.attrs?.src === 'string' ? FILE_SRC.exec(n.attrs.src) : null;
        if (!m) return '';
        const alt = typeof n.attrs?.alt === 'string' ? n.attrs.alt : '';
        return `<img src="${esc(fileUrl(m[1]!))}" alt="${esc(alt)}" loading="lazy">`;
      }
      case 'linkCard': {
        const href = safeUrl(n.attrs?.href, 'link');
        const t = esc(String(n.attrs?.title ?? ''));
        const sub = esc(String(n.attrs?.sub ?? ''));
        const inner = (h: string) =>
          `<span class="kh-ne-card__txt"><span class="kh-ne-card__t">${t || h}</span><span class="kh-ne-card__s">${sub}</span></span>`;
        if (!href || !/^https?:/i.test(href)) return `<div class="kh-ne-card">${inner('')}</div>`;
        return `<a class="kh-ne-card" href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow">${inner(esc(href))}</a>`;
      }
      case 'table':
        return `<div class="kh-pub-table"><table><tbody>${kids(n)}</tbody></table></div>`;
      case 'tableRow':
        return `<tr>${kids(n)}</tr>`;
      case 'tableCell':
        return `<td${span(n)}>${kids(n)}</td>`;
      case 'tableHeader':
        return `<th${span(n)}>${kids(n)}</th>`;
      default:
        return '';
    }
  }
  return node(doc);
}
