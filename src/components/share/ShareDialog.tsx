'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './share.css';

/** Dimmed overlay + glass dialog of the Sharing prototype (blur on a sibling layer, see mg/ui Dialog). */
export function ShareDialog({
  label,
  onClose,
  width = 520,
  children,
}: {
  label: string;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      prev?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className="kh-sh-dim" onClick={onClose}>
      <div className="kh-sh-dim__blur" aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="kh-sh-dlg"
        style={{ width: `min(${width}px, 100%)` }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ShareHead({
  title,
  sub,
  onClose,
  closeLabel,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  closeLabel: string;
}) {
  return (
    <div className="kh-sh-head">
      <div className="kh-sh-head__txt">
        <span className="kh-sh-head__t">{title}</span>
        {sub && <span className="kh-sh-head__s">{sub}</span>}
      </div>
      <button type="button" className="kh-sh-x" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
        ×
      </button>
    </div>
  );
}
