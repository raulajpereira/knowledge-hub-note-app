'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { Close } from './icons';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';
type ToastItem = { id: number; message: React.ReactNode; tone: ToastTone; duration: number };
type ToastInput = { message: React.ReactNode; tone?: ToastTone; duration?: number };

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

/**
 * Transient feedback ("Copiado", "Guardado"). Not in the prototypes as a
 * component; styled from the glass menu tokens. Errors stay 6 s, others 3 s.
 */
export function ToastProvider({
  dismissLabel,
  children,
}: {
  dismissLabel: string;
  children: React.ReactNode;
}) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    ({ message, tone = 'info', duration }: ToastInput) => {
      const id = nextId.current++;
      const ms = duration ?? (tone === 'error' ? 6000 : 3000);
      setItems((all) => [...all.slice(-3), { id, message, tone, duration: ms }]);
      if (ms > 0) setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {mounted &&
        createPortal(
          <div className="kh-toasts" role="region" aria-live="polite">
            {items.map((t) => (
              <div
                key={t.id}
                className={cx('kh-toast', `kh-toast--${t.tone}`)}
                role={t.tone === 'error' ? 'alert' : 'status'}
              >
                <span className="kh-toast__dot" aria-hidden="true" />
                <span className="kh-toast__text">{t.message}</span>
                <button
                  type="button"
                  className="kh-toast__close"
                  aria-label={dismissLabel}
                  onClick={() => dismiss(t.id)}
                >
                  <Close size={13} />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
