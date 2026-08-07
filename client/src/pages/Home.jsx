import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useCounts } from '../context/CountsContext.jsx';
import { useClickOutside } from '../lib/useClickOutside.js';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { resolveHomeLayout, HOME_BLOCK_LABEL_KEYS } from '../lib/homeBlocks.js';

const DEFAULT_ISSUE_STATUSES = [
  { name: 'Open', hue: 250 },
  { name: 'In Progress', hue: 290 },
  { name: 'Waiting', hue: 60 },
  { name: 'Done', hue: 145 },
];

function timeAgo(dateStr, t) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('common.justNow');
  if (mins < 60) return t('common.minsAgo', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('common.hoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  return t('common.daysAgo', { n: days });
}

const PRIORITY_HUES = { Low: 250, Medium: 60, High: 35, Critical: 20 };

function toKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const FAVORITE_ICONS = { note: 'doc', task: 'check', voice: 'mic', issue: 'archive', artifact: 'code', codeFolder: 'folder' };

function StatusDonut({ theme, segments }) {
  const size = 96;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let cumulativePct = 0;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={theme.subtleBg} strokeWidth={stroke} fill="none" />
      {segments.map((s, i) => {
        if (s.pct <= 0) return null;
        const dash = (s.pct / 100) * c;
        const rotation = (cumulativePct / 100) * 360;
        cumulativePct += s.pct;
        return (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            stroke={s.color}
            strokeDasharray={`${dash} ${c - dash}`}
            style={{ transform: `rotate(${rotation}deg)`, transformOrigin: '50% 50%' }}
          />
        );
      })}
    </svg>
  );
}

function DiskDonut({ theme, pct }) {
  const size = 96;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={theme.subtleBg} strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
        stroke={pct > 85 ? 'oklch(0.6 0.18 30)' : theme.accent}
        strokeDasharray={c} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.4s' }}
      />
    </svg>
  );
}

