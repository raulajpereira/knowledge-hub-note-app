import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';

const PRIORITIES = ['Low', 'Medium', 'High'];
const PRIORITY_HUES = { Low: 250, Medium: 60, High: 35 };

const FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'done', label: 'Done' },
  { key: 'all', label: 'All' },
];

export default function Tasks() {
  const { theme } = useTheme();
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listTasks().then(({ tasks }) => {
      setTasks(tasks);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => (filter === 'active' ? !t.done : filter === 'done' ? t.done : true))
      .filter((t) => !search.trim() || t.title.toLowerCase().includes(search.toLowerCase()));
  }, [tasks, filter, search]);

  const selected = tasks.find((t) => t.id === selectedId) || filtered[0] || null;

  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const addTask = async () => {
    const { task } = await api.createTask({ title: 'New task' });
    setTasks((prev) => [task, ...prev]);
    setSelectedId(task.id);
    setFilter('active');
  };

  const patch = async (id, payload) => {
    const { task } = await api.updateTask(id, payload);
    setTasks((prev) => prev.map((t) => (t.id === id ? task : t)));
  };

  const remove = async () => {
    if (!selected) return;
    await api.deleteTask(selected.id);
    setTasks((prev) => prev.filter((t) => t.id !== selected.id));
    setSelectedId(null);
  };

  const rowStyle = (isActive) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    background: isActive ? theme.accentSoftBg : 'transparent',
  });

  if (loading) return <div style={{ padding: 28, color: theme.textMuted }}>Loading tasks…</div>;

  return (
    <div style={{ padding: '24px 28px', flex: 1, display: 'flex', gap: 24, minHeight: 0 }}>
      <div style={{ flex: '1 1 340px', minWidth: 280, maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '9px 12px', flex: 1, minWidth: 0 }}>
            <span style={{ opacity: 0.5, display: 'flex' }}>
              <Icon name="search" size={15} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, flex: 1, minWidth: 0, color: theme.textPrimary }}
            />
          </div>
          <button onClick={addTask} title="New Task" style={{ display: 'flex', alignItems: 'center', background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 12px', cursor: 'pointer', flexShrink: 0 }}>
            <Icon name="plus" size={16} color="#fff" />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {FILTERS.map((f) => (
            <div
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                background: filter === f.key ? theme.accentSoftBg : theme.subtleBg,
                color: filter === f.key ? theme.accentText : theme.textMuted,
              }}
            >
              {f.label}
            </div>
          ))}
        </div>

        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {filtered.length === 0 && <div style={{ padding: 14, fontSize: 13, color: theme.textMuted }}>No tasks here.</div>}
          {filtered.map((t) => {
            const hue = PRIORITY_HUES[t.priority];
            return (
              <div key={t.id} onClick={() => setSelectedId(t.id)} style={rowStyle(selected?.id === t.id)}>
                <div
                  onClick={(e) => { e.stopPropagation(); patch(t.id, { done: !t.done }); }}
                  style={{
                    width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${t.done ? theme.accent : theme.border}`,
                    background: t.done ? theme.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {t.done && <Icon name="check" size={12} color="#fff" strokeWidth={2.5} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.6 : 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: theme.textMuted }}>
                    {t.project || 'No project'}
                    {t.due ? ` · due ${t.due}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, flexShrink: 0, background: `oklch(0.93 0.06 ${hue})`, color: `oklch(0.45 0.14 ${hue})` }}>
                  {t.priority}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected ? (
        <div style={{ flex: '1 1 420px', minWidth: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              value={selected.title}
              onChange={(e) => patch(selected.id, { title: e.target.value })}
              style={{ flex: '1 1 160px', minWidth: 160, border: 'none', outline: 'none', background: 'transparent', fontSize: 18, fontWeight: 800, color: theme.textPrimary }}
            />
            <button onClick={remove} style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
              Delete
            </button>
          </div>

          <button
            onClick={() => patch(selected.id, { done: !selected.done })}
            style={{ alignSelf: 'flex-start', background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            {selected.done ? 'Mark as Active' : 'Mark as Done'}
          </button>

          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Priority</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {PRIORITIES.map((p) => {
                const hue = PRIORITY_HUES[p];
                const active = selected.priority === p;
                return (
                  <div
                    key={p}
                    onClick={() => patch(selected.id, { priority: p })}
                    style={{
                      padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                      background: active ? `oklch(0.93 0.06 ${hue})` : theme.subtleBg,
                      color: active ? `oklch(0.45 0.14 ${hue})` : theme.textMuted,
                    }}
                  >
                    {p}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Due Date</div>
              <input
                value={selected.due || ''}
                onChange={(e) => patch(selected.id, { due: e.target.value })}
                placeholder="e.g. Jul 20"
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
              />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Project</div>
              <input
                value={selected.project || ''}
                onChange={(e) => patch(selected.id, { project: e.target.value })}
                placeholder="e.g. Notes"
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
              />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Notes</div>
            <textarea
              value={selected.notes || ''}
              onChange={(e) => patch(selected.id, { notes: e.target.value })}
              rows={5}
              placeholder="Add notes..."
              style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: 10, fontSize: 13.5, lineHeight: 1.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
        </div>
      ) : (
        <div style={{ flex: '1 1 420px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
          Select or create a task to get started.
        </div>
      )}
    </div>
  );
}
