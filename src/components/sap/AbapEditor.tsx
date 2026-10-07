'use client';

import { useMemo, useRef } from 'react';
import { clCodeLines, clTokens } from '@/lib/codelib';

// Prototype ClCodeEd: gutter + highlighted <pre> under a transparent
// <textarea>; the box scrolls as a whole (no scroll syncing). Names that
// point at another object/node are underlined: Ctrl/⌘ + click opens them
// (a plain click when the code is read-only, i.e. generated).

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function abapHtml(code: string, refs?: ReadonlySet<string>, tip = '') {
  return code
    .split('\n')
    .map((line) =>
      clTokens(line, refs)
        .map((k) =>
          !k.c
            ? esc(k.t)
            : k.c === 'ref'
              ? `<span class="kh-ab-ref" data-ref="${esc(k.ref!)}" title="${esc(tip + k.ref)}">${esc(k.t)}</span>`
              : `<span class="kh-ab-${k.c}">${esc(k.t)}</span>`,
        )
        .join(''),
    )
    .join('\n');
}

const wordAt = (s: string, i: number) => {
  let a = i;
  let b = i;
  while (a > 0 && /[A-Za-z0-9_/]/.test(s[a - 1]!)) a--;
  while (b < s.length && /[A-Za-z0-9_/]/.test(s[b]!)) b++;
  return s.slice(a, b).toUpperCase();
};

export function AbapEditor({
  value,
  pre = '',
  preTip,
  refs,
  refTip = '',
  onRef,
  readOnly,
  onChange,
  label,
}: {
  value: string;
  /** Read-only header above the code (function module interface). */
  pre?: string;
  preTip?: string;
  refs?: ReadonlySet<string>;
  refTip?: string;
  onRef?: (name: string) => void;
  readOnly?: boolean;
  onChange?: (v: string) => void;
  label: string;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const total = (pre ? clCodeLines(pre) : 0) + clCodeLines(value);
  const html = useMemo(() => `${abapHtml(value, refs, refTip)}\n`, [value, refs, refTip]);
  const preHtml = useMemo(() => (pre ? abapHtml(pre) : ''), [pre]);
  const hit = (e: React.MouseEvent) => {
    const r = (e.target as HTMLElement).closest?.('[data-ref]');
    if (r && onRef) onRef(r.getAttribute('data-ref')!);
  };

  return (
    <div className="kh-ab" data-ro={readOnly || undefined}>
      <div className="kh-ab-in">
        <pre className="kh-ab-gut" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => i + 1).join('\n')}
        </pre>
        <div className="kh-ab-body">
          {pre && <pre className="kh-ab-pre" title={preTip} dangerouslySetInnerHTML={{ __html: preHtml }} />}
          <div className="kh-ab-code" data-pre={pre ? '' : undefined}>
            <pre
              className="kh-ab-hl"
              onClick={readOnly ? hit : undefined}
              aria-hidden={readOnly ? undefined : true}
              aria-label={readOnly ? label : undefined}
              dangerouslySetInnerHTML={{ __html: html }}
            />
            {!readOnly && (
              <textarea
                ref={ta}
                className="kh-ab-ta"
                value={value}
                spellCheck={false}
                wrap="off"
                aria-label={label}
                title={refs?.size ? refTip : undefined}
                maxLength={200_000}
                onChange={(e) => onChange?.(e.target.value)}
                onClick={(e) => {
                  if (!(e.ctrlKey || e.metaKey) || !refs || !onRef) return;
                  const w = wordAt(e.currentTarget.value, e.currentTarget.selectionStart);
                  const head = w.split('-')[0]!;
                  if (refs.has(w)) onRef(w);
                  else if (refs.has(head)) onRef(head);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Tab') return;
                  e.preventDefault();
                  const el = e.currentTarget;
                  const a = el.selectionStart;
                  const b = el.selectionEnd;
                  onChange?.(`${el.value.slice(0, a)}  ${el.value.slice(b)}`);
                  requestAnimationFrame(() => {
                    if (ta.current) ta.current.selectionStart = ta.current.selectionEnd = a + 2;
                  });
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
