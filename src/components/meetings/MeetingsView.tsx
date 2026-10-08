'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { useConfirm, useToast } from '@/components/ui';
import { useShell } from '@/components/shell/ShellContext';
import { refreshCounts } from '@/components/shell/counts';
import { Connections } from '@/components/content/Connections';
import '../emails/emails.css';
import './meetings.css';

// Atas de Reunião: a meeting record kept as minutes — when, the subject, who
// was there (any names, people may be outside the app), the topics discussed,
// points to review and things to do. Shown on the Calendar by its date;
// linkable to notes, tasks and project issues.

type Item = { t: string; done: boolean };
type Meeting = {
  id: string;
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
type Patch = Partial<Omit<Meeting, 'id' | 'createdAt' | 'updatedAt'>>;

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
  const { t, lang } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const { modules } = useShell();
  const [items, setItems] = useState<Meeting[] | null>(null);
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const [taskOf, setTaskOf] = useState<Record<string, true>>({});
  const timers = useRef(new Map<string, { patch: Patch; tm: ReturnType<typeof setTimeout> }>());
  const activeId = sp.get('m');
  const loc = lang === 'en' ? 'en-GB' : 'pt-PT';

  const open = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (id) next.set('m', id);
      else next.delete('m');
      router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [path, router, sp],
  );

  useEffect(() => {
    api<{ meetings: Meeting[] }>('/meetings')
      .then((r) => setItems(r.meetings))
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
    return () => {
      for (const id of [...map.keys()]) flush(id);
    };
  }, [flush]);
  const upd = (id: string, p: Patch, delay = 500) => {
    setItems((cur) => cur && cur.map((x) => (x.id === id ? { ...x, ...p } : x)));
    const prev = timers.current.get(id);
    if (prev) clearTimeout(prev.tm);
    timers.current.set(id, {
      patch: { ...(prev?.patch ?? {}), ...p },
      tm: setTimeout(() => flush(id), delay),
    });
  };

  const all = useMemo(() => items ?? [], [items]);
  const query = q.trim().toLowerCase();
  const list = all
    .filter(
      (m) =>
        !query ||
        [m.title, m.topics, ...m.participants, ...m.review.map((x) => x.t), ...m.todos.map((x) => x.t)]
          .join(' ')
          .toLowerCase()
          .includes(query),
    )
    .sort((a, b) => (b.heldOn + b.startTime).localeCompare(a.heldOn + a.startTime));
  const act = all.find((m) => m.id === activeId) ?? null;
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

  const create = async () => {
    try {
      const { meeting } = await api<{ meeting: Meeting }>('/meetings', {
        title: t('mt_newTitle'),
        heldOn: today(),
      });
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
    await api(`/meetings/${act.id}`, undefined, 'DELETE').catch(() => {});
    const idx = list.findIndex((x) => x.id === act.id);
    const rest = list.filter((x) => x.id !== act.id);
    setItems((cur) => cur && cur.filter((x) => x.id !== act.id));
    open(rest[Math.min(idx, rest.length - 1)]?.id ?? null);
    refreshCounts();
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
  /** "Coisas a fazer" → a task linked to this meeting */
  const toTask = async (m: Meeting, it: Item, i: number) => {
    const key = `${m.id}:${i}`;
    if (!it.t.trim() || taskOf[key]) return;
    try {
      const { task } = await api<{ task: { id: string } }>('/tasks', { title: it.t.trim().slice(0, 300) });
      await api('/links', { a: { type: 'meeting', id: m.id }, b: { type: 'task', id: task.id } });
      setTaskOf((x) => ({ ...x, [key]: true }));
      toast({ message: t('mt_taskMade') });
      refreshCounts();
      // reload the links section
      setLinksKey((k) => k + 1);
    } catch {
      fail();
    }
  };
  const [linksKey, setLinksKey] = useState(0);

  const fmtDay = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });
  const time = (m: Meeting) => (m.startTime ? `${m.startTime}${m.endTime ? `–${m.endTime}` : ''}` : '');
  const now = today();

  return (
    <div className="kh-em kh-mt" style={{ gridTemplateColumns: 'minmax(260px, 340px) minmax(0, 1fr)' }}>
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
          <button
            type="button"
            className="kh-mt-new"
            title={t('mt_new')}
            aria-label={t('mt_new')}
            onClick={() => void create()}
          >
            <Svg d={I.plus} s={16} />
          </button>
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
                    role="button"
                    tabIndex={0}
                    onClick={() => open(m.id)}
                    onKeyDown={(e) => e.key === 'Enter' && open(m.id)}
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
              <label className="kh-mt-secT" htmlFor={`mt-topics-${act.id}`}>
                {t('mt_topics')}
              </label>
              <textarea
                id={`mt-topics-${act.id}`}
                className="kh-mt-topics"
                value={act.topics}
                maxLength={100_000}
                placeholder={t('mt_topicsPh')}
                onChange={(e) => upd(act.id, { topics: e.target.value })}
              />
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
    </div>
  );
}
