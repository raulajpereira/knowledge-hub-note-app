'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, isApiFailure } from '@/lib/client/api';
import { useI18n } from '@/i18n/client';
import { Icon } from './icons';
import { AvatarFace } from './Avatar';

// Lock screen (SECURITY.md §2): purely UX — the session stays valid — but
// unlocking re-checks the password on the server (/auth/reauth, with the
// server's lockout: 5 tries → 30 s, then backoff).
export function LockScreen({
  name,
  email,
  photoV,
  onUnlock,
}: {
  name: string;
  email: string;
  photoV?: number;
  onUnlock: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!pass) return setErr(t('lock_enterPw'));
    setBusy(true);
    try {
      await api('/auth/reauth', { password: pass });
      setPass('');
      onUnlock();
    } catch (x) {
      setPass('');
      if (isApiFailure(x) && x.code === 'locked')
        setErr(t('lock_wait').replace('{s}', String(x.retryAfter ?? 30)));
      else if (isApiFailure(x) && x.status === 401 && x.code === 'unauthenticated') {
        router.replace('/login');
        return;
      } else setErr(t('lock_bad'));
      [10, -10, 6, -6, 0].forEach((v, i) => setTimeout(() => setShake(v), i * 70));
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const other = async (e: React.MouseEvent) => {
    e.preventDefault();
    await api('/auth/logout', {}).catch(() => {});
    onUnlock();
    router.replace('/login');
    router.refresh();
  };

  return (
    <div className="kh-lock" data-kv-dim="1" role="dialog" aria-modal="true" aria-label={t('locked')}>
      <form className="kh-lock__card" onSubmit={submit} style={{ transform: `translateX(${shake}px)` }}>
        <AvatarFace
          name={name}
          photoV={photoV}
          size={88}
          fontSize={28}
          ring="0 0 0 3px rgba(255,255,255,.25)"
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            textAlign: 'center',
            minWidth: 0,
            maxWidth: '100%',
            alignSelf: 'stretch',
          }}
        >
          <span style={{ fontSize: 21, fontWeight: 600, letterSpacing: '-.01em' }}>{name}</span>
          <span
            style={{
              fontSize: 13.5,
              color: 'rgba(255,248,240,.75)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
            }}
          >
            {email}
          </span>
        </div>
        <span className="kh-lock__badge">
          <Icon name="lockSm" size={12} sw={2.2} />
          {t('locked')}
        </span>
        <span className="kh-lock__pw">
          <input
            ref={input}
            type={show ? 'text' : 'password'}
            value={pass}
            onChange={(e) => {
              setPass(e.target.value);
              setErr('');
            }}
            placeholder={t('login_password')}
            autoComplete="current-password"
            aria-invalid={Boolean(err) || undefined}
            aria-label={t('login_password')}
          />
          <button
            type="button"
            className="kh-lock__eye"
            onClick={() => setShow((s) => !s)}
            aria-label={t('login_eye')}
          >
            <Icon name={show ? 'eyeOff' : 'eye'} size={18} sw={1.9} />
          </button>
        </span>
        {err && (
          <span role="alert" style={{ marginTop: -8, fontSize: 12.5, color: '#ffc9b8' }}>
            {err}
          </span>
        )}
        <button type="submit" className="kh-lock__submit" disabled={busy}>
          {t('unlock')}
        </button>
        <a
          href="#"
          onClick={other}
          style={{ textAlign: 'center', alignSelf: 'center', fontSize: 12.5, color: 'rgba(255,248,240,.75)' }}
        >
          {t('lock_other')}
        </a>
      </form>
    </div>
  );
}
