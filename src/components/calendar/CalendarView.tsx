'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import { isoD, ptHolidays } from '@/lib/calendar';
import { usePersistentState, useToast } from '@/components/ui';
import { useShell } from '@/components/shell/ShellContext';
import { refreshCounts } from '@/components/shell/counts';
import './calendar.css';

// ZNotes.dc.html `isCalendar`: tasks (and, from Phase 5, issues) by due
// date — month/week grid with Portuguese holidays, drag to reschedule, a
// day panel to add/complete, and the period summary.

type Prio = 'low' | 'medium' | 'high';
type Task = { id: string; title: string; priority: Prio; dueOn: string | null; doneAt: string | null };
type Item = { kind: 'task'; id: string; due: string; title: string; done: boolean; c: string; prio: Prio };

const PRI: Record<Prio, string> = {
  high: 'oklch(0.78 0.14 45)',
  medium: 'oklch(0.85 0.12 80)',
  low: 'oklch(0.8 0.02 60)',
};
const PRI_L: Record<Prio, string> = { high: 't_high', medium: 't_med', low: 't_low' };
const LATE = 'oklch(0.72 0.18 28)';
const tint = (c: string, a: number) => c.replace(')', ` / ${a})`);
const at12 = (iso: string) => new Date(`${iso}T12:00:00`);

