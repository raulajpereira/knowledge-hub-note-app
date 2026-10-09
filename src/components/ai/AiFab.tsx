'use client';

import { useEffect } from 'react';
import { useI18n } from '@/i18n/client';
import { useAi } from './useAi';
import './ai.css';

// Assistente IA: the floating button (bottom right, in the footer row beside the news ticker).
// Opens and closes the side panel; Ctrl/⌘+J does the same.

const SPARK =
  '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"></path><path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"></path>';
const X = '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>';

export function AiFab({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const { has, ready } = useAi();

  useEffect(() => {
    if (!has) return;
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        onToggle();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [has, onToggle]);

  if (!has) return null;
  const label = open ? t('ai_close') : t('ai_panel');
  return (
    <button
      type="button"
      className="kh-ai-fab"
      data-open={open || undefined}
      data-idle={!ready || undefined}
      title={`${label} (Ctrl+J)`}
      aria-label={label}
      aria-expanded={open}
      aria-keyshortcuts="Control+J Meta+J"
      onClick={onToggle}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: open ? X : SPARK }}
      />
    </button>
  );
}
