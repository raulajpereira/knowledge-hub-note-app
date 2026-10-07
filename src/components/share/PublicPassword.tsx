'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';

/** Password step of a protected public link: the server sets a cookie and the page re-renders. */
export function PublicPassword({
  token,
  labels,
}: {
  token: string;
  labels: { title: string; sub: string; ph: string; open: string; wrong: string };
}) {
  const router = useRouter();
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwd || busy) return;
    setBusy(true);
    setErr('');
    try {
      await api(`/public/${encodeURIComponent(token)}/unlock`, { password: pwd });
      router.refresh();
    } catch {
      setErr(labels.wrong);
      setBusy(false);
    }
  };
  return (
    <form className="kh-glass kh-glass--panel kh-pub__card" onSubmit={submit} aria-busy={busy || undefined}>
      <span className="kh-pub__icon" aria-hidden="true">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="5" y="11" width="14" height="10" rx="2.5" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </span>
      <h1 className="kh-pub__h">{labels.title}</h1>
      <p className="kh-pub__p">{labels.sub}</p>
      <input
        className="kh-pub__input"
        type="password"
        autoFocus
        autoComplete="off"
        value={pwd}
        placeholder={labels.ph}
        aria-label={labels.ph}
        aria-invalid={!!err || undefined}
        onChange={(e) => setPwd(e.target.value)}
      />
      {err && (
        <span className="kh-pub__err" role="alert">
          {err}
        </span>
      )}
      <button type="submit" className="kh-pub__btn kh-pub__btn--solid" disabled={!pwd || busy}>
        {labels.open}
      </button>
    </form>
  );
}
