import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useCounts } from '../context/CountsContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import DateInput from '../components/DateInput.jsx';
import LinkedItemsPanel from '../components/LinkedItemsPanel.jsx';

const PRIORITIES = ['Low', 'Medium', 'High'];
const PRIORITY_HUES = { Low: 250, Medium: 60, High: 35 };
const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 };

const FILTERS = [
  { key: 'active', labelKey: 'tasks.filterActive' },
  { key: 'done', labelKey: 'tasks.filterDone' },
  { key: 'all', labelKey: 'tasks.filterAll' },
];

const BOARD_COLUMNS = [
  { status: 'todo', labelKey: 'tasks.statusTodo' },
  { status: 'in_progress', labelKey: 'tasks.statusInProgress' },
  { status: 'done', labelKey: 'tasks.statusDone' },
];

function TaskCard({ task, theme, onDragStart, onClick }) {
  const hue = PRIORITY_HUES[task.priority];
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      style={{
        background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12,
        cursor: 'grab', display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{task.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: `oklch(0.93 0.06 ${hue})`, color: `oklch(0.45 0.14 ${hue})` }}>
          {task.priority}
        </span>
        {task.due && <span style={{ fontSize: 10.5, color: theme.textMuted }}>{task.due}</span>}
      </div>
    </div>
  );
}

