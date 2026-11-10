'use client';

import { ShellContext } from '@/components/shell/ShellContext';

import { useState, useContext } from 'react';
import { useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';

/** "Exportar .xlsx" of a list: a glass pill with a download icon (busy while the file is built). */
function XlsxButtonInner({ onExport, compact }: { onExport: () => Promise<void>; compact?: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="kh-xlsx-btn"
      data-compact={compact || undefined}
      disabled={busy}
      aria-busy={busy || undefined}
      title={t('xl_export')}
      aria-label={t('xl_export')}
      onClick={async () => {
        setBusy(true);
        try {
          await onExport();
        } catch {
          toast({ message: t('xl_fail'), tone: 'error' });
        } finally {
          setBusy(false);
        }
      }}
    >
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
      >
        <path d="M12 4v11" />
        <path d="M7 10l5 5 5-5" />
        <path d="M5 20h14" />
      </svg>
      {!compact && <span>{busy ? t('xl_busy') : t('xl_export')}</span>}
    </button>
  );
}

/** Shown only when the plan has "xlsx" (console › Planos). */
export function XlsxButton(props: Parameters<typeof XlsxButtonInner>[0]) {
  const shell = useContext(ShellContext);
  if (shell && !shell.modules.has('xlsx')) return null;
  return <XlsxButtonInner {...props} />;
}
