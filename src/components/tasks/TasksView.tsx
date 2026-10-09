'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { projectLabel, useMgOptions } from '@/components/mg/useMgOptions';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import { COL_DEFAULTS, COL_LIMITS } from '@/lib/prefs';
import { fmtDue, localDay } from '@/lib/tasks';
import { onActivateKey, useConfirm, usePersistentState, useToast } from '@/components/ui';
import { usePref } from '@/components/shell/PrefsProvider';
import { useShell } from '@/components/shell/ShellContext';
import { refreshCounts } from '@/components/shell/counts';
import { ColHandle } from '@/components/content/ColHandle';
import { Connections } from '@/components/content/Connections';
import { useWhen } from '@/components/content/useWhen';
import { useDraft } from '@/components/content/useDraft';
import { sharedConfirm, useSharedFolders, type SharedFolder } from '@/components/share/useSharedFolders';
import './tasks.css';

// ZNotes.dc.html `isTasks`: list (search, filters, types, sort) · detail.

type Type = 'tech' | 'mgmt';
type Prio = 'low' | 'medium' | 'high';
type Repeat = 'none' | 'daily' | 'weekly' | 'monthly';
type TaskItem = {
  id: string;
  title: string;
  type: Type;
  priority: Prio;
  dueOn: string | null;
  repeat: Repeat;
  projectId: string | null;
  notes: string;
  pinned: boolean;
  doneAt: string | null;
  createdAt: string;
  /** the shared folder the task is in, if any */
  sharedFolderId: string | null;
  /** false for someone else's task seen through a shared folder */
  mine: boolean;
  subs: { done: number; total: number };
};
type Task = TaskItem & { subtasks: Array<{ id: string; title: string; done: boolean }> };
type Patch = Partial<
  Pick<
    Task,
    'title' | 'type' | 'priority' | 'dueOn' | 'repeat' | 'projectId' | 'notes' | 'pinned' | 'sharedFolderId'
  >
> & {
  done?: boolean;
};
type Cols = { side?: number; list?: number; insp?: number };

const TYPE_C: Record<Type, string> = { tech: 'oklch(0.78 0.13 245)', mgmt: 'oklch(0.76 0.14 305)' };
const PRI: Record<Prio, [string, string, string]> = {
  high: ['t_high', 'oklch(0.82 0.1 35)', '#3a1d12'],
  medium: ['t_med', 'oklch(0.88 0.09 85)', '#3a2a0e'],
  low: ['t_low', 'rgba(255,255,255,.16)', '#fbf8f5'],
};
const PR_ORDER: Record<Prio, number> = { high: 0, medium: 1, low: 2 };
const toItem = (t: Task): TaskItem => {
  const { subtasks, ...rest } = t;
  return { ...rest, subs: { done: subtasks.filter((s) => s.done).length, total: subtasks.length } };
};

