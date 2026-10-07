'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { useShell } from '@/components/shell/ShellContext';
import { ShareLinkDialog, type PublicLink } from './ShareLinkDialog';

const ICON = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ flex: 'none' }}
  >
    <circle cx="18" cy="5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="19" r="2.5" />
    <path d="M8.2 10.8l7.6-4.4" />
    <path d="M8.2 13.2l7.6 4.4" />
  </svg>
);

/**
 * The prototype's "Partilhar" button of a note (solid pill with a green dot
 * when the public link is on) or of an artifact (round icon, green when on).
 * Hidden without the `share` module.
 */
export function ShareButton({
  itemType,
  itemId,
  title,
  variant,
  className,
}: {
  itemType: 'note' | 'artifact';
  itemId: string;
  title: string;
  variant: 'pill' | 'round';
  className?: string;
}) {
  const { t } = useI18n();
  const { modules } = useShell();
  const [open, setOpen] = useState(false);
  const [shared, setShared] = useState(false);
  const can = modules.has('share');
  useEffect(() => {
    if (!can) return;
    let on = true;
    api<{ link: PublicLink | null }>(`/share/links?type=${itemType}&id=${itemId}`)
      .then((r) => on && setShared(!!r.link))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [can, itemType, itemId]);
  if (!can) return null;
  return (
    <>
      {variant === 'pill' ? (
        <button type="button" className="kh-sh-pill" onClick={() => setOpen(true)} aria-haspopup="dialog">
          {shared && <span className="kh-sh-pill__dot" aria-hidden="true" />}
          {t('share')}
        </button>
      ) : (
        <button
          type="button"
          className={className}
          title={t('share')}
          aria-label={t('share')}
          aria-haspopup="dialog"
          data-shared={shared || undefined}
          style={shared ? { background: 'oklch(0.7 0.14 150 / .45)' } : undefined}
          onClick={() => setOpen(true)}
        >
          {ICON}
        </button>
      )}
      {open && (
        <ShareLinkDialog
          itemType={itemType}
          itemId={itemId}
          title={title}
          onClose={() => setOpen(false)}
          onChange={setShared}
        />
      )}
    </>
  );
}
