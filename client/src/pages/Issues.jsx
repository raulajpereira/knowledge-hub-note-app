import { Fragment, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useCounts } from '../context/CountsContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import ColorSelect from '../components/ColorSelect.jsx';
import ProjectSelect from '../components/ProjectSelect.jsx';
import TemplateMenu from '../components/TemplateMenu.jsx';
import SaveTemplateButton from '../components/SaveTemplateButton.jsx';
import DateInput from '../components/DateInput.jsx';
import LinkedItemsPanel from '../components/LinkedItemsPanel.jsx';
import ResizeHandle from '../components/ResizeHandle.jsx';
import { backdropClose } from '../lib/backdropClose.js';
import { useIsMobile } from '../lib/useIsMobile.js';
import { useColumnWidths } from '../lib/useColumnWidths.js';

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
  { key: 'title', labelKey: 'issues.colTitle', width: 220 },
  { key: 'status', labelKey: 'issues.colStatus', width: 130 },
  { key: 'priority', labelKey: 'issues.colPriority', width: 110 },
  { key: 'project', labelKey: 'issues.colProject', width: 140 },
  { key: 'due', labelKey: 'issues.colDue', width: 100 },
  { key: 'waitingOn', labelKey: 'issues.colWaitingOn', width: 160 },
  { key: 'description', labelKey: 'issues.colDescription', width: 220 },
  { key: 'notes', labelKey: 'issues.colNotes', width: 220 },
];
function Badge({ label, hue, theme, size = 'md' }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: size === 'sm' ? 10.5 : 11, fontWeight: 800,
        padding: size === 'sm' ? '3px 8px' : '4px 10px', borderRadius: 6,
        background: `oklch(0.90 0.11 ${hue})`, color: `oklch(0.32 0.17 ${hue})`,
        whiteSpace: 'nowrap', letterSpacing: '0.01em',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: `oklch(0.55 0.20 ${hue})`, flexShrink: 0 }} />
      {label}
    </span>
  );
}

function FieldLabel({ children, theme }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
      {children}
    </div>
  );
}

