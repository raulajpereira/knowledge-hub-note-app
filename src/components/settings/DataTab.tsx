'use client';

import { useI18n } from '@/i18n/client';
import { ExportCard } from '@/components/shell/ExportCard';

// "Os seus dados": where the data lives, how it is protected, what leaves the
// app (only the AI), how long it stays, and the full export.
const ITEMS = [
  [
    'dt_where',
    'dt_whereD',
    '<circle cx="12" cy="10" r="3"></circle><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"></path>',
  ],
  [
    'dt_protect',
    'dt_protectD',
    '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"></rect><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"></path>',
  ],
  [
    'dt_vault',
    'dt_vaultD',
    '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.3-7.5 9.5-4.3-1.2-7.5-5-7.5-9.5V6z"></path><path d="M9 12l2 2 4-4"></path>',
  ],
  ['dt_ai', 'dt_aiD', '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"></path>'],
  [
    'dt_backup',
    'dt_backupD',
    '<path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z"></path><path d="M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7"></path><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"></path>',
  ],
  [
    'dt_offline',
    'dt_offlineD',
    '<path d="M3 7l9-4 9 4-9 4z"></path><path d="M3 12l9 4 9-4"></path><path d="M3 17l9 4 9-4"></path>',
  ],
  ['dt_keep', 'dt_keepD', '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path>'],
] as const;

export function DataTab() {
  const { t } = useI18n();
  return (
    <>
      <div className="kh-set__card">
        <div className="kh-set__head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="kh-set__title">{t('dt_title')}</div>
            <div className="kh-set__desc">{t('dt_desc')}</div>
          </div>
        </div>
        <div className="kh-dt">
          {ITEMS.map(([k, d, ic]) => (
            <div key={k} className="kh-dt__item">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: ic }}
              />
              <div>
                <b>{t(k)}</b>
                <p>{t(d)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <ExportCard />
    </>
  );
}