const Check = ({ size = 13, sw = 3.2 }: { size?: number; sw?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const Pin = ({ size, fill, sw }: { size: number; fill: string; sw?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke={sw ? 'currentColor' : 'none'}
    strokeWidth={sw}
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z" />
  </svg>
);
const ShareIc = ({ size = 13 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ flex: 'none' }}
  >
    <circle cx="18" cy="5" r="2.5" />
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="19" r="2.5" />
    <path d="M8.2 10.8l7.6-4.4" />
    <path d="M8.2 13.2l7.6 4.4" />
  </svg>
);
const Plus = ({ size = 16, sw = 2.4 }: { size?: number; sw?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    aria-hidden="true"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

function SubRow({
  s,
  onPatch,
  onRemove,
}: {
  s: Task['subtasks'][number];
  onPatch: (p: { title?: string; done?: boolean }) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle, flush] = useDraft(s.title, (v) => v.trim() && onPatch({ title: v.trim() }));
  return (
    <div className="kh-tk-sub">
      <button
        type="button"
        className="kh-tk-ck kh-tk-ck--sm"
        data-on={s.done || undefined}
        aria-label={s.title}
        aria-pressed={s.done}
        onClick={() => onPatch({ done: !s.done })}
      >
        {s.done && <Check size={12} />}
      </button>
      <input
        value={title}
        aria-label={t('t_subtasks')}
        maxLength={300}
        data-done={s.done || undefined}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={flush}
      />
      <button
        type="button"
        className="kh-tk-sub__x"
        title={t('tk_removeSub')}
        aria-label={t('tk_removeSub')}
        onClick={onRemove}
      >
        <svg
          width="12"
          height="12"
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
  );
}

function Detail({
  task,
  onPatch,
  onSubs,
  onDelete,
  shared,
  onShare,
}: {
  task: Task;
  onPatch: (p: Patch) => void;
  onSubs: (t: Task) => void;
  onDelete: () => void;
  /** shared task folders (owned and incoming) */
  shared: SharedFolder[];
  /** moves the task in/out of a shared folder (asks first) */
  onShare: (folderId: string | null) => void;
}) {
  const { t } = useI18n();
  const { projects } = useMgOptions();
  const when = useWhen();
  const toast = useToast();
  const done = !!task.doneAt;
  const [title, setTitle, flushTitle] = useDraft(task.title, (v) => onPatch({ title: v }));
  const [notes, setNotes, flushNotes] = useDraft(task.notes, (v) => onPatch({ notes: v }), 700);
  const [newSub, setNewSub] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  // A brand-new task opens with its title selected, ready to type.
  useEffect(() => {
    if (Date.now() - new Date(task.createdAt).getTime() < 3000) titleRef.current?.select();
  }, [task.id, task.createdAt]);

  const subCall = async (path: string, body?: unknown, method?: string) => {
    try {
      onSubs((await api<{ task: Task }>(`/tasks/${task.id}/subtasks${path}`, body, method)).task);
    } catch {
      toast({ message: t('ne_saveFail'), tone: 'error' });
    }
  };
  const subPct = task.subs.total ? Math.round((task.subs.done / task.subs.total) * 100) : 0;
  const inShared = shared.find((f) => f.id === task.sharedFolderId);
  // someone else's task in a folder shared read-only with the caller
  const readOnly = !task.mine && inShared?.perm === 'read';
  const targets = shared.filter((f) => f.mine || f.perm === 'edit');

  return (
    <fieldset className="kh-tk-detail" disabled={readOnly}>
      <div className="kh-tk-detail__top">
        <div className="kh-tk-detail__head">
          <input
            ref={titleRef}
            className="kh-tk-title"
            value={title}
            maxLength={300}
            aria-label={t('t_new')}
            data-done={done || undefined}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={flushTitle}
          />
          <div className="kh-tk-seg" role="radiogroup" aria-label={t('tr_type')}>
            {(['tech', 'mgmt'] as Type[]).map((y) => {
              const on = task.type === y;
              return (
                <button
                  key={y}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  style={on ? { background: TYPE_C[y], color: '#16131f' } : undefined}
                  onClick={() => onPatch({ type: y })}
                >
                  <span className="kh-tk-dot" style={{ background: TYPE_C[y] }} />
                  {t(y === 'tech' ? 'tk_tech' : 'tk_mgmt')}
                </button>
              );
            })}
          </div>
          {task.mine && targets.length > 0 && (
            <select
              className="kh-tk-shsel"
              value={task.sharedFolderId ?? ''}
              aria-label={t('sh_inFolder')}
              onChange={(e) => onShare(e.target.value || null)}
            >
              <option value="">{t('sh_noSharedFolder')}</option>
              {targets.map((f) => (
                <option key={f.id} value={f.id}>
                  ⇄ {f.name}
                </option>
              ))}
            </select>
          )}
          <div className="kh-tk-chips">
            {!task.mine && (
              <span className="kh-tk-chip">
                <ShareIc />
                {t('sh_sharedBy').replace('{who}', inShared?.owner?.name ?? '')}
                {readOnly && ` · ${t('sh_readOnly')}`}
              </span>
            )}
            <span className="kh-tk-chip">
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
              {t('createdAt')} {when(task.createdAt, true)}
            </span>
            {done && (
              <span className="kh-tk-chip kh-tk-chip--done">
                {t('t_doneAt')} {when(task.doneAt!, true)}
              </span>
            )}
          </div>
        </div>
        {task.mine && (
          <button
            type="button"
            className="kh-tk-round"
            title={task.pinned ? t('v_unpin') : t('v_pin')}
            aria-label={task.pinned ? t('v_unpin') : t('v_pin')}
            aria-pressed={task.pinned}
            style={{ background: task.pinned ? 'rgba(255,255,255,.24)' : undefined }}
            onClick={() => onPatch({ pinned: !task.pinned })}
          >
            <Pin size={16} sw={1.8} fill={task.pinned ? 'currentColor' : 'none'} />
          </button>
        )}
        <button
          type="button"
          className="kh-tk-round"
          style={{ color: '#ffc9b8' }}
          title={t('del')}
          aria-label={t('del')}
          onClick={onDelete}
        >
          <svg
            width="16"
            height="16"
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
      </div>

      <div className="kh-tk-row">
        <button
          type="button"
          className="kh-tk-donebtn"
          data-done={done || undefined}
          onClick={() => onPatch({ done: !done })}
        >
          <Check size={15} sw={2.6} />
          {done ? t('t_reopen') : t('t_markDone')}
        </button>
        {task.subs.total > 0 && (
          <div className="kh-tk-progress">
            <div>
              <div style={{ width: `${subPct}%` }} />
            </div>
            <span>
              {task.subs.done}/{task.subs.total}
            </span>
          </div>
        )}
      </div>

      <div className="kh-tk-field">
        <div className="kh-tk-lbl">{t('t_priority')}</div>
        <div className="kh-tk-prios">
          {(['low', 'medium', 'high'] as Prio[]).map((p) => {
            const on = task.priority === p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                style={on ? { background: PRI[p][1], color: PRI[p][2], borderColor: PRI[p][1] } : undefined}
                onClick={() => onPatch({ priority: p })}
              >
                {t(PRI[p][0])}
              </button>
            );
          })}
        </div>
      </div>

      <div className="kh-tk-grid">
        <label>
          <span className="kh-tk-lbl">{t('t_due')}</span>
          <input
            type="date"
            value={task.dueOn ?? ''}
            onChange={(e) => onPatch({ dueOn: e.target.value || null })}
          />
        </label>
        {task.mine && (
          <label>
            <span className="kh-tk-lbl">{t('t_project')}</span>
            {/* Management projects (shared by the tenant) */}
            <select
              value={task.projectId ?? ''}
              onChange={(e) => onPatch({ projectId: e.target.value || null })}
            >
              <option value="">{t('t_noProject')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {projectLabel(p)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className="kh-tk-lbl">{t('t_repeat')}</span>
          <select value={task.repeat} onChange={(e) => onPatch({ repeat: e.target.value as Repeat })}>
            {(
              [
                ['none', 't_rNone'],
                ['daily', 't_rDaily'],
                ['weekly', 't_rWeekly'],
                ['monthly', 't_rMonthly'],
              ] as const
            ).map(([id, k]) => (
              <option key={id} value={id}>
                {t(k)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="kh-tk-field">
        <div className="kh-tk-lbl">{t('t_subtasks')}</div>
        <div className="kh-tk-subs">
          {task.subtasks.map((s) => (
            <SubRow
              key={s.id}
              s={s}
              onPatch={(p) => void subCall(`/${s.id}`, p, 'PATCH')}
              onRemove={() => void subCall(`/${s.id}`, undefined, 'DELETE')}
            />
          ))}
          <div className="kh-tk-addsub">
            <Plus size={15} sw={2.2} />
            <input
              value={newSub}
              placeholder={t('t_addSub')}
              aria-label={t('t_addSub')}
              maxLength={300}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const v = newSub.trim();
                if (!v) return;
                setNewSub('');
                void subCall('', { title: v });
              }}
            />
          </div>
        </div>
      </div>

      <div className="kh-tk-field">
        <div className="kh-tk-lbl">{t('v_notes')}</div>
        <textarea
          className="kh-tk-notes"
          value={notes}
          placeholder={t('t_notesPh')}
          aria-label={t('v_notes')}
          maxLength={20000}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={flushNotes}
        />
      </div>

      {task.mine && (
        <Connections type="task" id={task.id} variant="section" placeholder={t('t_linkPh')} transports />
      )}
    </fieldset>
  );
}

export function TasksView() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const { focus } = useShell();
  const [filter, setFilter] = usePersistentState<'active' | 'done' | 'all'>('tasks.filter', 'active');
  const [typeF, setTypeF] = usePersistentState<'all' | Type>('tasks.type', 'all');
  const [sort, setSort] = usePersistentState<'recent' | 'due' | 'prio'>('tasks.sort', 'recent');
  const [cols, setCols] = usePref<Cols>('cols', {});
  const [liveList, setLiveList] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<TaskItem[] | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const activeId = sp.get('t');
  // prototype tShF: the tasks of one shared folder (every member's)
  const sh = useSharedFolders('tasks');
  const [shF0, setShF] = usePersistentState<string>('tasks.shf', '');
  const shF = shF0 && (!sh.loaded || sh.folders.some((f) => f.id === shF0)) ? shF0 : '';
  const curShared = sh.folders.find((f) => f.id === shF);

  const open = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (id) next.set('t', id);
      else next.delete('t');
      router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [path, router, sp],
  );

  useEffect(() => {
    let live = true;
    api<{ tasks: TaskItem[] }>(shF ? `/tasks?shared=${shF}` : '/tasks')
      .then((r) => live && setItems(r.tasks))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, [shF]);

  useEffect(() => {
    if (!activeId) {
      setTask(null);
      return;
    }
    if (task?.id === activeId) return;
    let live = true;
    api<{ task: Task }>(`/tasks/${activeId}`)
      .then((r) => live && setTask(r.task))
      .catch(() => {
        if (!live) return;
        setTask(null);
        open(null);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the id changes
  }, [activeId]);

  const all = useMemo(() => items ?? [], [items]);
  const today = localDay(new Date());
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const cmp =
      sort === 'due'
        ? (a: TaskItem, b: TaskItem) => ((a.dueOn ?? '9999') < (b.dueOn ?? '9999') ? -1 : 1)
        : sort === 'prio'
          ? (a: TaskItem, b: TaskItem) => PR_ORDER[a.priority] - PR_ORDER[b.priority]
          : (a: TaskItem, b: TaskItem) => b.createdAt.localeCompare(a.createdAt);
    return all
      .filter(
        (x) =>
          (typeF === 'all' || x.type === typeF) &&
          (filter === 'all' || (filter === 'done' ? !!x.doneAt : !x.doneAt)) &&
          (!s || x.title.toLowerCase().includes(s) || x.notes.toLowerCase().includes(s)),
      )
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || cmp(a, b));
  }, [all, filter, typeF, sort, q]);

  // Open the first task when none is selected (prototype tActive).
  useEffect(() => {
    if (!activeId && items && list[0]) open(list[0].id);
  }, [activeId, items, list, open]);

  const upsert = (x: TaskItem) =>
    setItems((cur) =>
      cur ? (cur.some((y) => y.id === x.id) ? cur.map((y) => (y.id === x.id ? x : y)) : [x, ...cur]) : cur,
    );

  const patch = async (id: string, p: Patch) => {
    // optimistic for the detail
    if (task?.id === id)
      setTask(
        (cur) =>
          cur && {
            ...cur,
            ...p,
            ...('done' in p ? { doneAt: p.done ? new Date().toISOString() : null } : {}),
          },
      );
    try {
      const r = await api<{ task: Task; next: Task | null }>(`/tasks/${id}`, p, 'PATCH');
      upsert(toItem(r.task));
      if (task?.id === id) setTask(r.task);
      if (r.next) {
        upsert(toItem(r.next));
        toast({ message: t('tk_nextCreated').replace('{d}', fmtDue(r.next.dueOn)), tone: 'info' });
      }
      if ('done' in p) refreshCounts();
    } catch {
      toast({ message: t('ne_saveFail'), tone: 'error' });
    }
  };

  const create = async () => {
    if (curShared && !(await confirm(sharedConfirm(t, curShared, false)))) return;
    try {
      const { task: n } = await api<{ task: Task }>('/tasks', {
        title: t('t_newTitle'),
        type: typeF === 'all' ? undefined : typeF,
        sharedFolderId: curShared?.id,
      });
      upsert(toItem(n));
      setTask(n);
      if (filter === 'done') setFilter('active');
      setSort('recent');
      open(n.id);
      refreshCounts();
    } catch (e) {
      toast({
        message: t(isApiFailure(e) && e.code === 'limit_reached' ? 'tk_limit' : 'ne_saveFail'),
        tone: 'error',
      });
    }
  };

  const moveShared = async (folderId: string | null) => {
    if (!task) return;
    const f = sh.folders.find((x) => x.id === folderId);
    if (f && !(await confirm(sharedConfirm(t, f, true)))) return;
    await patch(task.id, { sharedFolderId: folderId });
    if (shF && folderId !== shF) setItems((cur) => cur && cur.filter((x) => x.id !== task.id));
  };

  const remove = async () => {
    if (!task) return;
    const ok = await confirm({
      title: t('tr_askTitle'),
      body: t('tr_askBody').replace('{x}', task.title || t('t_newTitle')),
      confirmLabel: t('tr_move'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/tasks/${task.id}`, undefined, 'DELETE');
    } catch {
      toast({ message: t('ui_delFail'), tone: 'error' });
      return;
    }
    const idx = list.findIndex((x) => x.id === task.id);
    const rest = list.filter((x) => x.id !== task.id);
    setItems((cur) => cur && cur.filter((x) => x.id !== task.id));
    setTask(null);
    open(rest[Math.min(idx, rest.length - 1)]?.id ?? null);
    refreshCounts();
  };

  const counts = {
    active: all.filter((x) => !x.doneAt).length,
    done: all.filter((x) => x.doneAt).length,
    all: all.length,
  };
  const listW = liveList ?? cols.list ?? COL_DEFAULTS.list;

  return (
    <div
      className="kh-tk"
      style={{ gridTemplateColumns: focus ? 'minmax(0,1fr)' : `${listW}px minmax(0,1fr)` }}
    >
      {!focus && (
        <ColHandle
          style={{ left: listW }}
          value={listW}
          limits={COL_LIMITS.list}
          dir={1}
          onLive={setLiveList}
          onDone={(w) => setCols({ ...cols, list: w })}
          onReset={() => setCols({ ...cols, list: COL_DEFAULTS.list })}
        />
      )}
      {!focus && (
        <section className="kh-tk-list">
          <div className="kh-tk-list__top">
            <label className="kh-tk-search">
              <svg
                width="16"
                height="16"
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
                placeholder={t('t_search')}
                aria-label={t('t_search')}
              />
            </label>
            <button
              type="button"
              className="kh-tk-new"
              title={t('t_new')}
              aria-label={t('t_new')}
              onClick={() => void create()}
            >
              <Plus />
            </button>
          </div>
          <div className="kh-tk-filters">
            <div className="kh-tk-show" role="group" aria-label={t('t_show')}>
              {(
                [
                  ['active', 't_active'],
                  ['done', 't_done'],
                  ['all', 't_all'],
                ] as const
              ).map(([id, k]) => (
                <button
                  key={id}
                  type="button"
                  className="kh-tk-fchip"
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                >
                  {t(k)}
                  <span>{counts[id]}</span>
                </button>
              ))}
            </div>
            <div className="kh-tk-frow">
              <label className="kh-tk-fsel">
                <span
                  className="kh-tk-dot kh-tk-dot--ring"
                  aria-hidden="true"
                  style={{ background: typeF === 'all' ? 'rgba(255,255,255,.35)' : TYPE_C[typeF] }}
                />
                <select
                  className="kh-tk-sort"
                  value={typeF}
                  aria-label={t('tk_allTypes')}
                  onChange={(e) => setTypeF(e.target.value as typeof typeF)}
                >
                  {(['all', 'tech', 'mgmt'] as const).map((id) => (
                    <option key={id} value={id}>
                      {id === 'all'
                        ? t('tk_allTypes')
                        : `${t(id === 'tech' ? 'tk_tech' : 'tk_mgmt')} (${all.filter((x) => !x.doneAt && x.type === id).length})`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="kh-tk-fsel">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
                </svg>
                <select
                  className="kh-tk-sort"
                  value={sort}
                  aria-label={t('t_sortBy')}
                  onChange={(e) => setSort(e.target.value as typeof sort)}
                >
                  <option value="recent">{t('t_sortRecent')}</option>
                  <option value="due">{t('t_sortDue')}</option>
                  <option value="prio">{t('t_sortPrio')}</option>
                </select>
              </label>
              {sh.folders.length > 0 && (
                <label className="kh-tk-fsel kh-tk-fsel--wide">
                  <ShareIc />
                  <select
                    className="kh-tk-sort"
                    value={shF}
                    aria-label={t('sh_shared')}
                    onChange={(e) => setShF(e.target.value)}
                  >
                    <option value="">{t('t_allFolders')}</option>
                    {sh.folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.mine ? f.name : `${f.name} · ${f.owner?.name ?? ''}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
          <div className="kh-tk-items">
            {list.map((x) => {
              const on = x.id === activeId;
              const done = !!x.doneAt;
              const over = !done && !!x.dueOn && x.dueOn < today;
              const tod = x.dueOn === today;
              return (
                <div
                  key={x.id}
                  className="kh-tk-item"
                  data-on={on || undefined}
                  role="button"
                  tabIndex={0}
                  onClick={() => open(x.id)}
                  onKeyDown={onActivateKey(() => open(x.id))}
                >
                  <span
                    className="kh-tk-item__bar"
                    aria-hidden="true"
                    style={{ background: TYPE_C[x.type] }}
                    title={t(x.type === 'tech' ? 'tk_tech' : 'tk_mgmt')}
                  />
                  <button
                    type="button"
                    disabled={!x.mine && sh.folders.find((f) => f.id === x.sharedFolderId)?.perm === 'read'}
                    className="kh-tk-ck"
                    data-on={done || undefined}
                    aria-label={x.title}
                    aria-pressed={done}
                    onClick={(e) => {
                      e.stopPropagation();
                      void patch(x.id, { done: !done });
                    }}
                  >
                    {done && <Check />}
                  </button>
                  <div className="kh-tk-item__body">
                    <div className="kh-tk-item__title" data-done={done || undefined}>
                      {x.pinned && <Pin size={12} fill="#fbf8f5" />}
                      {x.sharedFolderId && (
                        <span
                          className="kh-tk-shmark"
                          title={t('sh_sharedItem').replace(
                            '{name}',
                            sh.folders.find((f) => f.id === x.sharedFolderId)?.name ?? '',
                          )}
                        >
                          <ShareIc size={12} />
                        </span>
                      )}
                      <button
                        type="button"
                        className="kh-rowbtn"
                        aria-current={on || undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          open(x.id);
                        }}
                      >
                        {x.title || t('t_newTitle')}
                      </button>
                    </div>
                    <div className="kh-tk-item__meta">
                      <span className="kh-tk-type" style={{ ['--c' as string]: TYPE_C[x.type] }}>
                        {t(x.type === 'tech' ? 'tk_tech' : 'tk_mgmt')}
                      </span>
                      {x.dueOn && (
                        <span
                          style={{
                            color: over ? 'oklch(0.8 0.13 30)' : tod ? '#fbf8f5' : 'rgba(255,248,240,.62)',
                            fontWeight: over || tod ? 600 : 400,
                          }}
                        >
                          ·{' '}
                          {over
                            ? `${t('t_overdue')} · ${fmtDue(x.dueOn)}`
                            : tod
                              ? t('t_today')
                              : `${t('t_until')} ${fmtDue(x.dueOn)}`}
                        </span>
                      )}
                      {x.subs.total > 0 && (
                        <span className="kh-tk-item__subs">
                          · {x.subs.done}/{x.subs.total}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className="kh-tk-prio"
                    style={{ background: PRI[x.priority][1], color: PRI[x.priority][2] }}
                  >
                    {t(PRI[x.priority][0])}
                  </span>
                </div>
              );
            })}
            {items && list.length === 0 && <div className="kh-tk-empty">{t('t_empty')}</div>}
          </div>
        </section>
      )}
      <section className="kh-tk-pane">
        {task ? (
          <Detail
            key={task.id}
            task={task}
            onPatch={(p) => void patch(task.id, p)}
            onSubs={(n) => {
              setTask(n);
              upsert(toItem(n));
            }}
            onDelete={() => void remove()}
            shared={sh.folders}
            onShare={(f) => void moveShared(f)}
          />
        ) : (
          <div className="kh-tk-none">{items ? t('t_noActive') : ''}</div>
        )}
      </section>
    </div>
  );
}
