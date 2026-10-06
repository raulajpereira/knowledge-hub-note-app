'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/client';
import './content.css';

// ── Column resize handle (same look as the shell's) ────────────────────────
/** Drag handle between two content columns (same look as the shell's); double-click resets. */
export function ColHandle({
  value,
  limits,
  dir,
  onLive,
  onDone,
  onReset,
  style,
}: {
  style: React.CSSProperties;
  value: number;
  limits: readonly [number, number];
  dir: 1 | -1;
  onLive: (w: number | null) => void;
  onDone: (w: number) => void;
  onReset: () => void;
}) {
  const { t } = useI18n();
  const [drag, setDrag] = useState(false);
  return (
    <div
      className="kh-handle kh-nt-handle"
      data-drag={drag}
      style={style}
      title={t('resize')}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={value}
      onDoubleClick={onReset}
      onPointerDown={(e) => {
        e.preventDefault();
        const x0 = e.clientX;
        const clamp = (w: number) => Math.round(Math.max(limits[0], Math.min(limits[1], w)));
        setDrag(true);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        const move = (ev: PointerEvent) => onLive(clamp(value + dir * (ev.clientX - x0)));
        const up = (ev: PointerEvent) => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          setDrag(false);
          onLive(null);
          const w = clamp(value + dir * (ev.clientX - x0));
          if (w !== value) onDone(w);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
    >
      <div className="kh-handle__bar" />
    </div>
  );
}
