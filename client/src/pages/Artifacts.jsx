import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
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

export default function Artifacts() {
  const { theme } = useTheme();
  const location = useLocation();
  const [artifacts, setArtifacts] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('preview');
  const [loading, setLoading] = useState(true);
  const [titleDraft, setTitleDraft] = useState('');

  const load = async () => {
    const { artifacts } = await api.listArtifacts();
    setArtifacts(artifacts);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => artifacts.filter((a) => !search.trim() || a.title.toLowerCase().includes(search.toLowerCase())),
    [artifacts, search]
  );

  const selected = artifacts.find((a) => a.id === selectedId) || filtered[0] || null;

  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  useEffect(() => {
    if (location.state?.artifactId) setSelectedId(location.state.artifactId);
  }, [location.state]);

  useEffect(() => {
    setTitleDraft(selected?.title ?? '');
    setMode('preview');
  }, [selected?.id]);

  const addArtifact = async () => {
    const { artifact } = await api.createArtifact({});
    setArtifacts((prev) => [artifact, ...prev]);
    setSelectedId(artifact.id);
    setMode('code');
  };

  const patch = async (payload) => {
    if (!selected) return;
    const { artifact } = await api.updateArtifact(selected.id, payload);
    setArtifacts((prev) => prev.map((a) => (a.id === artifact.id ? artifact : a)));
  };

  const commitTitle = async () => {
    if (!selected || titleDraft === selected.title) return;
    const { artifact } = await api.updateArtifact(selected.id, { title: titleDraft });
    setArtifacts((prev) => prev.map((a) => (a.id === artifact.id ? artifact : a)));
    setTitleDraft(artifact.title);
  };

  const remove = async () => {
    if (!selected) return;
    await api.deleteArtifact(selected.id);
    setArtifacts((prev) => prev.filter((a) => a.id !== selected.id));
    setSelectedId(null);
  };

  const rowStyle = (isActive) => ({
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '10px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    background: isActive ? theme.accentSoftBg : 'transparent',
  });

  if (loading) return <div style={{ padding: 28, color: theme.textMuted }}>Loading artifacts…</div>;

  return (
    <div style={{ padding: '24px 28px', flex: 1, display: 'flex', gap: 24, minHeight: 0 }}>
      <div style={{ flex: '1 1 300px', minWidth: 260, maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '9px 12px', flex: 1, minWidth: 0 }}>
            <span style={{ opacity: 0.5, display: 'flex' }}>
              <Icon name="search" size={15} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search artifacts..."
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, flex: 1, minWidth: 0, color: theme.textPrimary }}
            />
          </div>
          <button
            onClick={addArtifact}
            title="New Artifact"
            style={{ display: 'flex', alignItems: 'center', background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 12px', cursor: 'pointer', flexShrink: 0 }}
          >
            <Icon name="plus" size={16} color="#fff" />
          </button>
        </div>

        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {filtered.length === 0 && <div style={{ padding: 14, fontSize: 13, color: theme.textMuted }}>No artifacts yet.</div>}
          {filtered.map((a) => (
            <div key={a.id} onClick={() => setSelectedId(a.id)} style={rowStyle(selected?.id === a.id)}>
              <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
              <div style={{ fontSize: 11.5, color: theme.textMuted }}>{timeAgo(a.updatedAt)}</div>
            </div>
          ))}
        </div>
      </div>

      {selected ? (
        <div style={{ flex: '1 1 640px', minWidth: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              style={{ flex: '1 1 160px', minWidth: 160, border: 'none', outline: 'none', background: 'transparent', fontSize: 18, fontWeight: 800, color: theme.textPrimary }}
            />
            <div style={{ display: 'flex', background: theme.subtleBg, borderRadius: 8, padding: 3, gap: 2 }}>
              {['preview', 'code'].map((m) => (
                <div
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
                    background: mode === m ? theme.cardBg : 'transparent', color: mode === m ? theme.textPrimary : theme.textMuted,
                    boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                  }}
                >
                  {m}
                </div>
              ))}
            </div>
            <button onClick={remove} style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
              Delete
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden', display: mode === 'preview' ? 'block' : 'none' }}>
            <iframe title="Artifact preview" srcDoc={selected.html} sandbox="allow-scripts" style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
          </div>

          <div style={{ flex: 1, minHeight: 0, display: mode === 'code' ? 'block' : 'none' }}>
            <textarea
              value={selected.html}
              onChange={(e) => patch({ html: e.target.value })}
              style={{
                width: '100%', height: '100%', border: `1px solid ${theme.border}`, borderRadius: 10, outline: 'none', resize: 'none',
                background: theme.subtleBg, color: theme.textPrimary, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 12.5, lineHeight: 1.6, padding: 14, boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      ) : (
        <div style={{ flex: '1 1 640px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
          Select or create an artifact to get started.
        </div>
      )}
    </div>
  );
}
