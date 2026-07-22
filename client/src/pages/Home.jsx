import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Home() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [notes, setNotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listNotes(), api.listTasks()])
      .then(([{ notes }, { tasks }]) => {
        setNotes(notes);
        setTasks(tasks);
      })
      .finally(() => setLoading(false));
  }, []);

  const createAndGo = async () => {
    await api.createNote({ title: 'Untitled note', content: '' });
    navigate('/notes');
  };

  const stats = [
    { icon: 'doc', value: notes.length, label: 'Notes' },
    { icon: 'pin', value: notes.filter((n) => n.pinned).length, label: 'Pinned' },
    { icon: 'check', value: tasks.filter((t) => !t.done).length, label: 'Open Tasks' },
  ];

  const quickCapture = [
    {
      title: 'New Note',
      desc: 'Capture your thoughts and ideas',
      icon: <Icon name="plus" size={18} color="#fff" strokeWidth={2.2} />,
      onClick: createAndGo,
      gradient: true,
    },
    {
      title: 'New Task',
      desc: 'Track something you need to get done',
      icon: <Icon name="check" size={18} color={theme.accent} />,
      onClick: () => navigate('/tasks'),
      gradient: false,
    },
    {
      title: 'Voice Note',
      desc: 'Record and transcribe your voice',
      icon: <Icon name="mic" size={18} color={theme.accent} />,
      onClick: () => navigate('/voice'),
      gradient: false,
    },
  ];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, padding: '24px 28px', flex: 1 }}>
      <div style={{ flex: '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Quick Capture</div>
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
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Today At A Glance</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
            {stats.map((s) => (
              <div
                key={s.label}
                style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>{s.value}</div>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: theme.accentSoftBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={s.icon} size={16} color={theme.accentText} />
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Recent Notes</div>
            <a onClick={() => navigate('/notes')} style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer', color: theme.accentText }}>
              See all
            </a>
          </div>
          <div style={{ background: theme.cardBg, borderRadius: 14, border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
            {loading && <div style={{ padding: 18, fontSize: 13, color: theme.textMuted }}>Loading…</div>}
            {!loading && notes.length === 0 && (
              <div style={{ padding: 18, fontSize: 13, color: theme.textMuted }}>No notes yet — create your first one above.</div>
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
                    {note.content?.slice(0, 80) || 'No additional text'}
                  </div>
                </div>
                {note.pinned && <Icon name="pin" size={14} color={theme.accentText} />}
                <div style={{ fontSize: 12.5, color: theme.textMuted, width: 70, textAlign: 'right', flexShrink: 0 }}>
                  {timeAgo(note.updatedAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
