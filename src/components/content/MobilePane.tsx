'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { useViewport } from '@/components/ui';
import { useI18n } from '@/i18n/client';

// List ↔ detail pages on phones (D68): one pane at a time. The URL param
// that selects the item (?n= / ?t= / ?m=) decides which one shows; opening an
// item from the list pushes a history entry, so the browser's (Android's)
// Back returns to the list, and the ← button does the same.

export function useListDetail(param: string) {
  const vp = useViewport();
  const phone = vp === 'phone';
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const activeId = sp.get(param);
  const pushed = useRef(false);

  /** Goes to `url` (the same page with another item): a new history entry for list → detail on phones. */
  const go = useCallback(
    (url: string, id: string | null) => {
      if (phone && id && !activeId) {
        pushed.current = true;
        router.push(url, { scroll: false });
      } else router.replace(url, { scroll: false });
    },
    [phone, activeId, router],
  );

  /** ← : back to the list (the history entry when we made one). */
  const back = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      router.back();
      return;
    }
    const next = new URLSearchParams(sp.toString());
    next.delete(param);
    router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false });
  }, [router, sp, param, path]);

  return {
    vp,
    phone,
    compact: vp !== 'desktop',
    /** for the page root's data-pane (phones only) */
    pane: phone ? (activeId ? 'detail' : 'list') : undefined,
    go,
    back,
  };
}

/**
 * The same Back behaviour for a pane that is not in the URL (an open vault
 * entry, a Definições tab): while `open` on a phone there is one extra history
 * entry (same URL and router state), so Android's Back closes the pane instead
 * of leaving the page. Returns the ← handler.
 */
export function usePhoneBack(open: boolean, onClose: () => void) {
  const phone = useViewport() === 'phone';
  const pushed = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!phone || !open) return;
    window.history.pushState(window.history.state, '');
    pushed.current = true;
    const onPop = () => {
      if (!pushed.current) return;
      pushed.current = false;
      close.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [phone, open]);
  // closed in the page (not by Back): drop the extra entry again
  useEffect(() => {
    if (!open && pushed.current) {
      pushed.current = false;
      window.history.back();
    }
  }, [open]);
  return useCallback(() => {
    if (pushed.current) window.history.back();
    else close.current();
  }, []);
}

const Chev = ({ d }: { d: string }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

/** The ← button of a detail pane on phones. */
export function BackButton({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" className="kh-mback__btn" onClick={onBack} aria-label={t('mob_back')}>
      <Chev d="M15 6l-6 6 6 6" />
      <span>{t('mob_back')}</span>
    </button>
  );
}

/** Sticky top bar of a detail pane on phones: ← and an optional title / actions. */
export function BackBar({
  onBack,
  title,
  children,
}: {
  onBack: () => void;
  title?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="kh-mback">
      <BackButton onBack={onBack} />
      <span className="kh-mback__title">{title}</span>
      {children}
    </div>
  );
}

/** "Pastas" toggle of a list column on phones/tablets: the current folder, opens the folders sheet. */
export function FoldersButton({ label, onClick }: { label: string; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="kh-mfolders"
      aria-haspopup="dialog"
      title={t('mob_folders')}
      aria-label={`${t('mob_folders')}: ${label}`}
      onClick={onClick}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
      <span>{label}</span>
      <Chev d="M6 9l6 6 6-6" />
    </button>
  );
}
