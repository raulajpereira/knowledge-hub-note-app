import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useCounts } from '../context/CountsContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';

const HUE_ROTATION = [290, 250, 190, 150, 70, 20, 340, 25];

export default function Tags() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const { refresh: refreshCounts } = useCounts();
  const navigate = useNavigate();
  const [tags, setTags] = useState([]);
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [newTagOpen, setNewTagOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [{ tags }, { notes }] = await Promise.all([api.listTags(), api.listNotes()]);
    setTags(tags);
    setNotes(notes);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => tags.filter((t) => !search.trim() || t.name.toLowerCase().includes(search.toLowerCase())),
    [tags, search]
  );

  const selected = tags.find((t) => t.id === selectedId) || filtered[0] || null;

  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const notesForSelected = selected ? notes.filter((n) => Array.isArray(n.tags) && n.tags.includes(selected.name)) : [];

  const createTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const { tag } = await api.createTag({ name: newTagName.trim() });
      setTags((prev) => [...prev, tag]);
      setNewTagName('');
      setNewTagOpen(false);
      setSelectedId(tag.id);
      refreshCounts();
    } catch (err) {
      alert(err.message);
    }
  };

  const startEdit = (tag) => {
    setEditingId(tag.id);
    setEditValue(tag.name);
  };

  const commitEdit = async () => {
    const tag = tags.find((t) => t.id === editingId);
    setEditingId(null);
    if (!tag || !editValue.trim() || editValue.trim() === tag.name) return;
    const { tag: updated } = await api.renameTag(tag.id, { name: editValue.trim() });
    await load();
    setSelectedId(updated.id);
  };

  const removeTag = async (tag, e) => {
    e.stopPropagation();
    const ok = await confirm({ message: t('tags.confirmDelete', { name: tag.name }) });
    if (!ok) return;
    await api.deleteTag(tag.id);
    if (selectedId === tag.id) setSelectedId(null);
    await load();
    refreshCounts();
  };

  if (loading) return <div style={{ padding: 28, color: theme.textMuted }}>{t('common.loading')}</div>;

  return (
    <div style={{ padding: '24px 28px', flex: 1, display: 'flex', gap: 24, minHeight: 0 }}>
      <div style={{ flex: '1 1 300px', minWidth: 260, maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '9px 12px' }}>
          <span style={{ opacity: 0.5, display: 'flex' }}>
            <Icon name="search" size={15} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('tags.searchPlaceholder')}
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, flex: 1, minWidth: 0, color: theme.textPrimary }}
          />
        </div>

        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {filtered.length === 0 && <div style={{ padding: 14, fontSize: 13, color: theme.textMuted }}>{t('tags.noTagsYet')}</div>}
          {filtered.map((t) => (
            <div
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                background: selected?.id === t.id ? theme.accentSoftBg : 'transparent',
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: `oklch(0.6 0.19 ${t.hue})`, flexShrink: 0 }} />
              {editingId === t.id ? (
                <input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, border: `1px solid ${theme.accent}`, borderRadius: 6, padding: '3px 7px', background: theme.cardBg, color: theme.textPrimary, outline: 'none' }}
                />
              ) : (
                <>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                  <span style={{ fontSize: 11.5, color: theme.textMuted }}>{t.count}</span>
                  <span onClick={(e) => { e.stopPropagation(); startEdit(t); }} style={{ opacity: 0.5, cursor: 'pointer', padding: 2 }}>
                    &#9998;
                  </span>
                  <span onClick={(e) => removeTag(t, e)} style={{ opacity: 0.5, cursor: 'pointer', padding: 2, fontSize: 15 }}>
                    &times;
                  </span>
                </>
              )}
            </div>
          ))}

          {newTagOpen ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 4px 2px' }}>
              <input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createTag()}
                placeholder={t('tags.newTagPlaceholder')}
                autoFocus
                style={{ border: `1px solid ${theme.border}`, borderRadius: 7, padding: '7px 9px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
              />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {HUE_ROTATION.slice(0, 5).map((h) => (
                  <div key={h} style={{ width: 16, height: 16, borderRadius: '50%', background: `oklch(0.6 0.19 ${h})` }} />
                ))}
                <button onClick={createTag} style={{ marginLeft: 'auto', background: theme.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {t('common.add')}
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setNewTagOpen(true)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: theme.accent, color: '#fff', borderRadius: 8, padding: '9px 12px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', marginTop: 2 }}
            >
              <Icon name="plus" size={13} color="#fff" /> {t('tags.newTag')}
            </div>
          )}
        </div>
      </div>

      {selected ? (
        <div style={{ flex: '1 1 420px', minWidth: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: `oklch(0.6 0.19 ${selected.hue})`, flexShrink: 0 }} />
            <div style={{ fontSize: 19, fontWeight: 800 }}>{selected.name}</div>
            <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('tags.notesCount', { count: notesForSelected.length })}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {notesForSelected.length === 0 && <div style={{ fontSize: 13, color: theme.textMuted }}>{t('tags.noNotesForTag')}</div>}
            {notesForSelected.map((n) => (
              <div
                key={n.id}
                onClick={() => navigate('/notes', { state: { noteId: n.id } })}
                style={{ padding: 14, borderRadius: 10, cursor: 'pointer', borderBottom: `1px solid ${theme.border}` }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{n.title}</div>
                <div style={{ fontSize: 12.5, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {n.content?.slice(0, 80) || t('common.noAdditionalText')}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ flex: '1 1 420px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
          {t('tags.createToStart')}
        </div>
      )}
    </div>
  );
}
