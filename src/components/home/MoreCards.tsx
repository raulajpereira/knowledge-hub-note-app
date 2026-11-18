'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { useToast } from '@/components/ui';
import { useWhen } from '@/components/content/useWhen';
import { fmtClock, fmtMinutes } from '@/lib/timelog';
import { localDay } from '@/lib/tasks';
import { hdStatusKind, type HdStatusKind } from '@/lib/helpdesk';
import { TIMER_EVENT, TIMER_OPEN_EVENT, type TimeEntry } from '@/components/timelog/Timer';
import { HD_EVENT, useChangeText, type HdChange } from '@/components/helpdesk/HelpdeskPopup';
import type { HomeData } from '@/server/content/home';

// Início cards for the features added later: Registo de Tempos, Helpdesk,
// Reuniões de hoje, Nota do dia, Notas SAP, SAP News, Cutover e Testes,
// Ficheiros e Notas de voz. Each one is its own card (added, moved and
// removed in "Personalizar"); the ones that need more than the Início's data
// fetch it themselves, only when they are on the page.

const Empty = ({ k }: { k: string }) => {
  const { t } = useI18n();
  return <div className="kh-card__empty">{t(k)}</div>;
};

const Bar = ({ p, color }: { p: number; color?: string }) => (
  <div className="kh-hx-bar">
    <div style={{ width: `${Math.max(0, Math.min(100, p))}%`, background: color ?? 'var(--accent)' }} />
  </div>
);

// ---------------------------------------------------------------- Registo de Tempos

const WEEK_TARGET = 40 * 60;
const startOfWeek = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
const mins = (e: TimeEntry, now: number) =>
  e.endedAt ? (e.minutes ?? 0) : Math.max(0, Math.floor((now - Date.parse(e.startedAt)) / 60000));

