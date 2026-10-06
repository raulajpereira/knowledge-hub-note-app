'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthBadge, AuthCard, AuthHeading } from '@/components/auth/AuthLayout';
import { authErrorMessage } from '@/components/auth/authErrors';
import { PasswordRules, StrengthMeter } from '@/components/auth/PasswordMeter';
import { Button, Field, Message, PasswordInput } from '@/components/ui';
import { MIN_PASSWORD } from '@/lib/passwordStrength';
import { api, isApiFailure } from '@/lib/client/api';
import { useI18n } from '@/i18n/client';

const LockIcon = () => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#fbf8f5"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="5" y="11" width="14" height="10" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
export const OkIcon = () => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#fbf8f5"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const BadIcon = () => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#fbf8f5"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5" />
    <path d="M12 16.5v.01" />
  </svg>
);

export function ResetForm({ token, email, setup }: { token: string; email: string | null; setup: boolean }) {
  const { t } = useI18n();
  const [stage, setStage] = useState<'form' | 'done' | 'bad'>(email ? 'form' : 'bad');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [er, setEr] = useState<{ password?: string; confirm?: string }>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const errs: typeof er = {};
    if (pw.length < MIN_PASSWORD) errs.password = t('reset_ePw');
    if (confirm !== pw) errs.confirm = t('reset_eConf');
    setEr(errs);
    setMsg(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api('/auth/reset', { token, password: pw });
      setStage('done');
    } catch (err) {
      if (isApiFailure(err) && err.code === 'token_invalid') setStage('bad');
      else if (isApiFailure(err) && err.code.startsWith('password_'))
        setEr({ password: authErrorMessage(err, t) });
      else setMsg(isApiFailure(err) ? authErrorMessage(err, t) : t('auth_generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard onSubmit={onSubmit} busy={busy}>
      {stage === 'form' && (
        <>
          <AuthBadge tone="neutral">
            <LockIcon />
          </AuthBadge>
          <AuthHeading
            center
            title={setup ? t('auth_setupTitle') : t('reset_title')}
            sub={
              <>
                {t('reset_sub')} <b style={{ color: '#fbf8f5', fontWeight: 600 }}>{email}</b>
              </>
            }
          />
          <Field label={t('reset_password')} error={er.password}>
            {({ id, describedBy, invalid }) => (
              <PasswordInput
                id={id}
                value={pw}
                onChange={(e) => {
                  setPw(e.target.value);
                  setEr((x) => ({ ...x, password: undefined }));
                }}
                placeholder={t('reset_passwordPh')}
                autoComplete="new-password"
                toggleLabel={t('reset_eye')}
                aria-describedby={describedBy}
                invalid={invalid}
                autoFocus
              />
            )}
          </Field>
          <StrengthMeter password={pw} />
          <Field label={t('reset_confirm')} error={er.confirm}>
            {({ id, describedBy, invalid }) => (
              <PasswordInput
                id={id}
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setEr((x) => ({ ...x, confirm: undefined }));
                }}
                placeholder={t('reset_confirmPh')}
                autoComplete="new-password"
                toggleLabel={t('reset_eye')}
                aria-describedby={describedBy}
                invalid={invalid}
              />
            )}
          </Field>
          <PasswordRules password={pw} />
          {msg && <Message tone="error">{msg}</Message>}
          <Button type="submit" variant="primary" size="lg" block loading={busy}>
            {t('reset_submit')}
          </Button>
          <span className="kh-auth__note">{t('reset_note')}</span>
        </>
      )}
      {stage === 'done' && (
        <>
          <AuthBadge tone="ok">
            <OkIcon />
          </AuthBadge>
          <AuthHeading center title={t('reset_doneT')} sub={t('reset_doneS')} />
          <Link
            href="/login"
            className="kh-btn kh-btn--primary kh-btn--lg kh-btn--block"
            style={{ textDecoration: 'none' }}
          >
            {t('reset_toLogin')}
          </Link>
        </>
      )}
      {stage === 'bad' && (
        <>
          <AuthBadge tone="bad">
            <BadIcon />
          </AuthBadge>
          <AuthHeading center title={t('reset_badT')} sub={t('reset_badS')} />
          <Link
            href="/login?forgot=1"
            className="kh-btn kh-btn--primary kh-btn--lg kh-btn--block"
            style={{ textDecoration: 'none' }}
          >
            {t('reset_again')}
          </Link>
        </>
      )}
      <span className="kh-auth__foot">
        <Link href="/login">← {t('reset_back')}</Link>
      </span>
    </AuthCard>
  );
}