export default function Tasks() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const { refresh: refreshCounts } = useCounts();
  const location = useLocation();
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('active');
  const [sortBy, setSortBy] = useState('recent');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [titleDraft, setTitleDraft] = useState('');
  const [view, setView] = useState('list');
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  useEffect(() => {
    api.listTasks().then(({ tasks }) => {
      setTasks(tasks);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const list = tasks
      .filter((t) => (filter === 'active' ? !t.done : filter === 'done' ? t.done : true))
      .filter((t) => !search.trim() || t.title.toLowerCase().includes(search.toLowerCase()));
    if (sortBy === 'priority') {
      return [...list].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    }
    return list;
  }, [tasks, filter, search, sortBy]);

  const selected = tasks.find((t) => t.id === selectedId) || filtered[0] || null;

  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  useEffect(() => {
    if (location.state?.taskId) {
      setFilter('all');
      setSelectedId(location.state.taskId);
    }
  }, [location.state]);

  useEffect(() => {
    setTitleDraft(selected?.title ?? '');
  }, [selected?.id]);

  const commitTitle = async () => {
    if (!selected || titleDraft === selected.title) return;
    const { task } = await api.updateTask(selected.id, { title: titleDraft });
    setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    setTitleDraft(task.title);
  };

  const addTask = async () => {
    const { task } = await api.createTask({ title: t('tasks.newTask') });
    setTasks((prev) => [task, ...prev]);
    setSelectedId(task.id);
    setFilter('active');
    refreshCounts();
  };

  const patch = async (id, payload) => {
    const { task, nextTask } = await api.updateTask(id, payload);
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === id ? task : t));
      return nextTask ? [nextTask, ...next] : next;
    });
  };

  const remove = async () => {
    if (!selected) return;
    const ok = await confirm({ message: t('common.confirmTrashMessage') });
    if (!ok) return;
    await api.trashTask(selected.id);
    setTasks((prev) => prev.filter((t) => t.id !== selected.id));
    setSelectedId(null);
    refreshCounts();
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const bulkTrash = async () => {
    const ok = await confirm({ message: t('common.confirmTrashMessage') });
    if (!ok) return;
    const ids = [...selectedIds];
    await Promise.all(ids.map((id) => api.trashTask(id)));
    setTasks((prev) => prev.filter((tk) => !selectedIds.has(tk.id)));
    if (selectedId && selectedIds.has(selectedId)) setSelectedId(null);
    clearSelection();
    refreshCounts();
  };

  const bulkMarkDone = async () => {
    const ids = [...selectedIds];
    const updated = await Promise.all(ids.map((id) => api.updateTask(id, { done: true })));
    const byId = new Map(updated.map(({ task }) => [task.id, task]));
    setTasks((prev) => prev.map((tk) => byId.get(tk.id) || tk));
    clearSelection();
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

  if (loading) return <div style={{ padding: 28, color: theme.textMuted }}>{t('common.loading')}</div>;

  return (
    <div style={{ padding: '24px 28px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '9px 12px', flex: '1 1 260px', minWidth: 0, maxWidth: 400 }}>
          <span style={{ opacity: 0.5, display: 'flex' }}>
            <Icon name="search" size={15} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('tasks.searchPlaceholder')}
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, flex: 1, minWidth: 0, color: theme.textPrimary }}
          />
        </div>
        {view === 'list' && (
          <button
            onClick={() => (selectMode ? clearSelection() : setSelectMode(true))}
            title={t('tasks.selectMode')}
            style={{
              display: 'flex', alignItems: 'center', background: selectMode ? theme.accentSoftBg : 'transparent',
              color: selectMode ? theme.accentText : theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: 9, padding: '9px 12px', cursor: 'pointer', flexShrink: 0,
            }}
          >
            <Icon name="check" size={16} />
          </button>
        )}
        <button onClick={addTask} title={t('tasks.newTask')} style={{ display: 'flex', alignItems: 'center', background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 12px', cursor: 'pointer', flexShrink: 0 }}>
          <Icon name="plus" size={16} color="#fff" />
        </button>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', background: theme.subtleBg, borderRadius: 9, padding: 3, gap: 3 }}>
          {[{ key: 'list', icon: 'doc' }, { key: 'board', icon: 'archive' }].map((v) => (
            <div
              key={v.key}
              onClick={() => setView(v.key)}
              title={t(`tasks.view${v.key === 'list' ? 'List' : 'Board'}`)}
              style={{
                padding: '7px 10px', borderRadius: 7, cursor: 'pointer', display: 'flex',
                background: view === v.key ? theme.cardBg : 'transparent',
                color: view === v.key ? theme.accentText : theme.textMuted,
              }}
            >
              <Icon name={v.icon} size={15} />
            </div>
          ))}
        </div>
      </div>

      {view === 'list' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
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
                {t(f.labelKey)}
              </div>
            ))}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '6px 8px', fontSize: 12, fontWeight: 600, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', cursor: 'pointer' }}
          >
            <option value="recent" style={{ color: '#1a1a1a', background: '#fff' }}>{t('tasks.sortBy')}: {t('tasks.sortRecent')}</option>
            <option value="priority" style={{ color: '#1a1a1a', background: '#fff' }}>{t('tasks.sortBy')}: {t('tasks.sortPriority')}</option>
          </select>
        </div>
      )}

      {view === 'list' && selectMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: theme.accentSoftBg, borderRadius: 10, padding: '8px 10px' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: theme.accentText, marginRight: 4 }}>
            {t('tasks.selectedCount', { n: selectedIds.size })}
          </span>
          <button onClick={bulkTrash} disabled={selectedIds.size === 0} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: selectedIds.size ? 'pointer' : 'default', opacity: selectedIds.size ? 1 : 0.5 }}>
            {t('common.delete')}
          </button>
          <button onClick={bulkMarkDone} disabled={selectedIds.size === 0} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: selectedIds.size ? 'pointer' : 'default', opacity: selectedIds.size ? 1 : 0.5 }}>
            {t('tasks.markDone')}
          </button>
          <span onClick={clearSelection} style={{ marginLeft: 'auto', cursor: 'pointer', color: theme.textMuted, fontSize: 12.5, fontWeight: 600 }}>
            {t('common.cancel')}
          </span>
        </div>
      )}

      {view === 'board' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16, overflowX: 'auto' }}>
          {BOARD_COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => (t.status || (t.done ? 'done' : 'todo')) === col.status && (!search.trim() || t.title.toLowerCase().includes(search.toLowerCase())));
            return (
              <div
                key={col.status}
                onDragOver={(e) => { e.preventDefault(); setDragOverStatus(col.status); }}
                onDragLeave={() => setDragOverStatus((v) => (v === col.status ? null : v))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverStatus(null);
                  const taskId = e.dataTransfer.getData('text/task-id');
                  if (taskId) patch(taskId, { status: col.status });
                }}
                style={{
                  flex: '1 1 260px', minWidth: 240, display: 'flex', flexDirection: 'column', gap: 10,
                  background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 12,
                  outline: dragOverStatus === col.status ? `2px dashed ${theme.accent}` : 'none', outlineOffset: -2,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  {t(col.labelKey)}
                  <span style={{ fontSize: 11, opacity: 0.7 }}>{colTasks.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
                  {colTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      theme={theme}
                      onDragStart={(e) => e.dataTransfer.setData('text/task-id', task.id)}
                      onClick={() => { setSelectedId(task.id); setView('list'); }}
                    />
                  ))}
                  {colTasks.length === 0 && <div style={{ fontSize: 12, color: theme.textMuted, padding: '6px 2px' }}>{t('tasks.noTasksHere')}</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
      <div style={{ flex: 1, display: 'flex', gap: 24, minHeight: 0 }}>
      <div style={{ flex: '1 1 340px', minWidth: 280, maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {filtered.length === 0 && <div style={{ padding: 14, fontSize: 13, color: theme.textMuted }}>{t('tasks.noTasksHere')}</div>}
          {filtered.map((task) => {
            const hue = PRIORITY_HUES[task.priority];
            return (
              <div
                key={task.id}
                onClick={() => (selectMode ? toggleSelected(task.id) : setSelectedId(task.id))}
                style={rowStyle(selectMode ? selectedIds.has(task.id) : selected?.id === task.id)}
              >
                {selectMode ? (
                  <span
                    style={{
                      width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${selectedIds.has(task.id) ? theme.accent : theme.border}`,
                      background: selectedIds.has(task.id) ? theme.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}
                  >
                    {selectedIds.has(task.id) && <Icon name="check" size={11} color="#fff" strokeWidth={3} />}
                  </span>
                ) : (
                  <div
                    onClick={(e) => { e.stopPropagation(); patch(task.id, { done: !task.done }); }}
                    style={{
                      width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${task.done ? theme.accent : theme.border}`,
                      background: task.done ? theme.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    {task.done && <Icon name="check" size={12} color="#fff" strokeWidth={2.5} />}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, textDecoration: task.done ? 'line-through' : 'none', opacity: task.done ? 0.6 : 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {task.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: theme.textMuted }}>
                    {task.project || t('common.noProject')}
                    {task.due ? ` · ${t('common.due', { date: task.due })}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, flexShrink: 0, background: `oklch(0.93 0.06 ${hue})`, color: `oklch(0.45 0.14 ${hue})` }}>
                  {task.priority}
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
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              style={{ flex: '1 1 160px', minWidth: 160, border: 'none', outline: 'none', background: 'transparent', fontSize: 18, fontWeight: 800, color: theme.textPrimary }}
            />
            <span onClick={() => patch(selected.id, { favorite: !selected.favorite })} style={{ display: 'flex', cursor: 'pointer', flexShrink: 0 }}>
              <Icon name="pin" size={17} color={selected.favorite ? theme.accentText : theme.textMuted} />
            </span>
            <button onClick={remove} style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
              {t('common.delete')}
            </button>
          </div>

          <button
            onClick={() => patch(selected.id, { done: !selected.done })}
            style={{ alignSelf: 'flex-start', background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            {selected.done ? t('tasks.markActive') : t('tasks.markDone')}
          </button>

          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{t('tasks.priority')}</div>
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
              <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{t('tasks.dueDate')}</div>
              <DateInput
                value={selected.due}
                onChange={(value) => patch(selected.id, { due: value })}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
              />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{t('tasks.project')}</div>
              <input
                value={selected.project || ''}
                onChange={(e) => patch(selected.id, { project: e.target.value })}
                placeholder={t('tasks.projectPlaceholder')}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
              />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{t('common.recurrence')}</div>
              <select
                value={selected.recurrence || ''}
                onChange={(e) => patch(selected.id, { recurrence: e.target.value || null })}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
              >
                <option value="" style={{ color: '#1a1a1a', background: '#fff' }}>{t('common.recurrenceNone')}</option>
                <option value="daily" style={{ color: '#1a1a1a', background: '#fff' }}>{t('common.recurrenceDaily')}</option>
                <option value="weekly" style={{ color: '#1a1a1a', background: '#fff' }}>{t('common.recurrenceWeekly')}</option>
                <option value="monthly" style={{ color: '#1a1a1a', background: '#fff' }}>{t('common.recurrenceMonthly')}</option>
              </select>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{t('tasks.notes')}</div>
            <textarea
              value={selected.notes || ''}
              onChange={(e) => patch(selected.id, { notes: e.target.value })}
              rows={5}
              placeholder={t('tasks.notesPlaceholder')}
              style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: 10, fontSize: 13.5, lineHeight: 1.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          <LinkedItemsPanel entityType="task" entityId={selected.id} theme={theme} t={t} />
        </div>
      ) : (
        <div style={{ flex: '1 1 420px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
          {t('tasks.selectOrCreate')}
        </div>
      )}
      </div>
      )}
    </div>
  );
}
