'use client';

import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

const domainOf = (href: string) => {
  try {
    return new URL(href).hostname;
  } catch {
    return '';
  }
};

/** Prototype `bk.isLinks` item: favicon tile, title, subtitle, ↗. Icon via our /favicon proxy. */
export function LinkCardView({ node, selected }: ReactNodeViewProps) {
  const { href, title, sub } = node.attrs as { href: string; title: string; sub: string };
  const domain = domainOf(href);
  return (
    <NodeViewWrapper className="kh-ne-card" data-selected={selected || undefined}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        contentEditable={false}
        onClick={(e) => {
          // Inside the editor a plain click selects the card; Ctrl/⌘-click opens it.
          if (!(e.metaKey || e.ctrlKey)) e.preventDefault();
        }}
      >
        <span
          className="kh-ne-card__ic"
          style={
            domain
              ? { backgroundImage: `url(${BASE}/api/v1/favicon?domain=${encodeURIComponent(domain)})` }
              : undefined
          }
        />
        <span className="kh-ne-card__txt">
          <span className="kh-ne-card__t">{title || domain || href}</span>
          <span className="kh-ne-card__s">{sub || domain}</span>
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7 17L17 7" />
          <path d="M8 7h9v9" />
        </svg>
      </a>
    </NodeViewWrapper>
  );
}
