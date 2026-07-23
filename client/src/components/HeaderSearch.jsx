import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { api } from '../api.js';
import Icon from './Icon.jsx';

export default function HeaderSearch() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setResults([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const [{ notes }, { tasks }, { voiceNotes }, { artifacts }] = await Promise.all([
          api.listNotes(),
          api.listTasks(),
          api.listVoiceNotes(),
          api.listArtifacts(),
        ]);
        const noteHits = notes
          .filter((n) => n.title.toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q))
          .slice(0, 5)
          .map((n) => ({ type: 'note', id: n.id, label: n.title }));
        const taskHits = tasks
          .filter((t) => t.title.toLowerCase().includes(q))
          .slice(0, 5)
          .map((t) => ({ type: 'task', id: t.id, label: t.title }));
        const voiceHits = voiceNotes
          .filter((v) => v.title.toLowerCase().includes(q))
          .slice(0, 5)
          .map((v) => ({ type: 'voice', id: v.id, label: v.title }));
        const artifactHits = artifacts
          .filter((a) => a.title.toLowerCase().includes(q))
          .slice(0, 5)
          .map((a) => ({ type: 'artifact', id: a.id, label: a.title }));
        setResults([...noteHits, ...taskHits, ...voiceHits, ...artifactHits].slice(0, 8));
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const goTo = (result) => {
    setQuery('');
    setResults([]);
    setOpen(false);
    inputRef.current?.blur();
    if (result.type === 'note') navigate('/notes', { state: { noteId: result.id } });
    else if (result.type === 'task') navigate('/tasks', { state: { taskId: result.id } });
    else if (result.type === 'artifact') navigate('/artifacts', { state: { artifactId: result.id } });
    else navigate('/voice', { state: { voiceId: result.id } });
  };

  const typeLabel = { note: 'Note', task: 'Task', voice: 'Voice Note', artifact: 'Artifact' };
  const typeIcon = { note: 'doc', task: 'check', voice: 'mic', artifact: 'code' };

  return (
    <div style={{ flex: '1 1 200px', minWidth: 0, maxWidth: 520, position: 'relative' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: theme.subtleBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '10px 14px',
        }}
      >
        <span style={{ opacity: 0.65, display: 'flex', flexShrink: 0 }}>
          <Icon name="search" size={16} />
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          placeholder="Search notes, tasks, voice notes..."
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: theme.textPrimary, fontSize: 14 }}
        />
        {!query && (
          <span style={{ fontSize: 11, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 5, padding: '2px 6px', color: theme.textMuted, flexShrink: 0 }}>
            &#8984;K
          </span>
        )}
      </div>

      {open && query.trim() && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff',
            border: `1px solid ${theme.border}`, borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.25)', overflow: 'hidden', zIndex: 50,
            maxHeight: 320, overflowY: 'auto',
          }}
        >
          {loading && <div style={{ padding: 14, fontSize: 12.5, color: theme.textMuted }}>Searching…</div>}
          {!loading && results.length === 0 && <div style={{ padding: 14, fontSize: 12.5, color: theme.textMuted }}>No results for "{query}".</div>}
          {!loading &&
            results.map((r) => (
              <div
                key={`${r.type}-${r.id}`}
                onClick={() => goTo(r)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
              >
                <span style={{ opacity: 0.6, display: 'flex', flexShrink: 0 }}>
                  <Icon name={typeIcon[r.type]} size={14} />
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: theme.textMuted, flexShrink: 0 }}>{typeLabel[r.type]}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
