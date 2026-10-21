'use client';

import { useSyncExternalStore } from 'react';

// Phone / tablet / desktop (D68). Desktop (≥ 1100 px) keeps the full
// three-column shell; tablets (768–1099) get the drawer + compact header;
// phones (< 768) also get the bottom bar and one pane at a time. The CSS
// uses the same breakpoints (see shell/mobile.css).
export type Viewport = 'phone' | 'tablet' | 'desktop';

export const PHONE_MQ = '(max-width: 767.98px)';
export const COMPACT_MQ = '(max-width: 1099.98px)';

function subscribe(cb: () => void) {
  const a = window.matchMedia(PHONE_MQ);
  const b = window.matchMedia(COMPACT_MQ);
  a.addEventListener('change', cb);
  b.addEventListener('change', cb);
  return () => {
    a.removeEventListener('change', cb);
    b.removeEventListener('change', cb);
  };
}
function snapshot(): Viewport {
  if (window.matchMedia(PHONE_MQ).matches) return 'phone';
  return window.matchMedia(COMPACT_MQ).matches ? 'tablet' : 'desktop';
}
// The server renders the desktop tree; the client switches right after
// hydration (no mismatch), and the CSS already lays the page out meanwhile.
const server = (): Viewport => 'desktop';

export function useViewport(): Viewport {
  return useSyncExternalStore(subscribe, snapshot, server);
}