export function TimelogCard() {
  const { t } = useI18n();
  const [list, setList] = useState<TimeEntry[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const load = useCallback(() => {
    const from = startOfWeek(new Date());
    const to = new Date(Date.now() + 86_400_000);
    void api<{ entries: TimeEntry[] }>(`/timelog?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((r) => setList(r.entries))
      .catch(() => setList([]));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(TIMER_EVENT, load);
    return () => window.removeEventListener(TIMER_EVENT, load);
  }, [load]);
  const running = list?.find((e) => !e.endedAt) ?? null;
  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [running]);
  if (!list) return <Empty k="hx_loading" />;
  const today = localDay(new Date());
  const day = list.filter((e) => localDay(new Date(e.startedAt)) === today);
  const dayM = day.reduce((s, e) => s + mins(e, now), 0);
  const weekM = list.reduce((s, e) => s + mins(e, now), 0);
  return (
    <>
      <div className="kh-hx-kpis">
        <div>
          <small>{t('hx_today')}</small>
          <b>{fmtMinutes(dayM)}</b>
        </div>
        <div>
          <small>{t('hx_week')}</small>
          <b>{fmtMinutes(weekM)}</b>
        </div>
        <div className="kh-hx-kpis__bar">
          <Bar p={(weekM / WEEK_TARGET) * 100} />
          <small>{t('hx_weekOf').replace('{p}', String(Math.round((weekM / WEEK_TARGET) * 100)))}</small>
        </div>
      </div>
      <div className="kh-hx-run">
        {running ? (
          <>
            <span className="kh-hx-rec" />
            <span className="kh-mono">
              {fmtClock(Math.floor((now - Date.parse(running.startedAt)) / 1000))}
            </span>
            <span className="kh-hx-run__l">
              {[running.refLabel, running.clientLabel].filter(Boolean).join(' · ') || running.description}
            </span>
          </>
        ) : (
          <span className="kh-hx-run__l">{t('hx_notRunning')}</span>
        )}
        <button
          type="button"
          className="kh-hx-btn"
          onClick={() => window.dispatchEvent(new Event(TIMER_OPEN_EVENT))}
        >
          {running ? `■ ${t('hx_stop')}` : `▶ ${t('hx_start')}`}
        </button>
      </div>
      <div className="kh-hlist">
        {day
          .filter((e) => e.endedAt)
          .slice(0, 3)
          .map((e) => (
            <Link key={e.id} href={`/app/timelog?e=${e.id}`} className="kh-hrow" scroll={false}>
              <span className="kh-hrow__col">
                <span className="kh-hrow__t">{e.refLabel || e.description || '—'}</span>
                <span className="kh-hrow__s">
                  {[e.clientLabel, e.projectLabel].filter(Boolean).join(' · ') || '—'}
                </span>
              </span>
              <span className="kh-mono kh-hx-r">{fmtMinutes(e.minutes ?? 0)}</span>
            </Link>
          ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Helpdesk

type HdItem = { id: string; number: string; summary: string; status: string; inList: boolean };
type HdSource = { name: string; lastSyncAt: string | null; intervalMin: number; lastError: string | null };
const HOT: HdStatusKind[] = ['open', 'reopen', 'progress'];

export function HelpdeskCard() {
  const { t } = useI18n();
  const text = useChangeText();
  const when = useWhen();
  const [d, setD] = useState<{ items: HdItem[]; changes: HdChange[]; sources: HdSource[] } | null>(null);
  const load = useCallback(
    () =>
      void api<{ items: HdItem[]; changes: HdChange[]; sources: HdSource[] }>('/helpdesk')
        .then(setD)
        .catch(() => setD({ items: [], changes: [], sources: [] })),
    [],
  );
  useEffect(() => {
    load();
    window.addEventListener(HD_EVENT, load);
    return () => window.removeEventListener(HD_EVENT, load);
  }, [load]);
  if (!d) return <Empty k="hx_loading" />;
  if (!d.items.length) return <Empty k="hx_hdEmpty" />;
  const inList = d.items.filter((i) => i.inList);
  const by = (k: HdStatusKind) => inList.filter((i) => hdStatusKind(i.status) === k).length;
  const chips: Array<[HdStatusKind, string]> = [
    ['open', 'hx_hdOpen'],
    ['reopen', 'hx_hdReopen'],
    ['progress', 'hx_hdProgress'],
    ['pending', 'hx_hdPending'],
  ];
  const src = d.sources[0];
  return (
    <>
      <div className="kh-hx-chips">
        {chips.map(([k, l]) => (
          <span key={k} className="kh-hd-st" data-k={k} data-zero={!by(k) || undefined}>
            {by(k)} {t(l)}
          </span>
        ))}
      </div>
      <div className="kh-hlist">
        {(d.changes.length
          ? d.changes.slice(0, 4).map((c) => ({
              id: c.itemId,
              n: c.number,
              t: c.summary,
              s: `${text(c)} · ${when(c.syncAt)}`,
              key: c.id,
            }))
          : inList
              .filter((i) => HOT.includes(hdStatusKind(i.status)))
              .slice(0, 4)
              .map((i) => ({ id: i.id, n: i.number, t: i.summary, s: i.status, key: i.id }))
        ).map((r) => (
          <Link key={r.key} href={`/app/helpdesk?i=${r.id}`} className="kh-hrow" scroll={false}>
            <span className="kh-hrow__col">
              <span className="kh-hrow__t">
                <span className="kh-mono">#{r.n}</span> {r.t}
              </span>
              <span className="kh-hrow__s">{r.s}</span>
            </span>
          </Link>
        ))}
      </div>
      {src && (
        <div className="kh-hx-foot" data-warn={!!src.lastError || undefined}>
          ●{' '}
          {src.lastError
            ? t(`hd_err_${src.lastError}`)
            : t('hx_hdSynced').replace('{a}', src.lastSyncAt ? when(src.lastSyncAt) : '—')}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Reuniões de hoje · Nota do dia

type Meeting = {
  id: string;
  title: string;
  heldOn: string;
  startTime: string;
  endTime: string;
  participants: string[];
};

export function MeetingsCard() {
  const [list, setList] = useState<Meeting[] | null>(null);
  useEffect(() => {
    const today = localDay(new Date());
    void api<{ meetings: Meeting[] }>('/meetings')
      .then((r) =>
        setList(
          r.meetings
            .filter((m) => m.heldOn === today)
            .sort((a, b) => (a.startTime || '99').localeCompare(b.startTime || '99')),
        ),
      )
      .catch(() => setList([]));
  }, []);
  if (!list) return <Empty k="hx_loading" />;
  if (!list.length) return <Empty k="hx_noMeetings" />;
  return (
    <div className="kh-hlist">
      {list.slice(0, 5).map((m) => (
        <Link key={m.id} href={`/app/meetings?m=${m.id}`} className="kh-hrow" scroll={false}>
          <span className="kh-hrow__col">
            <span className="kh-hrow__t">{m.title || '—'}</span>
            <span className="kh-hrow__s">{(m.participants ?? []).slice(0, 3).join(', ') || '—'}</span>
          </span>
          <span className="kh-mono kh-hx-r">
            {m.startTime || '—'}
            {m.endTime ? `–${m.endTime}` : ''}
          </span>
        </Link>
      ))}
    </div>
  );
}

type Daily = {
  day: string;
  meetings: Array<{ id: string; title: string; start: string }>;
  tasks: Array<{ id: string; title: string; dueOn: string | null }>;
  noteId: string | null;
};

export function DailyCard() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [d, setD] = useState<Daily | null>(null);
  const [busy, setBusy] = useState(false);
  const day = localDay(new Date());
  useEffect(() => {
    void api<Daily>(`/notes/daily?day=${day}`)
      .then(setD)
      .catch(() => setD({ day, meetings: [], tasks: [], noteId: null }));
  }, [day]);
  const open = async () => {
    setBusy(true);
    try {
      const r = await api<{ id: string }>('/notes/daily', { day });
      router.push(`/app/notes?n=${r.id}`);
    } catch {
      toast({ message: t('hx_fail'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  if (!d) return <Empty k="hx_loading" />;
  const date = new Date(`${day}T12:00:00`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return (
    <>
      <div className="kh-hx-day">
        <b>{date.charAt(0).toUpperCase() + date.slice(1)}</b>
        <span>
          {t('hx_daySum').replace('{t}', String(d.tasks.length)).replace('{m}', String(d.meetings.length))}
        </span>
      </div>
      <div className="kh-hlist">
        {d.tasks.slice(0, 3).map((x) => (
          <Link key={x.id} href={`/app/tasks?t=${x.id}`} className="kh-hrow" scroll={false}>
            <span className="kh-hrow__col">
              <span className="kh-hrow__t">☐ {x.title || '—'}</span>
              <span className="kh-hrow__s">{t('hx_task')}</span>
            </span>
          </Link>
        ))}
      </div>
      <button type="button" className="kh-hx-btn kh-hx-btn--wide" disabled={busy} onClick={() => void open()}>
        {d.noteId ? t('hx_openDaily') : t('hx_makeDaily')}
      </button>
    </>
  );
}

// ---------------------------------------------------------------- Notas SAP · Cutover e Testes · Ficheiros · Voz

export function SapNotesCard({ data }: { data: HomeData['sapNotes'] }) {
  const { t } = useI18n();
  if (!data || (!data.todo && !data.done)) return <Empty k="hx_noSapNotes" />;
  return (
    <>
      <div className="kh-hx-kpis">
        <div>
          <small>{t('hx_snTodo')}</small>
          <b style={{ color: 'oklch(0.85 0.13 75)' }}>{data.todo}</b>
        </div>
        <div>
          <small>{t('hx_snDone')}</small>
          <b>{data.done}</b>
        </div>
      </div>
      <div className="kh-hlist">
        {data.list.map((n) => (
          <Link key={n.id} href={`/app/sapnotes?n=${n.id}`} className="kh-hrow" scroll={false}>
            <span className="kh-hrow__col">
              <span className="kh-hrow__t">
                <span className="kh-mono">{n.number}</span> {n.title}
              </span>
              <span className="kh-hrow__s">
                {t('hx_snIn')} {n.systems.join(', ') || '—'}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

export function FnCard({ data }: { data: HomeData['fn'] }) {
  const { t } = useI18n();
  const rows = (
    [
      ['cut', 'hx_fnCut', 'fn-cut', 'var(--accent)'],
      ['test', 'hx_fnTest', 'fn-test', 'oklch(0.75 0.15 150)'],
      ['mig', 'hx_fnMig', 'fn-mig', 'oklch(0.78 0.14 70)'],
    ] as const
  ).filter(([k]) => data?.[k]?.total);
  if (!rows.length) return <Empty k="hx_noFn" />;
  return (
    <div className="kh-hx-fn">
      {rows.map(([k, l, page, color]) => {
        const x = data![k]!;
        const p = Math.round((x.done / x.total) * 100);
        return (
          <Link key={k} href={`/app/${page}`} scroll={false}>
            <span>
              {t(l)} — {x.done}/{x.total}
              {x.bad ? <em> · {t('hx_fnBad').replace('{n}', String(x.bad))}</em> : null}
            </span>
            <b className="kh-mono">{p}%</b>
            <Bar p={p} color={color} />
          </Link>
        );
      })}
    </div>
  );
}

export function FilesCard({ data }: { data: HomeData['files'] }) {
  const { t } = useI18n();
  const when = useWhen();
  if (!data?.length) return <Empty k="hx_noFiles" />;
  return (
    <div className="kh-hlist">
      {data.map((f) => (
        <Link key={f.id} href={`/app/files?f=${f.id}`} className="kh-hrow" scroll={false}>
          <span className="kh-hrow__col">
            <span className="kh-hrow__t">{f.name}</span>
            <span className="kh-hrow__s">
              {f.folder ?? t('hx_noFolder')} · {when(f.updatedAt)}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export function VoiceCard({ data }: { data: HomeData['voice'] }) {
  const { t } = useI18n();
  const when = useWhen();
  if (!data?.length) return <Empty k="hx_noVoice" />;
  const dur = (ms: number) => {
    const s = Math.round(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  return (
    <div className="kh-hlist">
      {data.map((v) => (
        <Link key={v.id} href={`/app/voice?v=${v.id}`} className="kh-hrow" scroll={false}>
          <span className="kh-hrow__col">
            <span className="kh-hrow__t">{v.title || t('hx_voiceUntitled')}</span>
            <span className="kh-hrow__s">
              {dur(v.durationMs)} · {v.transcribed ? t('hx_transcribed') : when(v.createdAt)}
            </span>
          </span>
          <span className="kh-hx-r">▶</span>
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- SAP News

type News = { id: string; title: string; link: string; date: string; src: string };

export function NewsCard() {
  const when = useWhen();
  const [list, setList] = useState<News[] | null>(null);
  useEffect(() => {
    void api<{ items: News[] }>('/news/sap')
      .then((r) => setList(r.items.slice(0, 5)))
      .catch(() => setList([]));
  }, []);
  if (!list) return <Empty k="hx_loading" />;
  if (!list.length) return <Empty k="hx_noNews" />;
  return (
    <div className="kh-hlist">
      {list.map((n) => (
        <a key={n.id || n.link} href={n.link} target="_blank" rel="noreferrer noopener" className="kh-hrow">
          <span className="kh-hrow__col">
            <span className="kh-hrow__t">{n.title}</span>
            <span className="kh-hrow__s">{n.date ? when(n.date) : ''}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
