import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';

const STATUSES = ['Open', 'In Progress', 'Waiting', 'Done'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const PRIORITY_HUES = { Low: 250, Medium: 60, High: 35, Critical: 20 };
const STATUS_HUES = { Open: 250, 'In Progress': 290, Waiting: 60, Done: 145 };

const DEFAULT_COLUMNS = [
  { key: 'title', label: 'Title', width: 260 },
  { key: 'status', label: 'Status', width: 130 },
  { key: 'priority', label: 'Priority', width: 110 },
  { key: 'project', label: 'Project', width: 140 },
  { key: 'due', label: 'Due', width: 100 },
  { key: 'waitingOn', label: 'Waiting On', width: 180 },
];
const MIN_COLUMN_WIDTH = 70;

function ResizeHandle({ onResize }) {
  const dragRef = useRef(null);
  const onMouseDown = (e) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX };
    const onMove = (moveEvent) => {
      if (!dragRef.current) return;
      onResize(moveEvent.clientX - dragRef.current.startX);
      dragRef.current.startX = moveEvent.clientX;
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  return (
    <div
      onMouseDown={onMouseDown}
      style={{ position: 'absolute', right: -3, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 1 }}
    />
  );
}

function Badge({ label, hue, theme }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: `oklch(0.93 0.06 ${hue})`, color: `oklch(0.45 0.14 ${hue})`, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

export default function Issues() {
  const { theme } = useTheme();
  const [issues, setIssues] = useState([]);
  const [view, setView] = useState('table');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);

  const resizeColumn = (index, deltaX) => {
    setColumns((prev) =>
      prev.map((c, i) => (i === index ? { ...c, width: Math.max(MIN_COLUMN_WIDTH, c.width + deltaX) } : c))
    );
  };

  useEffect(() => {
    api.listIssues().then(({ issues }) => {
      setIssues(issues);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(
    () => issues.filter((i) => !search.trim() || i.title.toLowerCase().includes(search.toLowerCase())),
    [issues, search]
  );

  const selected = issues.find((i) => i.id === selectedId) || null;

  const addIssue = async () => {
    const { issue } = await api.createIssue({ title: 'New issue' });
    setIssues((prev) => [issue, ...prev]);
    setSelectedId(issue.id);
  };

  const patch = async (id, payload) => {
    const { issue } = await api.updateIssue(id, payload);
    setIssues((prev) => prev.map((i) => (i.id === id ? issue : i)));
  };

  const remove = async (id) => {
    await api.deleteIssue(id);
    setIssues((prev) => prev.filter((i) => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const onDropOnColumn = async (status, e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/issue-id');
    if (id) await patch(id, { status });
  };

  const cardStyle = { background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer' };

  if (loading) return <div style={{ padding: 28, color: theme.textMuted }}>Loading issues…</div>;

  return (
    <div style={{ padding: '24px 28px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>Project Issues</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', background: theme.subtleBg, borderRadius: 9, padding: 3, gap: 3 }}>
            {['table', 'kanban'].map((v) => (
              <div
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '7px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
                  background: view === v ? theme.cardBg : 'transparent', color: view === v ? theme.textPrimary : theme.textMuted,
                }}
              >
                {v}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '8px 12px' }}>
            <Icon name="search" size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar issues..."
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: theme.textPrimary, width: 140 }}
            />
          </div>
          <button onClick={addIssue} style={{ display: 'flex', alignItems: 'center', gap: 6, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <Icon name="plus" size={14} color="#fff" /> Novo Issue
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 24 }}>
        {view === 'table' ? (
          <div style={{ flex: '1 1 640px', minWidth: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: columns.map((c) => `${c.width}px`).join(' '), gap: 0, minWidth: 'max-content' }}>
              {columns.map((col, i) => (
                <div key={col.key} style={{ position: 'relative', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: `1px solid ${theme.border}` }}>
                  {col.label}
                  {i < columns.length - 1 && <ResizeHandle onResize={(dx) => resizeColumn(i, dx)} />}
                </div>
              ))}
              {filtered.map((issue) => (
                <Fragment key={issue.id}>
                  <div
                    onClick={() => setSelectedId(issue.id)}
                    style={{
                      padding: '12px 14px', fontSize: 13.5, fontWeight: 700, borderBottom: `1px solid ${theme.border}`, cursor: 'pointer',
                      background: selectedId === issue.id ? theme.accentSoftBg : 'transparent', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {issue.title}
                  </div>
                  <div onClick={() => setSelectedId(issue.id)} style={{ padding: '12px 14px', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <Badge label={issue.status} hue={STATUS_HUES[issue.status]} theme={theme} />
                  </div>
                  <div onClick={() => setSelectedId(issue.id)} style={{ padding: '12px 14px', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <Badge label={issue.priority} hue={PRIORITY_HUES[issue.priority]} theme={theme} />
                  </div>
                  <div onClick={() => setSelectedId(issue.id)} style={{ padding: '12px 14px', fontSize: 12.5, color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {issue.project || '—'}
                  </div>
                  <div onClick={() => setSelectedId(issue.id)} style={{ padding: '12px 14px', fontSize: 12.5, color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {issue.due || '—'}
                  </div>
                  <div onClick={() => setSelectedId(issue.id)} style={{ padding: '12px 14px', fontSize: 12.5, color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {issue.waitingOn || '—'}
                  </div>
                </Fragment>
              ))}
              {filtered.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: 20, fontSize: 13, color: theme.textMuted }}>No issues yet.</div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ flex: '1 1 640px', minWidth: 0, display: 'flex', gap: 14, overflowX: 'auto' }}>
            {STATUSES.map((status) => (
              <div
                key={status}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDropOnColumn(status, e)}
                style={{ flex: '1 1 220px', minWidth: 220, background: theme.subtleBg, borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '100%', overflowY: 'auto' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 8px' }}>
                  <Badge label={status} hue={STATUS_HUES[status]} theme={theme} />
                  <span style={{ fontSize: 11.5, color: theme.textMuted }}>{filtered.filter((i) => i.status === status).length}</span>
                </div>
                {filtered
                  .filter((i) => i.status === status)
                  .map((issue) => (
                    <div
                      key={issue.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/issue-id', issue.id)}
                      onClick={() => setSelectedId(issue.id)}
                      style={cardStyle}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{issue.title}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Badge label={issue.priority} hue={PRIORITY_HUES[issue.priority]} theme={theme} />
                        {issue.project && <span style={{ fontSize: 11, color: theme.textMuted }}>{issue.project}</span>}
                      </div>
                      {issue.due && <div style={{ fontSize: 11, color: theme.textMuted }}>Due {issue.due}</div>}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}

        {selected && (
          <div style={{ flex: '0 0 340px', width: 340, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                value={selected.title}
                onChange={(e) => patch(selected.id, { title: e.target.value })}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 16, fontWeight: 800, color: theme.textPrimary }}
              />
              <button onClick={() => remove(selected.id)} style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '6px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                Delete
              </button>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Status</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STATUSES.map((s) => (
                  <div
                    key={s}
                    onClick={() => patch(selected.id, { status: s })}
                    style={{
                      padding: '5px 10px', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                      background: selected.status === s ? `oklch(0.93 0.06 ${STATUS_HUES[s]})` : theme.subtleBg,
                      color: selected.status === s ? `oklch(0.45 0.14 ${STATUS_HUES[s]})` : theme.textMuted,
                    }}
                  >
                    {s}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Priority</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PRIORITIES.map((p) => (
                  <div
                    key={p}
                    onClick={() => patch(selected.id, { priority: p })}
                    style={{
                      padding: '5px 10px', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                      background: selected.priority === p ? `oklch(0.93 0.06 ${PRIORITY_HUES[p]})` : theme.subtleBg,
                      color: selected.priority === p ? `oklch(0.45 0.14 ${PRIORITY_HUES[p]})` : theme.textMuted,
                    }}
                  >
                    {p}
                  </div>
                ))}
              </div>
            </div>

            {[
              ['project', 'Project'],
              ['due', 'Due Date'],
              ['waitingOn', 'Waiting On'],
            ].map(([field, label]) => (
              <div key={field}>
                <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{label}</div>
                <input
                  value={selected[field] || ''}
                  onChange={(e) => patch(selected.id, { [field]: e.target.value })}
                  style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
                />
              </div>
            ))}

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Description</div>
              <textarea
                value={selected.description || ''}
                onChange={(e) => patch(selected.id, { description: e.target.value })}
                rows={3}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: 8, fontSize: 12.5, lineHeight: 1.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Notes</div>
              <textarea
                value={selected.notes || ''}
                onChange={(e) => patch(selected.id, { notes: e.target.value })}
                rows={3}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: 8, fontSize: 12.5, lineHeight: 1.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
