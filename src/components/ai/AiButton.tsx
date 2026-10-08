'use client';

import './ai.css';

/** A page action of the assistant (sparkle, busy state). */
export function AiButton({
  label,
  busy,
  disabled,
  title,
  onClick,
}: {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="kh-ai-btn"
      disabled={busy || disabled}
      aria-busy={busy || undefined}
      title={title ?? label}
      onClick={onClick}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
        <path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
      </svg>
      {label}
    </button>
  );
}
