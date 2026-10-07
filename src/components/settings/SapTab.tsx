'use client';

import { usePersistentState } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import '@/components/sap/sap.css';

// Definições › SAP GUI (prototype `sg`): logon language and start transaction
// written into every .sap shortcut the SAP Systems screen downloads.
export function SapTab() {
  const { t } = useI18n();
  const [lang, setLang] = usePersistentState<string>('sap.lang', '');
  const [tx, setTx] = usePersistentState<string>('sap.tx', '');
  const row = { gridTemplateColumns: 'minmax(120px,30%) minmax(0,1fr)' };
  return (
    <div className="kh-set__card">
      <div className="kh-set__head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="kh-set__title">{t('sg_title')}</div>
          <div className="kh-set__desc">{t('sg_desc')}</div>
        </div>
      </div>
      <div className="kh-set__rows">
        <div className="kh-set__row" style={row}>
          <span style={{ fontSize: 14 }}>{t('sg_lang')}</span>
          <select
            className="kh-sap-select"
            style={{ width: 170, height: 36, justifySelf: 'start', fontSize: 13.5 }}
            value={lang}
            aria-label={t('sg_lang')}
            onChange={(e) => setLang(e.target.value)}
          >
            <option value="">{t('sg_langSys')}</option>
            {['PT', 'EN', 'DE', 'ES', 'FR'].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="kh-set__row" style={row}>
          <span style={{ fontSize: 14 }}>{t('sg_tx')}</span>
          <input
            className="kh-sap-input"
            data-mono
            style={{
              width: 170,
              height: 36,
              justifySelf: 'start',
              textTransform: 'uppercase',
              textAlign: 'left',
            }}
            value={tx}
            placeholder="SMEN"
            maxLength={20}
            spellCheck={false}
            aria-label={t('sg_tx')}
            onChange={(e) => setTx(e.target.value.toUpperCase().replace(/[^A-Z0-9_/]/g, ''))}
          />
        </div>
      </div>
      <div className="kh-sg-tip">
        <span>{t('sg_tipTitle')}</span>
        <span>{t('sg_tip')}</span>
      </div>
    </div>
  );
}
