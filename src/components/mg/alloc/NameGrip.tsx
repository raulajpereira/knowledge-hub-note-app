'use client';

import { useState } from 'react';
import { usePersistentState } from '@/components/ui/usePersistentState';

/** Limits of the people / project column (px). */
const MIN = 170;
const maxW = (vw: number) => Math.max(MIN + 40, Math.min(560, Math.round(vw * 0.5)));

/**
 * Width of a view's first column: the user's (kept per view and synced like the other
 * column widths) or the view's default. `live` follows a drag before it is saved.
 */
export function useNameW(key: string, def: number, vw: number) {
  const [saved, setSaved] = usePersistentState<number | null>(`alloc.nameW.${key}`, null);
  const [live, setLive] = useState<number | null>(null);
  const clamp = (w: number) => Math.round(Math.max(MIN, Math.min(maxW(vw), w)));
  const w = live ?? (saved == null ? def : clamp(saved));
  return {
    w,
    grip: {
      value: w,
      max: maxW(vw),
      clamp,
      onLive: setLive,
      onDone: (v: number) => {
        setLive(null);
        setSaved(v);
      },
      onReset: () => {
        setLive(null);
        setSaved(null);
      },
    },
  };
}

/** Grip on the right edge of the header's first cell, as the app's tables (.kh-table__grip). */
export function NameGrip({
  value,
  max,
  clamp,
  onLive,
  onDone,
  onReset,
  label,
}: ReturnType<typeof useNameW>['grip'] & { label: string }) {
  const [drag, setDrag] = useState(false);
  return (
    <div
      className="al-grip"
      data-drag={drag || undefined}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={MIN}
      aria-valuemax={max}
      tabIndex={0}
      title={label}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        onDone(clamp(value + (e.key === 'ArrowLeft' ? -20 : 20)));
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const x0 = e.clientX;
        setDrag(true);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        const move = (ev: PointerEvent) => onLive(clamp(value + ev.clientX - x0));
        const up = (ev: PointerEvent) => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          setDrag(false);
          const w = clamp(value + ev.clientX - x0);
          if (w !== value) onDone(w);
          else onLive(null);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
    />
  );
}
