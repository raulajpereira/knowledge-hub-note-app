'use client';

import { useEffect, useRef } from 'react';

type TurnstileApi = {
  render: (el: HTMLElement, o: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<void> | null = null;
const load = () =>
  (loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(s);
  }));

/** Cloudflare Turnstile challenge (asked for by the server after failed sign-ins). */
export function Turnstile({
  siteKey,
  lang,
  onToken,
}: {
  siteKey: string;
  lang: string;
  onToken: (t: string | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  useEffect(() => {
    let id: string | null = null;
    let live = true;
    void load()
      .then(() => {
        if (!live || !box.current || !window.turnstile) return;
        id = window.turnstile.render(box.current, {
          sitekey: siteKey,
          language: lang,
          theme: 'dark',
          callback: (tok: string) => cb.current(tok),
          'expired-callback': () => cb.current(null),
          'error-callback': () => cb.current(null),
        });
      })
      .catch(() => cb.current(null));
    return () => {
      live = false;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey, lang]);
  return <div ref={box} style={{ minHeight: 65, display: 'flex', justifyContent: 'center' }} />;
}
