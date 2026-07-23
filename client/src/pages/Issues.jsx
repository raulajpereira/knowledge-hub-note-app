import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import DateInput from '../components/DateInput.jsx';

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const PRIORITY_HUES = { Low: 250, Medium: 60, High: 35, Critical: 20 };
const DEFAULT_STATUSES = [
  { name: 'Open', hue: 250 },
  { name: 'In Progress', hue: 290 },
  { name: 'Waiting', hue: 60 },
  { name: 'Done', hue: 145 },
];
const HUE_PRESETS = [250, 290, 60, 145, 20, 190, 330, 10];

const DEFAULT_COLUMNS = [
  { key: 'title', label: 'Title', width: 220 },
  { key: 'status', label: 'Status', width: 130 },
  { key: 'priority', label: 'Priority', width: 110 },
  { key: 'project', label: 'Project', width: 140 },
  { key: 'due', label: 'Due', width: 100 },
  { key: 'waitingOn', label: 'Waiting On', width: 160 },
  { key: 'description', label: 'Description', width: 220 },
  { key: 'notes', label: 'Notes', width: 220 },
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
  const { user, updateUserSettings } = useAuth();
  const location = useLocation();
  const [issues, setIssues] = useState([]);
  const [view, setView] = useState('table');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [titleDraft, setTitleDraft] = useState('');
  const [newIssueOpen, setNewIssueOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newPriority, setNewPriority] = useState('Medium');
  const [newStatus, setNewStatus] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newWaitingOn, setNewWaitingOn] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [statusConfigOpen, setStatusConfigOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState([]);
  const [originalStatusNames, setOriginalStatusNames] = useState([]);
  const [statusSaving, setStatusSaving] = useState(false);

  const statusConfig = user?.settings?.issueStatuses?.length ? user.settings.issueStatuses : DEFAULT_STATUSES;
  const STATUS_NAMES = statusConfig.map((s) => s.name);
  const STATUS_HUES = Object.fromEntries(statusConfig.map((s) => [s.name, s.hue]));
  const hueFor = (name) => STATUS_HUES[name] ?? 220;

  const openStatusConfig = () => {
    setStatusDraft(statusConfig.map((s, i) => ({ _key: `s-${i}-${Date.now()}`, originalName: s.name, name: s.name, hue: s.hue })));
    setOriginalStatusNames(statusConfig.map((s) => s.name));
    setStatusConfigOpen(true);
  };

  const cycleDraftHue = (key) => {
    setStatusDraft((prev) =>
      prev.map((s) => {
        if (s._key !== key) return s;
        const idx = HUE_PRESETS.indexOf(s.hue);
        return { ...s, hue: HUE_PRESETS[(idx + 1) % HUE_PRESETS.length] ?? HUE_PRESETS[0] };
      })
    );
  };

  const renameDraftStatus = (key, name) => {
    setStatusDraft((prev) => prev.map((s) => (s._key === key ? { ...s, name } : s)));
  };

  const removeDraftStatus = (key) => {
    setStatusDraft((prev) => prev.filter((s) => s._key !== key));
  };

  const addDraftStatus = () => {
    setStatusDraft((prev) => [...prev, { _key: `new-${Date.now()}`, originalName: null, name: 'New status', hue: HUE_PRESETS[prev.length % HUE_PRESETS.length] }]);
  };

  const saveStatusConfig = async () => {
    const cleaned = statusDraft.map((s) => ({ ...s, name: s.name.trim() })).filter((s) => s.name);
    if (cleaned.length === 0) return;
    setStatusSaving(true);
    try {
      const fallbackName = cleaned[0].name;
      const remainingOriginalNames = new Set(cleaned.filter((s) => s.originalName).map((s) => s.originalName));
      const renameMap = {};
      for (const s of cleaned) {
        if (s.originalName && s.originalName !== s.name) renameMap[s.originalName] = s.name;
      }
      for (const name of originalStatusNames) {
        if (!remainingOriginalNames.has(name)) renameMap[name] = fallbackName;
      }

      const toMigrate = Object.keys(renameMap).length ? issues.filter((i) => renameMap[i.status]) : [];
      const [migrated] = await Promise.all([
        Promise.all(toMigrate.map((i) => api.updateIssue(i.id, { status: renameMap[i.status] }))),
        api.updateSettings({ issueStatuses: cleaned.map(({ name, hue }) => ({ name, hue })) }).then(({ settings }) => updateUserSettings(settings)),
      ]);
      if (migrated.length) {
        const byId = Object.fromEntries(migrated.map((r) => [r.issue.id, r.issue]));
        setIssues((prev) => prev.map((i) => byId[i.id] || i));
      }
      setStatusConfigOpen(false);
    } finally {
      setStatusSaving(false);
    }
  };

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

  useEffect(() => {
    if (location.state?.issueId) setSelectedId(location.state.issueId);
  }, [location.state]);

  const filtered = useMemo(
    () => issues.filter((i) => !search.trim() || i.title.toLowerCase().includes(search.toLowerCase())),
    [issues, search]
  );

  const selected = issues.find((i) => i.id === selectedId) || null;

  useEffect(() => {
    setTitleDraft(selected?.title ?? '');
  }, [selected?.id]);

  const patch = async (id, payload) => {
    const { issue } = await api.updateIssue(id, payload);
    setIssues((prev) => prev.map((i) => (i.id === id ? issue : i)));
  };

  const commitTitle = async () => {
    if (!selected || titleDraft === selected.title) return;
    const { issue } = await api.updateIssue(selected.id, { title: titleDraft });
    setIssues((prev) => prev.map((i) => (i.id === issue.id ? issue : i)));
    setTitleDraft(issue.title);
  };

  const openNewIssue = () => {
    setNewTitle('');
    setNewProject('');
    setNewPriority('Medium');
    setNewStatus(STATUS_NAMES[0] || 'Open');
    setNewDue('');
    setNewWaitingOn('');
    setNewDescription('');
    setNewNotes('');
    setNewIssueOpen(true);
  };

  const createIssue = async () => {
    if (!newTitle.trim()) return;
    const { issue } = await api.createIssue({
      title: newTitle.trim(),
      project: newProject.trim() || undefined,
      priority: newPriority,
      status: newStatus || undefined,
      due: newDue || undefined,
      waitingOn: newWaitingOn.trim() || undefined,
      description: newDescription.trim() || undefined,
      notes: newNotes.trim() || undefined,
    });
    setIssues((prev) => [issue, ...prev]);
    setSelectedId(issue.id);
    setNewIssueOpen(false);
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
          <button onClick={openStatusConfig} title="Configure statuses" style={{ display: 'flex', alignItems: 'center', background: theme.subtleBg, border: 'none', color: theme.textPrimary, borderRadius: 9, padding: '9px 10px', cursor: 'pointer' }}>
            <Icon name="settings" size={16} />
          </button>
          <button onClick={openNewIssue} style={{ display: 'flex', alignItems: 'center', gap: 6, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <Icon name="plus" size={14} color="#fff" /> Novo Issue
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 24 }}>
        {view === 'table' ? (
          <div style={{ flex: '1 1 640px', minWidth: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: [...columns.map((c) => `${c.width}px`), '1fr'].join(' '), gap: 0, minWidth: '100%' }}>
              {columns.map((col, i) => (
                <div key={col.key} style={{ position: 'relative', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: `1px solid ${theme.border}` }}>
                  {col.label}
                  <ResizeHandle onResize={(dx) => resizeColumn(i, dx)} />
                </div>
              ))}
              <div style={{ borderBottom: `1px solid ${theme.border}` }} />
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
                  <div onClick={() => setSelectedId(issue.id)} style={{ padding: '12px 14px', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', background: selectedId === issue.id ? theme.accentSoftBg : 'transparent' }}>
                    <Badge label={issue.status} hue={hueFor(issue.status)} theme={theme} />
                  </div>
                  <div onClick={() => setSelectedId(issue.id)} style={{ padding: '12px 14px', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', background: selectedId === issue.id ? theme.accentSoftBg : 'transparent' }}>
                    <Badge label={issue.priority} hue={PRIORITY_HUES[issue.priority]} theme={theme} />
                  </div>
                  <div onClick={() => setSelectedId(issue.id)} style={{ padding: '12px 14px', fontSize: 12.5, color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: selectedId === issue.id ? theme.accentSoftBg : 'transparent' }}>
                    {issue.project || '—'}
                  </div>
                  <div onClick={() => setSelectedId(issue.id)} style={{ padding: '12px 14px', fontSize: 12.5, color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: selectedId === issue.id ? theme.accentSoftBg : 'transparent' }}>
                    {issue.due || '—'}
                  </div>
                  <div onClick={() => setSelectedId(issue.id)} style={{ padding: '12px 14px', fontSize: 12.5, color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: selectedId === issue.id ? theme.accentSoftBg : 'transparent' }}>
                    {issue.waitingOn || '—'}
                  </div>
                  <div onClick={() => setSelectedId(issue.id)} style={{ padding: '12px 14px', fontSize: 12.5, color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: selectedId === issue.id ? theme.accentSoftBg : 'transparent' }}>
                    {issue.description || '—'}
                  </div>
                  <div onClick={() => setSelectedId(issue.id)} style={{ padding: '12px 14px', fontSize: 12.5, color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: selectedId === issue.id ? theme.accentSoftBg : 'transparent' }}>
                    {issue.notes || '—'}
                  </div>
                  <div onClick={() => setSelectedId(issue.id)} style={{ borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', background: selectedId === issue.id ? theme.accentSoftBg : 'transparent' }} />
                </Fragment>
              ))}
              {filtered.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: 20, fontSize: 13, color: theme.textMuted }}>No issues yet.</div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ flex: '1 1 640px', minWidth: 0, display: 'flex', gap: 14, overflowX: 'auto' }}>
            {STATUS_NAMES.map((status) => (
              <div
                key={status}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDropOnColumn(status, e)}
                style={{ flex: '1 1 220px', minWidth: 220, background: theme.subtleBg, borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '100%', overflowY: 'auto' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 8px' }}>
                  <Badge label={status} hue={hueFor(status)} theme={theme} />
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
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 16, fontWeight: 800, color: theme.textPrimary }}
              />
              <button onClick={() => remove(selected.id)} style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '6px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                Delete
              </button>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Status</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STATUS_NAMES.map((s) => (
                  <div
                    key={s}
                    onClick={() => patch(selected.id, { status: s })}
                    style={{
                      padding: '5px 10px', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                      background: selected.status === s ? `oklch(0.93 0.06 ${hueFor(s)})` : theme.subtleBg,
                      color: selected.status === s ? `oklch(0.45 0.14 ${hueFor(s)})` : theme.textMuted,
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

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Project</div>
              <input
                value={selected.project || ''}
                onChange={(e) => patch(selected.id, { project: e.target.value })}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Due Date</div>
              <DateInput
                value={selected.due}
                onChange={(value) => patch(selected.id, { due: value })}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Waiting On</div>
              <input
                value={selected.waitingOn || ''}
                onChange={(e) => patch(selected.id, { waitingOn: e.target.value })}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
              />
            </div>

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

      {newIssueOpen && (
        <div
          onClick={() => setNewIssueOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 420, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
              borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 800 }}>New Issue</div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Title</div>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createIssue()}
                autoFocus
                placeholder="Issue title"
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Project</div>
                <input
                  value={newProject}
                  onChange={(e) => setNewProject(e.target.value)}
                  style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Due Date</div>
                <DateInput
                  value={newDue}
                  onChange={setNewDue}
                  style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Priority</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PRIORITIES.map((p) => {
                  const hue = PRIORITY_HUES[p];
                  const active = newPriority === p;
                  return (
                    <div
                      key={p}
                      onClick={() => setNewPriority(p)}
                      style={{
                        padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
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

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Status</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STATUS_NAMES.map((s) => {
                  const hue = hueFor(s);
                  const active = newStatus === s;
                  return (
                    <div
                      key={s}
                      onClick={() => setNewStatus(s)}
                      style={{
                        padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        background: active ? `oklch(0.93 0.06 ${hue})` : theme.subtleBg,
                        color: active ? `oklch(0.45 0.14 ${hue})` : theme.textMuted,
                      }}
                    >
                      {s}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Waiting On</div>
              <input
                value={newWaitingOn}
                onChange={(e) => setNewWaitingOn(e.target.value)}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Description</div>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: 8, fontSize: 12.5, lineHeight: 1.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Notes</div>
              <textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={3}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: 8, fontSize: 12.5, lineHeight: 1.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={() => setNewIssueOpen(false)}
                style={{ flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={createIssue}
                disabled={!newTitle.trim()}
                style={{
                  flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', opacity: newTitle.trim() ? 1 : 0.5,
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {statusConfigOpen && (
        <div
          onClick={() => setStatusConfigOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 420, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff',
              border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 800 }}>Manage statuses</div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: -10 }}>
              Renaming or removing a status updates any issues currently using it.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {statusDraft.map((s) => (
                <div key={s._key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    onClick={() => cycleDraftHue(s._key)}
                    title="Click to change color"
                    style={{ width: 22, height: 22, borderRadius: '50%', background: `oklch(0.6 0.19 ${s.hue})`, cursor: 'pointer', flexShrink: 0 }}
                  />
                  <input
                    value={s.name}
                    onChange={(e) => renameDraftStatus(s._key, e.target.value)}
                    style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
                  />
                  <span
                    onClick={() => removeDraftStatus(s._key)}
                    style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 18, padding: '2px 6px', flexShrink: 0 }}
                  >
                    &times;
                  </span>
                </div>
              ))}
            </div>

            <div
              onClick={addDraftStatus}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: `1px dashed ${theme.border}`, color: theme.textMuted, borderRadius: 8, padding: '8px 12px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}
            >
              <Icon name="plus" size={13} /> Add status
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={() => setStatusConfigOpen(false)}
                style={{ flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={saveStatusConfig}
                disabled={statusSaving || statusDraft.length === 0}
                style={{
                  flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', opacity: statusSaving || statusDraft.length === 0 ? 0.5 : 1,
                }}
              >
                {statusSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
