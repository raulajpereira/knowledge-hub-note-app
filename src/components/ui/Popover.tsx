'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { useViewport } from './useViewport';

/**
 * A dropdown panel drawn at the page level (portal, position: fixed) under
 * its anchor, so it gets the real glass of the app's menus: inside a glass
 * card a nested backdrop blur has nothing behind it to blur. Closes on a
 * click outside the anchor and the panel, and on Escape.
 */
export function Popover({
  anchor,
  align = 'right',
  onClose,
  className,
  width,
  maxHeight,
  children,
  sheet,
  ...aria
}: {
  anchor: React.RefObject<HTMLElement | null>;
  align?: 'left' | 'right';
  onClose: () => void;
  className?: string;
  width?: number;
  /** cap on the height (it never goes past the bottom of the window) */
  maxHeight?: number;
  children: React.ReactNode;
  /** on phones: a full-height sheet from the bottom instead of a dropdown */
  sheet?: boolean;
  id?: string;
  role?: string;
  'aria-label'?: string;
  'aria-multiselectable'?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const asSheet = useViewport() === 'phone' && !!sheet;

  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const vw = window.innerWidth;
      // never past the window's edges (narrow screens): slide it back inside
      const w = Math.min(width ?? ref.current?.offsetWidth ?? 0, vw - 16);
      setPos(
        align === 'right'
          ? { top: r.bottom + 6, right: Math.min(Math.max(8, vw - r.right), Math.max(8, vw - 8 - w)) }
          : { top: r.bottom + 6, left: Math.min(Math.max(8, r.left), Math.max(8, vw - 8 - w)) },
      );
    };
    place();
    // again once drawn: a popover without a set width is measured then
    const raf = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, align, width]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      close.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close.current();
      anchor.current?.focus();
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key, true);
    };
  }, [anchor]);

  if (!pos || typeof document === 'undefined') return null;
  if (asSheet)
    return createPortal(
      <>
        <div className="kh-popover-dim" aria-hidden="true" />
        <div ref={ref} {...aria} className={cx('kh-popover', 'kh-popover--sheet', className)}>
          {children}
        </div>
      </>,
      document.body,
    );
  return createPortal(
    <div
      ref={ref}
      {...aria}
      className={cx('kh-popover', className)}
      style={{
        top: pos.top,
        left: pos.left,
        right: pos.right,
        width: width === undefined ? undefined : `min(${width}px, calc(100vw - 16px))`,
        maxHeight: `min(${maxHeight ? `${maxHeight}px` : '100vh'}, calc(100vh - ${Math.round(pos.top) + 16}px))`,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
