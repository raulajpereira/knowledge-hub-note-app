import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useCounts } from '../context/CountsContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';

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

const PRIORITY_HUES = { Low: 250, Medium: 60, High: 35 };

function toKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const FAVORITE_ICONS = { note: 'doc', task: 'check', voice: 'mic', issue: 'archive', artifact: 'code', codeFolder: 'folder' };

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
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [voiceNotes, setVoiceNotes] = useState([]);
  const [issues, setIssues] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [codeFolders, setCodeFolders] = useState([]);
  const [sapNews, setSapNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vpsDisk, setVpsDisk] = useState(null);

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

  const quickCapture = [
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

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, padding: '24px 28px', flex: 1 }}>
      <div style={{ flex: '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{t('home.quickCapture')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
            {quickCapture.map((qc) => (
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

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{t('home.myTasks')}</div>
            <a onClick={() => navigate('/tasks')} style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', color: theme.accentText }}>
              {t('home.seeAll')}
            </a>
          </div>
          <div style={{ background: theme.cardBg, borderRadius: 14, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
            {loading && <div style={{ padding: 18, fontSize: 13, color: theme.textMuted }}>{t('common.loading')}</div>}
            {!loading && tasks.filter((t) => !t.done).length === 0 && (
              <div style={{ padding: 18, fontSize: 13, color: theme.textMuted }}>{t('home.noOpenTasks')}</div>
            )}
            {tasks
              .filter((task) => !task.done)
              .slice(0, 8)
              .map((task) => {
                const hue = PRIORITY_HUES[task.priority];
                return (
                  <div
                    key={task.id}
                    onClick={() => navigate('/tasks', { state: { taskId: task.id } })}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }}
                  >
                    <div
                      onClick={(e) => toggleTaskDone(e, task)}
                      style={{
                        width: 19, height: 19, borderRadius: 6, border: `1.5px solid ${theme.border}`, background: 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.title}</div>
                      <div style={{ fontSize: 11.5, color: theme.textMuted }}>
                        {task.project || t('common.noProject')}
                        {task.due ? ` · ${t('common.due', { date: task.due })}` : ''}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 6, flexShrink: 0, background: `oklch(0.93 0.06 ${hue})`, color: `oklch(0.45 0.14 ${hue})` }}>
                      {task.priority}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
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
            {notes.slice(0, 8).map((note) => (
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

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
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
      </div>
    </div>
  );
}
