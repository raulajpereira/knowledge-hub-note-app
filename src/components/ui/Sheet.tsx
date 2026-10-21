'use client';

import { useRef } from 'react';
import { cx } from './cx';
import { Modal } from './Modal';

/**
 * Bottom sheet (phones and tablets): a Modal docked to the bottom edge with a
 * grab bar, safe-area padding and swipe-down to close. Escape, the backdrop,
 * the focus trap and the layer stack are the Modal's.
 */
export function Sheet({
  open,
  onClose,
  title,
  closeLabel,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  closeLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  const y0 = useRef<number | null>(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      closeLabel={closeLabel}
      className={cx('kh-sheet-panel', className)}
      overlayClassName="kh-overlay--sheet"
    >
      <div
        className="kh-sheet-panel__body"
        onTouchStart={(e) => {
          const panel = (e.currentTarget as HTMLElement).closest('.kh-modal');
          // only a swipe that starts at the top of the content closes the sheet
          y0.current = panel && panel.scrollTop <= 0 ? (e.touches[0]?.clientY ?? null) : null;
        }}
        onTouchEnd={(e) => {
          const y = e.changedTouches[0]?.clientY;
          if (y0.current !== null && y !== undefined && y - y0.current > 80) onClose();
          y0.current = null;
        }}
      >
        {children}
      </div>
    </Modal>
  );
}
