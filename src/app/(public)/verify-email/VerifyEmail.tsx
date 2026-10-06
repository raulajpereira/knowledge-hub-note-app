'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AuthBadge, AuthCard, AuthHeading } from '@/components/auth/AuthLayout';
import { api } from '@/lib/client/api';
import { useI18n } from '@/i18n/client';
import { BadIcon, OkIcon } from '../reset-password/ResetForm';

// Confirms on load with a POST from the browser — not on GET — so email
// link scanners that prefetch URLs can't consume the single-use token.
export function VerifyEmail({ token }: { token: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<'busy' | 'ok' | 'bad'>(token ? 'busy' : 'bad');
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api('/auth/verify-email', { token })
      .then(() => setState('ok'))
      .catch(() => setState('bad'));
  }, [token]);

  return (
    <AuthCard>
      {state === 'busy' && <AuthHeading center title={t('auth_verifying')} />}
      {state === 'ok' && (
        <>
          <AuthBadge tone="ok">
            <OkIcon />
          </AuthBadge>
          <AuthHeading center title={t('auth_verifyOkT')} sub={t('auth_verifyOkS')} />
          <Link
            href="/login"
            className="kh-btn kh-btn--primary kh-btn--lg kh-btn--block"
            style={{ textDecoration: 'none' }}
          >
            {t('reset_toLogin')}
          </Link>
        </>
      )}
      {state === 'bad' && (
        <>
          <AuthBadge tone="bad">
            <BadIcon />
          </AuthBadge>
          <AuthHeading center title={t('auth_verifyBadT')} sub={t('auth_verifyBadS')} />
          <Link
            href="/login"
            className="kh-btn kh-btn--primary kh-btn--lg kh-btn--block"
            style={{ textDecoration: 'none' }}
          >
            {t('reset_toLogin')}
          </Link>
        </>
      )}
    </AuthCard>
  );
}
