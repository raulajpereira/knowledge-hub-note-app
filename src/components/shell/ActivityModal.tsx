'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui';
import { useI18n } from '@/i18n/client';

export type ActivityEntry = { title: string; kind: string; action: string; at: string };

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * "Atividade" (prototype actOpen): what was created / completed / updated in
 * a date range. Content modules (Phase 4+) feed `entries`; until then the
 * range is always empty.
 */
export function ActivityModal({
  open,
  onClose,
  entries = [],
}: {
  open: boolean;
  onClose: () => void;
  entries?: ActivityEntry[];
}) {
  const { t } = useI18n();
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(iso(today));
  const [to, setTo] = useState(iso(today));

  const presets = useMemo(() => {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const wk = new Date(today);
    wk.setDate(wk.getDate() - ((wk.getDay() + 6) % 7)); // Monday
    const mo = new Date(today.getFullYear(), today.getMonth(), 1);
    return [
      [t('actToday'), iso(today), iso(today)],
      [t('actYesterday'), iso(y), iso(y)],
      [t('actWeek'), iso(wk), iso(today)],
      [t('actMonth'), iso(mo), iso(today)],
    ] as const;
  }, [t, today]);

  const list = entries.filter((e) => e.at.slice(0, 10) >= from && e.at.slice(0, 10) <= to);

  return (
    <Modal open={open} onClose={onClose} title={t('activity')} closeLabel={t('i_close')}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <input type="date" className="kh-date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span style={{ fontSize: 14, color: 'rgba(255,248,240,.65)' }}>{t('actTo')}</span>
        <input type="date" className="kh-date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {presets.map(([label, a, b]) => (
          <button
            key={label}
            type="button"
            className="kh-preset"
            aria-pressed={from === a && to === b}
            onClick={() => {
              setFrom(a);
              setTo(b);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <div style={{ padding: '10px 0 20px', fontSize: 14, color: 'rgba(255,248,240,.7)' }}>
          {t('actNone')}
        </div>
      ) : (
        <>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'rgba(255,248,240,.65)',
            }}
          >
            {list.length}
            {list.length === 1 ? t('actEvent') : t('actEvents')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '0 -8px' }}>
            {list.map((a, i) => (
              <div key={i} className="kh-act__row">
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{a.title}</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,248,240,.62)' }}>
                    {a.kind} · {a.action}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
