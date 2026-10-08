'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthCard, AuthHeading } from '@/components/auth/AuthLayout';
import { authErrorMessage } from '@/components/auth/authErrors';
import { StrengthMeter } from '@/components/auth/PasswordMeter';
import { Button, Field, Input, Message, PasswordInput } from '@/components/ui';
import { EMAIL_RE, MIN_PASSWORD } from '@/lib/passwordStrength';
import { api, isApiFailure } from '@/lib/client/api';
import { useI18n } from '@/i18n/client';

type Errs = Partial<Record<'name' | 'email' | 'password' | 'invite', string>>;

export function RegisterForm({ initialCode, invitedEmail }: { initialCode?: string; invitedEmail?: string }) {
  const { lang, t } = useI18n();
  const [v, setV] = useState({
    name: '',
    email: invitedEmail ?? '',
    password: '',
    invite: initialCode ?? '',
  });
  // invited to a shared folder: no code needed (a FREE account); falls back to the code if the server says no
  const [shared, setShared] = useState(!!invitedEmail && !initialCode);
  const [er, setEr] = useState<Errs>({});
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setV((x) => ({ ...x, [k]: e.target.value }));
    setEr((x) => ({ ...x, [k]: undefined }));
    setMsg(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || done) return;
    const errs: Errs = {};
    if (!v.name.trim()) errs.name = t('reg_eName');
    if (!EMAIL_RE.test(v.email.trim())) errs.email = t('reg_eEmail');
    if (v.password.length < MIN_PASSWORD) errs.password = t('reg_ePw');
    if (!shared && !v.invite.trim()) errs.invite = t('reg_eInv');
    setEr(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setMsg(null);
    try {
      await api('/auth/register', {
        name: v.name.trim(),
        email: v.email.trim(),
        password: v.password,
        code: shared ? undefined : v.invite.trim(),
        lang,
      });
      setDone(true);
      setMsg({ text: t('auth_verifySent'), ok: true });
    } catch (err) {
      if (isApiFailure(err) && err.code.startsWith('code_')) {
        if (shared) {
          setShared(false);
          setEr({ invite: t('reg_eInvShared') });
        } else setEr({ invite: authErrorMessage(err, t) });
      } else if (isApiFailure(err) && err.code === 'email_taken') setEr({ email: authErrorMessage(err, t) });
      else if (isApiFailure(err) && err.code.startsWith('password_'))
        setEr({ password: authErrorMessage(err, t) });
      else setMsg({ text: isApiFailure(err) ? authErrorMessage(err, t) : t('auth_generic'), ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard onSubmit={onSubmit} busy={busy}>
      <AuthHeading title={t('reg_title')} sub={t(shared ? 'reg_subShared' : 'reg_sub')} />
      <Field label={t('reg_name')} error={er.name}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            value={v.name}
            onChange={set('name')}
            placeholder={t('reg_namePh')}
            autoComplete="name"
            aria-describedby={describedBy}
            invalid={invalid}
            disabled={done}
          />
        )}
      </Field>
      <Field label={t('reg_email')} error={er.email}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="email"
            value={v.email}
            onChange={set('email')}
            placeholder={t('reg_emailPh')}
            autoComplete="email"
            aria-describedby={describedBy}
            invalid={invalid}
            disabled={done}
          />
        )}
      </Field>
      <Field label={t('reg_password')} error={er.password}>
        {({ id, describedBy, invalid }) => (
          <PasswordInput
            id={id}
            value={v.password}
            onChange={set('password')}
            placeholder={t('reg_passwordPh')}
            autoComplete="new-password"
            toggleLabel={t('reg_eye')}
            aria-describedby={describedBy}
            invalid={invalid}
            disabled={done}
          />
        )}
      </Field>
      <StrengthMeter password={v.password} />
      {shared ? (
        <Message tone="ok">{t('reg_sharedInvite')}</Message>
      ) : (
        <Field label={t('reg_invite')} error={er.invite}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              value={v.invite}
              onChange={set('invite')}
              placeholder="KH-INV-000000"
              spellCheck={false}
              autoComplete="off"
              aria-describedby={describedBy}
              invalid={invalid}
              disabled={done}
              style={{ fontFamily: 'var(--font-mono)', letterSpacing: '.06em', textTransform: 'uppercase' }}
            />
          )}
        </Field>
      )}
      {msg && <Message tone={msg.ok ? 'ok' : 'error'}>{msg.text}</Message>}
      {!done && (
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          {t('reg_submit')}
        </Button>
      )}
      {!done && (
        <span className="kh-auth__legal">
          {t('reg_legal')
            .split(/(\{terms\}|\{privacy\})/)
            .map((part, i) =>
              part === '{terms}' ? (
                <Link key={i} href="/terms" target="_blank">
                  {t('reg_terms')}
                </Link>
              ) : part === '{privacy}' ? (
                <Link key={i} href="/privacy" target="_blank">
                  {t('reg_privacy')}
                </Link>
              ) : (
                part
              ),
            )}
        </span>
      )}
      <span className="kh-auth__foot">
        {t('reg_hasAcc')} <Link href="/login">{t('reg_toLogin')}</Link>
      </span>
    </AuthCard>
  );
}
