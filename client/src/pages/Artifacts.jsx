import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
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

export default function Artifacts() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const location = useLocation();
  const [artifacts, setArtifacts] = useState([]);
  const [tags, setTags] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('preview');
  const [loading, setLoading] = useState(true);
  const [titleDraft, setTitleDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');

  const load = async () => {
    const [{ artifacts }, { tags }] = await Promise.all([api.listArtifacts(), api.listTags()]);
    setArtifacts(artifacts);
    setTags(tags);
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
    setDescriptionDraft(selected?.description ?? '');
    setMode('preview');
    setTagPickerOpen(false);
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

  const commitDescription = async () => {
    if (!selected || descriptionDraft === (selected.description || '')) return;
    const { artifact } = await api.updateArtifact(selected.id, { description: descriptionDraft });
    setArtifacts((prev) => prev.map((a) => (a.id === artifact.id ? artifact : a)));
    setDescriptionDraft(artifact.description || '');
  };

  const addTagToArtifact = async (tagName) => {
    if (!selected || selected.tags?.includes(tagName)) return;
    await patch({ tags: [...(selected.tags || []), tagName] });
  };

  const removeTagFromArtifact = async (tagName) => {
    if (!selected) return;
    await patch({ tags: (selected.tags || []).filter((t) => t !== tagName) });
  };

  const createAndAddTag = async () => {
    const name = newTagInput.trim();
    if (!name) return;
    let tag = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (!tag) {
      const res = await api.createTag({ name });
      tag = res.tag;
      setTags((prev) => [...prev, tag]);
    }
    await addTagToArtifact(tag.name);
    setNewTagInput('');
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

  if (loading) return <div style={{ padding: 28, color: theme.textMuted }}>{t('common.loading')}</div>;

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
              placeholder={t('artifacts.searchPlaceholder')}
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, flex: 1, minWidth: 0, color: theme.textPrimary }}
            />
          </div>
          <button
            onClick={addArtifact}
            title={t('artifacts.newArtifact')}
            style={{ display: 'flex', alignItems: 'center', background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 12px', cursor: 'pointer', flexShrink: 0 }}
          >
            <Icon name="plus" size={16} color="#fff" />
          </button>
        </div>

        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {filtered.length === 0 && <div style={{ padding: 14, fontSize: 13, color: theme.textMuted }}>{t('artifacts.noArtifactsYet')}</div>}
          {filtered.map((a) => (
            <div key={a.id} onClick={() => setSelectedId(a.id)} style={rowStyle(selected?.id === a.id)}>
              <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
              <div style={{ fontSize: 11.5, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {a.description || timeAgo(a.updatedAt, t)}
              </div>
              {a.tags?.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {a.tags.map((tagName) => (
                    <span key={tagName} style={{ fontSize: 10, fontWeight: 700, background: theme.subtleBg, color: theme.textMuted, padding: '2px 6px', borderRadius: 5 }}>
                      {tagName}
                    </span>
                  ))}
                </div>
              )}
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
                  {t(`artifacts.${m}`)}
                </div>
              ))}
            </div>
            <button onClick={remove} style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
              {t('common.delete')}
            </button>
          </div>

          <input
            value={descriptionDraft}
            onChange={(e) => setDescriptionDraft(e.target.value)}
            onBlur={commitDescription}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            placeholder={t('artifacts.descriptionPlaceholder')}
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: theme.textMuted }}
          />

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {(selected.tags || []).map((tagName) => {
              const tag = tags.find((t) => t.name === tagName);
              const hue = tag?.hue ?? 290;
              return (
                <span
                  key={tagName}
                  style={{
                    fontSize: 11, fontWeight: 700, background: `oklch(0.55 0.19 ${hue} / 0.16)`, color: `oklch(0.5 0.2 ${hue})`,
                    padding: '3px 6px 3px 9px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  {tagName}
                  <span onClick={() => removeTagFromArtifact(tagName)} style={{ cursor: 'pointer', opacity: 0.7 }}>
                    &times;
                  </span>
                </span>
              );
            })}
            <span
              onClick={() => setTagPickerOpen((v) => !v)}
              style={{ fontSize: 11, fontWeight: 700, border: `1px dashed ${theme.border}`, color: theme.textMuted, padding: '3px 9px', borderRadius: 6, cursor: 'pointer' }}
            >
              {t('artifacts.addTag')}
            </span>
          </div>

          {tagPickerOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: theme.subtleBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 10 }}>
              {tags.filter((t) => !(selected.tags || []).includes(t.name)).length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {tags
                    .filter((t) => !(selected.tags || []).includes(t.name))
                    .map((t) => (
                      <span
                        key={t.id}
                        onClick={() => addTagToArtifact(t.name)}
                        style={{ fontSize: 11, fontWeight: 700, background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textPrimary, padding: '4px 9px', borderRadius: 6, cursor: 'pointer' }}
                      >
                        {t.name}
                      </span>
                    ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createAndAddTag()}
                  placeholder={t('artifacts.newTagPlaceholder')}
                  style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 7, padding: '7px 10px', fontSize: 12.5, background: theme.cardBg, color: theme.textPrimary, outline: 'none' }}
                />
                <button onClick={createAndAddTag} style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {t('common.add')}
                </button>
              </div>
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden', display: mode === 'preview' ? 'block' : 'none' }}>
            <iframe title="Artifact preview" srcDoc={selected.html} sandbox="allow-scripts" style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
          </div>

          <div style={{ flex: 1, minHeight: 0, display: mode === 'code' ? 'block' : 'none' }}>
            <textarea
              value={selected.html}
              onChange={(e) => patch({ html: e.target.value })}
              style={{
                width: '100%', height: '100%', border: `1px solid ${theme.border}`, borderRadius: 10, outline: 'none', resize: 'none',
                background: theme.subtleBg, color: theme.textPrimary, fontFamily: 'var(--font-mono)',
                fontSize: 12.5, lineHeight: 1.6, padding: 14, boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      ) : (
        <div style={{ flex: '1 1 640px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
          {t('artifacts.selectOrCreate')}
        </div>
      )}
    </div>
  );
}
