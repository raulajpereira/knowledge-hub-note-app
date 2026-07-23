import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
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

export default function Home() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [notes, setNotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadTasks = () => api.listTasks().then(({ tasks }) => setTasks(tasks));

  useEffect(() => {
    Promise.all([api.listNotes(), loadTasks()])
      .then(([{ notes }]) => setNotes(notes))
      .finally(() => setLoading(false));
  }, []);

  const toggleTaskDone = async (e, task) => {
    e.stopPropagation();
    const { task: updated } = await api.updateTask(task.id, { done: !task.done });
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const createAndGo = async () => {
    await api.createNote({ title: 'Untitled note', content: '' });
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
      </div>

      <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>
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
    </div>
  );
}
