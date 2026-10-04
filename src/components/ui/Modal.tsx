'use client';

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { Close, Info, Trash } from './icons';
import { Button, IconButton } from './Button';

// Open overlays, bottom → top. Only the top one reacts to Escape, and each
// new layer sits above the previous (modal → confirm → …).
const stack: string[] = [];
const FOCUSABLE =
  'button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** sm: 440px (confirm) · md: 640px · lg: 880px */
  size?: 'sm' | 'md' | 'lg';
  /** Second-layer look (lighter dim), used by confirmations over a modal. */
  layer?: 'modal' | 'confirm';
  closeLabel: string;
  dismissible?: boolean;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  hideClose?: boolean;
};

/** Glass modal with layered blur (overlay blur + panel blur), README §6. */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  layer = 'modal',
  closeLabel,
  dismissible = true,
  footer,
  children,
  className,
  hideClose,
}: ModalProps) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [depth, setDepth] = useState(0);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    stack.push(id);
    setDepth(stack.length);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first =
      panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panelRef.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab' && panelRef.current) {
        // Keep focus inside the top-most layer.
        const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!items.length) return;
        const firstEl = items[0]!;
        const lastEl = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (!stack.length) document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, id, dismissible, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={cx('kh-overlay', layer === 'confirm' && 'kh-overlay--confirm')}
      style={{ zIndex: 200 + depth * 10 }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && dismissible) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? `${id}-title` : undefined}
        tabIndex={-1}
        className={cx('kh-modal', size !== 'md' && `kh-modal--${size}`, className)}
        data-zs=""
      >
        {(title || !hideClose) && (
          <div className="kh-modal__head">
            <div className="kh-modal__titles">
              {title && (
                <span id={`${id}-title`} className="kh-modal__title">
                  {title}
                </span>
              )}
              {subtitle && <span className="kh-modal__sub">{subtitle}</span>}
            </div>
            {!hideClose && (
              <IconButton label={closeLabel} size="sm" onClick={onClose}>
                <Close size={15} />
              </IconButton>
            )}
          </div>
        )}
        {children}
        {footer && <div className="kh-modal__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export type ConfirmOptions = {
  title: React.ReactNode;
  body?: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
};

/** Confirmation dialog — prototype `cf` (icon tile, title, body, Cancel/OK). */
export function ConfirmDialog({
  open,
  options,
  onResult,
}: {
  open: boolean;
  options: ConfirmOptions | null;
  onResult: (ok: boolean) => void;
}) {
  if (!options) return null;
  const { title, body, confirmLabel, cancelLabel, danger } = options;
  return (
    <Modal
      open={open}
      onClose={() => onResult(false)}
      size="sm"
      layer="confirm"
      closeLabel={cancelLabel}
      hideClose
    >
      <span className={cx('kh-confirm__icon', danger && 'kh-confirm__icon--danger')} aria-hidden="true">
        {danger ? <Trash /> : <Info />}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="kh-confirm__title">{title}</span>
        {body && <span className="kh-confirm__body">{body}</span>}
      </div>
      <div className="kh-modal__foot">
        <Button variant="glass" onClick={() => onResult(false)}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={() => onResult(true)} data-autofocus="">
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

type Pending = { options: ConfirmOptions; resolve: (ok: boolean) => void };
const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

/** `const confirm = useConfirm(); if (await confirm({...})) …` */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
    [],
  );
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={Boolean(pending)}
        options={pending?.options ?? null}
        onResult={(ok) => {
          pending?.resolve(ok);
          setPending(null);
        }}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}
