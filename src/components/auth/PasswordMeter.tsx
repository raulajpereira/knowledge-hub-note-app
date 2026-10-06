'use client';

import { STRENGTH_COLORS, passwordRules, strengthScore } from '@/lib/passwordStrength';
import { translateList } from '@/i18n';
import { useI18n } from '@/i18n/client';

/** 4-bar strength meter + label (Register / ResetPassword). */
export function StrengthMeter({ password }: { password: string }) {
  const { lang, t } = useI18n();
  const sc = strengthScore(password);
  const labels = translateList(lang, 'reg_s');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: -8 }} aria-live="polite">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 4 }}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              height: 4,
              borderRadius: 999,
              background: password && i < Math.max(1, sc) ? STRENGTH_COLORS[sc] : 'rgba(255,255,255,.12)',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 11.5, color: 'rgba(255,248,240,.7)' }}>
        {password ? labels[sc] : t('reg_sNone')}
      </span>
    </div>
  );
}

/** The three ✓ rules under the confirm field (ResetPassword). */
export function PasswordRules({ password }: { password: string }) {
  const { t } = useI18n();
  const r = passwordRules(password);
  const rows: Array<[boolean, string]> = [
    [r.length, t('reset_r1')],
    [r.cases, t('reset_r2')],
    [r.digitOrSymbol, t('reset_r3')],
  ];
  return (
    <ul
      style={{
        margin: '-4px 0 0',
        padding: 0,
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        fontSize: 12.5,
      }}
    >
      {rows.map(([ok, label]) => (
        <li
          key={label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: ok ? '#fbf8f5' : 'rgba(255,248,240,.62)',
          }}
        >
          <span
            style={{
              width: 16,
              height: 16,
              flex: 'none',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: ok ? 'oklch(0.8 0.14 150)' : 'rgba(255,255,255,.16)',
              fontSize: 10,
              fontWeight: 700,
              color: '#16131f',
            }}
            aria-hidden="true"
          >
            {ok ? '✓' : ''}
          </span>
          {label}
        </li>
      ))}
    </ul>
  );
}
