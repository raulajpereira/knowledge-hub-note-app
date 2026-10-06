'use client';

import { Logo } from '@/components/brand/Logo';
import { Segmented } from '@/components/ui';
import { useI18n } from '@/i18n/client';

/**
 * Public pages frame (Login / Register / ResetPassword prototypes): dark warm
 * gradient, PT/EN switch top-right, brand + slogan on the left, glass card
 * on the right; stacks on narrow screens.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="kh-auth">
      <div className="kh-auth__lang">
        <Segmented
          label="Idioma / Language"
          value={lang}
          onChange={setLang}
          options={[
            { value: 'pt', label: 'PT' },
            { value: 'en', label: 'EN' },
          ]}
        />
      </div>
      <div className="kh-auth__brand">
        <Logo size={44} />
        <span className="kh-auth__slogan">{t('login_slogan')}</span>
      </div>
      {children}
    </div>
  );
}

/** The glass form card (420px, padding 34, radius 30, gap 18). */
export function AuthCard({
  onSubmit,
  children,
  busy,
}: {
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
  busy?: boolean;
}) {
  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="kh-glass kh-glass--panel kh-auth__card"
      aria-busy={busy || undefined}
    >
      {children}
    </form>
  );
}

export function AuthHeading({
  title,
  sub,
  center,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  center?: boolean;
}) {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: center ? 'center' : undefined }}
    >
      <h1 className="kh-auth__title">{title}</h1>
      {sub && <span className="kh-auth__sub">{sub}</span>}
    </div>
  );
}

/** Round status badge above a centred heading (ResetPassword states). */
export function AuthBadge({ tone, children }: { tone: 'neutral' | 'ok' | 'bad'; children: React.ReactNode }) {
  const bg =
    tone === 'ok'
      ? 'oklch(0.72 0.14 150 / .7)'
      : tone === 'bad'
        ? 'oklch(0.7 0.15 40 / .65)'
        : 'rgba(255,255,255,.12)';
  return (
    <span className="kh-auth__badge" style={{ background: bg }} aria-hidden="true">
      {children}
    </span>
  );
}
