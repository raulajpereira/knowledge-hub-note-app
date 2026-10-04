import { useId } from 'react';

// Brand mark + wordmark, as drawn in the Login/Register prototypes.
export function Logo({ size = 44, showWordmark = true }: { size?: number; showWordmark?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <svg
        width={size}
        height={size}
        viewBox="7 7 27 26"
        aria-hidden="true"
        style={{ flex: 'none', display: 'block', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,.25))' }}
      >
        <defs>
          <linearGradient id={`${id}k`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fffbf5" />
            <stop offset="1" stopColor="#e6d7c4" />
          </linearGradient>
          <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4fb8ff" />
            <stop offset="1" stopColor="#0a5cff" />
          </linearGradient>
        </defs>
        <path
          d="M11 24.5C8 23.5 7.2 19.8 8.9 17.3C8.4 13.6 11.3 10.4 15 10.8C16.6 8.5 20.4 7.8 22.9 9.4C25.6 8.3 29.1 9.6 30 12.4C32.6 13.3 33.6 16.5 32.3 18.8C33.3 21.6 31.4 24.6 28.4 24.8C29.2 27.3 27.2 29.1 24.8 28.4L24 31C23.7 31.9 22.5 32 22.1 31.2L20.8 27.6C16.8 27.9 14.6 27.3 13.4 25.7C12.6 25.6 11.7 25.1 11 24.5Z"
          fill={`url(#${id}k)`}
        />
        <g fill="none" stroke="#6b5646" strokeWidth="1.1" strokeLinecap="round" opacity=".5">
          <path d="M12 16.4c1.7-.4 3.1.5 3.6 2" />
          <path d="M16.6 12.6c.3 1.4 1.4 2.2 2.8 2.2" />
          <path d="M26.8 12.2c-.5 1.4 0 2.8 1.3 3.6" />
          <path d="M11.8 21.6c1.4.5 2.8.1 3.7-1" />
          <path d="M29.6 20.2c-1.4.1-2.5 1-2.9 2.3" />
        </g>
        <path
          d="M20.6 14.4a2.9 2.9 0 0 1 1.5 5.38l.85 4.72a.8.8 0 0 1-.79.95h-3.12a.8.8 0 0 1-.79-.95l.85-4.72a2.9 2.9 0 0 1 1.5-5.38z"
          fill={`url(#${id}g)`}
        />
      </svg>
      {showWordmark && (
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.02em' }}>
          <span>Knowledge</span>
          <span style={{ color: 'var(--accent)' }}>Hub</span>
        </span>
      )}
    </div>
  );
}
