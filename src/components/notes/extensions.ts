'use client';

import { mergeAttributes, Node } from '@tiptap/core';
import CodeBlock from '@tiptap/extension-code-block';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { codeRanges } from '@/lib/codeHighlight';
import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { LinkCardView } from './LinkCardView';
import { CodeBlockView } from './CodeBlockView';

// Editor schema additions. The server allowlist (src/server/content/doc.ts)
// must accept every node/mark produced here.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** Images live with the note: the document keeps `/api/v1/files/<id>` and the basePath is added when rendering. */
export const NoteImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (el) => {
          const src = el.getAttribute('src') ?? '';
          return BASE && src.startsWith(`${BASE}/api/v1/files/`) ? src.slice(BASE.length) : src;
        },
        // Images still being imported are not loaded from the third-party host.
        renderHTML: (attrs) =>
          typeof attrs.src === 'string' && attrs.src.startsWith('/api/v1/files/')
            ? { src: `${BASE}${attrs.src}` }
            : { 'data-pending': '' },
      },
    };
  },
}).configure({ inline: false, allowBase64: true });

/** Prototype callout (warning tile): one paragraph of inline content. */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'inline*',
  defining: true,
  parseHTML: () => [{ tag: 'div[data-callout]' }, { tag: 'aside' }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes(HTMLAttributes, { 'data-callout': '', class: 'kh-ne-callout' }),
    0,
  ],
  addCommands() {
    return {
      toggleCallout:
        () =>
        ({ commands, editor }) =>
          editor.isActive('callout') ? commands.setNode('paragraph') : commands.setNode('callout'),
    };
  },
});

/** Link card with the site's icon (prototype "Ligações úteis" block). */
export const LinkCard = Node.create({
  name: 'linkCard',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({
    href: { default: '' },
    title: { default: '' },
    sub: { default: '' },
  }),
  parseHTML: () => [
    {
      tag: 'a[data-link-card]',
      getAttrs: (el) => ({
        href: (el as HTMLElement).getAttribute('href') ?? '',
        title: (el as HTMLElement).getAttribute('data-title') ?? '',
        sub: (el as HTMLElement).getAttribute('data-sub') ?? '',
      }),
    },
  ],
  renderHTML: ({ HTMLAttributes }) => [
    'a',
    mergeAttributes({
      'data-link-card': '',
      href: HTMLAttributes.href,
      'data-title': HTMLAttributes.title,
      'data-sub': HTMLAttributes.sub,
      target: '_blank',
      rel: 'noopener noreferrer',
    }),
    HTMLAttributes.title || HTMLAttributes.href,
  ],
  addNodeView() {
    return ReactNodeViewRenderer(LinkCardView);
  },
  addCommands() {
    return {
      insertLinkCard:
        (attrs: { href: string; title: string; sub: string }) =>
        ({ commands }) =>
          commands.insertContent({ type: 'linkCard', attrs }),
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: { toggleCallout: () => ReturnType };
    linkCard: { insertLinkCard: (attrs: { href: string; title: string; sub: string }) => ReturnType };
  }
}

/** Highlighting of every code block, as inline decorations (the document stays plain text). */
function codeDecorations(doc: PMNode, type: string) {
  const out: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== type) return;
    const start = pos + 1;
    for (const r of codeRanges(node.textContent, node.attrs.language as string | null))
      out.push(Decoration.inline(start + r.from, start + r.to, { class: r.cls }));
    return false;
  });
  return DecorationSet.create(doc, out);
}

/** Code blocks with syntax highlighting, a language picker (or detection) and copy. */
export const NoteCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
  addProseMirrorPlugins() {
    const type = this.name;
    const key = new PluginKey('kh-code-hl');
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key,
        state: {
          init: (_c, state) => codeDecorations(state.doc, type),
          apply: (tr, old) => (tr.docChanged ? codeDecorations(tr.doc, type) : old),
        },
        props: { decorations: (state) => key.getState(state) as DecorationSet },
      }),
    ];
  },
});
