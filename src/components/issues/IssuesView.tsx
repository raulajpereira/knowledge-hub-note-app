'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { projectLabel, useMgOptions } from '@/components/mg/useMgOptions';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { fmtDue, localDay } from '@/lib/tasks';
import { useConfirm, usePersistentState, useToast } from '@/components/ui';
import { refreshCounts } from '@/components/shell/counts';
import { Connections } from '@/components/content/Connections';
import './issues.css';

// Tarefas de Projeto — ZNotes.dc.html `isIssues`: a table with resizable,
// sortable columns and a Kanban by status (drag a card to change it), plus
// the detail panel. Projects arrive with Management (Phase 8).

type Status = 'open' | 'progress' | 'waiting' | 'done';
type Prio = 'low' | 'medium' | 'high' | 'critical';
type Issue = {
  id: string;
  title: string;
  status: Status;
  priority: Prio;
  projectId: string | null;
  dueOn: string | null;
  waiting: string;
  description: string;
  notes: string;
  doneAt: string | null;
  createdAt: string;
};
type Col = 'title' | 'status' | 'prio' | 'project' | 'due' | 'waiting' | 'desc' | 'notes' | 'created';

const STATUS: Record<Status, [string, string]> = {
  open: ['s_open', 'oklch(0.78 0.11 240)'],
  progress: ['s_progress', 'oklch(0.76 0.12 300)'],
  waiting: ['s_waiting', 'oklch(0.85 0.12 75)'],
  done: ['s_done', 'oklch(0.8 0.14 150)'],
};
const PRIO: Record<Prio, [string, string]> = {
  low: ['t_low', 'rgba(255,248,240,.55)'],
  medium: ['t_med', 'oklch(0.85 0.12 75)'],
  high: ['t_high', 'oklch(0.78 0.13 45)'],
  critical: ['p_critical', 'oklch(0.7 0.19 25)'],
};
const STATUSES = Object.keys(STATUS) as Status[];
const COLS: Col[] = ['title', 'status', 'prio', 'project', 'due', 'waiting', 'desc', 'notes', 'created'];
const COLS_DEF: Record<Col, number> = {
  title: 280,
  status: 140,
  prio: 130,
  project: 210,
  due: 120,
  waiting: 190,
  desc: 240,
  notes: 300,
  created: 160,
};
const KAN_DEF: Record<Status, number> = { open: 300, progress: 300, waiting: 300, done: 300 };
const tint = (c: string) => (c.startsWith('oklch') ? c.replace(')', ' / .2)') : 'rgba(255,255,255,.1)');
const PO: Record<Prio, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SO: Record<Status, number> = { open: 0, progress: 1, waiting: 2, done: 3 };

const Badge = ({ label, color }: { label: string; color: string }) => (
  <span className="kh-is-badge" style={{ background: tint(color) }}>
    <span style={{ background: color }} />
    {label}
  </span>
);