export default function Home() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { refresh: refreshCounts } = useCounts();
  const { user, updateUserSettings } = useAuth();
  const [notes, setNotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [voiceNotes, setVoiceNotes] = useState([]);
  const [issues, setIssues] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [codeFolders, setCodeFolders] = useState([]);
  const [sapNews, setSapNews] = useState([]);
  const [resurfacedItems, setResurfacedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vpsDisk, setVpsDisk] = useState(null);
  const [columns, setColumns] = useState(() => resolveHomeLayout(null));
  const [draggedBlock, setDraggedBlock] = useState(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef(null);
  useClickOutside(addMenuRef, () => setAddMenuOpen(false), addMenuOpen);

  useEffect(() => {
    setColumns(resolveHomeLayout(user?.settings?.homeLayout));
  }, [user?.settings?.homeLayout]);

  // Blocks can be dragged into either column and to any position — not just
  // reordered within their starting column — so the user can split them
  // however they like (e.g. 3 left / 4 right instead of a fixed 3/5).
  const moveBlock = (key, toColumn, toIndex) => {
    setColumns((prev) => {
      const fromColumn = prev.left.includes(key) ? 'left' : 'right';
      const fromList = prev[fromColumn];
      const fromIndex = fromList.indexOf(key);
      if (fromIndex === -1) return prev;

      if (fromColumn === toColumn) {
        const clamped = Math.max(0, Math.min(toIndex, fromList.length - 1));
        if (clamped === fromIndex) return prev;
        const next = [...fromList];
        next.splice(fromIndex, 1);
        next.splice(clamped, 0, key);
        return { ...prev, [toColumn]: next };
      }

      const nextFrom = [...fromList];
      nextFrom.splice(fromIndex, 1);
      const nextTo = [...prev[toColumn]];
      const clamped = Math.max(0, Math.min(toIndex, nextTo.length));
      nextTo.splice(clamped, 0, key);
      return { ...prev, [fromColumn]: nextFrom, [toColumn]: nextTo };
    });
  };

  const onBlockDragOver = (e, colKey, index) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedBlock) return;
    moveBlock(draggedBlock, colKey, index);
  };

  const onColumnDragOver = (e, colKey) => {
    e.preventDefault();
    if (!draggedBlock) return;
    moveBlock(draggedBlock, colKey, Number.MAX_SAFE_INTEGER);
  };

  const onBlockDrop = async () => {
    if (!draggedBlock) return;
    setDraggedBlock(null);
    const { settings } = await api.updateSettings({ homeLayout: columns });
    updateUserSettings(settings);
  };

  const removeBlock = async (key) => {
    const fromColumn = columns.left.includes(key) ? 'left' : 'right';
    const next = { ...columns, [fromColumn]: columns[fromColumn].filter((k) => k !== key), hidden: [...columns.hidden, key] };
    setColumns(next);
    const { settings } = await api.updateSettings({ homeLayout: next });
    updateUserSettings(settings);
  };

  const addBlock = async (key) => {
    const next = { ...columns, left: [...columns.left, key], hidden: columns.hidden.filter((k) => k !== key) };
    setColumns(next);
    setAddMenuOpen(false);
    const { settings } = await api.updateSettings({ homeLayout: next });
    updateUserSettings(settings);
  };

  useEffect(() => {
    if (!user?.hostingerConnected) return;
    api.getVpsStatus().then((data) => setVpsDisk(data.disk)).catch(() => setVpsDisk(null));
  }, [user?.hostingerConnected]);

  const loadTasks = () => api.listTasks().then(({ tasks }) => setTasks(tasks));

  useEffect(() => {
    Promise.all([
      api.listNotes(),
      loadTasks(),
      api.listVoiceNotes(),
      api.listIssues(),
      api.listArtifacts(),
      api.listCodeFolders(),
      api.getSapNews(),
    ])
      .then(([{ notes }, , { voiceNotes }, { issues }, { artifacts }, { folders }, { items }]) => {
        setNotes(notes);
        setVoiceNotes(voiceNotes);
        setIssues(issues);
        setArtifacts(artifacts);
        setCodeFolders(folders);
        setSapNews(items);
      })
      .finally(() => setLoading(false));
    api.getResurfacedItems().then(({ items }) => setResurfacedItems(items)).catch(() => setResurfacedItems([]));
  }, []);

  const favorites = [
    ...notes.filter((n) => n.pinned).map((n) => ({ id: n.id, type: 'note', title: n.title })),
    ...tasks.filter((x) => x.favorite).map((x) => ({ id: x.id, type: 'task', title: x.title })),
    ...voiceNotes.filter((v) => v.favorite).map((v) => ({ id: v.id, type: 'voice', title: v.title })),
    ...issues.filter((i) => i.favorite).map((i) => ({ id: i.id, type: 'issue', title: i.title })),
    ...artifacts.filter((a) => a.favorite).map((a) => ({ id: a.id, type: 'artifact', title: a.title })),
    ...codeFolders.filter((f) => f.favorite).map((f) => ({ id: f.id, type: 'codeFolder', title: f.name })),
  ];

  const goToFavorite = (fav) => {
    const routes = {
      note: ['/notes', { noteId: fav.id }],
      task: ['/tasks', { taskId: fav.id }],
      voice: ['/voice', { voiceId: fav.id }],
      issue: ['/issues', { issueId: fav.id }],
      artifact: ['/artifacts', { artifactId: fav.id }],
      codeFolder: ['/code-library', { folderId: fav.id }],
    };
    const [path, state] = routes[fav.type];
    navigate(path, { state });
  };

  const statusConfig = user?.settings?.issueStatuses?.length ? user.settings.issueStatuses : DEFAULT_ISSUE_STATUSES;
  const issueStatusBreakdown = statusConfig
    .map((s) => {
      const count = issues.filter((i) => i.status === s.name).length;
      return { name: s.name, hue: s.hue, count, pct: issues.length ? Math.round((count / issues.length) * 1000) / 10 : 0 };
    })
    .filter((s) => s.count > 0);

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const notesThisWeek = notes.filter((n) => new Date(n.createdAt) >= weekAgo).length;
  const tasksCompletedThisWeek = tasks.filter((x) => x.done && new Date(x.updatedAt) >= weekAgo).length;

  const todayKey = toKey(new Date());
  const in7Key = toKey(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const agenda = [
    ...tasks.filter((x) => x.due && !x.done).map((x) => ({ id: x.id, type: 'task', title: x.title, due: x.due })),
    ...issues.filter((i) => i.due).map((i) => ({ id: i.id, type: 'issue', title: i.title, due: i.due })),
  ]
    .filter((item) => item.due >= todayKey && item.due <= in7Key)
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 6);

  const toggleTaskDone = async (e, task) => {
    e.stopPropagation();
    const { task: updated } = await api.updateTask(task.id, { done: !task.done });
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const createAndGo = async () => {
    await api.createNote({ title: 'Untitled note', content: '' });
    refreshCounts();
    navigate('/notes');
  };

  const quickCaptureItems = [
    {
      title: t('home.newNoteTitle'),
      desc: t('home.newNoteDesc'),
      icon: <Icon name="plus" size={18} color="#fff" strokeWidth={2.2} />,
      onClick: createAndGo,
      gradient: true,
    },
    {
      title: t('home.newTaskTitle'),
      desc: t('home.newTaskDesc'),
      icon: <Icon name="check" size={18} color={theme.accent} />,
      onClick: () => navigate('/tasks'),
      gradient: false,
    },
    {
      title: t('home.voiceNoteTitle'),
      desc: t('home.voiceNoteDesc'),
      icon: <Icon name="mic" size={18} color={theme.accent} />,
      onClick: () => navigate('/voice'),
      gradient: false,
    },
    {
      title: t('home.sapMeTitle'),
      desc: t('home.sapMeDesc'),
      icon: <Icon name="external" size={18} color={theme.accent} />,
      onClick: () => window.open('https://me.sap.com', '_blank', 'noopener,noreferrer'),
      gradient: false,
    },
  ];

  // Issues in the terminal status (last column of the user's configured
  // workflow, e.g. "Done") count as resolved, same as a checked-off task.
  const terminalIssueStatus = statusConfig[statusConfig.length - 1]?.name;
  const openTasksAndIssues = [
    ...tasks.filter((tk) => !tk.done).map((tk) => ({ id: tk.id, kind: 'task', title: tk.title, project: tk.project, due: tk.due, priority: tk.priority, raw: tk })),
    ...issues.filter((is) => is.status !== terminalIssueStatus).map((is) => ({ id: is.id, kind: 'issue', title: is.title, project: is.project, due: is.due, priority: is.priority, raw: is })),
  ].sort((a, b) => {
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return 0;
  });

  // The 3 most recently touched still-open items across Notes/Tasks/Issues —
  // "pick up where I left off" instead of re-finding it via search or a list.
  // Dismissing an item only hides it from this block (Settings.continueDismissed
  // records the item's updatedAt at dismiss time); it reappears here if the
  // item gets touched again afterwards, and never affects the item elsewhere.
  const continueDismissed = user?.settings?.continueDismissed || {};
  const continueItems = [
    ...notes.map((n) => ({ id: n.id, kind: 'note', title: n.title, updatedAt: n.updatedAt })),
    ...tasks.filter((tk) => !tk.done).map((tk) => ({ id: tk.id, kind: 'task', title: tk.title, updatedAt: tk.updatedAt, raw: tk })),
    ...issues.filter((is) => is.status !== terminalIssueStatus).map((is) => ({ id: is.id, kind: 'issue', title: is.title, updatedAt: is.updatedAt, raw: is })),
  ]
    .filter((item) => {
      const dismissedAt = continueDismissed[`${item.kind}:${item.id}`];
      return !dismissedAt || new Date(item.updatedAt) > new Date(dismissedAt);
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 3);

  const openContinueItem = (item) => {
    if (item.kind === 'note') navigate('/notes', { state: { noteId: item.id } });
    else if (item.kind === 'task') navigate('/tasks', { state: { taskId: item.id } });
    else navigate('/issues', { state: { issueId: item.id } });
  };

  const dismissContinueItem = async (e, item) => {
    e.stopPropagation();
    const next = { ...continueDismissed, [`${item.kind}:${item.id}`]: item.updatedAt };
    const { settings } = await api.updateSettings({ continueDismissed: next });
    updateUserSettings(settings);
  };

  const blockContent = {
    quickCapture: (
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{t('home.quickCapture')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
          {quickCaptureItems.map((qc) => (
            <div
              key={qc.title}
              onClick={qc.onClick}
              style={{
                position: 'relative',
                overflow: 'hidden',
                background: qc.gradient ? `linear-gradient(135deg, ${theme.accent}, ${theme.accentDark})` : theme.cardBg,
                border: qc.gradient ? 'none' : `1px solid ${theme.border}`,
                borderRadius: 14,
                padding: 18,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {qc.gradient && (
                <>
                  <div style={{ position: 'absolute', width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.16)', top: -50, right: -30, pointerEvents: 'none' }} />
                  <div style={{ position: 'absolute', width: 70, height: 70, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', bottom: -30, right: 20, pointerEvents: 'none' }} />
                </>
              )}
              <div
                style={{
                  position: 'relative', zIndex: 1, width: 34, height: 34, borderRadius: 9,
                  background: qc.gradient ? 'rgba(255,255,255,0.2)' : theme.accentSoftBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {qc.icon}
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, color: qc.gradient ? '#fff' : theme.textPrimary }}>{qc.title}</div>
              <div style={{ fontSize: 12.5, color: qc.gradient ? 'rgba(255,255,255,0.85)' : theme.textMuted, lineHeight: 1.4 }}>
                {qc.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),

    continueWorking: (
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{t('home.continueWorking')}</div>
        <div style={{ background: theme.cardBg, borderRadius: 14, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
          {loading && <div style={{ padding: 18, fontSize: 13, color: theme.textMuted }}>{t('common.loading')}</div>}
          {!loading && continueItems.length === 0 && (
            <div style={{ padding: 18, fontSize: 13, color: theme.textMuted }}>{t('home.continueWorkingEmpty')}</div>
          )}
          {continueItems.map((item, i) => (
            <div
              key={`${item.kind}-${item.id}`}
              onClick={() => openContinueItem(item)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', cursor: 'pointer',
                borderBottom: i === continueItems.length - 1 ? 'none' : `1px solid ${theme.border}`,
              }}
            >
              <div style={{ width: 26, height: 26, borderRadius: 8, background: theme.accentSoftBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={item.kind === 'note' ? 'doc' : item.kind === 'task' ? 'check' : 'archive'} size={13} color={theme.accentText} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                <div style={{ fontSize: 11, color: theme.textMuted, textTransform: 'capitalize' }}>{t(`home.continueKind${item.kind[0].toUpperCase()}${item.kind.slice(1)}`)}</div>
              </div>
              <span
                onClick={(e) => dismissContinueItem(e, item)}
                title={t('home.continueFinish')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%',
                  flexShrink: 0, color: theme.textMuted, border: `1.5px solid ${theme.border}`,
                }}
              >
                <Icon name="check" size={12} />
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: theme.accentText, flexShrink: 0 }}>{t('home.continueGo')}</span>
            </div>
          ))}
        </div>
      </div>
    ),

    myTasks: (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingRight: 22 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{t('home.myTasks')}</div>
          <a onClick={() => navigate('/tasks')} style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', color: theme.accentText }}>
            {t('home.seeAll')}
          </a>
        </div>
        <div style={{ background: theme.cardBg, borderRadius: 14, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
          {loading && <div style={{ padding: 18, fontSize: 13, color: theme.textMuted }}>{t('common.loading')}</div>}
          {!loading && openTasksAndIssues.length === 0 && (
            <div style={{ padding: 18, fontSize: 13, color: theme.textMuted }}>{t('home.noOpenTasks')}</div>
          )}
          {openTasksAndIssues
            .slice(0, 8)
            .map((item) => {
              const hue = PRIORITY_HUES[item.priority];
              return (
                <div
                  key={`${item.kind}-${item.id}`}
                  onClick={() =>
                    item.kind === 'task'
                      ? navigate('/tasks', { state: { taskId: item.id } })
                      : navigate('/issues', { state: { issueId: item.id } })
                  }
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }}
                >
                  {item.kind === 'task' ? (
                    <div
                      onClick={(e) => toggleTaskDone(e, item.raw)}
                      style={{
                        width: 19, height: 19, borderRadius: 6, border: `1.5px solid ${theme.border}`, background: 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div style={{ width: 19, height: 19, borderRadius: 6, background: theme.accentSoftBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name="archive" size={11} color={theme.accentText} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                    <div style={{ fontSize: 11.5, color: theme.textMuted }}>
                      {item.project || t('common.noProject')}
                      {item.due ? ` · ${t('common.due', { date: item.due })}` : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 6, flexShrink: 0, background: `oklch(0.93 0.06 ${hue})`, color: `oklch(0.45 0.14 ${hue})` }}>
                    {item.priority}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    ),

    issuesByStatus: (
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{t('home.issuesByStatus')}</div>
        <div style={{ background: theme.cardBg, borderRadius: 14, border: `1px solid ${theme.border}`, padding: 18 }}>
          {!loading && issues.length === 0 && (
            <div style={{ fontSize: 12.5, color: theme.textMuted, textAlign: 'center', padding: '6px 4px' }}>{t('home.noIssuesYet')}</div>
          )}
          {issues.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <StatusDonut theme={theme} segments={issueStatusBreakdown.map((s) => ({ pct: s.pct, color: `oklch(0.6 0.19 ${s.hue})` }))} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 0 }}>
                {issueStatusBreakdown.map((s) => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: `oklch(0.6 0.19 ${s.hue})`, flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                    <span style={{ fontSize: 12, color: theme.textMuted, flexShrink: 0 }}>{s.count} · {s.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    ),

    recentNotes: (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingRight: 22 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{t('home.recentNotes')}</div>
          <a onClick={() => navigate('/notes')} style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', color: theme.accentText }}>
            {t('home.seeAll')}
          </a>
        </div>
        <div style={{ background: theme.cardBg, borderRadius: 14, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
          {loading && <div style={{ padding: 18, fontSize: 13, color: theme.textMuted }}>{t('common.loading')}</div>}
          {!loading && notes.length === 0 && (
            <div style={{ padding: 18, fontSize: 13, color: theme.textMuted }}>{t('home.noNotesYet')}</div>
          )}
          {notes.slice(0, 4).map((note) => (
            <div
              key={note.id}
              onClick={() => navigate('/notes')}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 9, background: theme.accentSoftBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="doc" size={16} color={theme.accentText} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{note.title}</div>
                <div style={{ fontSize: 12.5, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {note.content?.slice(0, 80) || t('common.noAdditionalText')}
                </div>
              </div>
              {note.pinned && <Icon name="pin" size={14} color={theme.accentText} />}
              <div style={{ fontSize: 12.5, color: theme.textMuted, width: 70, textAlign: 'right', flexShrink: 0 }}>
                {timeAgo(note.updatedAt, t)}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),

    favorites: (
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{t('home.favorites')}</div>
        <div style={{ background: theme.cardBg, borderRadius: 14, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
          {!loading && favorites.length === 0 && (
            <div style={{ padding: 18, fontSize: 13, color: theme.textMuted }}>{t('home.noFavoritesYet')}</div>
          )}
          {favorites.slice(0, 8).map((fav) => (
            <div
              key={`${fav.type}-${fav.id}`}
              onClick={() => goToFavorite(fav)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 8, background: theme.accentSoftBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={FAVORITE_ICONS[fav.type]} size={14} color={theme.accentText} />
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fav.title}</div>
            </div>
          ))}
        </div>
      </div>
    ),

    resurfacing: (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Icon name="sparkle" size={14} color={theme.accentText} />
          <div style={{ fontSize: 16, fontWeight: 700 }}>{t('home.resurfacing')}</div>
        </div>
        <div style={{ background: theme.cardBg, borderRadius: 14, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
          {!loading && resurfacedItems.length === 0 && (
            <div style={{ padding: 18, fontSize: 13, color: theme.textMuted }}>{t('home.resurfacingEmpty')}</div>
          )}
          {resurfacedItems.map((item) => (
            <div
              key={`${item.type}-${item.id}`}
              onClick={() => goToFavorite(item)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 8, background: theme.accentSoftBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={FAVORITE_ICONS[item.type] || 'doc'} size={14} color={theme.accentText} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                <div style={{ fontSize: 12, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.snippet}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),

    weeklySummary: (
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{t('home.weeklySummary')}</div>
        <div style={{ background: theme.cardBg, borderRadius: 14, border: `1px solid ${theme.border}`, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, textAlign: 'center', background: theme.subtleBg, borderRadius: 10, padding: '12px 8px' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: theme.accentText }}>{notesThisWeek}</div>
              <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 2 }}>{t('home.notesCreatedThisWeek', { n: notesThisWeek })}</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', background: theme.subtleBg, borderRadius: 10, padding: '12px 8px' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: theme.accentText }}>{tasksCompletedThisWeek}</div>
              <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 2 }}>{t('home.tasksCompletedThisWeek', { n: tasksCompletedThisWeek })}</div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              {t('home.upcomingAgenda')}
            </div>
            {agenda.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('home.noUpcoming')}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {agenda.map((item) => (
                <div
                  key={`${item.type}-${item.id}`}
                  onClick={() => navigate(item.type === 'task' ? '/tasks' : '/issues', { state: item.type === 'task' ? { taskId: item.id } : { issueId: item.id } })}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                >
                  <Icon name={item.type === 'task' ? 'check' : 'archive'} size={13} color={theme.textMuted} />
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                  <div style={{ fontSize: 11.5, color: theme.textMuted, flexShrink: 0 }}>{item.due}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),

    sapNewsTeaser: (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingRight: 22 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{t('home.sapNewsTeaser')}</div>
          <a onClick={() => navigate('/sap-news')} style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', color: theme.accentText }}>
            {t('home.seeAll')}
          </a>
        </div>
        <div style={{ background: theme.cardBg, borderRadius: 14, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
          {!loading && sapNews.length === 0 && (
            <div style={{ padding: 18, fontSize: 13, color: theme.textMuted }}>{t('home.noSapNewsYet')}</div>
          )}
          {sapNews.slice(0, 3).map((item) => (
            <div
              key={item.id}
              onClick={() => navigate('/sap-news', { state: { newsId: item.id } })}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 8, background: theme.accentSoftBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="news" size={14} color={theme.accentText} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                <div style={{ fontSize: 11.5, color: theme.textMuted }}>{item.source}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),

    vpsDiskUsage: (
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{t('home.vpsDiskUsage')}</div>
        <div style={{ background: theme.cardBg, borderRadius: 14, border: `1px solid ${theme.border}`, padding: 18 }}>
          {!user?.hostingerConnected && (
            <div style={{ fontSize: 12.5, color: theme.textMuted, textAlign: 'center', padding: '6px 4px' }}>
              {t('home.vpsDiskUsageNotConnected')}
            </div>
          )}
          {user?.hostingerConnected && vpsDisk?.usedPct != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
                <DiskDonut theme={theme} pct={vpsDisk.usedPct} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 19, fontWeight: 800 }}>{vpsDisk.usedPct}%</div>
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.5 }}>
                {t('home.vpsDiskUsageOf', { used: (vpsDisk.usedMb / 1024).toFixed(1), total: (vpsDisk.totalMb / 1024).toFixed(1) })}
              </div>
            </div>
          )}
          {user?.hostingerConnected && vpsDisk && vpsDisk.usedPct == null && (
            <div style={{ fontSize: 12.5, color: theme.textMuted, textAlign: 'center', padding: '6px 4px' }}>{t('settings.vpsNoData')}</div>
          )}
        </div>
      </div>
    ),

    tagsHeatmap: (() => {
      const WEEKS = 10;
      const startOfWeek = (d) => {
        const x = new Date(d);
        const day = (x.getDay() + 6) % 7; // Monday = 0
        x.setHours(0, 0, 0, 0);
        x.setDate(x.getDate() - day);
        return x.getTime();
      };
      const thisWeekStart = startOfWeek(new Date());
      const weekStarts = Array.from({ length: WEEKS }, (_, i) => thisWeekStart - (WEEKS - 1 - i) * 7 * 86400000);

      const counts = {}; // tag -> weekIndex -> count
      const totals = {}; // tag -> total
      for (const note of notes) {
        if (!note.tags?.length || !note.createdAt) continue;
        const ws = startOfWeek(new Date(note.createdAt));
        const idx = weekStarts.indexOf(ws);
        if (idx === -1) continue;
        for (const tag of note.tags) {
          counts[tag] = counts[tag] || Array(WEEKS).fill(0);
          counts[tag][idx] += 1;
          totals[tag] = (totals[tag] || 0) + 1;
        }
      }
      const topTags = Object.keys(totals).sort((a, b) => totals[b] - totals[a]).slice(0, 6);
      const maxCell = Math.max(1, ...topTags.flatMap((tg) => counts[tg]));

      return (
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{t('home.tagsHeatmap')}</div>
          <div style={{ background: theme.cardBg, borderRadius: 14, border: `1px solid ${theme.border}`, padding: 16 }}>
            {topTags.length === 0 ? (
              <div style={{ fontSize: 12.5, color: theme.textMuted, textAlign: 'center', padding: '10px 4px' }}>{t('home.tagsHeatmapEmpty')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {topTags.map((tag) => (
                  <div key={tag} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 74, flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={tag}>
                      {tag}
                    </span>
                    <div style={{ display: 'flex', gap: 3, flex: 1 }}>
                      {counts[tag].map((c, i) => {
                        const alpha = c === 0 ? 0 : 0.22 + 0.78 * (c / maxCell);
                        return (
                          <div
                            key={i}
                            title={`${c} ${c === 1 ? t('home.tagsHeatmapNote') : t('home.tagsHeatmapNotes')}`}
                            style={{
                              flex: 1, aspectRatio: '1', borderRadius: 3, minWidth: 10,
                              background: c === 0 ? theme.subtleBg : theme.accent,
                              opacity: c === 0 ? 1 : alpha,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    })(),
  };

  const renderBlock = (key, colKey, index) => (
    <div
      key={key}
      draggable
      onDragStart={() => setDraggedBlock(key)}
      onDragOver={(e) => onBlockDragOver(e, colKey, index)}
      onDrop={onBlockDrop}
      onDragEnd={onBlockDrop}
      style={{ position: 'relative', opacity: draggedBlock === key ? 0.5 : 1, cursor: 'grab' }}
    >
      <span
        onClick={(e) => { e.stopPropagation(); removeBlock(key); }}
        title={t('home.removeBlock')}
        style={{
          position: 'absolute', top: -6, right: -6, zIndex: 2, width: 22, height: 22, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textMuted, opacity: 0.55, fontSize: 15, lineHeight: 1,
        }}
      >
        &times;
      </span>
      {blockContent[key]}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '24px 28px', flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div ref={addMenuRef} style={{ position: 'relative' }}>
          <div
            onClick={() => setAddMenuOpen((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: theme.subtleBg, color: theme.textPrimary,
              border: `1px solid ${theme.border}`, borderRadius: 9, padding: '8px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={13} /> {t('home.addBlock')}
          </div>
          {addMenuOpen && (
            <div
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, width: 220,
                background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
                borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.25)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
              }}
            >
              {columns.hidden.length === 0 && (
                <div style={{ fontSize: 12, color: theme.textMuted, padding: '10px 8px' }}>{t('home.addBlockEmpty')}</div>
              )}
              {columns.hidden.map((key) => (
                <div
                  key={key}
                  onClick={() => addBlock(key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = theme.subtleBg)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Icon name="plus" size={12} color={theme.accentText} />
                  {t(HOME_BLOCK_LABEL_KEYS[key])}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        <div
          onDragOver={(e) => onColumnDragOver(e, 'left')}
          onDrop={onBlockDrop}
          style={{ flex: '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28, minHeight: 80 }}
        >
          {columns.left.map((key, i) => renderBlock(key, 'left', i))}
        </div>

        <div
          onDragOver={(e) => onColumnDragOver(e, 'right')}
          onDrop={onBlockDrop}
          style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28, minHeight: 80 }}
        >
          {columns.right.map((key, i) => renderBlock(key, 'right', i))}
        </div>
      </div>
    </div>
  );
}
