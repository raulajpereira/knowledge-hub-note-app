// "Vistas guardadas": the filters of a saved view and how they travel in the
// page URL (linkable, back/forward). The server validates them with Zod
// (server/content/views.ts); this file is shared with the browser.

export type NoteViewFilter = {
  /** 'all' | 'fav' | a notebook id | 'sh:<shared folder id>' */
  folder: string;
  tags: string[];
  tagMode: 'any' | 'all';
  q: string;
  days: number | null;
};
export type TaskDue = 'any' | 'overdue' | 'today' | 'week' | 'month' | 'none';
export type TaskViewFilter = {
  status: 'active' | 'done' | 'all';
  type: 'all' | 'tech' | 'mgmt';
  priority: Array<'low' | 'medium' | 'high'>;
  project: string | null;
  due: TaskDue;
  shared: string | null;
  q: string;
};
export type SavedView =
  | {
      id: string;
      kind: 'notes';
      name: string;
      filter: NoteViewFilter;
      position: number;
      count: number | null;
    }
  | {
      id: string;
      kind: 'tasks';
      name: string;
      filter: TaskViewFilter;
      position: number;
      count: number | null;
    };

export const NOTE_VIEW_DEFAULT: NoteViewFilter = {
  folder: 'all',
  tags: [],
  tagMode: 'any',
  q: '',
  days: null,
};
export const TASK_VIEW_DEFAULT: TaskViewFilter = {
  status: 'active',
  type: 'all',
  priority: [],
  project: null,
  due: 'any',
  shared: null,
  q: '',
};
export const TASK_DUES: TaskDue[] = ['any', 'overdue', 'today', 'week', 'month', 'none'];
export const VIEW_DAYS = [7, 30, 90, 365];

/** URL params that describe a Notes filter (besides `n`, the open note). */
export const NOTE_VIEW_KEYS = ['view', 'f', 'tag', 'tm', 'days', 'q'];
export const TASK_VIEW_KEYS = ['view', 'st', 'ty', 'pr', 'pj', 'due', 'sh', 'q'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function noteViewParams(f: NoteViewFilter, view?: string): URLSearchParams {
  const p = new URLSearchParams();
  if (view) p.set('view', view);
  if (f.folder !== 'all') p.set('f', f.folder);
  for (const t of f.tags) p.append('tag', t);
  if (f.tags.length > 1 && f.tagMode === 'all') p.set('tm', 'all');
  if (f.days) p.set('days', String(f.days));
  if (f.q) p.set('q', f.q);
  return p;
}

/** The Notes filter in a URL, or null when the URL carries none. */
export function noteViewFromParams(sp: URLSearchParams): NoteViewFilter | null {
  if (!NOTE_VIEW_KEYS.some((k) => sp.has(k))) return null;
  const f = sp.get('f') ?? 'all';
  const d = Number(sp.get('days'));
  return {
    folder: f === 'fav' || UUID.test(f) || /^sh:[0-9a-f-]{36}$/i.test(f) ? f : 'all',
    tags: [...new Set(sp.getAll('tag').map((t) => t.trim().slice(0, 40)))].filter(Boolean).slice(0, 10),
    tagMode: sp.get('tm') === 'all' ? 'all' : 'any',
    days: Number.isInteger(d) && d >= 1 && d <= 3650 ? d : null,
    q: (sp.get('q') ?? '').slice(0, 200),
  };
}

export function taskViewParams(f: TaskViewFilter, view?: string): URLSearchParams {
  const p = new URLSearchParams();
  if (view) p.set('view', view);
  p.set('st', f.status);
  if (f.type !== 'all') p.set('ty', f.type);
  for (const x of f.priority) p.append('pr', x);
  if (f.project) p.set('pj', f.project);
  if (f.due !== 'any') p.set('due', f.due);
  if (f.shared) p.set('sh', f.shared);
  if (f.q) p.set('q', f.q);
  return p;
}

export function taskViewFromParams(sp: URLSearchParams): TaskViewFilter | null {
  if (!TASK_VIEW_KEYS.some((k) => sp.has(k))) return null;
  const st = sp.get('st');
  const ty = sp.get('ty');
  const pj = sp.get('pj');
  const due = sp.get('due') as TaskDue | null;
  const sh = sp.get('sh');
  return {
    status: st === 'done' || st === 'all' ? st : 'active',
    type: ty === 'tech' || ty === 'mgmt' ? ty : 'all',
    priority: [...new Set(sp.getAll('pr'))].filter(
      (x): x is 'low' | 'medium' | 'high' => x === 'low' || x === 'medium' || x === 'high',
    ),
    project: pj === 'none' || (pj && UUID.test(pj)) ? pj : null,
    due: due && TASK_DUES.includes(due) ? due : 'any',
    shared: sh && UUID.test(sh) ? sh : null,
    q: (sp.get('q') ?? '').slice(0, 200),
  };
}

export const viewHref = (v: SavedView) =>
  v.kind === 'notes'
    ? `/app/notes?${noteViewParams(v.filter, v.id)}`
    : `/app/tasks?${taskViewParams(v.filter, v.id)}`;

/** A task matches a task filter (the same rules as the server's count). */
export function taskMatches(
  x: {
    title: string;
    notes: string;
    doneAt: string | null;
    type: string;
    priority: string;
    projectId: string | null;
    dueOn: string | null;
  },
  f: Pick<TaskViewFilter, 'priority' | 'project' | 'due'>,
  today: string,
): boolean {
  if (f.priority.length && !f.priority.includes(x.priority as 'low')) return false;
  if (f.project === 'none' ? x.projectId : f.project && x.projectId !== f.project) return false;
  const plus = (n: number) => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  switch (f.due) {
    case 'none':
      return !x.dueOn;
    case 'overdue':
      return !!x.dueOn && x.dueOn < today;
    case 'today':
      return x.dueOn === today;
    case 'week':
      return !!x.dueOn && x.dueOn >= today && x.dueOn <= plus(7);
    case 'month':
      return !!x.dueOn && x.dueOn >= today && x.dueOn <= plus(30);
    default:
      return true;
  }
}

const EVT = 'kh:views';
/** Pages that save, rename or delete a view call this so the sidebar reloads. */
export const refreshViews = () => window.dispatchEvent(new Event(EVT));
export const VIEWS_EVENT = EVT;
