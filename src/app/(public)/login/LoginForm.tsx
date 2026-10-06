'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthCard, AuthHeading } from '@/components/auth/AuthLayout';
import { authErrorMessage } from '@/components/auth/authErrors';
import { Button, Checkbox, Field, Input, Message, PasswordInput } from '@/components/ui';
import { EMAIL_RE } from '@/lib/passwordStrength';
import { api, isApiFailure } from '@/lib/client/api';
import { useI18n } from '@/i18n/client';

const EMAIL_KEY = 'kh.authEmail';

/** Only same-app relative paths are allowed as post-login targets. */
function safeNext(next?: string) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/app';
}

export function LoginForm({ next, focusForgot }: { next?: string; focusForgot?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [er, setEr] = useState<{ email?: string; password?: string }>({});
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(EMAIL_KEY);
      if (saved) setEmail(saved);
    } catch {
      // storage unavailable
    }
    if (focusForgot) emailRef.current?.focus();
  }, [focusForgot]);

  const signedIn = () => {
    try {
      if (remember) localStorage.setItem(EMAIL_KEY, email.trim());
      else localStorage.removeItem(EMAIL_KEY);
    } catch {
      // ignore
    }
    setMsg({ text: t('login_ok'), ok: true });
    setTimeout(() => {
      router.replace(safeNext(next));
      router.refresh();
    }, 700);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const errs: typeof er = {};
    if (!EMAIL_RE.test(email.trim())) errs.email = t('login_eEmail');
    if (!password) errs.password = t('login_ePw');
    setEr(errs);
    setMsg(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const r = await api<{ twoFactor?: boolean; challenge?: string }>('/auth/login', {
        email: email.trim(),
        password,
        remember,
      });
      if (r.twoFactor && r.challenge) {
        setChallenge(r.challenge);
        setBusy(false);
        return;
      }
      signedIn();
    } catch (err) {
      setMsg({ text: isApiFailure(err) ? authErrorMessage(err, t) : t('auth_generic'), ok: false });
      setBusy(false);
    }
  };

  const onTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !challenge) return;
    setBusy(true);
    setMsg(null);
    try {
      await api('/auth/login/2fa', { challenge, code: code.trim() });
      signedIn();
    } catch (err) {
      if (isApiFailure(err) && err.code === 'challenge_expired') setChallenge(null);
      setMsg({ text: isApiFailure(err) ? authErrorMessage(err, t) : t('auth_generic'), ok: false });
      setBusy(false);
    }
  };

  const onForgot = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setEr({ email: t('login_forgotNeed') });
      setMsg(null);
      emailRef.current?.focus();
      return;
    }
    setEr({});
    try {
      await api('/auth/forgot', { email: email.trim() });
      setMsg({ text: t('login_forgotMsg'), ok: true });
    } catch (err) {
      setMsg({ text: isApiFailure(err) ? authErrorMessage(err, t) : t('auth_generic'), ok: false });
    }
  };

  if (challenge) {
    return (
      <AuthCard onSubmit={onTwoFactor} busy={busy}>
        <AuthHeading title={t('auth_2faTitle')} sub={t('auth_2faSub')} />
        <Field label={t('auth_2faCode')}>
          {({ id }) => (
            <Input
              id={id}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000 000"
              style={{ fontFamily: 'var(--font-mono)', letterSpacing: '.12em' }}
            />
          )}
        </Field>
        {msg && <Message tone={msg.ok ? 'ok' : 'error'}>{msg.text}</Message>}
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          {t('auth_2faSubmit')}
        </Button>
        <span className="kh-auth__foot">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setChallenge(null);
              setCode('');
              setMsg(null);
            }}
          >
            ← {t('reset_back')}
          </a>
        </span>
      </AuthCard>
    );
  }

  return (
    <AuthCard onSubmit={onSubmit} busy={busy}>
      <AuthHeading title={t('login_title')} sub={t('login_sub')} />
      <Field label={t('login_email')} error={er.email}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            ref={emailRef}
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEr((x) => ({ ...x, email: undefined }));
              setMsg(null);
            }}
            placeholder={t('login_emailPh')}
            autoComplete="email"
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>
      <Field label={t('login_password')} error={er.password}>
        {({ id, describedBy, invalid }) => (
          <PasswordInput
            id={id}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setEr((x) => ({ ...x, password: undefined }));
              setMsg(null);
            }}
            placeholder={t('login_passwordPh')}
            autoComplete="current-password"
            toggleLabel={t('login_eye')}
            aria-describedby={describedBy}
            invalid={invalid}
          />
        )}
      </Field>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Checkbox checked={remember} onChange={setRemember}>
          {t('login_remember')}
        </Checkbox>
        <a
          href="#"
          onClick={onForgot}
          style={{ marginLeft: 'auto', fontSize: 13, color: 'rgba(255,248,240,.82)' }}
        >
          {t('login_forgot')}
        </a>
      </div>
      {msg && <Message tone={msg.ok ? 'ok' : 'error'}>{msg.text}</Message>}
      <Button type="submit" variant="primary" size="lg" block loading={busy}>
        {t('login_submit')}
      </Button>
      <span className="kh-auth__foot">
        {t('login_noAcc')} <Link href="/register">{t('login_toReg')}</Link>
      </span>
    </AuthCard>
  );
}
