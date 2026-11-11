'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { Modal, Switch, useToast } from '@/components/ui';
import { usePref } from '@/components/shell/PrefsProvider';
import { localDay } from '@/lib/tasks';

// "O seu dia" on the Início: the day's meetings and pending tasks, and the
// day's note ("Diário"). It opens by itself the first time the Início is
// shown each day (until "Dispensar hoje" on this device, or the switch is
// turned off); "O meu dia" opens it again.

type Daily = {
  day: string;
  meetings: Array<{ id: string; title: string; start: string }>;
  tasks: Array<{ id: string; title: string; dueOn: string | null }>;
  noteId: string | null;
};
const KEY = 'kh.daily.dismissed';

export function useDailyPopup() {
  const [auto] = usePref<boolean>('ui.dailyAuto', true);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!auto) return;
    // automated browsers (the E2E suite) only with ?daily=1: it would cover every test's first page
    if (navigator.webdriver && !new URLSearchParams(location.search).has('daily')) return;
    try {
      if (localStorage.getItem(KEY) === localDay(new Date())) return;
    } catch {
      /* private mode: show it */
    }
    setOpen(true);
  }, [auto]);
  return { open, setOpen };
}

export function DailyPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [auto, setAuto] = usePref<boolean>('ui.dailyAuto', true);
  const [d, setD] = useState<Daily | null>(null);
  const [busy, setBusy] = useState(false);
  const day = localDay(new Date());

  useEffect(() => {
    if (!open) return;
    api<Daily>(`/notes/daily?day=${day}`)
      .then(setD)
      .catch(() => setD({ day, meetings: [], tasks: [], noteId: null }));
  }, [open, day]);

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, day);
    } catch {
      /* private mode */
    }
    onClose();
  };
  const openNote = async () => {
    setBusy(true);
    try {
      const r = await api<{ id: string }>('/notes/daily', { day });
      dismiss();
      router.push(`/app/notes?n=${r.id}`);
    } catch {
      toast({ message: t('ne_saveFail'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const when = new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('dn_popT')}
      subtitle={when.charAt(0).toUpperCase() + when.slice(1)}
      closeLabel={t('ui_close')}
      className="kh-dn"
      footer={
        <div className="kh-dn__foot">
          <button type="button" className="kh-btn kh-btn--ghost" onClick={dismiss}>
            {t('dn_dismiss')}
          </button>
          <button
            type="button"
            className="kh-btn kh-btn--primary"
            disabled={busy}
            onClick={() => void openNote()}
          >
            {t('dn_open')}
          </button>
        </div>
      }
    >
      <section className="kh-dn__sec">
        <h3>{t('dn_meetings')}</h3>
        {!d ? (
          <p className="kh-dn__none">…</p>
        ) : d.meetings.length ? (
          <ul>
            {d.meetings.map((m) => (
              <li key={m.id}>
                <span className="kh-dn__time">{m.start || '—'}</span>
                <a
                  href={`/app/meetings?m=${m.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onClose();
                    router.push(`/app/meetings?m=${m.id}`);
                  }}
                >
                  {m.title || '—'}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="kh-dn__none">{t('dn_noMeetings')}</p>
        )}
      </section>
      <section className="kh-dn__sec">
        <h3>{t('dn_tasks')}</h3>
        {!d ? (
          <p className="kh-dn__none">…</p>
        ) : d.tasks.length ? (
          <ul>
            {d.tasks.map((x) => (
              <li key={x.id}>
                <span className="kh-dn__box" aria-hidden="true" />
                <a
                  href={`/app/tasks?t=${x.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onClose();
                    router.push(`/app/tasks?t=${x.id}`);
                  }}
                >
                  {x.title || '—'}
                </a>
                {x.dueOn && x.dueOn < day && <span className="kh-dn__late">{t('dn_overdue')}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="kh-dn__none">{t('dn_noTasks')}</p>
        )}
      </section>
      <label className="kh-dn__auto">
        <Switch checked={auto} onChange={(v) => setAuto(v)} label={t('dn_auto')} />
        <span>{t('dn_auto')}</span>
      </label>
    </Modal>
  );
}
