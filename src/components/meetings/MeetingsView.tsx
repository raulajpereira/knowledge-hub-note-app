'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { useConfirm, usePersistentState, useToast } from '@/components/ui';
import { useShell } from '@/components/shell/ShellContext';
import { refreshCounts } from '@/components/shell/counts';
import { Connections } from '@/components/content/Connections';
import { AiButton } from '@/components/ai/AiButton';
import { AiText } from '@/components/ai/AiText';
import { aiError, useAi } from '@/components/ai/useAi';
import { SaveTemplateButton, TemplateButton } from '@/components/templates/Templates';
import type { MeetingTpl } from '@/lib/templates';
import type { JSONContent } from '@tiptap/react';
import { MeetingTopics, textToDoc, type TopicsHandle } from './MeetingTopics';
import { TodoTasksDialog, type TaskType, type TodoAsk } from './TodoTasksDialog';
import '../emails/emails.css';
import '../artifacts/artifacts.css';
import './meetings.css';

// Registos Reuniões: a meeting record kept as minutes — when, the subject, who
// was there (any names, people may be outside the app), the topics discussed,
// points to review and things to do. In folders (as Artefactos); shown on the
// Calendar by its date; linkable to notes, tasks, project issues and other
// meeting records. The topics are a document like a note's (images included).

type Item = { t: string; done: boolean };
type Meeting = {
  id: string;
  folderId: string | null;
  title: string;
  heldOn: string;
  startTime: string;
  endTime: string;
  participants: string[];
  topics: string;
  review: Item[];
  todos: Item[];
  createdAt: string;
  updatedAt: string;
};
type Patch = Partial<Omit<Meeting, 'id' | 'createdAt' | 'updatedAt'>> & { topicsDoc?: JSONContent };
type Folder = { id: string; name: string; color: string };
const COL = { def: 340, min: 260, gap: 0, read: 420 };
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** "Coisas a fazer" already offered as tasks this session (created or declined), per record. */
const ASKED = 'kh.mt.askedTodos';
const norm = (s: string) => s.trim().toLowerCase();
function askedOf(id: string): Set<string> {
  try {
    const all = JSON.parse(sessionStorage.getItem(ASKED) ?? '{}') as Record<string, string[]>;
    return new Set(all[id] ?? []);
  } catch {
    return new Set();
  }
}
function markAsked(id: string, texts: string[]) {
  try {
    const all = JSON.parse(sessionStorage.getItem(ASKED) ?? '{}') as Record<string, string[]>;
    all[id] = [...new Set([...(all[id] ?? []), ...texts.map(norm)])];
    sessionStorage.setItem(ASKED, JSON.stringify(all));
  } catch {
    /* storage unavailable: the question may come back */
  }
}