const Chevron = ({ dir }: { dir: 'l' | 'r' }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={dir === 'l' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
  </svg>
);

export function CalendarView() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const { modules } = useShell();
  const hasTasks = modules.has('tasks');
  const loc = lang === 'en' ? 'en-GB' : 'pt-PT';
  const en = lang === 'en';
  const today = isoD(new Date());

  const [mode, setMode] = usePersistentState<'month' | 'week'>('cal.mode', 'month');
  const [showT, setShowT] = usePersistentState('cal.tasks', true);
  const [showDone, setShowDone] = usePersistentState('cal.done', false);
  const [panelW, setPanelW] = usePersistentState('cal.panel', 340);
  const [livePanel, setLivePanel] = useState<number | null>(null);
  const [anchor, setAnchor] = useState(today);
  const [sel, setSel] = useState(today);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [draft, setDraft] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const gridRO = useRef<ResizeObserver | null>(null);

  const load = useCallback(() => {
    if (!hasTasks) return;
    api<{ tasks: Task[] }>('/tasks')
      .then((r) => setTasks(r.tasks))
      .catch(() => {});
  }, [hasTasks]);
  useEffect(load, [load]);

  // Grid → dots instead of chips when the calendar gets narrow (prototype cNarrow).
  const gridRef = useCallback((el: HTMLDivElement | null) => {
    gridRO.current?.disconnect();
    gridRO.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    gridRO.current = new ResizeObserver(([e]) => setNarrow((e?.contentRect.width ?? 999) < 640));
    gridRO.current.observe(el);
  }, []);

  const A = at12(anchor);
  const wk = mode === 'week';
  let start: Date;
  let days: number;
  if (wk) {
    start = new Date(A);
    start.setDate(A.getDate() - ((A.getDay() + 6) % 7));
    days = 7;
  } else {
    const first = new Date(A.getFullYear(), A.getMonth(), 1, 12);
    start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    const last = new Date(A.getFullYear(), A.getMonth() + 1, 0, 12);
    days = Math.ceil((Math.round((+last - +start) / 86_400_000) + 1) / 7) * 7;
  }
  const end = new Date(start);
  end.setDate(start.getDate() + days - 1);
  const hol = useMemo(
    () => ({ ...ptHolidays(start.getFullYear()), ...ptHolidays(start.getFullYear() + 1) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- by year only
    [start.getFullYear()],
  );

  const items: Item[] = useMemo(
    () =>
      showT
        ? tasks
            .filter((x) => x.dueOn && (!x.doneAt || showDone))
            .map((x) => ({
              kind: 'task' as const,
              id: x.id,
              due: x.dueOn!,
              title: x.title,
              done: !!x.doneAt,
              c: PRI[x.priority],
              prio: x.priority,
            }))
        : [],
    [tasks, showT, showDone],
  );
  const byDay = useMemo(() => {
    const m: Record<string, Item[]> = {};
    for (const x of items) (m[x.due] ??= []).push(x);
    for (const k of Object.keys(m)) m[k]!.sort((a, b) => Number(a.done) - Number(b.done));
    return m;
  }, [items]);

  const patchTask = async (id: string, p: { dueOn?: string; done?: boolean }) => {
    setTasks((cur) =>
      cur.map((x) =>
        x.id === id
          ? {
              ...x,
              ...(p.dueOn ? { dueOn: p.dueOn } : {}),
              ...('done' in p ? { doneAt: p.done ? new Date().toISOString() : null } : {}),
            }
          : x,
      ),
    );
    try {
      const r = await api<{ next: unknown }>(`/tasks/${id}`, p, 'PATCH');
      if (r.next) load();
      if ('done' in p) refreshCounts();
    } catch {
      toast({ message: t('ne_saveFail'), tone: 'error' });
      load();
    }
  };

  const add = async () => {
    const v = draft.trim();
    if (!v) return;
    setDraft('');
    try {
      const { task } = await api<{ task: Task }>('/tasks', { title: v, dueOn: sel });
      setTasks((cur) => [task, ...cur]);
      setShowT(true);
      refreshCounts();
    } catch (e) {
      toast({
        message: t(isApiFailure(e) && e.code === 'limit_reached' ? 'tk_limit' : 'ne_saveFail'),
        tone: 'error',
      });
    }
  };

  const shift = (n: number) => {
    const d = new Date(A);
    if (wk) d.setDate(d.getDate() + 7 * n);
    else {
      d.setDate(1);
      d.setMonth(d.getMonth() + n);
    }
    setAnchor(isoD(d));
  };
  const label = wk
    ? `${start.getDate()} ${start.toLocaleDateString(loc, { month: 'short' })} – ${end.getDate()} ${end.toLocaleDateString(loc, { month: 'short' })} ${end.getFullYear()}`
    : A.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  const rows = days / 7;
  const maxN = narrow ? 0 : wk ? 12 : 3;
  const rowMin = wk ? (narrow ? '140px' : '320px') : narrow ? '58px' : rows > 5 ? '96px' : '112px';
  const dow = en
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  const rangeFrom = wk ? isoD(start) : isoD(new Date(A.getFullYear(), A.getMonth(), 1, 12));
  const rangeTo = wk ? isoD(end) : isoD(new Date(A.getFullYear(), A.getMonth() + 1, 0, 12));
  const inRange = items.filter((x) => x.due >= rangeFrom && x.due <= rangeTo);
  const selDate = at12(sel);
  const dd = Math.round((+new Date(`${sel}T00:00:00`) - +new Date(`${today}T00:00:00`)) / 86_400_000);
  const selItems = byDay[sel] ?? [];
  const open = (x: Item) => router.push(`/app/tasks?t=${x.id}`);
  const colorOf = (x: Item) => (!x.done && x.due < today ? LATE : x.c);
  const pw = livePanel ?? panelW;

  const onPanelDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const clamp = (w: number) => Math.round(Math.max(250, Math.min(1300, w)));
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const mv = (ev: PointerEvent) => setLivePanel(clamp(panelW - (ev.clientX - x0)));
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setLivePanel(null);
      setPanelW(clamp(panelW - (ev.clientX - x0)));
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  return (
    <section className="kh-cal">
      <div className="kh-cal__main">
        <div className="kh-cal__head">
          <div className="kh-cal__titles">
            <div className="kh-cal__title">{t('nav_calendar')}</div>
            <div className="kh-cal__sub">{t('c_sub')}</div>
          </div>
          <div className="kh-cal__modes" role="radiogroup" aria-label={t('c_month')}>
            {(['month', 'week'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                data-on={mode === m || undefined}
                onClick={() => {
                  setMode(m);
                  setAnchor(sel);
                }}
              >
                {t(m === 'month' ? 'c_month' : 'c_week')}
              </button>
            ))}
          </div>
          <div className="kh-cal__nav">
            <button
              type="button"
              className="kh-cal__today"
              onClick={() => {
                setAnchor(today);
                setSel(today);
              }}
            >
              {t('t_today')}
            </button>
            <button type="button" className="kh-cal__arrow" aria-label="‹" onClick={() => shift(-1)}>
              <Chevron dir="l" />
            </button>
            <div className="kh-cal__label">{label}</div>
            <button type="button" className="kh-cal__arrow" aria-label="›" onClick={() => shift(1)}>
              <Chevron dir="r" />
            </button>
          </div>
        </div>
        <div className="kh-cal__filters">
          {hasTasks && (
            <button
              type="button"
              className="kh-cal__chip"
              data-on={showT || undefined}
              aria-pressed={showT}
              onClick={() => setShowT(!showT)}
            >
              <span style={{ background: PRI.high }} />
              {t('c_tasks')}
              <span className="kh-cal__n">{tasks.filter((x) => x.dueOn && !x.doneAt).length}</span>
            </button>
          )}
          <button
            type="button"
            className="kh-cal__chip"
            data-on={showDone || undefined}
            aria-pressed={showDone}
            onClick={() => setShowDone(!showDone)}
          >
            <span style={{ background: 'rgba(255,248,240,.5)' }} />
            {t('c_done')}
          </button>
          <span className="kh-cal__hint">{t('c_hint')}</span>
        </div>
        <div className="kh-cal__dow">
          {dow.map((d, i) => (
            <div key={d} style={{ color: i > 4 ? 'rgba(255,248,240,.5)' : 'rgba(255,248,240,.72)' }}>
              {d}
            </div>
          ))}
        </div>
        <div
          ref={gridRef}
          className="kh-cal__grid"
          style={{ gridAutoRows: `minmax(${rowMin},1fr)`, gap: narrow ? 4 : 6 }}
        >
          {Array.from({ length: days }, (_, i) => {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            const k = isoD(d);
            const L = byDay[k] ?? [];
            const inM = wk || d.getMonth() === A.getMonth();
            const we = d.getDay() === 0 || d.getDay() === 6;
            const hl = hol[k];
            return (
              <div
                key={k}
                className="kh-cal__day"
                data-today={k === today || undefined}
                data-sel={k === sel || undefined}
                data-we={we || undefined}
                data-drop={dropOn === k || undefined}
                style={{ opacity: inM ? 1 : 0.45 }}
                role="button"
                tabIndex={0}
                aria-label={d.toLocaleDateString(loc, { day: 'numeric', month: 'long' })}
                onClick={() => setSel(k)}
                onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && setSel(k)}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes('application/x-kh-due')) return;
                  e.preventDefault();
                  if (dropOn !== k) setDropOn(k);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('application/x-kh-due');
                  setDropOn(null);
                  setSel(k);
                  if (id) void patchTask(id, { dueOn: k });
                }}
              >
                <div className="kh-cal__dayhead">
                  <span className="kh-cal__num">{d.getDate()}</span>
                  {hl && !narrow && (
                    <span className="kh-cal__hol" title={hl[en ? 1 : 0]}>
                      {hl[en ? 1 : 0]}
                    </span>
                  )}
                </div>
                {narrow && L.length > 0 && (
                  <div className="kh-cal__dots">
                    {L.slice(0, 8).map((x) => (
                      <span
                        key={x.id}
                        title={x.title}
                        style={{ background: colorOf(x), boxShadow: `0 0 6px ${colorOf(x)}` }}
                      />
                    ))}
                  </div>
                )}
                {L.slice(0, maxN).map((x) => (
                  <div
                    key={x.id}
                    className="kh-cal__item"
                    draggable
                    title={`${t('c_task')} · ${x.title}`}
                    style={{
                      background: tint(colorOf(x), 0.2),
                      borderLeftColor: colorOf(x),
                      opacity: x.done ? 0.55 : 1,
                    }}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('application/x-kh-due', x.id);
                    }}
                    onDragEnd={() => setDropOn(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      open(x);
                    }}
                  >
                    <span style={{ textDecoration: x.done ? 'line-through' : 'none' }}>{x.title}</span>
                  </div>
                ))}
                {!narrow && L.length > maxN && (
                  <span className="kh-cal__more">
                    +{L.length - maxN}
                    {t('c_more')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div
        className="kh-cal__resize"
        title={t('resize')}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={pw}
        onPointerDown={onPanelDown}
        onDoubleClick={() => setPanelW(340)}
      >
        <div data-drag={livePanel !== null || undefined} />
      </div>
      <aside className="kh-cal__panel" style={{ width: pw }}>
        <div className="kh-cal__selhead">
          <span className="kh-cal__rel">
            {dd === 0
              ? t('t_today')
              : dd === 1
                ? t('c_tomorrow')
                : dd === -1
                  ? t('c_yesterday')
                  : selDate.toLocaleDateString(loc, { weekday: 'long' })}
          </span>
          <span className="kh-cal__sellabel">
            {selDate.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          {hol[sel] && <span className="kh-cal__selhol">{hol[sel]![en ? 1 : 0]}</span>}
        </div>
        {hasTasks && (
          <div className="kh-cal__add">
            <input
              value={draft}
              placeholder={t('c_newPh')}
              aria-label={t('c_newPh')}
              maxLength={300}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void add()}
            />
            <button type="button" title={t('c_add')} aria-label={t('c_add')} onClick={() => void add()}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        )}
        <div className="kh-cal__selitems">
          {selItems.map((x) => {
            const late = !x.done && x.due < today;
            const c = colorOf(x);
            return (
              <div
                key={x.id}
                className="kh-cal__sel"
                style={{ borderLeftColor: c }}
                role="button"
                tabIndex={0}
                onClick={() => open(x)}
                onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && open(x)}
              >
                <button
                  type="button"
                  className="kh-cal__ck"
                  data-on={x.done || undefined}
                  aria-label={x.title}
                  aria-pressed={x.done}
                  onClick={(e) => {
                    e.stopPropagation();
                    void patchTask(x.id, { done: !x.done });
                  }}
                >
                  {x.done && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </button>
                <div className="kh-cal__selbody">
                  <span
                    style={{ textDecoration: x.done ? 'line-through' : 'none', opacity: x.done ? 0.6 : 1 }}
                  >
                    {x.title}
                  </span>
                  <span className="kh-cal__selmeta">
                    <span style={{ background: tint(c, 0.3) }}>
                      {t('c_task')}
                      {late ? ` · ${t('c_late')}` : ''}
                    </span>
                    {t(PRI_L[x.prio])}
                  </span>
                </div>
              </div>
            );
          })}
          {selItems.length === 0 && <div className="kh-cal__empty">{t('c_empty')}</div>}
        </div>
        <div className="kh-cal__sum">
          <span className="kh-cal__rel">{t('c_monthSum')}</span>
          <div>
            {hasTasks && (
              <div>
                <span style={{ color: PRI.high }}>{inRange.filter((x) => !x.done).length}</span>
                <span>{t('c_sumTasks')}</span>
              </div>
            )}
            <div>
              <span style={{ color: 'oklch(0.75 0.17 28)' }}>
                {inRange.filter((x) => !x.done && x.due < today).length}
              </span>
              <span>{t('c_sumLate')}</span>
            </div>
          </div>
        </div>
      </aside>
    </section>
  );
}
