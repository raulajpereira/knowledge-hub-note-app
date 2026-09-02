import { Fragment, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import TemplateMenu from '../components/TemplateMenu.jsx';
import SaveTemplateButton from '../components/SaveTemplateButton.jsx';
import PanelDivider from '../components/PanelDivider.jsx';
import { backdropClose } from '../lib/backdropClose.js';
import { useIsMobile } from '../lib/useIsMobile.js';
import { useResizablePanel } from '../lib/useResizablePanel.js';

const TOPIC_CATEGORIES = ['Decisão', 'Risco', 'Bloqueio', 'Follow-up'];
const TOPIC_STATUSES = ['Aberto', 'Em curso', 'Resolvido'];
const TASK_STATUSES = ['todo', 'in_progress', 'done'];
const TASK_PRIORITIES = ['Low', 'Medium', 'High'];
const CATEGORY_HUES = { 'Decisão': 250, 'Risco': 20, 'Bloqueio': 25, 'Follow-up': 190 };
const TOPIC_STATUS_HUES = { Aberto: 60, 'Em curso': 290, Resolvido: 145 };
const TASK_STATUS_HUES = { todo: 60, in_progress: 290, done: 145 };
const PRIORITY_HUES = { Low: 250, Medium: 60, High: 25 };
const PRIORITY_ORDER = { High: 0, Medium: 1, Low: 2 };
const TASK_FILTERS = [
  { key: 'active', labelKey: 'tasks.filterActive' },
  { key: 'done', labelKey: 'tasks.filterDone' },
  { key: 'all', labelKey: 'tasks.filterAll' },
];

function hueFromString(s) {
  let h = 0;
  for (const c of s || '') h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function projectHue(project) {
  if (!project) return 250;
  if (project.color && !Number.isNaN(Number(project.color))) return Number(project.color);
  return hueFromString(project.name);
}

function Badge({ label, hue, theme, onClick }) {
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, padding: '4px 10px',
        borderRadius: 6, background: `oklch(0.90 0.11 ${hue})`, color: `oklch(0.32 0.17 ${hue})`,
        whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : 'default',
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

function Pill({ label, hue, active, onClick, theme }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        background: active ? `oklch(0.90 0.11 ${hue})` : theme.cardBg,
        color: active ? `oklch(0.32 0.17 ${hue})` : theme.textMuted,
        border: `1px solid ${active ? `oklch(0.90 0.11 ${hue})` : theme.border}`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? `oklch(0.55 0.20 ${hue})` : theme.textMuted, opacity: active ? 1 : 0.5, flexShrink: 0 }} />
      {label}
    </div>
  );
}

function StatCard({ label, value, hue, theme }) {
  return (
    <div style={{ flex: '1 1 160px', background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: hue != null ? `oklch(0.55 0.19 ${hue})` : theme.textPrimary }}>{value}</div>
      <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + n, 1));
}
function monthLabel(ym, lang) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-US', { month: 'short', year: '2-digit' });
}

function selectStyle(theme) {
  return { border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, fontWeight: 600, background: theme.subtleBg, color: theme.textPrimary, width: '100%', boxSizing: 'border-box' };
}
function optionStyle() {
  return { color: '#1a1a1a', background: '#fff' };
}

