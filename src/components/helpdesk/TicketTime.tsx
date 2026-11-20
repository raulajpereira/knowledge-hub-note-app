'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { useToast } from '@/components/ui';
import { fmtMinutes, roundUp15 } from '@/lib/timelog';
import { TIMER_EVENT, TIMER_OPEN_EVENT, type TimeEntry } from '@/components/timelog/Timer';

// "Registo de Tempos deste ticket": a ticket's entries in its own popup (a
// synced ticket) or panel (a manual one). Start the timer on it, stop it, or
// add an entry by hand (in the Registo de Tempos tab, filled in).

export type TicketRef = {
  /** the ticket's number as shown ("146233", "INC0042") */
  number: string;
  summary: string;
  client: string;
  /** a manual ticket: picked as such when the timer starts */
  ticketId?: string | null;
};

const minsOf = (e: TimeEntry) =>
  e.minutes ?? roundUp15((Date.now() - new Date(e.startedAt).getTime()) / 1000);
const pad = (n: number) => String(n).padStart(2, '0');
const hm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const label = (r: TicketRef) => {
  const n = /^\d/.test(r.number) ? `#${r.number}` : r.number;
  return r.summary ? `${n} · ${r.summary}` : n;
};

/** the ticket's entries (refreshed when the timer starts or stops) */
export function useTicketTime(r: TicketRef | null) {
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);
  const key = r ? `${r.number}|${r.ticketId ?? ''}` : '';
  const load = useCallback(() => {
    if (!key) return setEntries(null);
    const [n, id] = key.split('|');
    void api<{ entries: TimeEntry[] }>(
      `/timelog/ticket?n=${encodeURIComponent(n!)}${id ? `&id=${encodeURIComponent(id)}` : ''}`,
    )
      .then((x) => setEntries(x.entries))
      .catch(() => setEntries([]));
  }, [key]);
  useEffect(() => {
    load();
    window.addEventListener(TIMER_EVENT, load);
    return () => window.removeEventListener(TIMER_EVENT, load);
  }, [load]);
  const total = (entries ?? []).reduce((a, e) => a + minsOf(e), 0);
  return { entries, total, reload: load };
}

/** the button at the end of the ticket: "⏱ Registo de Tempos deste ticket · 4h42" */
export function TicketTimeButton({ total, onClick }: { total: number; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" className="kh-hd-tlbtn" onClick={onClick}>
      ⏱ {t('hd_tlThis')}
      {total > 0 && <b> · {fmtMinutes(total)}</b>}
    </button>
  );
}

export function TicketTime({
  r,
  entries,
  onBack,
}: {
  r: TicketRef;
  entries: TimeEntry[] | null;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [running, setRunning] = useState<TimeEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const loadRunning = useCallback(() => {
    void api<{ entry: TimeEntry | null }>('/timelog/running')
      .then((x) => setRunning(x.entry))
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadRunning();
    window.addEventListener(TIMER_EVENT, loadRunning);
    const i = setInterval(() => tick((n) => n + 1), 30_000);
    return () => {
      window.removeEventListener(TIMER_EVENT, loadRunning);
      clearInterval(i);
    };
  }, [loadRunning]);
  const list = entries ?? [];
  const here = !!running && list.some((e) => e.id === running.id);
  const weekStart = (() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() - ((n.getDay() + 6) % 7)).getTime();
  })();
  const sum = (xs: TimeEntry[]) => xs.reduce((a, e) => a + minsOf(e), 0);

  const start = async () => {
    // another one running: the header's dialog stops it (and can start this one next)
    if (running) {
      window.dispatchEvent(new Event(TIMER_OPEN_EVENT));
      return;
    }
    setBusy(true);
    try {
      await api('/timelog/start', {
        refKind: r.ticketId ? 'ticket' : null,
        refId: r.ticketId ?? null,
        refLabel: label(r),
        clientId: null,
        clientLabel: r.client,
        projectId: null,
        description: '',
        inTimesheet: false,
      });
      window.dispatchEvent(new Event(TIMER_EVENT));
    } catch {
      toast({ message: t('hd_fail'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const today = new Date().toDateString();

  return (
    <div className="kh-hd-tt">
      <div className="kh-hd-tt__tot">
        <span>
          {t('hd_tlTotal')}
          <b>{fmtMinutes(sum(list))}</b>
        </span>
        <span>
          {t('hd_tlWeek')}
          <b>{fmtMinutes(sum(list.filter((e) => Date.parse(e.startedAt) >= weekStart)))}</b>
        </span>
        <span>
          {t('tl_inSheet')}
          <b>{fmtMinutes(sum(list.filter((e) => e.tsState === 'added')))}</b>
        </span>
      </div>
      <div className="kh-hd-tt__bar">
        <b>{t('hd_tlEntries')}</b>
        <span className="sp" />
        <button
          type="button"
          className="kh-btn kh-btn--sm kh-btn--ghost"
          onClick={() =>
            router.push(
              `/app/helpdesk?tab=time&new=${encodeURIComponent(label(r))}&c=${encodeURIComponent(r.client)}${
                r.ticketId ? `&tk=${r.ticketId}` : ''
              }`,
            )
          }
        >
          + {t('tl_manual')}
        </button>
        {here ? (
          <button
            type="button"
            className="kh-btn kh-btn--sm kh-hd-tt__go"
            onClick={() => window.dispatchEvent(new Event(TIMER_OPEN_EVENT))}
          >
            ❚❚ {t('hd_tlStop')} ({fmtMinutes(minsOf(running!))})
          </button>
        ) : (
          <button
            type="button"
            className="kh-btn kh-btn--sm kh-hd-tt__go"
            disabled={busy}
            onClick={() => void start()}
          >
            ▶ {t('hd_tlStart')}
          </button>
        )}
      </div>
      {entries && !list.length && <p className="kh-hd-hint">{t('hd_tlNone')}</p>}
      {list.map((e) => {
        const d = new Date(e.startedAt);
        return (
          <div key={e.id} className="kh-hd-tt__row" data-run={!e.endedAt || undefined}>
            <span className="kh-hd-mono">
              {d.toDateString() === today ? t('tl_today') : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`}
            </span>
            <span className="kh-hd-mono">
              {hm(e.startedAt)} – {e.endedAt ? hm(e.endedAt) : t('tl_running')}
            </span>
            <span className="kh-hd-mono">{fmtMinutes(minsOf(e))}</span>
            <span title={e.description}>{e.description || '—'}</span>
          </div>
        );
      })}
      <div className="kh-hd-tt__back">
        <button type="button" className="kh-btn kh-btn--sm kh-btn--ghost" onClick={onBack}>
          ← {t('hd_tlBack')}
        </button>
      </div>
    </div>
  );
}
