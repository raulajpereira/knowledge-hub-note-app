import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'note', label: 'Notes' },
  { key: 'task', label: 'Tasks' },
  { key: 'voice', label: 'Voice Notes' },
];

const TYPE_ICON = { note: 'doc', task: 'check', voice: 'mic' };
const TYPE_LABEL = { note: 'Note', task: 'Task', voice: 'Voice Note' };

export default function Trash() {
  const { theme } = useTheme();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ notes }, { tasks }, { voiceNotes }] = await Promise.all([
      api.listNotes(true),
      api.listTasks(true),
      api.listVoiceNotes(true),
    ]);
    const merged = [
      ...notes.map((n) => ({ ...n, type: 'note' })),
      ...tasks.map((t) => ({ ...t, type: 'task' })),
      ...voiceNotes.map((v) => ({ ...v, type: 'voice' })),
    ].sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
    setItems(merged);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => (filter === 'all' ? items : items.filter((i) => i.type === filter)), [items, filter]);

  const restore = async (item) => {
    if (item.type === 'note') await api.restoreNote(item.id);
    else if (item.type === 'task') await api.restoreTask(item.id);
    else await api.restoreVoiceNote(item.id);
    setItems((prev) => prev.filter((i) => !(i.type === item.type && i.id === item.id)));
  };

  const deleteForever = async (item) => {
    if (item.type === 'note') await api.deleteNoteForever(item.id);
    else if (item.type === 'task') await api.deleteTaskForever(item.id);
    else await api.deleteVoiceNoteForever(item.id);
    setItems((prev) => prev.filter((i) => !(i.type === item.type && i.id === item.id)));
  };

  if (loading) return <div style={{ padding: 28, color: theme.textMuted }}>Loading trash…</div>;

  return (
    <div style={{ padding: '24px 28px', flex: 1, display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Trash</div>
          <div style={{ fontSize: 12.5, color: theme.textMuted }}>Deleted notes, tasks and voice notes. Restore them or remove them for good.</div>
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
      </div>

      <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {filtered.length === 0 && <div style={{ padding: 20, fontSize: 13, color: theme.textMuted, textAlign: 'center' }}>Trash is empty.</div>}
        {filtered.map((item) => (
          <div key={`${item.type}-${item.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: theme.subtleBg, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', opacity: 0.6, flexShrink: 0 }}>
              <Icon name={TYPE_ICON[item.type]} size={16} />
            </span>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
              <div style={{ fontSize: 11.5, color: theme.textMuted }}>
                {TYPE_LABEL[item.type]} · Deleted {new Date(item.deletedAt).toLocaleString()}
              </div>
            </div>
            <button
              onClick={() => restore(item)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
            >
              <Icon name="undo" size={13} /> Restore
            </button>
            <button
              onClick={() => deleteForever(item)}
              style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
            >
              Delete Forever
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