export default function Issues() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { user, updateUserSettings } = useAuth();
  const confirm = useConfirm();
  const { refresh: refreshCounts } = useCounts();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [issues, setIssues] = useState([]);
  const [view, setView] = useState('table');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [loading, setLoading] = useState(true);
  const { columns, resizeColumn, persistColumnWidths } = useColumnWidths('issues', DEFAULT_COLUMNS);
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
  const [reportOpen, setReportOpen] = useState(false);
  const [reportProject, setReportProject] = useState('');
  const [reportText, setReportText] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportCopied, setReportCopied] = useState(false);
  const [statusDraft, setStatusDraft] = useState([]);
  const [originalStatusNames, setOriginalStatusNames] = useState([]);
  const [statusSaving, setStatusSaving] = useState(false);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [waitingOnDraft, setWaitingOnDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [projectNames, setProjectNames] = useState([]);

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
    setStatusDraft((prev) => [...prev, { _key: `new-${Date.now()}`, originalName: null, name: t('issues.newStatus'), hue: HUE_PRESETS[prev.length % HUE_PRESETS.length] }]);
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

  useEffect(() => {
    api.listIssues().then(({ issues }) => {
      setIssues(issues);
      setLoading(false);
    });
    api.listProjects().then(({ projects }) => setProjectNames(projects.map((p) => p.name)));
  }, []);

  useEffect(() => {
    if (location.state?.issueId) setSelectedId(location.state.issueId);
  }, [location.state]);

  const filtered = useMemo(
    () => issues.filter((i) => !search.trim() || i.title.toLowerCase().includes(search.toLowerCase())),
    [issues, search]
  );

  const projectOptions = useMemo(
    () => [...new Set(issues.map((i) => i.project).filter(Boolean))].sort(),
    [issues]
  );

  const openReport = () => {
    setReportProject(projectOptions[0] || '');
    setReportText('');
    setReportError('');
    setReportCopied(false);
    setReportOpen(true);
  };

  const generateReport = async () => {
    setReportLoading(true);
    setReportError('');
    setReportText('');
    try {
      const { report } = await api.generateIssuesReport(reportProject);
      setReportText(report);
    } catch (err) {
      setReportError(err.message || t('issues.reportFailed'));
    } finally {
      setReportLoading(false);
    }
  };

  const copyReport = () => {
    navigator.clipboard.writeText(reportText);
    setReportCopied(true);
    setTimeout(() => setReportCopied(false), 1500);
  };

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortValue = (issue, key) => {
    if (key === 'priority') return PRIORITIES.indexOf(issue.priority);
    if (key === 'status') return STATUS_NAMES.indexOf(issue.status);
    return (issue[key] || '').toString().toLowerCase();
  };

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const arr = [...filtered].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir, statusConfig]);

  const selected = issues.find((i) => i.id === selectedId) || null;

  useEffect(() => {
    setTitleDraft(selected?.title ?? '');
    setWaitingOnDraft(selected?.waitingOn ?? '');
    setDescriptionDraft(selected?.description ?? '');
    setNotesDraft(selected?.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const patch = async (id, payload) => {
    const { issue, nextIssue } = await api.updateIssue(id, payload);
    setIssues((prev) => {
      const next = prev.map((i) => (i.id === id ? issue : i));
      return nextIssue ? [nextIssue, ...next] : next;
    });
    // Only these two fields feed the notification bell's overdue/due-soon
    // logic — skip the refresh on every other field so it doesn't run on
    // each keystroke while editing e.g. the project or notes text.
    if ('status' in payload || 'due' in payload) refreshCounts();
  };

  const commitTitle = async () => {
    if (!selected || titleDraft === selected.title) return;
    const { issue } = await api.updateIssue(selected.id, { title: titleDraft });
    setIssues((prev) => prev.map((i) => (i.id === issue.id ? issue : i)));
    setTitleDraft(issue.title);
  };

  // Text fields are edited via local draft state and only sent to the server
  // on blur — patching on every keystroke caused an async round-trip per
  // character, which reset the input's value (and cursor position) from the
  // server response mid-typing and scrambled fast input.
  const commitField = (field, value) => {
    if (!selected || value === (selected[field] || '')) return;
    patch(selected.id, { [field]: value });
  };

  const openNewIssue = (tpl) => {
    setNewTitle(tpl?.data.title || '');
    setNewProject(tpl?.data.project || '');
    setNewPriority(tpl?.data.priority || 'Medium');
    setNewStatus(STATUS_NAMES[0] || 'Open');
    setNewDue('');
    setNewWaitingOn(tpl?.data.waitingOn || '');
    setNewDescription(tpl?.data.description || '');
    setNewNotes(tpl?.data.notes || '');
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
    refreshCounts();
  };

  const remove = async (id) => {
    const ok = await confirm({ message: t('common.confirmDeleteMessage') });
    if (!ok) return;
    await api.deleteIssue(id);
    setIssues((prev) => prev.filter((i) => i.id !== id));
    if (selectedId === id) setSelectedId(null);
    refreshCounts();
  };

  const onDropOnColumn = async (status, e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/issue-id');
    if (id) await patch(id, { status });
  };

  const cardStyle = { background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer' };

  if (loading) return <div style={{ padding: 28, color: theme.textMuted }}>{t('common.loading')}</div>;

  const viewLabel = { table: t('issues.table'), kanban: t('issues.kanban') };

  return (
    <div style={{ padding: isMobile ? 14 : '24px 28px', flex: 1, display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{t('issues.title')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
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
                {viewLabel[v]}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '8px 12px' }}>
            <Icon name="search" size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('issues.filterPlaceholder')}
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: theme.textPrimary, width: isMobile ? 100 : 140 }}
            />
          </div>
          <button onClick={openStatusConfig} title={t('issues.configureStatuses')} style={{ display: 'flex', alignItems: 'center', background: theme.subtleBg, border: 'none', color: theme.textPrimary, borderRadius: 9, padding: '9px 10px', cursor: 'pointer' }}>
            <Icon name="settings" size={16} />
          </button>
          <button
            onClick={openReport}
            disabled={projectOptions.length === 0}
            title={t('issues.aiReport')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: theme.subtleBg, border: 'none', color: theme.textPrimary, borderRadius: 9, padding: '9px 12px', fontWeight: 700, fontSize: 12.5, cursor: projectOptions.length === 0 ? 'default' : 'pointer', opacity: projectOptions.length === 0 ? 0.5 : 1 }}
          >
            <Icon name="sparkle" size={14} color={theme.accentText} /> {t('issues.aiReport')}
          </button>
          <TemplateMenu entityType="issue" onUse={openNewIssue} />
          <button onClick={() => openNewIssue()} style={{ display: 'flex', alignItems: 'center', gap: 6, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <Icon name="plus" size={14} color="#fff" /> {t('issues.newIssue')}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 24 }}>
        {view === 'table' ? (
          <div style={{ flex: '1 1 640px', minWidth: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: 'auto' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: columns.map((c, i) => (i === columns.length - 1 ? `minmax(${c.width}px, 1fr)` : `${c.width}px`)).join(' '),
                gap: 0, minWidth: '100%',
              }}
            >
              {columns.map((col, i) => (
                <div
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  style={{ position: 'relative', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: `2px solid ${theme.border}`, background: theme.subtleBg, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}
                >
                  {t(col.labelKey)}
                  {sortKey === col.key && (
                    <span style={{ display: 'flex', opacity: 0.8, transform: sortDir === 'asc' ? 'rotate(-90deg)' : 'rotate(90deg)' }}>
                      <Icon name="chevron" size={9} strokeWidth={2.5} />
                    </span>
                  )}
                  <ResizeHandle onResize={(dx) => resizeColumn(i, dx)} onResizeEnd={persistColumnWidths} />
                </div>
              ))}
              {sorted.map((issue) => {
                const isSelected = selectedId === issue.id;
                const isHovered = hoveredId === issue.id;
                const rowBg = isSelected ? theme.accentSoftBg : isHovered ? theme.subtleBg : 'transparent';
                const cellStyle = { padding: 'var(--kh-row-py, 12px) 14px', fontSize: 12.5, color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: rowBg };
                return (
                  <Fragment key={issue.id}>
                    <div
                      onClick={() => setSelectedId(issue.id)}
                      onMouseEnter={() => setHoveredId(issue.id)}
                      onMouseLeave={() => setHoveredId((h) => (h === issue.id ? null : h))}
                      style={{ ...cellStyle, fontSize: 13.5, fontWeight: 700, color: theme.textPrimary, borderLeft: isSelected ? `3px solid ${theme.accent}` : '3px solid transparent' }}
                    >
                      {issue.title}
                    </div>
                    <div onClick={() => setSelectedId(issue.id)} onMouseEnter={() => setHoveredId(issue.id)} onMouseLeave={() => setHoveredId((h) => (h === issue.id ? null : h))} style={{ ...cellStyle, display: 'flex', alignItems: 'center' }}>
                      <Badge label={issue.status} hue={hueFor(issue.status)} theme={theme} />
                    </div>
                    <div onClick={() => setSelectedId(issue.id)} onMouseEnter={() => setHoveredId(issue.id)} onMouseLeave={() => setHoveredId((h) => (h === issue.id ? null : h))} style={{ ...cellStyle, display: 'flex', alignItems: 'center' }}>
                      <Badge label={issue.priority} hue={PRIORITY_HUES[issue.priority]} theme={theme} />
                    </div>
                    <div onClick={() => setSelectedId(issue.id)} onMouseEnter={() => setHoveredId(issue.id)} onMouseLeave={() => setHoveredId((h) => (h === issue.id ? null : h))} style={cellStyle}>
                      {issue.project || '—'}
                    </div>
                    <div onClick={() => setSelectedId(issue.id)} onMouseEnter={() => setHoveredId(issue.id)} onMouseLeave={() => setHoveredId((h) => (h === issue.id ? null : h))} style={cellStyle}>
                      {issue.due || '—'}
                    </div>
                    <div onClick={() => setSelectedId(issue.id)} onMouseEnter={() => setHoveredId(issue.id)} onMouseLeave={() => setHoveredId((h) => (h === issue.id ? null : h))} style={cellStyle}>
                      {issue.waitingOn || '—'}
                    </div>
                    <div onClick={() => setSelectedId(issue.id)} onMouseEnter={() => setHoveredId(issue.id)} onMouseLeave={() => setHoveredId((h) => (h === issue.id ? null : h))} style={cellStyle}>
                      {issue.description || '—'}
                    </div>
                    <div onClick={() => setSelectedId(issue.id)} onMouseEnter={() => setHoveredId(issue.id)} onMouseLeave={() => setHoveredId((h) => (h === issue.id ? null : h))} style={cellStyle}>
                      {issue.notes || '—'}
                    </div>
                  </Fragment>
                );
              })}
              {filtered.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: 20, fontSize: 13, color: theme.textMuted }}>{t('issues.noIssuesYet')}</div>
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
                      {issue.due && <div style={{ fontSize: 11, color: theme.textMuted }}>{t('common.due', { date: issue.due })}</div>}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}

      </div>

      {selected && (
        <div
          onMouseDown={backdropClose(() => setSelectedId(null))}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 560, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
              borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                style={{ flex: '1 1 140px', minWidth: 140, border: 'none', outline: 'none', background: 'transparent', fontSize: 17, fontWeight: 800, color: theme.textPrimary }}
              />
              <span onClick={() => patch(selected.id, { favorite: !selected.favorite })} style={{ display: 'flex', cursor: 'pointer', flexShrink: 0 }}>
                <Icon name="pin" size={16} color={selected.favorite ? theme.accentText : theme.textMuted} />
              </span>
              <button onClick={() => remove(selected.id)} style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '6px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                {t('common.delete')}
              </button>
              <span onClick={() => setSelectedId(null)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 20, padding: '0 2px', flexShrink: 0 }}>
                &times;
              </span>
            </div>

            <SaveTemplateButton
              entityType="issue"
              getData={() => ({ title: selected.title, project: selected.project, priority: selected.priority, waitingOn: selected.waitingOn, description: selected.description, notes: selected.notes })}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, background: theme.subtleBg, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <FieldLabel theme={theme}>{t('issues.status')}</FieldLabel>
                  <ColorSelect
                    value={selected.status}
                    options={STATUS_NAMES.map((s) => ({ value: s, label: s, hue: hueFor(s) }))}
                    onChange={(v) => patch(selected.id, { status: v })}
                    theme={theme}
                  />
                </div>
                <div>
                  <FieldLabel theme={theme}>{t('issues.priority')}</FieldLabel>
                  <ColorSelect
                    value={selected.priority}
                    options={PRIORITIES.map((p) => ({ value: p, label: p, hue: PRIORITY_HUES[p] }))}
                    onChange={(v) => patch(selected.id, { priority: v })}
                    theme={theme}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <FieldLabel theme={theme}>{t('issues.project')}</FieldLabel>
                  <ProjectSelect
                    key={selected.id}
                    value={selected.project}
                    projectNames={projectNames}
                    onCommit={(v) => patch(selected.id, { project: v })}
                    theme={theme}
                    t={t}
                    style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12.5, background: theme.cardBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <FieldLabel theme={theme}>{t('issues.dueDate')}</FieldLabel>
                  <DateInput
                    value={selected.due}
                    onChange={(value) => patch(selected.id, { due: value })}
                    style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12.5, background: theme.cardBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <FieldLabel theme={theme}>{t('issues.waitingOn')}</FieldLabel>
                  <input
                    value={waitingOnDraft}
                    onChange={(e) => setWaitingOnDraft(e.target.value)}
                    onBlur={() => commitField('waitingOn', waitingOnDraft)}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12.5, background: theme.cardBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <FieldLabel theme={theme}>{t('common.recurrence')}</FieldLabel>
                  <select
                    value={selected.recurrence || ''}
                    onChange={(e) => patch(selected.id, { recurrence: e.target.value || null })}
                    style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 12.5, background: theme.cardBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' }}
                  >
                    <option value="" style={{ color: '#1a1a1a', background: '#fff' }}>{t('common.recurrenceNone')}</option>
                    <option value="daily" style={{ color: '#1a1a1a', background: '#fff' }}>{t('common.recurrenceDaily')}</option>
                    <option value="weekly" style={{ color: '#1a1a1a', background: '#fff' }}>{t('common.recurrenceWeekly')}</option>
                    <option value="monthly" style={{ color: '#1a1a1a', background: '#fff' }}>{t('common.recurrenceMonthly')}</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <FieldLabel theme={theme}>{t('issues.description')}</FieldLabel>
              <textarea
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                onBlur={() => commitField('description', descriptionDraft)}
                rows={3}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: 8, fontSize: 12.5, lineHeight: 1.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <FieldLabel theme={theme}>{t('issues.notes')}</FieldLabel>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                onBlur={() => commitField('notes', notesDraft)}
                rows={3}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: 8, fontSize: 12.5, lineHeight: 1.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>

            <LinkedItemsPanel entityType="issue" entityId={selected.id} theme={theme} t={t} />
          </div>
        </div>
      )}

      {newIssueOpen && (
        <div
          onMouseDown={backdropClose(() => setNewIssueOpen(false))}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 520, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
              borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 800 }}>{t('issues.newIssueModalTitle')}</div>

            <div>
              <FieldLabel theme={theme}>{t('issues.colTitle')}</FieldLabel>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createIssue()}
                autoFocus
                placeholder={t('issues.titlePlaceholder')}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, background: theme.subtleBg, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <FieldLabel theme={theme}>{t('issues.project')}</FieldLabel>
                  <ProjectSelect
                    value={newProject}
                    projectNames={projectNames}
                    onCommit={setNewProject}
                    theme={theme}
                    t={t}
                    style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, background: theme.cardBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <FieldLabel theme={theme}>{t('issues.dueDate')}</FieldLabel>
                  <DateInput
                    value={newDue}
                    onChange={setNewDue}
                    style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, background: theme.cardBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <FieldLabel theme={theme}>{t('issues.priority')}</FieldLabel>
                  <ColorSelect
                    value={newPriority}
                    options={PRIORITIES.map((p) => ({ value: p, label: p, hue: PRIORITY_HUES[p] }))}
                    onChange={setNewPriority}
                    theme={theme}
                  />
                </div>
                <div>
                  <FieldLabel theme={theme}>{t('issues.status')}</FieldLabel>
                  <ColorSelect
                    value={newStatus}
                    options={STATUS_NAMES.map((s) => ({ value: s, label: s, hue: hueFor(s) }))}
                    onChange={setNewStatus}
                    theme={theme}
                  />
                </div>
              </div>

              <div>
                <FieldLabel theme={theme}>{t('issues.waitingOn')}</FieldLabel>
                <input
                  value={newWaitingOn}
                  onChange={(e) => setNewWaitingOn(e.target.value)}
                  style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, background: theme.cardBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div>
              <FieldLabel theme={theme}>{t('issues.description')}</FieldLabel>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: 8, fontSize: 12.5, lineHeight: 1.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <FieldLabel theme={theme}>{t('issues.notes')}</FieldLabel>
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
                {t('common.cancel')}
              </button>
              <button
                onClick={createIssue}
                disabled={!newTitle.trim()}
                style={{
                  flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', opacity: newTitle.trim() ? 1 : 0.5,
                }}
              >
                {t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {reportOpen && (
        <div
          onMouseDown={backdropClose(() => setReportOpen(false))}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 560, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff',
              border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 800 }}>{t('issues.aiReport')}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <select
                value={reportProject}
                onChange={(e) => setReportProject(e.target.value)}
                style={{ flex: 1, minWidth: 0, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
              >
                {projectOptions.map((p) => (
                  <option key={p} value={p} style={{ color: '#1a1a1a', background: '#fff' }}>{p}</option>
                ))}
              </select>
              <button
                onClick={generateReport}
                disabled={reportLoading}
                style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: reportLoading ? 0.6 : 1, flexShrink: 0 }}
              >
                {reportLoading ? t('issues.reportGenerating') : t('issues.reportGenerate')}
              </button>
            </div>
            {reportError && <div style={{ fontSize: 12.5, color: 'oklch(0.55 0.18 25)' }}>{reportError}</div>}
            {reportText && (
              <>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, background: theme.subtleBg, borderRadius: 10, padding: 14, maxHeight: 340, overflowY: 'auto' }}>
                  {reportText}
                </div>
                <button
                  onClick={copyReport}
                  style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
                >
                  <Icon name="copy" size={13} /> {reportCopied ? t('issues.reportCopied') : t('issues.reportCopy')}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {statusConfigOpen && (
        <div
          onMouseDown={backdropClose(() => setStatusConfigOpen(false))}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 420, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff',
              border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 800 }}>{t('issues.manageStatuses')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: -10 }}>
              {t('issues.manageStatusesDesc')}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {statusDraft.map((s) => (
                <div key={s._key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    onClick={() => cycleDraftHue(s._key)}
                    title={t('issues.changeColor')}
                    style={{ width: 22, height: 22, borderRadius: '50%', background: `oklch(0.6 0.19 ${s.hue})`, cursor: 'pointer', flexShrink: 0 }}
                  />
                  <input
                    value={s.name}
                    onChange={(e) => renameDraftStatus(s._key, e.target.value)}
                    style={{ flex: 1, minWidth: 0, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '7px 10px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
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
              <Icon name="plus" size={13} /> {t('issues.addStatus')}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={() => setStatusConfigOpen(false)}
                style={{ flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={saveStatusConfig}
                disabled={statusSaving || statusDraft.length === 0}
                style={{
                  flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', opacity: statusSaving || statusDraft.length === 0 ? 0.5 : 1,
                }}
              >
                {statusSaving ? t('issues.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
