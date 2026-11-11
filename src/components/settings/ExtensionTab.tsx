'use client';

import { useI18n } from '@/i18n/client';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** "Extensão do navegador": the download (made for this server) and how to install it in Chrome / Edge. */
export function ExtensionTab() {
  const { t } = useI18n();
  const steps = ['ex_s1', 'ex_s2', 'ex_s3', 'ex_s4'];
  return (
    <div className="kh-set__card">
      <div className="kh-set__head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="kh-set__title">{t('ex_title')}</div>
          <div className="kh-set__desc">{t('ex_desc')}</div>
        </div>
      </div>
      <a className="kh-btn kh-btn--primary kh-ex__dl" href={`${BASE}/api/v1/extension`} download>
        ⬇ {t('ex_dl')}
      </a>
      <ol className="kh-ex__steps">
        {steps.map((k, i) => (
          <li key={k}>
            <span className="kh-ex__n">{i + 1}</span>
            <span>{t(k)}</span>
          </li>
        ))}
      </ol>
      <p className="kh-set__desc" style={{ marginTop: 12 }}>
        {t('ex_use')}
      </p>
    </div>
  );
}