function startResize(
  e: React.PointerEvent,
  w0: number,
  lim: [number, number],
  onLive: (w: number) => void,
  onDone: (w: number) => void,
) {
  e.preventDefault();
  e.stopPropagation();
  const x0 = e.clientX;
  const clamp = (x: number) => Math.round(Math.max(lim[0], Math.min(lim[1], w0 + x - x0)));
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  const move = (ev: PointerEvent) => onLive(clamp(ev.clientX));
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    onDone(clamp(ev.clientX));
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

export function IssuesView() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [view, setView] = usePersistentState<'table' | 'kanban'>('issues.view', 'table');
  const [status, setStatus] = usePersistentState<'all' | Status>('issues.status', 'all');
  const [sort, setSort] = usePersistentState<{ key: Col; dir: 1 | -1 }>('issues.sort', {
    key: 'created',
    dir: -1,
  });
  const [colW, setColW] = usePersistentState<Partial<Record<Col, number>>>('issues.cols', {});
  const [kanW, setKanW] = usePersistentState<Partial<Record<Status, number>>>('issues.kan', {});
  const [live, setLive] = useState<{ key: string; w: number } | null>(null);
  const [items, setItems] = useState<Issue[] | null>(null);
  const [q, setQ] = useState('');
  const [project, setProject] = useState('');
  const { projects } = useMgOptions();
  const pjLabel = (id: string | null) => {
    const p = projects.find((x) => x.id === id);
    return p ? projectLabel(p) : '';
  };
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const activeId = sp.get('i');

  const open = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (id) next.set('i', id);
      else next.delete('i');
      router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [path, router, sp],
  );

  useEffect(() => {
    api<{ issues: Issue[] }>('/issues')
      .then((r) => setItems(r.issues))
      .catch(() => setItems([]));
  }, []);

  const save = (id: string, patch: Partial<Issue>, delay = 0) => {
    setItems((cur) => cur && cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const run = () =>
      api<{ issue: Issue }>(`/issues/${id}`, patch, 'PATCH')
        .then((r) => {
          setItems((cur) => cur && cur.map((x) => (x.id === id ? { ...x, doneAt: r.issue.doneAt } : x)));
          if ('status' in patch) refreshCounts();
        })
        .catch(() => toast({ message: t('ne_saveFail'), tone: 'error' }));
    const key = `${id}:${Object.keys(patch).join(',')}`;
    const tm = timers.current.get(key);
    if (tm) clearTimeout(tm);
    if (!delay) return void run();
    timers.current.set(key, setTimeout(run, delay));
  };
  const create = async (st: Status = 'open') => {
    try {
      const { issue } = await api<{ issue: Issue }>('/issues', { title: t('i_newTitle'), status: st });
      setItems((cur) => [issue, ...(cur ?? [])]);
      open(issue.id);
      refreshCounts();
    } catch {
      toast({ message: t('ne_saveFail'), tone: 'error' });
    }
  };
  const remove = async (x: Issue) => {
    const ok = await confirm({
      title: t('tr_askTitle'),
      body: t('tr_askBody').replace('{x}', x.title),
      confirmLabel: t('tr_move'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/issues/${x.id}`, undefined, 'DELETE');
    } catch {
      toast({ message: t('ui_delFail'), tone: 'error' });
      return;
    }
    setItems((cur) => cur && cur.filter((y) => y.id !== x.id));
    open(null);
    refreshCounts();
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const all = useMemo(() => items ?? [], [items]);
  const today = localDay(new Date());
  const query = q.trim().toLowerCase();
  const base = all.filter(
    (x) =>
      (!project || x.projectId === project) &&
      (!query || [x.title, x.description, x.notes, x.waiting].some((v) => v.toLowerCase().includes(query))),
  );
  const list = base.filter((x) => status === 'all' || x.status === status);
  const val = (x: Issue): string | number => {
    switch (sort.key) {
      case 'created':
        return x.createdAt;
      case 'prio':
        return PO[x.priority];
      case 'status':
        return SO[x.status];
      case 'project':
        return pjLabel(x.projectId).toLowerCase();
      case 'due':
        return x.dueOn ?? '9999';
      case 'desc':
        return x.description.toLowerCase();
      default:
        return String(x[sort.key]).toLowerCase();
    }
  };
  const sorted = list.slice().sort((a, b) => {
    const A = val(a);
    const B = val(b);
    return (A < B ? -1 : A > B ? 1 : 0) * sort.dir;
  });
  const fmtStamp = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  const due = (x: Issue) =>
    x.dueOn
      ? {
          label: fmtDue(x.dueOn),
          color: x.status !== 'done' && x.dueOn < today ? 'oklch(0.8 0.13 30)' : undefined,
        }
      : { label: '—', color: 'rgba(255,248,240,.5)' };
  const width = (c: Col) => (live?.key === `col:${c}` ? live.w : (colW[c] ?? COLS_DEF[c]));
  const grid = COLS.map((c) => `minmax(${width(c)}px,${width(c)}fr)`).join(' ');
  const tableW = COLS.reduce((a, c) => a + width(c), 0);
  const kw = (k: Status) => (live?.key === `kan:${k}` ? live.w : (kanW[k] ?? KAN_DEF[k]));
  const nonDone = all.filter((x) => x.status !== 'done').length;
  const a = all.find((x) => x.id === activeId) ?? null;
  const cell = (x: Issue, c: Col) => {
    switch (c) {
      case 'title':
        return <div className="kh-is-td kh-is-td--title">{x.title}</div>;
      case 'status':
        return (
          <div className="kh-is-td">
            <Badge label={t(STATUS[x.status][0])} color={STATUS[x.status][1]} />
          </div>
        );
      case 'prio':
        return (
          <div className="kh-is-td">
            <Badge label={t(PRIO[x.priority][0])} color={PRIO[x.priority][1]} />
          </div>
        );
      case 'project': {
        const p = projects.find((y) => y.id === x.projectId);
        return p ? (
          <div className="kh-is-td" title={projectLabel(p)}>
            <span className="kh-is-dot" style={{ background: p.color }} />
            {projectLabel(p)}
          </div>
        ) : (
          <div className="kh-is-td kh-is-td--dim">—</div>
        );
      }
      case 'due': {
        const d = due(x);
        return (
          <div className="kh-is-td kh-is-td--mono" style={{ color: d.color }}>
            {d.label}
          </div>
        );
      }
      case 'waiting':
        return <div className="kh-is-td kh-is-td--dim">{x.waiting || '—'}</div>;
      case 'desc':
        return <div className="kh-is-td kh-is-td--dim">{x.description || '—'}</div>;
      case 'notes':
        return <div className="kh-is-td kh-is-td--dim">{x.notes || '—'}</div>;
      case 'created':
        return <div className="kh-is-td kh-is-td--created">{fmtStamp(x.createdAt)}</div>;
    }
  };

  return (
    <section className="kh-is">
      <div className="kh-is-main">
        <div className="kh-is-head">
          <div className="kh-is-title">
            <div>{t('nav_issues')}</div>
            <div>
              {nonDone} {t('i_pending')} · {all.length} total
            </div>
          </div>
          <div className="kh-is-seg" role="radiogroup">
            {(
              [
                ['table', 'i_table'],
                ['kanban', 'i_kanban'],
              ] as const
            ).map(([id, k]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={view === id}
                data-on={view === id || undefined}
                onClick={() => setView(id)}
              >
                {t(k)}
              </button>
            ))}
          </div>
          <label className="kh-is-search">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,248,240,.6)"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('i_filter')}
              aria-label={t('i_filter')}
            />
          </label>
          <select
            className="kh-is-select"
            value={project}
            aria-label={t('t_project')}
            onChange={(e) => setProject(e.target.value)}
          >
            <option value="">{t('i_allProjects')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {projectLabel(p)}
              </option>
            ))}
          </select>
          <button type="button" className="kh-is-new" onClick={() => void create('open')}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('i_new')}
          </button>
        </div>
        <div className="kh-is-chips">
          {(['all', ...STATUSES] as const).map((id) => (
            <button key={id} type="button" data-on={status === id || undefined} onClick={() => setStatus(id)}>
              {id !== 'all' && <span className="kh-is-dot" style={{ background: STATUS[id][1] }} />}
              {id === 'all' ? t('i_all') : t(STATUS[id][0])}
              <span>{id === 'all' ? base.length : base.filter((x) => x.status === id).length}</span>
            </button>
          ))}
        </div>

        {view === 'table' ? (
          <div className="kh-is-table">
            <div style={{ minWidth: tableW }}>
              <div className="kh-is-th" style={{ gridTemplateColumns: grid }}>
                {COLS.map((c) => (
                  <div key={c} className="kh-is-thc">
                    <button
                      type="button"
                      onClick={() => setSort({ key: c, dir: sort.key === c ? (-sort.dir as 1 | -1) : 1 })}
                    >
                      {t(`c_${c}`)}
                      <span>{sort.key === c ? (sort.dir > 0 ? '▲' : '▼') : ''}</span>
                    </button>
                    <div
                      className="kh-is-rz"
                      data-on={live?.key === `col:${c}` || undefined}
                      title={t('resize')}
                      role="separator"
                      aria-orientation="vertical"
                      onDoubleClick={() => setColW({ ...colW, [c]: COLS_DEF[c] })}
                      onPointerDown={(e) =>
                        startResize(
                          e,
                          width(c),
                          [80, 700],
                          (w) => setLive({ key: `col:${c}`, w }),
                          (w) => {
                            setLive(null);
                            setColW({ ...colW, [c]: w });
                          },
                        )
                      }
                    >
                      <div />
                    </div>
                  </div>
                ))}
              </div>
              {sorted.map((x) => (
                <div
                  key={x.id}
                  className="kh-is-tr"
                  data-on={x.id === activeId || undefined}
                  style={{ gridTemplateColumns: grid }}
                  role="button"
                  tabIndex={0}
                  onClick={() => open(x.id)}
                  onKeyDown={(e) => e.key === 'Enter' && open(x.id)}
                >
                  {COLS.map((c) => (
                    <div key={c} style={{ display: 'contents' }}>
                      {cell(x, c)}
                    </div>
                  ))}
                </div>
              ))}
              {items && !sorted.length && <div className="kh-is-empty">{t('i_empty')}</div>}
            </div>
          </div>
        ) : (
          <div className="kh-is-kanban">
            {STATUSES.map((k) => {
              const cards = sorted.filter((x) => x.status === k);
              return (
                <div
                  key={k}
                  className="kh-is-col"
                  data-over={(drag && over === k) || undefined}
                  style={{ flex: `1 1 ${kw(k)}px` }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (over !== k) setOver(k);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = drag;
                    setDrag(null);
                    setOver(null);
                    const it = all.find((x) => x.id === id);
                    if (it && it.status !== k) save(it.id, { status: k });
                  }}
                >
                  <div className="kh-is-col__head">
                    <span
                      className="kh-is-col__dot"
                      style={{ background: STATUS[k][1], boxShadow: `0 0 10px ${STATUS[k][1]}` }}
                    />
                    <span>{t(STATUS[k][0])}</span>
                    <span>{cards.length}</span>
                    <div style={{ flex: 1 }} />
                    <button
                      type="button"
                      title={t('i_new')}
                      aria-label={`${t('i_new')} · ${t(STATUS[k][0])}`}
                      onClick={() => void create(k)}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  </div>
                  <div className="kh-is-cards">
                    {cards.map((x) => {
                      const d = due(x);
                      return (
                        <div
                          key={x.id}
                          className="kh-is-card"
                          data-on={x.id === activeId || undefined}
                          data-drag={drag === x.id || undefined}
                          draggable
                          role="button"
                          tabIndex={0}
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', x.id);
                            setDrag(x.id);
                          }}
                          onDragEnd={() => {
                            setDrag(null);
                            setOver(null);
                          }}
                          onClick={() => open(x.id)}
                          onKeyDown={(e) => e.key === 'Enter' && open(x.id)}
                        >
                          <div className="kh-is-card__t">{x.title}</div>
                          {x.description && <div className="kh-is-card__d">{x.description}</div>}
                          <div className="kh-is-card__row">
                            <Badge label={t(PRIO[x.priority][0])} color={PRIO[x.priority][1]} />
                            {x.dueOn && (
                              <span className="kh-is-due" style={{ color: d.color }}>
                                {d.label}
                              </span>
                            )}
                          </div>
                          {x.waiting && x.waiting !== 'N/A' && (
                            <div className="kh-is-card__w">⏳ {x.waiting}</div>
                          )}
                          <div className="kh-is-card__f">
                            <span>—</span>
                            <span>{fmtStamp(x.createdAt)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className="kh-is-kanrz"
                    data-on={live?.key === `kan:${k}` || undefined}
                    title={t('resize')}
                    role="separator"
                    aria-orientation="vertical"
                    onDoubleClick={() => setKanW({ ...kanW, [k]: KAN_DEF[k] })}
                    onPointerDown={(e) =>
                      startResize(
                        e,
                        kw(k),
                        [220, 560],
                        (w) => setLive({ key: `kan:${k}`, w }),
                        (w) => {
                          setLive(null);
                          setKanW({ ...kanW, [k]: w });
                        },
                      )
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {a && (
        <aside className="kh-is-panel" key={a.id}>
          <div className="kh-is-panel__top">
            <span className="kh-is-created">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3 2" />
              </svg>
              {t('createdAt')} {fmtStamp(a.createdAt)}
            </span>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="kh-is-del"
              title={t('del')}
              aria-label={t('del')}
              onClick={() => void remove(a)}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 7h16" />
                <path d="M9 7V4h6v3" />
                <path d="M6 7l1 13h10l1-13" />
              </svg>
            </button>
            <button
              type="button"
              className="kh-is-close"
              title={t('i_close')}
              aria-label={t('i_close')}
              onClick={() => open(null)}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>
          <div className="kh-is-panel__body">
            <textarea
              className="kh-is-ptitle"
              rows={2}
              value={a.title}
              maxLength={300}
              aria-label={t('c_title')}
              onChange={(e) => {
                const v = e.target.value;
                if (v.trim()) save(a.id, { title: v }, 500);
                else setItems((cur) => cur && cur.map((x) => (x.id === a.id ? { ...x, title: v } : x)));
              }}
            />
            <div className="kh-is-field">
              <div className="kh-is-lbl">{t('i_status')}</div>
              <div className="kh-is-pick">
                {STATUSES.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={a.status === k}
                    style={
                      a.status === k
                        ? { background: tint(STATUS[k][1]), borderColor: STATUS[k][1] }
                        : undefined
                    }
                    onClick={() => save(a.id, { status: k })}
                  >
                    <span className="kh-is-dot" style={{ background: STATUS[k][1] }} />
                    {t(STATUS[k][0])}
                  </button>
                ))}
              </div>
            </div>
            <div className="kh-is-field">
              <div className="kh-is-lbl">{t('t_priority')}</div>
              <div className="kh-is-pick">
                {(Object.keys(PRIO) as Prio[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={a.priority === k}
                    style={
                      a.priority === k ? { background: tint(PRIO[k][1]), borderColor: PRIO[k][1] } : undefined
                    }
                    onClick={() => save(a.id, { priority: k })}
                  >
                    <span className="kh-is-dot" style={{ background: PRIO[k][1] }} />
                    {t(PRIO[k][0])}
                  </button>
                ))}
              </div>
            </div>
            <div className="kh-is-grid">
              <label className="kh-is-field">
                <span className="kh-is-lbl">{t('t_project')}</span>
                <select
                  className="kh-is-input kh-is-input--sel"
                  value={a.projectId ?? ''}
                  onChange={(e) => save(a.id, { projectId: e.target.value || null })}
                >
                  <option value="">{t('t_noProject')}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {projectLabel(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="kh-is-field">
                <span className="kh-is-lbl">{t('t_due')}</span>
                <input
                  type="date"
                  className="kh-is-input"
                  value={a.dueOn ?? ''}
                  onChange={(e) => save(a.id, { dueOn: e.target.value || null })}
                />
              </label>
            </div>
            <label className="kh-is-field">
              <span className="kh-is-lbl">{t('i_waiting')}</span>
              <input
                className="kh-is-input"
                value={a.waiting}
                maxLength={300}
                placeholder={t('i_waitingPh')}
                onChange={(e) => save(a.id, { waiting: e.target.value }, 600)}
              />
            </label>
            <label className="kh-is-field">
              <span className="kh-is-lbl">{t('i_desc')}</span>
              <textarea
                className="kh-is-input kh-is-input--area"
                value={a.description}
                maxLength={20000}
                onChange={(e) => save(a.id, { description: e.target.value }, 600)}
              />
            </label>
            <label className="kh-is-field">
              <span className="kh-is-lbl">{t('v_notes')}</span>
              <textarea
                className="kh-is-input kh-is-input--area"
                value={a.notes}
                maxLength={20000}
                onChange={(e) => save(a.id, { notes: e.target.value }, 600)}
              />
            </label>
            {a.status === 'done' && a.doneAt && (
              <div className="kh-is-donedate">
                {t('s_done')} · {fmtStamp(a.doneAt)}
              </div>
            )}
            <Connections type="issue" id={a.id} variant="section" transports />
          </div>
        </aside>
      )}
    </section>
  );
}
