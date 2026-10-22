'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';

// Evidence of one test step: thumbnails (images) and file chips, "+" to upload,
// drop files on the strip; pasting into the step's row is handled by the page.
// Clicking a thumbnail opens the lightbox (← → to move, Esc to close).

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
export type Evidence = {
  id: string;
  rowId: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
};
export const evidenceSrc = (id: string) => `${BASE}/api/v1/sap/functional/evidence/${id}`;
const kb = (n: number) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export function EvidenceStrip({
  items,
  busy,
  label,
  onAdd,
  onDelete,
  onOpen,
}: {
  items: Evidence[];
  busy: boolean;
  label: string;
  onAdd: (files: File[]) => void;
  onDelete: (e: Evidence) => void;
  onOpen: (e: Evidence) => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className="kh-ev"
      data-over={over || undefined}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const fs = [...e.dataTransfer.files];
        if (fs.length) onAdd(fs);
      }}
    >
      {items.map((x) =>
        x.mime.startsWith('image/') ? (
          <span key={x.id} className="kh-ev-thumb">
            <button
              type="button"
              title={x.name}
              aria-label={`${t('ev_open')} ${x.name}`}
              onClick={() => onOpen(x)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- evidence streamed by our API */}
              <img src={evidenceSrc(x.id)} alt={x.name} loading="lazy" />
            </button>
            <button
              type="button"
              className="kh-ev-x"
              aria-label={`${t('del')} ${x.name}`}
              onClick={() => onDelete(x)}
            >
              ×
            </button>
          </span>
        ) : (
          <span key={x.id} className="kh-ev-file">
            <a href={evidenceSrc(x.id)} download={x.name} title={x.name}>
              {x.name} <small>{kb(x.size)}</small>
            </a>
            <button
              type="button"
              className="kh-ev-x"
              aria-label={`${t('del')} ${x.name}`}
              onClick={() => onDelete(x)}
            >
              ×
            </button>
          </span>
        ),
      )}
      <button
        type="button"
        className="kh-ev-add"
        disabled={busy || items.length >= 20}
        aria-label={label}
        title={t('ev_addHint')}
        onClick={() => ref.current?.click()}
      >
        {busy ? '…' : '+'} {items.length ? '' : t('ev_add')}
      </button>
      <input
        ref={ref}
        type="file"
        multiple
        hidden
        accept="image/*,.pdf,.txt,.log,.csv,.json,.xml,.xlsx,.xls,.docx,.doc,.pptx,.zip,.eml,.msg"
        onChange={(e) => {
          const fs = [...(e.target.files ?? [])];
          e.target.value = '';
          if (fs.length) onAdd(fs);
        }}
      />
    </div>
  );
}

export function Lightbox({
  items,
  start,
  onClose,
}: {
  items: Evidence[];
  start: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [i, setI] = useState(start);
  const cur = items[i];
  // touch: swipe sideways for the previous / next image
  const x0 = useRef<number | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((v) => Math.min(items.length - 1, v + 1));
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [items.length, onClose]);
  if (!cur) return null;
  return (
    <div className="kh-lb" role="dialog" aria-modal="true" aria-label={cur.name} onClick={onClose}>
      <div
        className="kh-lb-in"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          x0.current = e.touches.length === 1 ? (e.touches[0]?.clientX ?? null) : null;
        }}
        onTouchEnd={(e) => {
          const x = e.changedTouches[0]?.clientX;
          if (x0.current === null || x === undefined) return;
          const dx = x - x0.current;
          x0.current = null;
          if (dx < -60) setI((v) => Math.min(items.length - 1, v + 1));
          else if (dx > 60) setI((v) => Math.max(0, v - 1));
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- evidence streamed by our API */}
        <img src={evidenceSrc(cur.id)} alt={cur.name} />
        <div className="kh-lb-bar">
          <button type="button" disabled={i === 0} aria-label={t('ev_prev')} onClick={() => setI(i - 1)}>
            ‹
          </button>
          <span>
            {cur.name} · {i + 1}/{items.length}
          </span>
          <button
            type="button"
            disabled={i >= items.length - 1}
            aria-label={t('ev_next')}
            onClick={() => setI(i + 1)}
          >
            ›
          </button>
          <button type="button" aria-label={t('i_close')} onClick={onClose}>
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