const Svg = ({ d, s = 15 }: { d: string; s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: d }}
  />
);
const I = {
  search: '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
  x: '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
  trash: '<path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"></path>',
  task: '<rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="M8.5 12l2.5 2.5 4.5-5"></path>',
  clock: '<circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l3 2"></path>',
  people:
    '<circle cx="9" cy="8" r="3.2"></circle><path d="M3.5 19a5.5 5.5 0 0 1 11 0"></path><path d="M16 5.2a3 3 0 0 1 0 5.6M18 19a5 5 0 0 0-2.5-4.3"></path>',
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Checklist rows: Enter adds the next one, Backspace on an empty row removes it. */
function Checklist({
  items,
  onChange,
  placeholder,
  addLabel,
  label,
  extra,
}: {
  items: Item[];
  onChange: (next: Item[]) => void;
  placeholder: string;
  addLabel: string;
  label: string;
  extra?: (it: Item, i: number) => React.ReactNode;
}) {
  const { t } = useI18n();
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [focusAt, setFocusAt] = useState<number | null>(null);
  useEffect(() => {
    if (focusAt == null) return;
    refs.current[focusAt]?.focus();
    setFocusAt(null);
  }, [focusAt, items.length]);
  const set = (i: number, p: Partial<Item>) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <div className="kh-mt-list" role="list" aria-label={label}>
      {items.map((it, i) => (
        <div key={i} className="kh-mt-row" role="listitem" data-done={it.done || undefined}>
          <button
            type="button"
            className="kh-mt-ck"
            aria-pressed={it.done}
            aria-label={`${t('mt_done')}: ${it.t || placeholder}`}
            onClick={() => set(i, { done: !it.done })}
          >
            {it.done && <Svg d={I.ok} s={12} />}
          </button>
          <input
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={it.t}
            maxLength={2000}
            placeholder={placeholder}
            aria-label={`${label} ${i + 1}`}
            onChange={(e) => set(i, { t: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const next = [...items];
                next.splice(i + 1, 0, { t: '', done: false });
                onChange(next);
                setFocusAt(i + 1);
              } else if (e.key === 'Backspace' && !it.t && items.length > 0) {
                e.preventDefault();
                onChange(items.filter((_, j) => j !== i));
                setFocusAt(Math.max(0, i - 1));
              }
            }}
          />
          {extra?.(it, i)}
          <button
            type="button"
            className="kh-mt-rm"
            aria-label={`${t('del')} ${it.t || placeholder}`}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <Svg d={I.x} s={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="kh-mt-add"
        onClick={() => {
          onChange([...items, { t: '', done: false }]);
          setFocusAt(items.length);
        }}
      >
        + {addLabel}
      </button>
    </div>
  );
}

export function MeetingsView() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const { modules } = useShell();
  const [items, setItems] = useState<Meeting[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folder0, setFolder] = usePersistentState<string>('meetings.folder', 'all');
  // the folders/list column is resizable (drag the handle, ←/→, double-click resets)
  const [colW, setColW] = usePersistentState<number>('meetings.colW', COL.def);
  const [liveCol, setLiveCol] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [newFolder, setNewFolder] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const { ready: aiReady } = useAi();
  const [aiBusy, setAiBusy] = useState(false);
  const [sug, setSug] = useState<{ id: string; summary: string; review: string[]; todos: string[] } | null>(
    null,
  );
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const [taskOf, setTaskOf] = useState<Record<string, true>>({});
  const timers = useRef(new Map<string, { patch: Patch; tm: ReturnType<typeof setTimeout> }>());
  /** the open record, for the questions asked when leaving it */
  const actRef = useRef<Meeting | null>(null);
  // the open record switches at once; the URL (?m=) follows
  const urlId = sp.get('m');
  const [activeId, setActiveId] = useState<string | null>(urlId);
  useEffect(() => setActiveId(urlId), [urlId]);
  const loc = t('locale');

  const open = useCallback(
    (id: string | null) => {
      setActiveId(id);
      const next = new URLSearchParams(sp.toString());
      if (id) next.set('m', id);
      else next.delete('m');
      router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [path, router, sp],
  );

  useEffect(() => {
    api<{ meetings: Meeting[]; folders: Folder[] }>('/meetings')
      .then((r) => {
        setItems(r.meetings);
        setFolders(r.folders);
      })
      .catch(() => setItems([]));
  }, []);

  const fail = useCallback(() => toast({ message: t('ne_saveFail'), tone: 'error' }), [toast, t]);
  const flush = useCallback(
    (id: string) => {
      const p = timers.current.get(id);
      if (!p) return;
      clearTimeout(p.tm);
      timers.current.delete(id);
      void api(`/meetings/${id}`, p.patch, 'PATCH').catch(fail);
    },
    [fail],
  );
  useEffect(() => {
    const map = timers.current;
    // leaving or reloading the page sends what is still waiting for the debounce
    const hide = () => {
      for (const id of [...map.keys()]) flush(id);
    };
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('pagehide', hide);
      hide();
    };
  }, [flush]);
  const upd = (id: string, p: Patch, delay = 500) => {
    // the document is kept by the editor (and in `docs`), not in the list
    const vis = { ...p };
    delete vis.topicsDoc;
    setItems((cur) => cur && cur.map((x) => (x.id === id ? { ...x, ...vis } : x)));
    const prev = timers.current.get(id);
    if (prev) clearTimeout(prev.tm);
    timers.current.set(id, {
      patch: { ...(prev?.patch ?? {}), ...p },
      tm: setTimeout(() => flush(id), delay),
    });
  };

  const all = useMemo(() => items ?? [], [items]);
  // a folder that is gone falls back to "Todas"
  const folder = folder0 === 'all' || folders.some((f) => f.id === folder0) ? folder0 : 'all';
  const query = q.trim().toLowerCase();
  const list = all
    .filter(
      (m) =>
        (folder === 'all' || m.folderId === folder) &&
        (!query ||
          [m.title, m.topics, ...m.participants, ...m.review.map((x) => x.t), ...m.todos.map((x) => x.t)]
            .join(' ')
            .toLowerCase()
            .includes(query)),
    )
    .sort((a, b) => (b.heldOn + b.startTime).localeCompare(a.heldOn + a.startTime));
  const act = all.find((m) => m.id === activeId) ?? null;
  actRef.current = act;
  // topics documents, loaded when a record is opened (records with only text are converted)
  const docs = useRef(new Map<string, JSONContent>());
  const [, setDocsLoaded] = useState(0);
  const topicsRef = useRef<TopicsHandle>(null);
  const actId = act?.id;
  useEffect(() => {
    if (!actId || docs.current.has(actId)) return;
    let live = true;
    api<{ meeting: Meeting & { topicsDoc: JSONContent | null } }>(`/meetings/${actId}`)
      .then(({ meeting: m }) => {
        if (!live || docs.current.has(actId)) return;
        docs.current.set(actId, m.topicsDoc ?? textToDoc(m.topics));
        setDocsLoaded((n) => n + 1);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [actId]);
  // grouped by month (newest first)
  const groups = useMemo(() => {
    const out: Array<{ key: string; label: string; items: Meeting[] }> = [];
    for (const m of list) {
      const key = m.heldOn.slice(0, 7);
      let g = out.at(-1);
      if (!g || g.key !== key) {
        const d = new Date(`${key}-01T12:00:00`);
        const label = d.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
        g = { key, label: label.charAt(0).toUpperCase() + label.slice(1), items: [] };
        out.push(g);
      }
      g.items.push(m);
    }
    return out;
  }, [list, loc]);

  const create = async (tpl?: MeetingTpl) => {
    try {
      const { meeting } = await api<{ meeting: Meeting }>('/meetings', {
        title: tpl?.title.trim() || t('mt_newTitle'),
        heldOn: today(),
        folderId: folder === 'all' ? null : folder,
        ...(tpl && {
          participants: tpl.participants,
          topics: tpl.topics,
          review: tpl.review.map((x) => ({ t: x, done: false })),
          todos: tpl.todos.map((x) => ({ t: x, done: false })),
        }),
      });
      docs.current.set(meeting.id, textToDoc(meeting.topics));
      setItems((cur) => [meeting, ...(cur ?? [])]);
      setQ('');
      open(meeting.id);
      refreshCounts();
    } catch {
      fail();
    }
  };
  const remove = async () => {
    if (!act) return;
    const ok = await confirm({
      title: t('tr_askTitle'),
      body: t('tr_askBody').replace('{x}', act.title),
      confirmLabel: t('tr_move'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    const tm = timers.current.get(act.id);
    if (tm) clearTimeout(tm.tm);
    timers.current.delete(act.id);
    try {
      await api(`/meetings/${act.id}`, undefined, 'DELETE');
    } catch {
      toast({ message: t('ui_delFail'), tone: 'error' });
      return;
    }
    const idx = list.findIndex((x) => x.id === act.id);
    const rest = list.filter((x) => x.id !== act.id);
    setItems((cur) => cur && cur.filter((x) => x.id !== act.id));
    open(rest[Math.min(idx, rest.length - 1)]?.id ?? null);
    refreshCounts();
  };
  const addFolder = async () => {
    const n = newFolder.trim();
    if (!n) return;
    try {
      const { folder: f } = await api<{ folder: Folder }>('/meetings/folders', { name: n.slice(0, 80) });
      setFolders((cur) => [...cur, f]);
      setNewFolder('');
      setFolder(f.id);
    } catch {
      fail();
    }
  };
  const removeFolder = async (f: Folder) => {
    const n = all.filter((m) => m.folderId === f.id).length;
    if (
      n &&
      !(await confirm({
        title: t('mt_folderDelT').replace('{name}', f.name),
        body: t('mt_folderDel'),
        confirmLabel: t('del'),
        cancelLabel: t('tr_cancel'),
      }))
    )
      return;
    try {
      await api(`/meetings/folders/${f.id}`, undefined, 'DELETE');
      setFolders((cur) => cur.filter((x) => x.id !== f.id));
      setItems((cur) => cur && cur.map((x) => (x.folderId === f.id ? { ...x, folderId: null } : x)));
      if (folder === f.id) setFolder('all');
    } catch {
      fail();
    }
  };
  /** drag a meeting onto a folder ("Todas" takes it out of its folder) */
  const dropOn = (id: string, target: string) => {
    const folderId = target === 'all' ? null : target;
    const m = all.find((x) => x.id === id);
    if (!m || m.folderId === folderId) return;
    upd(id, { folderId }, 0);
  };
  const addWho = () => {
    if (!act) return;
    const names = who
      .split(/[;,\n]/)
      .map((s) => s.trim().slice(0, 120))
      .filter((s) => s && !act.participants.some((p) => p.toLowerCase() === s.toLowerCase()));
    setWho('');
    if (names.length) upd(act.id, { participants: [...act.participants, ...names].slice(0, 100) }, 0);
  };
  /** "Coisas a fazer" → a task linked to this meeting (of the given type; the default otherwise) */
  const makeTask = async (m: Meeting, text: string, i: number, type?: TaskType) => {
    const { task } = await api<{ task: { id: string } }>('/tasks', {
      title: text.trim().slice(0, 300),
      ...(type && { type }),
    });
    await api('/links', { a: { type: 'meeting', id: m.id }, b: { type: 'task', id: task.id } });
    setTaskOf((x) => ({ ...x, [`${m.id}:${i}`]: true }));
  };
  const toTask = async (m: Meeting, it: Item, i: number) => {
    if (!it.t.trim() || taskOf[`${m.id}:${i}`]) return;
    try {
      await makeTask(m, it.t, i);
      toast({ message: t('mt_taskMade') });
      refreshCounts();
      // reload the links section
      setLinksKey((k) => k + 1);
    } catch {
      fail();
    }
  };
  const [linksKey, setLinksKey] = useState(0);

  // Leaving a record (another record, a new one, another page of the app) whose
  // "Coisas a fazer" are not done and have no task yet: ask whether to create
  // them as tasks first. Each item is offered once per session.
  const [leave, setLeave] = useState<{ m: Meeting; items: TodoAsk[]; go: () => void } | null>(null);
  const pendingTodos = useCallback(
    (m: Meeting) => {
      const asked = askedOf(m.id);
      return m.todos
        .map((it, i) => ({ i, t: it.t.trim(), done: it.done }))
        .filter((x) => x.t && !x.done && !taskOf[`${m.id}:${x.i}`] && !asked.has(norm(x.t)));
    },
    [taskOf],
  );
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  const guard = useCallback(
    async (go: () => void) => {
      const m = actRef.current;
      let items = m && modules.has('tasks') && !leaveRef.current ? pendingTodos(m) : [];
      if (m && items.length) {
        // to-dos made into tasks earlier (before a reload) are linked to the record by their title
        try {
          const { links } = await api<{ links: Array<{ type: string; title: string }> }>(
            `/links?type=meeting&id=${m.id}`,
          );
          const made = new Set(links.filter((l) => l.type === 'task').map((l) => norm(l.title)));
          items = items.filter((x) => !made.has(norm(x.t.slice(0, 300))));
        } catch {
          /* ask anyway */
        }
      }
      if (!m || !items.length) return go();
      setLeave({ m, items: items.map(({ i, t: text }) => ({ i, t: text })), go });
    },
    [modules, pendingTodos],
  );
  const guardRef = useRef(guard);
  guardRef.current = guard;
  const pendingRef = useRef(pendingTodos);
  pendingRef.current = pendingTodos;
  // links to other pages of the app (sidebar, Connections, links in the topics…) wait for the answer
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const m = actRef.current;
      const same = url.pathname === window.location.pathname;
      // the same page: only another record (?m=) leaves this one
      if (!m || (same && (url.searchParams.get('m') ?? m.id) === m.id)) return;
      if (!modules.has('tasks') || !pendingRef.current(m).length) return;
      e.preventDefault();
      e.stopPropagation();
      const to = url.pathname.startsWith(`${BASE}/`) ? url.pathname.slice(BASE.length) : url.pathname;
      void guardRef.current(() => router.push(`${to}${url.search}${url.hash}`));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [modules, router]);

  /** another record: after the question about this one's to-dos */
  const openRec = (id: string) => (id === activeId ? open(id) : void guard(() => open(id)));
  const answer = (created: boolean) => async (chosen: TodoAsk[], type: TaskType) => {
    if (!leave) return [];
    const { m, items, go } = leave;
    const failed: TodoAsk[] = [];
    let n = 0;
    if (created)
      for (const x of chosen) {
        try {
          await makeTask(m, x.t, x.i, type);
          n++;
        } catch {
          failed.push(x);
        }
      }
    if (n) {
      toast({ message: n === 1 ? t('mt_taskMade') : t('mt_tasksMade').replace('{n}', String(n)) });
      refreshCounts();
      setLinksKey((k) => k + 1);
    }
    // the ones not chosen count as declined; the ones that failed are asked again
    markAsked(
      m.id,
      items.filter((x) => !failed.includes(x)).map((x) => x.t),
    );
    if (failed.length) {
      fail();
      return failed;
    }
    setLeave(null);
    go();
    return [];
  };

  const fmtDay = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });
  const time = (m: Meeting) => (m.startTime ? `${m.startTime}${m.endTime ? `–${m.endTime}` : ''}` : '');
  const now = today();

  const cw = liveCol ?? colW;
  const maxCol = () => Math.max(COL.min, (rootRef.current?.offsetWidth ?? 1200) - COL.read - COL.gap);
  const onColDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = Math.min(cw, maxCol());
    const max = maxCol();
    let w = w0;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const mv = (ev: PointerEvent) => {
      w = Math.round(Math.max(COL.min, Math.min(max, w0 + ev.clientX - x0)));
      setLiveCol(w);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setLiveCol(null);
      setColW(w);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  const colCss = `min(${cw}px, calc(100% - ${COL.read + COL.gap}px))`;

  return (
    <div
      ref={rootRef}
      className="kh-em kh-mt kh-page-card"
      style={{ gridTemplateColumns: `${colCss} minmax(0, 1fr)` }}
    >
      <div
        className="kh-mt-handle"
        style={{ left: `calc(${colCss} + ${COL.gap / 2 - 7}px)` }}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('cl_resize')}
        aria-valuenow={Math.round(cw)}
        aria-valuemin={COL.min}
        tabIndex={0}
        title={t('cl_resize')}
        data-drag={liveCol !== null || undefined}
        onPointerDown={onColDown}
        onDoubleClick={() => setColW(COL.def)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          const d = e.key === 'ArrowLeft' ? -20 : 20;
          setColW(Math.max(COL.min, Math.min(maxCol(), Math.min(cw, maxCol()) + d)));
        }}
      >
        <div />
      </div>
      <div className="kh-em-side">
        <div className="kh-em-top">
          <label className="kh-em-search">
            <Svg d={I.search} s={16} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('mt_search')}
              aria-label={t('mt_search')}
            />
          </label>
          <TemplateButton
            kind="meeting"
            compact
            onPick={(tpl) => void guard(() => void create(tpl.body as MeetingTpl))}
          />
          <button
            type="button"
            className="kh-mt-new"
            title={t('mt_new')}
            aria-label={t('mt_new')}
            onClick={() => void guard(() => void create())}
          >
            <Svg d={I.plus} s={16} />
          </button>
        </div>
        <div className="kh-em-folders kh-ar-folders">
          {[{ id: 'all', name: t('mt_all'), top: true }, ...folders].map((f) => {
            const top = 'top' in f;
            const n = top ? all.length : all.filter((m) => m.folderId === f.id).length;
            return (
              <div
                key={f.id}
                className="kh-em-folder"
                data-on={folder === f.id || undefined}
                data-top={top || undefined}
                onClick={() => setFolder(f.id)}
                onDragOver={(e) => dragId && e.preventDefault()}
                onDrop={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  dropOn(dragId, f.id);
                  setDragId(null);
                }}
              >
                <Svg d={I.folder} s={17} />
                <button
                  type="button"
                  className="kh-rowbtn kh-em-folder__name"
                  aria-current={folder === f.id || undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFolder(f.id);
                  }}
                >
                  {f.name}
                </button>
                {!top && (
                  <button
                    type="button"
                    title={t('del')}
                    aria-label={`${t('del')} ${f.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeFolder(f as Folder);
                    }}
                  >
                    <Svg d={I.x} s={14} />
                  </button>
                )}
                <span className="kh-em-count">{n}</span>
              </div>
            );
          })}
          <div className="kh-em-newfolder">
            <input
              value={newFolder}
              maxLength={80}
              placeholder={t('a_folderPh')}
              aria-label={t('a_folderPh')}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addFolder()}
            />
            <button type="button" onClick={() => void addFolder()}>
              + {t('newFolder')}
            </button>
          </div>
        </div>
        <section className="kh-em-list kh-mt-items" aria-label={t('nav_meetings')}>
          {groups.map((g) => (
            <div key={g.key} className="kh-mt-group">
              <div className="kh-mt-month">{g.label}</div>
              {g.items.map((m) => {
                const d = new Date(`${m.heldOn}T12:00:00`);
                return (
                  <div
                    key={m.id}
                    className="kh-mt-item"
                    data-on={m.id === activeId || undefined}
                    data-next={m.heldOn >= now || undefined}
                    data-drag={dragId === m.id || undefined}
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', m.id);
                      setDragId(m.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => openRec(m.id)}
                    onKeyDown={(e) => e.key === 'Enter' && openRec(m.id)}
                  >
                    <span className="kh-mt-day" aria-hidden="true">
                      <b>{d.getDate()}</b>
                      <span>{d.toLocaleDateString(loc, { month: 'short' }).replace('.', '')}</span>
                    </span>
                    <div>
                      <span>{m.title}</span>
                      <span>
                        {[
                          time(m),
                          m.participants.length
                            ? `${m.participants.length} ${t(m.participants.length === 1 ? 'mt_person' : 'mt_people')}`
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · ') || fmtDay(m.heldOn)}
                      </span>
                    </div>
                    {m.heldOn === now && <span className="kh-mt-today">{t('mt_today')}</span>}
                  </div>
                );
              })}
            </div>
          ))}
          {items && !list.length && <div className="kh-em-empty">{query ? t('mt_none') : t('mt_empty')}</div>}
        </section>
      </div>

      <section className="kh-em-read kh-mt-read">
        {act ? (
          <div className="kh-mt-main">
            <div className="kh-mt-head">
              <input
                className="kh-mt-title"
                value={act.title}
                maxLength={300}
                aria-label={t('mt_subject')}
                placeholder={t('mt_subject')}
                onChange={(e) => {
                  const v = e.target.value;
                  setItems((cur) => cur && cur.map((x) => (x.id === act.id ? { ...x, title: v } : x)));
                  if (v.trim()) upd(act.id, { title: v });
                }}
              />
              <SaveTemplateButton
                kind="meeting"
                compact
                defaultName={act.title}
                body={() => ({
                  title: act.title,
                  participants: act.participants,
                  topics: act.topics,
                  review: act.review.map((x) => x.t),
                  todos: act.todos.map((x) => x.t),
                })}
              />
              <button
                type="button"
                className="kh-em-act kh-em-act--del"
                title={t('del')}
                aria-label={t('del')}
                onClick={() => void remove()}
              >
                <Svg d={I.trash} />
              </button>
            </div>
            <div className="kh-mt-when">
              <label>
                <span>{t('mt_date')}</span>
                <input
                  type="date"
                  value={act.heldOn}
                  required
                  onChange={(e) => e.target.value && upd(act.id, { heldOn: e.target.value }, 0)}
                />
              </label>
              <label>
                <span>{t('mt_start')}</span>
                <input
                  type="time"
                  value={act.startTime}
                  onChange={(e) => upd(act.id, { startTime: e.target.value }, 0)}
                />
              </label>
              <label>
                <span>{t('mt_end')}</span>
                <input
                  type="time"
                  value={act.endTime}
                  onChange={(e) => upd(act.id, { endTime: e.target.value }, 0)}
                />
              </label>
              <label>
                <span>{t('mt_folder')}</span>
                <select
                  className="kh-mt-folderSel"
                  aria-label={t('mt_folder')}
                  value={act.folderId ?? ''}
                  onChange={(e) => upd(act.id, { folderId: e.target.value || null }, 0)}
                >
                  <option value="">{t('mt_noFolder')}</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <span className="kh-mt-whenTxt">
                <Svg d={I.clock} s={14} />
                {fmtDay(act.heldOn)}
                {time(act) && ` · ${time(act)}`}
              </span>
            </div>

            <div className="kh-mt-sec">
              <div className="kh-mt-secT">
                <Svg d={I.people} s={15} />
                {t('mt_participants')}
              </div>
              <div className="kh-mt-who">
                {act.participants.map((p) => (
                  <span key={p} className="kh-mt-chip">
                    {p}
                    <button
                      type="button"
                      aria-label={`${t('del')} ${p}`}
                      onClick={() =>
                        upd(act.id, { participants: act.participants.filter((x) => x !== p) }, 0)
                      }
                    >
                      <Svg d={I.x} s={10} />
                    </button>
                  </span>
                ))}
                <input
                  value={who}
                  maxLength={400}
                  placeholder={t('mt_addPerson')}
                  aria-label={t('mt_addPerson')}
                  onChange={(e) => setWho(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      addWho();
                    } else if (e.key === 'Backspace' && !who && act.participants.length)
                      upd(act.id, { participants: act.participants.slice(0, -1) }, 0);
                  }}
                  onBlur={addWho}
                />
              </div>
            </div>

            <div className="kh-mt-sec">
              <div className="kh-mt-secT">
                <span>{t('mt_topics')}</span>
                {aiReady && (
                  <span style={{ marginLeft: 'auto' }}>
                    <AiButton
                      label={t('ai_organise')}
                      title={t('ai_organiseTip')}
                      busy={aiBusy}
                      disabled={!act.topics.trim()}
                      onClick={async () => {
                        setAiBusy(true);
                        setSug(null);
                        try {
                          const r = await api<{
                            meeting: { summary: string; review: string[]; todos: string[] };
                          }>('/ai/action', {
                            kind: 'meeting',
                            title: act.title,
                            participants: act.participants,
                            topics: act.topics,
                          });
                          setSug({ id: act.id, ...r.meeting });
                        } catch (e) {
                          toast({ message: aiError(t, e), tone: 'error' });
                        } finally {
                          setAiBusy(false);
                        }
                      }}
                    />
                  </span>
                )}
              </div>
              {sug?.id === act.id && (
                <div className="kh-ai-out" aria-label={t('ai_suggestion')}>
                  <div className="kh-ai-out__h">{t('ai_suggestion')}</div>
                  {sug.summary && <AiText text={sug.summary} cite={(n) => `[${n}]`} />}
                  {sug.review.length > 0 && (
                    <div>
                      <b>{t('mt_review')}</b>
                      <ul>
                        {sug.review.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {sug.todos.length > 0 && (
                    <div>
                      <b>{t('mt_todos')}</b>
                      <ul>
                        {sug.todos.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="kh-ai-out__acts">
                    <button
                      type="button"
                      data-main
                      onClick={() => {
                        // the summary goes on top of the document, the original topics stay below
                        if (sug.summary)
                          topicsRef.current?.prepend(sug.summary, `— ${t('ai_originalNotes')} —`);
                        upd(
                          act.id,
                          {
                            review: [...act.review, ...sug.review.map((x) => ({ t: x, done: false }))],
                            todos: [...act.todos, ...sug.todos.map((x) => ({ t: x, done: false }))],
                          },
                          0,
                        );
                        setSug(null);
                      }}
                    >
                      {t('ai_apply')}
                    </button>
                    <button type="button" onClick={() => setSug(null)}>
                      {t('ai_discard')}
                    </button>
                  </div>
                </div>
              )}
              {docs.current.has(act.id) ? (
                <MeetingTopics
                  key={act.id}
                  meetingId={act.id}
                  doc={docs.current.get(act.id)!}
                  handle={topicsRef}
                  onChange={(doc, text) => {
                    docs.current.set(act.id, doc);
                    // the server keeps the text itself; here it serves search and the AI button
                    setItems((cur) => cur && cur.map((x) => (x.id === act.id ? { ...x, topics: text } : x)));
                    upd(act.id, { topicsDoc: doc });
                  }}
                />
              ) : (
                <div className="kh-mt-doc" aria-busy="true" />
              )}
            </div>

            <div className="kh-mt-cols">
              <div className="kh-mt-sec">
                <div className="kh-mt-secT">
                  {t('mt_review')}
                  {act.review.length > 0 && (
                    <span className="kh-mt-n">
                      {act.review.filter((x) => x.done).length}/{act.review.length}
                    </span>
                  )}
                </div>
                <Checklist
                  items={act.review}
                  onChange={(review) => upd(act.id, { review })}
                  placeholder={t('mt_reviewPh')}
                  addLabel={t('mt_addPoint')}
                  label={t('mt_review')}
                />
              </div>
              <div className="kh-mt-sec">
                <div className="kh-mt-secT">
                  {t('mt_todos')}
                  {act.todos.length > 0 && (
                    <span className="kh-mt-n">
                      {act.todos.filter((x) => x.done).length}/{act.todos.length}
                    </span>
                  )}
                </div>
                <Checklist
                  items={act.todos}
                  onChange={(todos) => upd(act.id, { todos })}
                  placeholder={t('mt_todosPh')}
                  addLabel={t('mt_addTodo')}
                  label={t('mt_todos')}
                  extra={
                    modules.has('tasks')
                      ? (it, i) => (
                          <button
                            type="button"
                            className="kh-mt-mk"
                            data-made={taskOf[`${act.id}:${i}`] || undefined}
                            disabled={!it.t.trim() || !!taskOf[`${act.id}:${i}`]}
                            title={taskOf[`${act.id}:${i}`] ? t('mt_taskMade') : t('mt_toTask')}
                            aria-label={`${t('mt_toTask')}: ${it.t}`}
                            onClick={() => void toTask(act, it, i)}
                          >
                            <Svg d={taskOf[`${act.id}:${i}`] ? I.ok : I.task} s={13} />
                          </button>
                        )
                      : undefined
                  }
                />
              </div>
            </div>

            <Connections key={`${act.id}:${linksKey}`} type="meeting" id={act.id} variant="section" />
          </div>
        ) : (
          <div className="kh-em-none">{items && !all.length ? t('mt_empty') : t('mt_noActive')}</div>
        )}
      </section>
      {leave && (
        <TodoTasksDialog
          title={leave.m.title}
          items={leave.items}
          onCreate={answer(true)}
          onSkip={() => void answer(false)([], 'tech')}
          onStay={() => setLeave(null)}
        />
      )}
    </div>
  );
}
