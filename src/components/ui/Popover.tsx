'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';

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
  id?: string;
  role?: string;
  'aria-label'?: string;
  'aria-multiselectable'?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      setPos(
        align === 'right'
          ? { top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) }
          : { top: r.bottom + 6, left: Math.max(8, r.left) },
      );
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, align]);

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
  return createPortal(
    <div
      ref={ref}
      {...aria}
      className={cx('kh-popover', className)}
      style={{
        top: pos.top,
        left: pos.left,
        right: pos.right,
        width,
        maxHeight: `min(${maxHeight ? `${maxHeight}px` : '100vh'}, calc(100vh - ${Math.round(pos.top) + 16}px))`,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
