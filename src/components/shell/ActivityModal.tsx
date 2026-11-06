'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DateInput, Modal } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';

type Entry = {
  type: string;
  id: string;
  title: string;
  action: 'created' | 'done' | 'updated';
  at: string;
  href: string;
};
const ACTION = { created: 'actCreated', done: 'actDone', updated: 'actUpdated' } as const;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * "Atividade" (prototype actOpen): what the person created, completed or
 * changed in a date range (GET /me/activity, the active workspace's modules).
 * The days are the person's local days.
 */
export function ActivityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n();
  const router = useRouter();
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

  const [list, setList] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open || !from || !to || from > to) return;
    let live = true;
    setFailed(false);
    // local midnight of `from` up to local midnight after `to`
    const a = new Date(`${from}T00:00:00`);
    const b = new Date(`${to}T00:00:00`);
    b.setDate(b.getDate() + 1);
    const q = new URLSearchParams({ from: a.toISOString(), to: b.toISOString() });
    api<{ items: Entry[] }>(`/me/activity?${q}`)
      .then((r) => live && setList(r.items))
      .catch(() => {
        if (!live) return;
        setList([]);
        setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [open, from, to]);
  const when = (at: string) =>
    new Date(at).toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <Modal open={open} onClose={onClose} title={t('activity')} closeLabel={t('i_close')}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <DateInput className="kh-date" value={from} onChange={setFrom} aria-label={t('act_fromDate')} />
        <span style={{ fontSize: 14, color: 'rgb(var(--t) / calc(.65 * var(--t-k)))' }}>{t('actTo')}</span>
        <DateInput className="kh-date" value={to} onChange={setTo} aria-label={t('act_toDate')} />
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
      {list === null ? (
        <div style={{ padding: '10px 0 20px', fontSize: 14, color: 'rgb(var(--t) / calc(.7 * var(--t-k)))' }}>
          …
        </div>
      ) : list.length === 0 ? (
        <div style={{ padding: '10px 0 20px', fontSize: 14, color: 'rgb(var(--t) / calc(.7 * var(--t-k)))' }}>
          {failed ? t('act_fail') : t('actNone')}
        </div>
      ) : (
        <>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'rgb(var(--t) / calc(.65 * var(--t-k)))',
            }}
          >
            {list.length}
            {list.length === 1 ? t('actEvent') : t('actEvents')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '0 -8px' }}>
            {list.map((a) => (
              <button
                key={`${a.type}:${a.id}:${a.action}:${a.at}`}
                type="button"
                className="kh-act__row"
                data-action={a.action}
                onClick={() => {
                  onClose();
                  router.push(a.href);
                }}
              >
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{a.title || '—'}</span>
                  <span style={{ fontSize: 12, color: 'rgb(var(--t) / calc(.62 * var(--t-k)))' }}>
                    {t(`act_k_${a.type}`)} · {t(ACTION[a.action])} · {when(a.at)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
