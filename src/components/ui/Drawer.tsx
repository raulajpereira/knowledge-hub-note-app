'use client';

import { useRef, useState } from 'react';
import { cx } from './cx';
import { Close } from './icons';
import { IconButton } from './Button';
import { usePersistentState } from './usePersistentState';

type DrawerProps = {
  /** Persists the chosen width per drawer. */
  storageKey: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose?: () => void;
  closeLabel: string;
  resizeLabel: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  children: React.ReactNode;
  className?: string;
};

/**
 * Right-hand detail panel with a drag handle on its left edge (Admin
 * Console drawer): drag to resize, double-click the handle to reset.
 */
export function Drawer({
  storageKey,
  title,
  subtitle,
  onClose,
  closeLabel,
  resizeLabel,
  defaultWidth = 420,
  minWidth = 320,
  maxWidth = 760,
  children,
  className,
}: DrawerProps) {
  const [width, setWidth, resetWidth] = usePersistentState(`drawer.${storageKey}`, defaultWidth);
  const [dragging, setDragging] = useState(false);
  const live = useRef(width);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);

  const clamp = (w: number) => Math.round(Math.min(maxWidth, Math.max(minWidth, w)));

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    live.current = w0;
    setDragging(true);
    const move = (ev: PointerEvent) => {
      live.current = clamp(w0 + (x0 - ev.clientX)); // panel grows leftwards
      setLiveWidth(live.current);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setDragging(false);
      setLiveWidth(null);
      setWidth(live.current);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setWidth(clamp(width + 16));
    else if (e.key === 'ArrowRight') setWidth(clamp(width - 16));
  };

  return (
    <aside className={cx('kh-drawer', className)} style={{ width: liveWidth ?? width }}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={resizeLabel}
        aria-valuenow={liveWidth ?? width}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        tabIndex={0}
        title={resizeLabel}
        className="kh-drawer__handle"
        data-dragging={dragging || undefined}
        onPointerDown={onPointerDown}
        onDoubleClick={resetWidth}
        onKeyDown={onKeyDown}
      >
        <div className="kh-drawer__bar" />
      </div>
      <div className="kh-drawer__body kh-glass kh-glass--panel kh-glass--soft" data-zs="">
        <div className="kh-modal__head">
          <div className="kh-modal__titles">
            <span className="kh-modal__title">{title}</span>
            {subtitle && <span className="kh-modal__sub">{subtitle}</span>}
          </div>
          {onClose && (
            <IconButton label={closeLabel} size="sm" onClick={onClose}>
              <Close size={15} />
            </IconButton>
          )}
        </div>
        {children}
      </div>
    </aside>
  );
}