export default function Management() {
  const { theme } = useTheme();
  const { t, lang } = useLanguage();
  const confirm = useConfirm();
  const isMobile = useIsMobile();
  const taskListPanel = useResizablePanel('management.tasks.list', 340, { min: 260, max: 560 });

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('dashboard');
  const [topics, setTopics] = useState([]);
  const [people, setPeople] = useState([]);
  const [mgmtTasks, setMgmtTasks] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [projects, setProjects] = useState([]);

  const [selectedPersonId, setSelectedPersonId] = useState(null);
  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [allocationFormOpen, setAllocationFormOpen] = useState(false);

  const [taskView, setTaskView] = useState('list');
  const [taskFilter, setTaskFilter] = useState('active');
  const [taskSortBy, setTaskSortBy] = useState('recent');
  const [taskSearch, setTaskSearch] = useState('');
  const [taskSelectMode, setTaskSelectMode] = useState(false);
  const [taskSelectedIds, setTaskSelectedIds] = useState(() => new Set());

  useEffect(() => {
    Promise.all([
      api.listManagementTopics(),
      api.listPeople(),
      api.listManagementTasks(),
      api.listAllocations(),
      api.listProjects(),
    ]).then(([t1, t2, t3, t4, t5]) => {
      setTopics(t1.topics);
      setPeople(t2.people);
      setMgmtTasks(t3.tasks);
      setAllocations(t4.allocations);
      setProjects(t5.projects);
      setLoading(false);
    });
  }, []);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const currentMonth = useMemo(() => monthKey(new Date()), []);
  const weekAhead = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }, []);

  const openTopicsCount = topics.filter((tp) => tp.status !== 'Resolvido').length;
  const dueSoonCount = useMemo(() => {
    const topicDue = topics.filter((tp) => tp.status !== 'Resolvido' && tp.due && tp.due >= today && tp.due <= weekAhead).length;
    const taskDue = mgmtTasks.filter((tk) => tk.status !== 'done' && tk.due && tk.due >= today && tk.due <= weekAhead).length;
    return topicDue + taskDue;
  }, [topics, mgmtTasks, today, weekAhead]);
  const overallocatedPeople = useMemo(() => {
    const byPerson = new Map();
    for (const a of allocations) {
      if (a.startMonth <= currentMonth && a.endMonth >= currentMonth) {
        byPerson.set(a.personId, (byPerson.get(a.personId) || 0) + a.percent);
      }
    }
    return [...byPerson.entries()].filter(([, pct]) => pct > 100);
  }, [allocations, currentMonth]);

  // ---- Topics -----------------------------------------------------------

  const selectedTopic = topics.find((tp) => tp.id === selectedTopicId) || null;

  const addTopic = async () => {
    const { topic } = await api.createManagementTopic({ title: t('management.untitledTopic') });
    setTopics((prev) => [topic, ...prev]);
    setSelectedTopicId(topic.id);
  };
  const patchTopic = async (id, payload) => {
    const { topic } = await api.updateManagementTopic(id, payload);
    setTopics((prev) => prev.map((tp) => (tp.id === id ? topic : tp)));
  };
  const removeTopic = async (id) => {
    const ok = await confirm({ message: t('common.confirmDeleteMessage') });
    if (!ok) return;
    await api.deleteManagementTopic(id);
    setTopics((prev) => prev.filter((tp) => tp.id !== id));
    setSelectedTopicId(null);
  };

  // ---- Management tasks --------------------------------------------------

  const selectedTask = mgmtTasks.find((tk) => tk.id === selectedTaskId) || null;

  const addMgmtTask = async () => {
    const { task } = await api.createManagementTask({ title: t('management.untitledTask') });
    setMgmtTasks((prev) => [task, ...prev]);
    setSelectedTaskId(task.id);
    setTaskView('list');
    setTaskFilter('active');
  };
  const addMgmtTaskFromTemplate = async (tpl) => {
    const { task } = await api.createManagementTask({
      title: tpl.data.title || tpl.name,
      priority: tpl.data.priority,
      notes: tpl.data.notes,
      ownerId: tpl.data.ownerId,
      projectId: tpl.data.projectId,
    });
    setMgmtTasks((prev) => [task, ...prev]);
    setSelectedTaskId(task.id);
    setTaskView('list');
    setTaskFilter('active');
  };
  const patchMgmtTask = async (id, payload) => {
    const { task } = await api.updateManagementTask(id, payload);
    setMgmtTasks((prev) => prev.map((tk) => (tk.id === id ? task : tk)));
  };
  const removeMgmtTask = async (id) => {
    const ok = await confirm({ message: t('common.confirmDeleteMessage') });
    if (!ok) return;
    await api.deleteManagementTask(id);
    setMgmtTasks((prev) => prev.filter((tk) => tk.id !== id));
    setSelectedTaskId(null);
  };

  const toggleTaskSelected = (id) => {
    setTaskSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearTaskSelection = () => {
    setTaskSelectedIds(new Set());
    setTaskSelectMode(false);
  };
  const bulkDeleteTasks = async () => {
    const ok = await confirm({ message: t('common.confirmDeleteMessage') });
    if (!ok) return;
    const ids = [...taskSelectedIds];
    await Promise.all(ids.map((id) => api.deleteManagementTask(id)));
    setMgmtTasks((prev) => prev.filter((tk) => !taskSelectedIds.has(tk.id)));
    if (selectedTaskId && taskSelectedIds.has(selectedTaskId)) setSelectedTaskId(null);
    clearTaskSelection();
  };
  const bulkMarkTasksDone = async () => {
    const ids = [...taskSelectedIds];
    const updated = await Promise.all(ids.map((id) => api.updateManagementTask(id, { status: 'done' })));
    const byId = new Map(updated.map(({ task }) => [task.id, task]));
    setMgmtTasks((prev) => prev.map((tk) => byId.get(tk.id) || tk));
    clearTaskSelection();
  };

  const filteredTasks = useMemo(() => {
    const list = mgmtTasks
      .filter((tk) => (taskFilter === 'active' ? tk.status !== 'done' : taskFilter === 'done' ? tk.status === 'done' : true))
      .filter((tk) => !taskSearch.trim() || tk.title.toLowerCase().includes(taskSearch.toLowerCase()));
    if (taskSortBy === 'priority') {
      return [...list].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    }
    return list;
  }, [mgmtTasks, taskFilter, taskSearch, taskSortBy]);

  useEffect(() => {
    if (tab === 'tasks' && taskView === 'list' && !isMobile && !selectedTaskId && filteredTasks.length > 0) {
      setSelectedTaskId(filteredTasks[0].id);
    }
  }, [tab, taskView, filteredTasks, selectedTaskId, isMobile]);

  // ---- People -------------------------------------------------------------

  const selectedPerson = people.find((p) => p.id === selectedPersonId) || null;

  const addPerson = async () => {
    const { person } = await api.createPerson({ name: t('management.untitledPerson') });
    setPeople((prev) => [...prev, person]);
    setSelectedPersonId(person.id);
  };
  const patchPerson = async (id, payload) => {
    const { person } = await api.updatePerson(id, payload);
    setPeople((prev) => prev.map((p) => (p.id === id ? person : p)));
  };
  const removePerson = async (id) => {
    const ok = await confirm({ message: t('common.confirmDeleteMessage') });
    if (!ok) return;
    await api.deletePerson(id);
    setPeople((prev) => prev.filter((p) => p.id !== id));
    setSelectedPersonId(null);
  };

  // ---- Allocations --------------------------------------------------------

  const addAllocation = async (payload) => {
    const { allocation } = await api.createAllocation(payload);
    setAllocations((prev) => [...prev, allocation]);
    setAllocationFormOpen(false);
  };
  const removeAllocation = async (id) => {
    const ok = await confirm({ message: t('common.confirmDeleteMessage') });
    if (!ok) return;
    await api.deleteAllocation(id);
    setAllocations((prev) => prev.filter((a) => a.id !== id));
  };

  const months = useMemo(() => {
    let start = addMonths(currentMonth, -2);
    let end = addMonths(currentMonth, 10);
    for (const a of allocations) {
      if (a.startMonth < start) start = a.startMonth;
      if (a.endMonth > end) end = a.endMonth;
    }
    const list = [];
    let cursor = start;
    let guard = 0;
    while (cursor <= end && guard < 36) {
      list.push(cursor);
      cursor = addMonths(cursor, 1);
      guard += 1;
    }
    return list;
  }, [allocations, currentMonth]);

  const fieldStyle = { width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, background: theme.cardBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' };
  const areaStyle = { ...fieldStyle, background: theme.subtleBg, resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' };
  const cardStyle = { background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer' };

  if (loading) return <div style={{ padding: 28, color: theme.textMuted }}>{t('common.loading')}</div>;

  const TABS = [
    { id: 'dashboard', label: t('management.tabDashboard') },
    { id: 'topics', label: t('management.tabTopics') },
    { id: 'people', label: t('management.tabPeople') },
    { id: 'allocations', label: t('management.tabAllocations') },
    { id: 'tasks', label: t('management.tabTasks') },
  ];

  return (
    <div style={{ padding: isMobile ? 14 : '24px 28px', flex: 1, display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0 }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{t('management.title')}</div>

      <div style={{ display: 'flex', gap: isMobile ? 18 : 28, borderBottom: `1px solid ${theme.border}`, overflowX: 'auto' }}>
        {TABS.map((tb) => (
          <div
            key={tb.id}
            onClick={() => setTab(tb.id)}
            style={{
              padding: '11px 2px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              color: tab === tb.id ? theme.textPrimary : theme.textMuted,
              borderBottom: `2px solid ${tab === tb.id ? theme.accent : 'transparent'}`,
            }}
          >
            {tb.label}
          </div>
        ))}
      </div>

      {tab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <StatCard label={t('management.statOpenTopics')} value={openTopicsCount} hue={60} theme={theme} />
            <StatCard label={t('management.statDueSoon')} value={dueSoonCount} hue={25} theme={theme} />
            <StatCard label={t('management.statOverallocated')} value={overallocatedPeople.length} hue={overallocatedPeople.length ? 25 : 145} theme={theme} />
            <StatCard label={t('management.statPeople')} value={people.length} hue={250} theme={theme} />
          </div>
          {overallocatedPeople.length > 0 && (
            <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <FieldLabel theme={theme}>{t('management.statOverallocated')}</FieldLabel>
              {overallocatedPeople.map(([personId, pct]) => {
                const person = people.find((p) => p.id === personId);
                return (
                  <div key={personId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{person?.name || '—'}</span>
                    <span style={{ fontWeight: 700, color: 'oklch(0.55 0.18 25)' }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'topics' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={addTopic} style={{ display: 'flex', alignItems: 'center', gap: 6, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              <Icon name="plus" size={15} color="#fff" /> {t('management.newTopic')}
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 14, overflowX: 'auto' }}>
            {TOPIC_STATUSES.map((status) => (
              <div
                key={status}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => patchTopic(e.dataTransfer.getData('text/topic-id'), { status })}
                style={{ flex: '1 1 240px', minWidth: 220, background: theme.subtleBg, borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '100%', overflowY: 'auto' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 8px' }}>
                  <Badge label={status} hue={TOPIC_STATUS_HUES[status]} theme={theme} />
                  <span style={{ fontSize: 11.5, color: theme.textMuted }}>{topics.filter((tp) => tp.status === status).length}</span>
                </div>
                {topics.filter((tp) => tp.status === status).map((topic) => (
                  <div key={topic.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/topic-id', topic.id)} onClick={() => setSelectedTopicId(topic.id)} style={cardStyle}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{topic.title}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Badge label={topic.category} hue={CATEGORY_HUES[topic.category]} theme={theme} />
                    </div>
                    {topic.owner && <div style={{ fontSize: 11, color: theme.textMuted }}>{topic.owner.name}</div>}
                    {topic.due && <div style={{ fontSize: 11, color: theme.textMuted }}>{t('common.due', { date: topic.due })}</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'people' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>
          <div style={{ flex: isMobile ? '1 1 auto' : '0 0 280px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={addPerson} title={t('management.newPerson')} style={{ display: 'flex', alignItems: 'center', background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 12px', cursor: 'pointer' }}>
                <Icon name="plus" size={16} color="#fff" />
              </button>
            </div>
            <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {people.length === 0 && <div style={{ padding: 14, fontSize: 13, color: theme.textMuted }}>{t('management.noPeopleYet')}</div>}
              {people.map((p) => (
                <div key={p.id} onClick={() => setSelectedPersonId(p.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', background: selectedPersonId === p.id ? theme.accentSoftBg : 'transparent', opacity: p.archived ? 0.5 : 1 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.role || t('management.noRole')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {selectedPerson ? (
              <PersonDetail
                key={selectedPerson.id}
                person={selectedPerson}
                theme={theme}
                t={t}
                fieldStyle={fieldStyle}
                areaStyle={areaStyle}
                onPatch={(payload) => patchPerson(selectedPerson.id, payload)}
                onRemove={() => removePerson(selectedPerson.id)}
              />
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>{t('management.selectPersonPrompt')}</div>
            )}
          </div>
        </div>
      )}

      {tab === 'allocations' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setAllocationFormOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              <Icon name="plus" size={15} color="#fff" /> {t('management.newAllocation')}
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `180px repeat(${months.length}, minmax(56px, 1fr))`, minWidth: 180 + months.length * 56 }}>
              <div style={{ position: 'sticky', left: 0, top: 0, zIndex: 2, background: theme.cardBg, borderBottom: `1px solid ${theme.border}`, borderRight: `1px solid ${theme.border}`, padding: 10, fontSize: 11, fontWeight: 700, color: theme.textMuted }}>
                {t('management.person')}
              </div>
              {months.map((m) => (
                <div key={m} style={{ position: 'sticky', top: 0, zIndex: 1, background: m === currentMonth ? theme.accentSoftBg : theme.cardBg, borderBottom: `1px solid ${theme.border}`, padding: 10, fontSize: 11, fontWeight: 700, color: theme.textMuted, textAlign: 'center' }}>
                  {monthLabel(m, lang)}
                </div>
              ))}

              {people.filter((p) => !p.archived).map((person) => (
                <Fragment key={person.id}>
                  <div style={{ position: 'sticky', left: 0, background: theme.cardBg, borderRight: `1px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}`, padding: 10, fontSize: 12.5, fontWeight: 700 }}>
                    {person.name}
                  </div>
                  {months.map((m) => {
                    const cellAllocs = allocations.filter((a) => a.personId === person.id && a.startMonth <= m && a.endMonth >= m);
                    return (
                      <div key={m} style={{ borderBottom: `1px solid ${theme.border}`, padding: 3, display: 'flex', flexDirection: 'column', gap: 2, minHeight: 34 }}>
                        {cellAllocs.map((a) => (
                          <div
                            key={a.id}
                            onClick={() => removeAllocation(a.id)}
                            title={`${a.project?.name || ''} · ${a.percent}%`}
                            style={{
                              background: `oklch(0.6 0.16 ${projectHue(a.project)} / 0.85)`, color: '#fff', borderRadius: 4,
                              fontSize: 9.5, fontWeight: 700, padding: '2px 4px', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}
                          >
                            {a.project?.name} {a.percent}%
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: theme.textMuted }}>{t('management.allocationHint')}</div>
        </div>
      )}

      {tab === 'tasks' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '9px 12px', flex: '1 1 220px', minWidth: 0, maxWidth: 340 }}>
              <span style={{ opacity: 0.5, display: 'flex' }}><Icon name="search" size={15} /></span>
              <input
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                placeholder={t('tasks.searchPlaceholder')}
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, flex: 1, minWidth: 0, color: theme.textPrimary }}
              />
            </div>
            {taskView === 'list' && (
              <button
                onClick={() => (taskSelectMode ? clearTaskSelection() : setTaskSelectMode(true))}
                title={t('tasks.selectMode')}
                style={{
                  display: 'flex', alignItems: 'center', background: taskSelectMode ? theme.accentSoftBg : 'transparent',
                  color: taskSelectMode ? theme.accentText : theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: 9, padding: '9px 12px', cursor: 'pointer', flexShrink: 0,
                }}
              >
                <Icon name="check" size={16} />
              </button>
            )}
            <TemplateMenu entityType="managementTask" onUse={addMgmtTaskFromTemplate} />
            <button onClick={addMgmtTask} title={t('management.newTask')} style={{ display: 'flex', alignItems: 'center', background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 12px', cursor: 'pointer', flexShrink: 0 }}>
              <Icon name="plus" size={16} color="#fff" />
            </button>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', background: theme.subtleBg, borderRadius: 9, padding: 3, gap: 3 }}>
              {[{ key: 'list', icon: 'doc' }, { key: 'board', icon: 'archive' }].map((v) => (
                <div
                  key={v.key}
                  onClick={() => setTaskView(v.key)}
                  title={t(`tasks.view${v.key === 'list' ? 'List' : 'Board'}`)}
                  style={{
                    padding: '7px 10px', borderRadius: 7, cursor: 'pointer', display: 'flex',
                    background: taskView === v.key ? theme.cardBg : 'transparent',
                    color: taskView === v.key ? theme.accentText : theme.textMuted,
                  }}
                >
                  <Icon name={v.icon} size={15} />
                </div>
              ))}
            </div>
          </div>

          {taskView === 'list' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {TASK_FILTERS.map((f) => (
                  <div
                    key={f.key}
                    onClick={() => setTaskFilter(f.key)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                      background: taskFilter === f.key ? theme.accentSoftBg : theme.subtleBg,
                      color: taskFilter === f.key ? theme.accentText : theme.textMuted,
                    }}
                  >
                    {t(f.labelKey)}
                  </div>
                ))}
              </div>
              <select
                value={taskSortBy}
                onChange={(e) => setTaskSortBy(e.target.value)}
                style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '6px 8px', fontSize: 12, fontWeight: 600, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', cursor: 'pointer' }}
              >
                <option value="recent" style={optionStyle()}>{t('tasks.sortBy')}: {t('tasks.sortRecent')}</option>
                <option value="priority" style={optionStyle()}>{t('tasks.sortBy')}: {t('tasks.sortPriority')}</option>
              </select>
            </div>
          )}

          {taskView === 'list' && taskSelectMode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: theme.accentSoftBg, borderRadius: 10, padding: '8px 10px' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: theme.accentText, marginRight: 4 }}>{t('tasks.selectedCount', { n: taskSelectedIds.size })}</span>
              <button onClick={bulkDeleteTasks} disabled={taskSelectedIds.size === 0} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: taskSelectedIds.size ? 'pointer' : 'default', opacity: taskSelectedIds.size ? 1 : 0.5 }}>
                {t('common.delete')}
              </button>
              <button onClick={bulkMarkTasksDone} disabled={taskSelectedIds.size === 0} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: taskSelectedIds.size ? 'pointer' : 'default', opacity: taskSelectedIds.size ? 1 : 0.5 }}>
                {t('tasks.markDone')}
              </button>
              <span onClick={clearTaskSelection} style={{ marginLeft: 'auto', cursor: 'pointer', color: theme.textMuted, fontSize: 12.5, fontWeight: 600 }}>{t('common.cancel')}</span>
            </div>
          )}

          {taskView === 'board' ? (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 14, overflowX: 'auto' }}>
              {TASK_STATUSES.map((status) => (
                <div
                  key={status}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => patchMgmtTask(e.dataTransfer.getData('text/task-id'), { status })}
                  style={{ flex: '1 1 240px', minWidth: 220, background: theme.subtleBg, borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '100%', overflowY: 'auto' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px 8px' }}>
                    <Badge label={t(`management.taskStatus.${status}`)} hue={TASK_STATUS_HUES[status]} theme={theme} />
                    <span style={{ fontSize: 11.5, color: theme.textMuted }}>
                      {mgmtTasks.filter((tk) => tk.status === status && (!taskSearch.trim() || tk.title.toLowerCase().includes(taskSearch.toLowerCase()))).length}
                    </span>
                  </div>
                  {mgmtTasks
                    .filter((tk) => tk.status === status && (!taskSearch.trim() || tk.title.toLowerCase().includes(taskSearch.toLowerCase())))
                    .map((mtask) => (
                      <div
                        key={mtask.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/task-id', mtask.id)}
                        onClick={() => { setSelectedTaskId(mtask.id); setTaskView('list'); }}
                        style={cardStyle}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{mtask.title}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <Badge label={mtask.priority} hue={PRIORITY_HUES[mtask.priority]} theme={theme} />
                        </div>
                        {mtask.owner && <div style={{ fontSize: 11, color: theme.textMuted }}>{mtask.owner.name}</div>}
                        {mtask.due && <div style={{ fontSize: 11, color: theme.textMuted }}>{t('common.due', { date: mtask.due })}</div>}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: isMobile ? 0 : 12 }}>
              {!(isMobile && selectedTaskId) && (
                <div style={{ flex: isMobile ? '1 1 auto' : `0 0 ${taskListPanel.width}px`, minWidth: isMobile ? 0 : 240, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
                    {filteredTasks.length === 0 && <div style={{ padding: 14, fontSize: 13, color: theme.textMuted }}>{t('tasks.noTasksHere')}</div>}
                    {filteredTasks.map((mtask) => {
                      const hue = PRIORITY_HUES[mtask.priority];
                      const isDone = mtask.status === 'done';
                      const active = taskSelectMode ? taskSelectedIds.has(mtask.id) : selectedTaskId === mtask.id;
                      return (
                        <div
                          key={mtask.id}
                          onClick={() => (taskSelectMode ? toggleTaskSelected(mtask.id) : setSelectedTaskId(mtask.id))}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', background: active ? theme.accentSoftBg : 'transparent' }}
                        >
                          {taskSelectMode ? (
                            <span style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${taskSelectedIds.has(mtask.id) ? theme.accent : theme.border}`, background: taskSelectedIds.has(mtask.id) ? theme.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {taskSelectedIds.has(mtask.id) && <Icon name="check" size={11} color="#fff" strokeWidth={3} />}
                            </span>
                          ) : (
                            <div
                              onClick={(e) => { e.stopPropagation(); patchMgmtTask(mtask.id, { status: isDone ? 'todo' : 'done' }); }}
                              style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${isDone ? theme.accent : theme.border}`, background: isDone ? theme.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                            >
                              {isDone && <Icon name="check" size={12} color="#fff" strokeWidth={2.5} />}
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.6 : 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {mtask.title}
                            </div>
                            <div style={{ fontSize: 11.5, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {mtask.owner?.name || t('management.none')}{mtask.due ? ` · ${t('common.due', { date: mtask.due })}` : ''}
                            </div>
                          </div>
                          <div style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, flexShrink: 0, background: `oklch(0.93 0.06 ${hue})`, color: `oklch(0.45 0.14 ${hue})` }}>
                            {mtask.priority}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!isMobile && <PanelDivider theme={theme} onResize={taskListPanel.onResize} onResizeEnd={taskListPanel.onResizeEnd} />}

              {(!isMobile || selectedTaskId) && (selectedTask ? (
                <TaskDetailPanel
                  key={selectedTask.id}
                  mtask={selectedTask}
                  people={people}
                  projects={projects}
                  topics={topics}
                  theme={theme}
                  t={t}
                  isMobile={isMobile}
                  fieldStyle={fieldStyle}
                  areaStyle={areaStyle}
                  onBack={() => setSelectedTaskId(null)}
                  onPatch={(payload) => patchMgmtTask(selectedTask.id, payload)}
                  onRemove={() => removeMgmtTask(selectedTask.id)}
                />
              ) : (
                <div style={{ flex: '1 1 420px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>{t('tasks.selectOrCreate')}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedTopic && (
        <TopicModal
          topic={selectedTopic}
          people={people}
          projects={projects}
          theme={theme}
          t={t}
          fieldStyle={fieldStyle}
          areaStyle={areaStyle}
          onClose={() => setSelectedTopicId(null)}
          onPatch={(payload) => patchTopic(selectedTopic.id, payload)}
          onRemove={() => removeTopic(selectedTopic.id)}
        />
      )}

      {allocationFormOpen && (
        <AllocationModal
          people={people}
          projects={projects}
          currentMonth={currentMonth}
          theme={theme}
          t={t}
          onClose={() => setAllocationFormOpen(false)}
          onCreate={addAllocation}
        />
      )}
    </div>
  );
}

function PersonDetail({ person, theme, t, fieldStyle, areaStyle, onPatch, onRemove }) {
  const [nameDraft, setNameDraft] = useState(person.name);
  const [roleDraft, setRoleDraft] = useState(person.role || '');
  const [emailDraft, setEmailDraft] = useState(person.email || '');
  const [phoneDraft, setPhoneDraft] = useState(person.phone || '');
  const [capacityDraft, setCapacityDraft] = useState(person.weeklyCapacityHours ?? '');
  const [notesDraft, setNotesDraft] = useState(person.notes || '');
  const [skillInput, setSkillInput] = useState('');
  const skills = Array.isArray(person.skills) ? person.skills : [];

  const commit = (field, value) => {
    if (value === (person[field] ?? '')) return;
    onPatch({ [field]: value });
  };

  const addSkill = () => {
    const v = skillInput.trim();
    if (!v) return;
    onPatch({ skills: [...skills, v] });
    setSkillInput('');
  };

  return (
    <div style={{ flex: 1, minHeight: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => commit('name', nameDraft)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 19, fontWeight: 800, color: theme.textPrimary }}
        />
        <span
          onClick={() => onPatch({ archived: !person.archived })}
          style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, cursor: 'pointer', border: `1px solid ${theme.border}`, borderRadius: 7, padding: '6px 10px' }}
        >
          {person.archived ? t('management.unarchive') : t('management.archive')}
        </span>
        <button onClick={onRemove} style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '7px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          {t('common.delete')}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <FieldLabel theme={theme}>{t('management.role')}</FieldLabel>
          <input value={roleDraft} onChange={(e) => setRoleDraft(e.target.value)} onBlur={() => commit('role', roleDraft)} style={fieldStyle} />
        </div>
        <div>
          <FieldLabel theme={theme}>{t('management.weeklyCapacity')}</FieldLabel>
          <input type="number" min="0" value={capacityDraft} onChange={(e) => setCapacityDraft(e.target.value)} onBlur={() => commit('weeklyCapacityHours', capacityDraft === '' ? null : Number(capacityDraft))} style={fieldStyle} />
        </div>
        <div>
          <FieldLabel theme={theme}>{t('management.email')}</FieldLabel>
          <input value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} onBlur={() => commit('email', emailDraft)} style={fieldStyle} />
        </div>
        <div>
          <FieldLabel theme={theme}>{t('management.phone')}</FieldLabel>
          <input value={phoneDraft} onChange={(e) => setPhoneDraft(e.target.value)} onBlur={() => commit('phone', phoneDraft)} style={fieldStyle} />
        </div>
      </div>

      <div>
        <FieldLabel theme={theme}>{t('management.skills')}</FieldLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '6px 8px', background: theme.subtleBg }}>
          {skills.map((s, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, background: theme.accent, color: '#fff', borderRadius: 20, padding: '3px 9px', fontSize: 11.5, fontWeight: 700 }}>
              {s}
              <span onClick={() => onPatch({ skills: skills.filter((_, si) => si !== i) })} style={{ cursor: 'pointer', opacity: 0.8 }}>×</span>
            </span>
          ))}
          <input
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
            placeholder={t('management.addSkillPlaceholder')}
            style={{ border: 'none', background: 'transparent', outline: 'none', color: theme.textPrimary, fontSize: 12.5, flex: 1, minWidth: 100 }}
          />
        </div>
      </div>

      <div>
        <FieldLabel theme={theme}>{t('projects.notes')}</FieldLabel>
        <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} onBlur={() => commit('notes', notesDraft)} rows={4} style={areaStyle} />
      </div>
    </div>
  );
}

function ModalShell({ onClose, children, width = 520 }) {
  return (
    <div onMouseDown={backdropClose(onClose)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

function modalCardStyle(theme) {
  return { background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' };
}

function TopicModal({ topic, people, projects, theme, t, fieldStyle, areaStyle, onClose, onPatch, onRemove }) {
  const [titleDraft, setTitleDraft] = useState(topic.title);
  const [notesDraft, setNotesDraft] = useState(topic.notes || '');

  return (
    <ModalShell onClose={onClose}>
      <div style={modalCardStyle(theme)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => titleDraft.trim() && titleDraft !== topic.title && onPatch({ title: titleDraft })}
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 17, fontWeight: 800, color: theme.textPrimary }}
          />
          <span onClick={onClose} style={{ cursor: 'pointer', opacity: 0.5, fontSize: 18, color: theme.textPrimary }}>×</span>
        </div>

        <div>
          <FieldLabel theme={theme}>{t('management.category')}</FieldLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TOPIC_CATEGORIES.map((c) => (
              <Pill key={c} label={c} hue={CATEGORY_HUES[c]} active={topic.category === c} onClick={() => onPatch({ category: c })} theme={theme} />
            ))}
          </div>
        </div>

        <div>
          <FieldLabel theme={theme}>{t('management.status')}</FieldLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TOPIC_STATUSES.map((s) => (
              <Pill key={s} label={s} hue={TOPIC_STATUS_HUES[s]} active={topic.status === s} onClick={() => onPatch({ status: s })} theme={theme} />
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <FieldLabel theme={theme}>{t('management.owner')}</FieldLabel>
            <select value={topic.ownerId || ''} onChange={(e) => onPatch({ ownerId: e.target.value || null })} style={selectStyle(theme)}>
              <option value="" style={optionStyle()}>{t('management.none')}</option>
              {people.map((p) => <option key={p.id} value={p.id} style={optionStyle()}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel theme={theme}>{t('management.project')}</FieldLabel>
            <select value={topic.projectId || ''} onChange={(e) => onPatch({ projectId: e.target.value || null })} style={selectStyle(theme)}>
              <option value="" style={optionStyle()}>{t('management.none')}</option>
              {projects.map((p) => <option key={p.id} value={p.id} style={optionStyle()}>{p.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <FieldLabel theme={theme}>{t('management.due')}</FieldLabel>
          <input type="date" value={topic.due || ''} onChange={(e) => onPatch({ due: e.target.value || null })} style={fieldStyle} />
        </div>

        <div>
          <FieldLabel theme={theme}>{t('projects.notes')}</FieldLabel>
          <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} onBlur={() => onPatch({ notes: notesDraft })} rows={3} style={areaStyle} />
        </div>

        <button onClick={onRemove} style={{ alignSelf: 'flex-start', background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '7px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          {t('common.delete')}
        </button>
      </div>
    </ModalShell>
  );
}

function TaskDetailPanel({ mtask, people, projects, topics, theme, t, isMobile, fieldStyle, areaStyle, onBack, onPatch, onRemove }) {
  const [titleDraft, setTitleDraft] = useState(mtask.title);
  const [notesDraft, setNotesDraft] = useState(mtask.notes || '');

  useEffect(() => {
    setTitleDraft(mtask.title);
    setNotesDraft(mtask.notes || '');
  }, [mtask.id]);

  const commitTitle = () => {
    if (titleDraft.trim() && titleDraft !== mtask.title) onPatch({ title: titleDraft });
  };
  const commitNotes = () => {
    if (notesDraft !== (mtask.notes || '')) onPatch({ notes: notesDraft });
  };

  return (
    <div style={{ flex: isMobile ? '1 1 auto' : '1 1 420px', minWidth: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        {isMobile && (
          <span onClick={onBack} style={{ display: 'flex', cursor: 'pointer', color: theme.textMuted, transform: 'rotate(180deg)', flexShrink: 0 }}>
            <Icon name="chevron" size={18} />
          </span>
        )}
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          style={{ flex: '1 1 160px', minWidth: 160, border: 'none', outline: 'none', background: 'transparent', fontSize: 18, fontWeight: 800, color: theme.textPrimary }}
        />
        <span onClick={() => onPatch({ favorite: !mtask.favorite })} style={{ display: 'flex', cursor: 'pointer', flexShrink: 0 }}>
          <Icon name="pin" size={17} color={mtask.favorite ? theme.accentText : theme.textMuted} />
        </span>
        <button onClick={onRemove} style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
          {t('common.delete')}
        </button>
      </div>

      <SaveTemplateButton
        entityType="managementTask"
        getData={() => ({ title: mtask.title, priority: mtask.priority, notes: mtask.notes, ownerId: mtask.ownerId, projectId: mtask.projectId })}
      />

      <button
        onClick={() => onPatch({ status: mtask.status === 'done' ? 'todo' : 'done' })}
        style={{ alignSelf: 'flex-start', background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
      >
        {mtask.status === 'done' ? t('tasks.markActive') : t('tasks.markDone')}
      </button>

      <div>
        <FieldLabel theme={theme}>{t('management.status')}</FieldLabel>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TASK_STATUSES.map((s) => (
            <Pill key={s} label={t(`management.taskStatus.${s}`)} hue={TASK_STATUS_HUES[s]} active={mtask.status === s} onClick={() => onPatch({ status: s })} theme={theme} />
          ))}
        </div>
      </div>

      <div>
        <FieldLabel theme={theme}>{t('management.priority')}</FieldLabel>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TASK_PRIORITIES.map((p) => (
            <Pill key={p} label={p} hue={PRIORITY_HUES[p]} active={mtask.priority === p} onClick={() => onPatch({ priority: p })} theme={theme} />
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <FieldLabel theme={theme}>{t('management.owner')}</FieldLabel>
          <select value={mtask.ownerId || ''} onChange={(e) => onPatch({ ownerId: e.target.value || null })} style={selectStyle(theme)}>
            <option value="" style={optionStyle()}>{t('management.none')}</option>
            {people.map((p) => <option key={p.id} value={p.id} style={optionStyle()}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel theme={theme}>{t('management.project')}</FieldLabel>
          <select value={mtask.projectId || ''} onChange={(e) => onPatch({ projectId: e.target.value || null })} style={selectStyle(theme)}>
            <option value="" style={optionStyle()}>{t('management.none')}</option>
            {projects.map((p) => <option key={p.id} value={p.id} style={optionStyle()}>{p.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <FieldLabel theme={theme}>{t('management.relatedTopic')}</FieldLabel>
          <select value={mtask.topicId || ''} onChange={(e) => onPatch({ topicId: e.target.value || null })} style={selectStyle(theme)}>
            <option value="" style={optionStyle()}>{t('management.none')}</option>
            {topics.map((tp) => <option key={tp.id} value={tp.id} style={optionStyle()}>{tp.title}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel theme={theme}>{t('management.due')}</FieldLabel>
          <input type="date" value={mtask.due || ''} onChange={(e) => onPatch({ due: e.target.value || null })} style={fieldStyle} />
        </div>
      </div>

      <div>
        <FieldLabel theme={theme}>{t('tasks.notes')}</FieldLabel>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={commitNotes}
          rows={7}
          placeholder={t('tasks.notesPlaceholder')}
          style={areaStyle}
        />
      </div>
    </div>
  );
}

function AllocationModal({ people, projects, currentMonth, theme, t, onClose, onCreate }) {
  const [personId, setPersonId] = useState(people[0]?.id || '');
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [startMonth, setStartMonth] = useState(currentMonth);
  const [endMonth, setEndMonth] = useState(currentMonth);
  const [percent, setPercent] = useState(100);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!personId || !projectId) {
      setError(t('management.allocationFormError'));
      return;
    }
    await onCreate({ personId, projectId, startMonth, endMonth, percent: Number(percent) });
  };

  return (
    <ModalShell onClose={onClose} width={440}>
      <div style={modalCardStyle(theme)}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{t('management.newAllocation')}</div>

        <div>
          <FieldLabel theme={theme}>{t('management.person')}</FieldLabel>
          <select value={personId} onChange={(e) => setPersonId(e.target.value)} style={selectStyle(theme)}>
            {people.length === 0 && <option value="" style={optionStyle()}>{t('management.noPeopleYet')}</option>}
            {people.map((p) => <option key={p.id} value={p.id} style={optionStyle()}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel theme={theme}>{t('management.project')}</FieldLabel>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={selectStyle(theme)}>
            {projects.length === 0 && <option value="" style={optionStyle()}>{t('management.noProjectsYet')}</option>}
            {projects.map((p) => <option key={p.id} value={p.id} style={optionStyle()}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <FieldLabel theme={theme}>{t('management.startMonth')}</FieldLabel>
            <input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} style={selectStyle(theme)} />
          </div>
          <div>
            <FieldLabel theme={theme}>{t('management.endMonth')}</FieldLabel>
            <input type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} style={selectStyle(theme)} />
          </div>
        </div>
        <div>
          <FieldLabel theme={theme}>{t('management.percent')}</FieldLabel>
          <input type="number" min="1" max="200" value={percent} onChange={(e) => setPercent(e.target.value)} style={selectStyle(theme)} />
        </div>
        {error && <div style={{ fontSize: 12, color: 'oklch(0.55 0.18 25)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {t('common.cancel')}
          </button>
          <button onClick={submit} disabled={!personId || !projectId} style={{ flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: personId && projectId ? 1 : 0.5 }}>
            {t('common.create')}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
