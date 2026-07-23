import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import CodeBlock from '../components/CodeBlock.jsx';
import AutoResizeTextarea from '../components/AutoResizeTextarea.jsx';

let blockIdCounter = 0;
const newBlockId = () => `b${Date.now()}-${blockIdCounter++}`;

function getBlocks(note) {
  if (Array.isArray(note.blocks) && note.blocks.length > 0) return note.blocks;
  return [{ id: 'legacy', type: 'text', value: note.content || '' }];
}

function contentFromBlocks(blocks) {
  return blocks
    .filter((b) => b.type !== 'image')
    .map((b) => b.value || '')
    .join('\n\n')
    .trim();
}

export default function Notes() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const location = useLocation();
  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [tags, setTags] = useState([]);
  const [activeFolder, setActiveFolder] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [showTrash, setShowTrash] = useState(false);
  const [trashedNotes, setTrashedNotes] = useState([]);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [titleDraft, setTitleDraft] = useState('');
  const [dragOverFolder, setDragOverFolder] = useState(null);

  const load = async () => {
    const [{ notes }, { folders }, { tags }] = await Promise.all([api.listNotes(), api.listFolders(), api.listTags()]);
    setNotes(notes);
    setFolders(folders);
    setTags(tags);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (location.state?.noteId) {
      setActiveFolder('all');
      setSelectedId(location.state.noteId);
    }
  }, [location.state]);

  const loadTrash = async () => {
    const { notes } = await api.listNotes(true);
    setTrashedNotes(notes);
  };

  useEffect(() => {
    if (showTrash) loadTrash();
  }, [showTrash]);

  const filtered = useMemo(() => {
    return notes
      .filter((n) => (activeFolder === 'all' ? true : activeFolder === 'none' ? !n.folderId : n.folderId === activeFolder))
      .filter((n) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
      })
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [notes, activeFolder, search]);

  const selected = notes.find((n) => n.id === selectedId) || filtered[0] || null;

  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  useEffect(() => {
    setTitleDraft(selected?.title ?? '');
  }, [selected?.id]);

  const commitTitle = async () => {
    if (!selected || titleDraft === selected.title) return;
    const { note } = await api.updateNote(selected.id, { title: titleDraft });
    setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
    setTitleDraft(note.title);
  };

  const addNote = async () => {
    const { note } = await api.createNote({
      title: t('notes.untitledNote'),
      content: '',
      folderId: activeFolder !== 'all' && activeFolder !== 'none' ? activeFolder : null,
    });
    setNotes((prev) => [note, ...prev]);
    setSelectedId(note.id);
  };

  const patchSelected = async (patch) => {
    if (!selected) return;
    const { note } = await api.updateNote(selected.id, patch);
    setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
  };

  const moveNoteToFolder = async (noteId, folderId) => {
    const { note } = await api.updateNote(noteId, { folderId });
    setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
  };

  const trashSelected = async () => {
    if (!selected) return;
    await api.trashNote(selected.id);
    setNotes((prev) => prev.filter((n) => n.id !== selected.id));
    setSelectedId(null);
  };

  const restoreNote = async (id) => {
    await api.restoreNote(id);
    await load();
    await loadTrash();
  };

  const deleteForever = async (id) => {
    await api.deleteNoteForever(id);
    await loadTrash();
  };

  const addTagToNote = async (tagName) => {
    if (!selected || selected.tags?.includes(tagName)) return;
    await patchSelected({ tags: [...(selected.tags || []), tagName] });
  };

  const removeTagFromNote = async (tagName) => {
    if (!selected) return;
    await patchSelected({ tags: (selected.tags || []).filter((t) => t !== tagName) });
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
    await addTagToNote(tag.name);
    setNewTagInput('');
  };

  const updateBlocks = async (blocks) => {
    await patchSelected({ blocks, content: contentFromBlocks(blocks) });
  };

  const addTextBlock = () => {
    if (!selected) return;
    updateBlocks([...getBlocks(selected), { id: newBlockId(), type: 'text', value: '' }]);
  };

  const addCodeBlock = () => {
    if (!selected) return;
    updateBlocks([...getBlocks(selected), { id: newBlockId(), type: 'code', language: 'abap', value: '' }]);
  };

  const addImageBlock = (url) => {
    if (!selected) return;
    updateBlocks([...getBlocks(selected), { id: newBlockId(), type: 'image', url }]);
  };

  const handlePasteImage = async (e) => {
    if (!selected) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const { url } = await api.uploadNoteImage(file);
        addImageBlock(url);
        break;
      }
    }
  };

  const updateBlock = (blockId, patch) => {
    if (!selected) return;
    updateBlocks(getBlocks(selected).map((b) => (b.id === blockId ? { ...b, ...patch } : b)));
  };

  const deleteBlock = (blockId) => {
    if (!selected) return;
    const blocks = getBlocks(selected).filter((b) => b.id !== blockId);
    updateBlocks(blocks.length > 0 ? blocks : [{ id: newBlockId(), type: 'text', value: '' }]);
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const { folder } = await api.createFolder({ name: newFolderName.trim() });
    setFolders((prev) => [...prev, folder]);
    setNewFolderName('');
    setNewFolderOpen(false);
  };

  const rowStyle = (isActive) => ({
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '10px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    background: isActive ? theme.accentSoftBg : 'transparent',
  });

  if (loading) {
    return <div style={{ padding: 28, color: theme.textMuted }}>Loading notes…</div>;
  }

  return (
    <div style={{ padding: '24px 28px', flex: 1, display: 'flex', gap: 24, minHeight: 0 }}>
      <div style={{ flex: '1 1 320px', minWidth: 280, maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '9px 12px', flex: 1, minWidth: 0 }}>
            <span style={{ opacity: 0.5, display: 'flex' }}>
              <Icon name="search" size={15} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('notes.searchPlaceholder')}
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, flex: 1, minWidth: 0, color: theme.textPrimary }}
            />
          </div>
          <button
            onClick={addNote}
            title="New Note"
            style={{ display: 'flex', alignItems: 'center', background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 12px', cursor: 'pointer', flexShrink: 0 }}
          >
            <Icon name="plus" size={16} color="#fff" />
          </button>
        </div>

        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div
            onClick={() => setActiveFolder('all')}
            onDragOver={(e) => { e.preventDefault(); setDragOverFolder('none'); }}
            onDragLeave={() => setDragOverFolder((v) => (v === 'none' ? null : v))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverFolder(null);
              const noteId = e.dataTransfer.getData('text/note-id');
              if (noteId) moveNoteToFolder(noteId, null);
            }}
            style={{
              ...rowStyle(activeFolder === 'all'), flexDirection: 'row', alignItems: 'center', gap: 8,
              color: activeFolder === 'all' ? theme.accentText : theme.textMuted,
              outline: dragOverFolder === 'none' ? `2px dashed ${theme.accent}` : 'none', outlineOffset: -2,
            }}
          >
            <Icon name="folder" size={15} />
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{t('notes.allNotes')}</span>
            <span style={{ fontSize: 11.5, opacity: 0.7 }}>{notes.length}</span>
          </div>
          {folders.map((f) => (
            <div
              key={f.id}
              onClick={() => setActiveFolder(f.id)}
              onDragOver={(e) => { e.preventDefault(); setDragOverFolder(f.id); }}
              onDragLeave={() => setDragOverFolder((v) => (v === f.id ? null : v))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverFolder(null);
                const noteId = e.dataTransfer.getData('text/note-id');
                if (noteId) moveNoteToFolder(noteId, f.id);
              }}
              style={{
                ...rowStyle(activeFolder === f.id), flexDirection: 'row', alignItems: 'center', gap: 8,
                color: activeFolder === f.id ? theme.accentText : theme.textMuted,
                outline: dragOverFolder === f.id ? `2px dashed ${theme.accent}` : 'none', outlineOffset: -2,
              }}
            >
              <Icon name="folder" size={15} />
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
              <span style={{ fontSize: 11.5, opacity: 0.7 }}>{f.noteCount}</span>
            </div>
          ))}
          {newFolderOpen ? (
            <div style={{ display: 'flex', gap: 6, padding: '4px 4px 2px' }}>
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createFolder()}
                placeholder={t('notes.newFolderName')}
                autoFocus
                style={{ flex: 1, minWidth: 0, border: `1px solid ${theme.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
              />
              <button onClick={createFolder} style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {t('common.add')}
              </button>
            </div>
          ) : (
            <div
              onClick={() => setNewFolderOpen(true)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: theme.accent, color: '#fff', borderRadius: 8, padding: '9px 12px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', marginTop: 2 }}
            >
              <Icon name="plus" size={13} color="#fff" /> {t('notes.newFolder')}
            </div>
          )}
        </div>

        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {filtered.length === 0 && <div style={{ padding: 14, fontSize: 13, color: theme.textMuted }}>{t('notes.noNotesHere')}</div>}
          {filtered.map((n) => (
            <div
              key={n.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/note-id', n.id)}
              onClick={() => setSelectedId(n.id)}
              style={{ ...rowStyle(selected?.id === n.id), cursor: 'grab' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {n.pinned && <Icon name="pin" size={13} color={theme.accentText} />}
                <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</div>
              </div>
              <div style={{ fontSize: 12, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {n.content?.slice(0, 60) || t('common.noAdditionalText')}
              </div>
              {n.tags?.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {n.tags.map((tagName) => (
                    <span key={tagName} style={{ fontSize: 10, fontWeight: 700, background: theme.subtleBg, color: theme.textMuted, padding: '2px 6px', borderRadius: 5 }}>
                      {tagName}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div onClick={() => setShowTrash((v) => !v)} style={{ fontSize: 12.5, color: theme.textMuted, cursor: 'pointer', textAlign: 'center', padding: '4px 0' }}>
          {showTrash ? t('notes.hideTrash') : t('notes.viewTrash')}
        </div>
      </div>

      {showTrash ? (
        <div style={{ flex: '1 1 480px', minWidth: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{t('notes.trash')}</div>
          {trashedNotes.length === 0 && <div style={{ fontSize: 13, color: theme.textMuted }}>{t('notes.trashEmpty')}</div>}
          {trashedNotes.map((n) => (
            <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: theme.subtleBg }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{n.title}</div>
                <div style={{ fontSize: 12, color: theme.textMuted }}>{t('notes.deleted', { date: new Date(n.deletedAt).toLocaleString() })}</div>
              </div>
              <button onClick={() => restoreNote(n.id)} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {t('common.restore')}
              </button>
              <button onClick={() => deleteForever(n.id)} style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {t('common.deleteForever')}
              </button>
            </div>
          ))}
        </div>
      ) : selected ? (
        <div style={{ flex: '1 1 480px', minWidth: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              style={{ flex: '1 1 160px', minWidth: 160, border: 'none', outline: 'none', background: 'transparent', fontSize: 19, fontWeight: 800, color: theme.textPrimary }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span onClick={() => patchSelected({ pinned: !selected.pinned })} style={{ display: 'flex', cursor: 'pointer' }}>
                <Icon name="pin" size={17} color={selected.pinned ? theme.accentText : theme.textMuted} />
              </span>
              <button onClick={trashSelected} style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                {t('common.delete')}
              </button>
            </div>
          </div>

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
                  <span onClick={() => removeTagFromNote(tagName)} style={{ cursor: 'pointer', opacity: 0.7 }}>
                    &times;
                  </span>
                </span>
              );
            })}
            <span
              onClick={() => setTagPickerOpen((v) => !v)}
              style={{ fontSize: 11, fontWeight: 700, border: `1px dashed ${theme.border}`, color: theme.textMuted, padding: '3px 9px', borderRadius: 6, cursor: 'pointer' }}
            >
              {t('notes.addTag')}
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
                        onClick={() => addTagToNote(t.name)}
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
                  placeholder={t('notes.newTagPlaceholder')}
                  style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 7, padding: '7px 10px', fontSize: 12.5, background: theme.cardBg, color: theme.textPrimary, outline: 'none' }}
                />
                <button onClick={createAndAddTag} style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {t('common.add')}
                </button>
              </div>
            </div>
          )}

          <div onPaste={handlePasteImage} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {getBlocks(selected).map((block) =>
              block.type === 'code' ? (
                <CodeBlock
                  key={block.id}
                  value={block.value}
                  language={block.language || 'abap'}
                  onChange={(value) => updateBlock(block.id, { value })}
                  onLanguageChange={(language) => updateBlock(block.id, { language })}
                  onDelete={() => deleteBlock(block.id)}
                />
              ) : block.type === 'image' ? (
                <div key={block.id} style={{ position: 'relative' }}>
                  <img src={block.url} alt="" style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }} />
                  <span
                    onClick={() => deleteBlock(block.id)}
                    style={{
                      position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 6,
                      padding: '2px 9px', cursor: 'pointer', fontSize: 15, lineHeight: 1.4,
                    }}
                  >
                    &times;
                  </span>
                </div>
              ) : (
                <div key={block.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <AutoResizeTextarea
                    value={block.value}
                    onChange={(e) => updateBlock(block.id, { value: e.target.value })}
                    placeholder={t('notes.writePlaceholder')}
                    style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, lineHeight: 1.6, color: theme.textPrimary, fontFamily: 'inherit' }}
                  />
                  {getBlocks(selected).length > 1 && (
                    <span onClick={() => deleteBlock(block.id)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '2px 6px' }}>
                      &times;
                    </span>
                  )}
                </div>
              )
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addTextBlock} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '7px 12px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
              {t('notes.addText')}
            </button>
            <button onClick={addCodeBlock} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '7px 12px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
              {t('notes.addCode')}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex: '1 1 480px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
          {t('notes.selectOrCreate')}
        </div>
      )}
    </div>
  );
}
