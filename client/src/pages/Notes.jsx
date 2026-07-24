import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useCounts } from '../context/CountsContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import CodeBlock from '../components/CodeBlock.jsx';
import AutoResizeTextarea from '../components/AutoResizeTextarea.jsx';
import { highlightCode, tokenColor } from '../lib/highlight.js';

const URL_ONLY_RE = /^(https?:\/\/|www\.)\S+$/i;

function normalizeUrl(text) {
  // Drop trailing punctuation that tends to hitch a ride when a URL is
  // copied as part of a sentence (e.g. "see https://sap.com.").
  const trimmed = text.replace(/[.,;:)\]]+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

let blockIdCounter = 0;
const newBlockId = () => `b${Date.now()}-${blockIdCounter++}`;

function getBlocks(note) {
  if (Array.isArray(note.blocks) && note.blocks.length > 0) return note.blocks;
  // Per-note id (not a shared literal) so block components remount — and
  // reset their local edit/view state — when switching between notes.
  return [{ id: `legacy-${note.id}`, type: 'text', value: note.content || '' }];
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
  const confirm = useConfirm();
  const { refresh: refreshCounts } = useCounts();
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
  const [newFolderParentId, setNewFolderParentId] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState(() => new Set());
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [titleDraft, setTitleDraft] = useState('');
  const [dragOverFolder, setDragOverFolder] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkPickerSearch, setLinkPickerSearch] = useState('');
  const [linkPickTarget, setLinkPickTarget] = useState(null);
  const [linkLabelDraft, setLinkLabelDraft] = useState('');
  const [previewNoteId, setPreviewNoteId] = useState(null);

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

  const backlinks = useMemo(
    () => (selected ? notes.filter((n) => n.id !== selected.id && (n.links || []).some((l) => l.noteId === selected.id)) : []),
    [notes, selected]
  );

  const linkCandidates = useMemo(() => {
    if (!selected) return [];
    const linkedIds = new Set((selected.links || []).map((l) => l.noteId));
    const q = linkPickerSearch.trim().toLowerCase();
    return notes.filter((n) => n.id !== selected.id && !linkedIds.has(n.id) && (!q || n.title.toLowerCase().includes(q)));
  }, [notes, selected, linkPickerSearch]);

  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  useEffect(() => {
    setTitleDraft(selected?.title ?? '');
    setHistoryOpen(false);
  }, [selected?.id]);

  const openHistory = async () => {
    if (!selected) return;
    setHistoryOpen(true);
    setVersionsLoading(true);
    try {
      const { versions } = await api.listNoteVersions(selected.id);
      setVersions(versions);
    } finally {
      setVersionsLoading(false);
    }
  };

  const restoreVersion = async (versionId) => {
    if (!selected) return;
    setRestoringId(versionId);
    try {
      const { note } = await api.restoreNoteVersion(selected.id, versionId);
      setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
      setTitleDraft(note.title);
      const { versions } = await api.listNoteVersions(selected.id);
      setVersions(versions);
    } finally {
      setRestoringId(null);
    }
  };

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
    refreshCounts();
  };

  const patchNoteById = async (noteId, patch) => {
    const { note } = await api.updateNote(noteId, patch);
    setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
    return note;
  };

  const patchSelected = async (patch) => {
    if (!selected) return;
    return patchNoteById(selected.id, patch);
  };

  const openLinkPicker = () => {
    setLinkPickerSearch('');
    setLinkPickTarget(null);
    setLinkLabelDraft('');
    setLinkPickerOpen(true);
  };

  const confirmAddLink = async () => {
    if (!selected || !linkPickTarget) return;
    await patchSelected({ links: [...(selected.links || []), { noteId: linkPickTarget, label: linkLabelDraft.trim() || null }] });
    setLinkPickerOpen(false);
  };

  const removeLink = async (noteId) => {
    if (!selected) return;
    await patchSelected({ links: (selected.links || []).filter((l) => l.noteId !== noteId) });
  };

  const previewNote = notes.find((n) => n.id === previewNoteId) || null;

  const openNoteFromPreview = () => {
    setSelectedId(previewNoteId);
    setPreviewNoteId(null);
  };

  const moveNoteToFolder = async (noteId, folderId) => {
    const { note } = await api.updateNote(noteId, { folderId });
    setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
  };

  const reparentFolder = async (folderId, parentId) => {
    if (folderId === parentId) return;
    const target = folders.find((f) => f.id === folderId);
    if (!target || target.parentId === parentId) return;
    let ancestor = parentId;
    while (ancestor) {
      if (ancestor === folderId) return; // would create a cycle
      ancestor = folders.find((f) => f.id === ancestor)?.parentId || null;
    }
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, parentId } : f)));
    const { folder } = await api.renameFolder(folderId, { parentId });
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, ...folder } : f)));
  };

  const toggleFolderCollapsed = (id) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const trashSelected = async () => {
    if (!selected) return;
    const ok = await confirm({ message: t('common.confirmTrashMessage') });
    if (!ok) return;
    await api.trashNote(selected.id);
    setNotes((prev) => prev.filter((n) => n.id !== selected.id));
    setSelectedId(null);
    refreshCounts();
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

  const addLinkBlock = async (url) => {
    if (!selected) return;
    const noteId = selected.id;
    const blockId = newBlockId();
    const blocksWithNew = [...getBlocks(selected), { id: blockId, type: 'link', url, title: url, favicon: null }];
    const savedNote = await patchNoteById(noteId, { blocks: blocksWithNew, content: contentFromBlocks(blocksWithNew) });
    try {
      const preview = await api.linkPreview(url);
      const baseBlocks = Array.isArray(savedNote.blocks) && savedNote.blocks.length ? savedNote.blocks : blocksWithNew;
      const finalBlocks = baseBlocks.map((b) => (b.id === blockId ? { ...b, title: preview.title, favicon: preview.favicon } : b));
      await patchNoteById(noteId, { blocks: finalBlocks, content: contentFromBlocks(finalBlocks) });
    } catch {
      // keep the raw URL as the card's title if the preview fetch failed
    }
  };

  const handlePaste = async (e) => {
    if (!selected) return;
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type && item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          const { url } = await api.uploadNoteImage(file);
          addImageBlock(url);
          return;
        }
      }
    }
    const text = e.clipboardData?.getData('text/plain')?.trim();
    if (text && URL_ONLY_RE.test(text)) {
      e.preventDefault();
      addLinkBlock(normalizeUrl(text));
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
    const { folder } = await api.createFolder({ name: newFolderName.trim(), parentId: newFolderParentId });
    setFolders((prev) => [...prev, { ...folder, noteCount: 0 }]);
    setNewFolderName('');
    setNewFolderOpen(false);
    setNewFolderParentId(null);
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

  const renderFolderNode = (f, depth) => {
    const kids = folders.filter((c) => c.parentId === f.id);
    const hasKids = kids.length > 0;
    const collapsed = collapsedFolders.has(f.id);
    return (
      <div key={f.id}>
        <div
          draggable
          onDragStart={(e) => e.dataTransfer.setData('text/folder-id', f.id)}
          onClick={() => setActiveFolder(f.id)}
          onDragOver={(e) => { e.preventDefault(); setDragOverFolder(f.id); }}
          onDragLeave={() => setDragOverFolder((v) => (v === f.id ? null : v))}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverFolder(null);
            const noteId = e.dataTransfer.getData('text/note-id');
            const draggedFolderId = e.dataTransfer.getData('text/folder-id');
            if (noteId) moveNoteToFolder(noteId, f.id);
            else if (draggedFolderId) reparentFolder(draggedFolderId, f.id);
          }}
          style={{
            ...rowStyle(activeFolder === f.id), flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingLeft: 10 + depth * 16,
            color: activeFolder === f.id ? theme.accentText : theme.textMuted,
            outline: dragOverFolder === f.id ? `2px dashed ${theme.accent}` : 'none', outlineOffset: -2,
          }}
        >
          {hasKids ? (
            <span
              onClick={(e) => { e.stopPropagation(); toggleFolderCollapsed(f.id); }}
              style={{ display: 'flex', cursor: 'pointer', opacity: 0.6, flexShrink: 0, transform: collapsed ? 'none' : 'rotate(90deg)' }}
            >
              <Icon name="chevron" size={11} />
            </span>
          ) : (
            <span style={{ width: 11, flexShrink: 0 }} />
          )}
          <Icon name="folder" size={15} />
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
          <span
            onClick={(e) => { e.stopPropagation(); setNewFolderParentId(f.id); setNewFolderOpen(true); }}
            title={t('codeLibrary.newSubfolder')}
            style={{ display: 'flex', opacity: 0.5, cursor: 'pointer', flexShrink: 0 }}
          >
            <Icon name="plus" size={12} />
          </span>
          <span style={{ fontSize: 11.5, opacity: 0.7, flexShrink: 0 }}>{f.noteCount}</span>
        </div>
        {hasKids && !collapsed && kids.map((k) => renderFolderNode(k, depth + 1))}
      </div>
    );
  };

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
            title={t('notes.newNoteButton')}
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
          {folders.filter((f) => !f.parentId).map((f) => renderFolderNode(f, 0))}
          {newFolderOpen ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 4px 2px' }}>
              {newFolderParentId && (
                <div style={{ fontSize: 11, color: theme.textMuted }}>
                  {t('codeLibrary.newFolderInside', { name: folders.find((f) => f.id === newFolderParentId)?.name || '' })}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
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
            </div>
          ) : (
            <div
              onClick={() => { setNewFolderParentId(null); setNewFolderOpen(true); }}
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
              <span onClick={openHistory} title={t('notes.history')} style={{ display: 'flex', cursor: 'pointer' }}>
                <Icon name="history" size={17} color={theme.textMuted} />
              </span>
              <button onClick={trashSelected} style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                {t('common.delete')}
              </button>
            </div>
          </div>

          {historyOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: theme.subtleBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t('notes.history')}</div>
                <span onClick={() => setHistoryOpen(false)} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 16, padding: '0 4px' }}>
                  &times;
                </span>
              </div>
              {versionsLoading && <div style={{ fontSize: 12, color: theme.textMuted }}>{t('common.loading')}</div>}
              {!versionsLoading && versions.length === 0 && (
                <div style={{ fontSize: 12, color: theme.textMuted }}>{t('notes.noHistoryYet')}</div>
              )}
              {!versionsLoading && versions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto' }}>
                  {versions.map((v) => (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderRadius: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</div>
                        <div style={{ fontSize: 11, color: theme.textMuted }}>{new Date(v.createdAt).toLocaleString()}</div>
                      </div>
                      <button
                        onClick={() => restoreVersion(v.id)}
                        disabled={restoringId === v.id}
                        style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 7, padding: '5px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0, opacity: restoringId === v.id ? 0.6 : 1 }}
                      >
                        {restoringId === v.id ? t('notes.restoring') : t('notes.restore')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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

          <div onPaste={handlePaste} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
              ) : block.type === 'link' ? (
                <a
                  key={block.id}
                  href={block.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10,
                    border: `1px solid ${theme.border}`, background: theme.subtleBg, textDecoration: 'none', color: 'inherit',
                  }}
                >
                  {block.favicon ? (
                    <img src={block.favicon} alt="" style={{ width: 18, height: 18, flexShrink: 0 }} />
                  ) : (
                    <Icon name="link" size={16} color={theme.textMuted} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{block.title || block.url}</div>
                    <div style={{ fontSize: 11.5, color: theme.textMuted, textDecoration: 'underline', textDecorationStyle: 'dashed', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {block.url}
                    </div>
                  </div>
                  <span
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteBlock(block.id); }}
                    style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '2px 6px', flexShrink: 0 }}
                  >
                    &times;
                  </span>
                </a>
              ) : (
                <div key={block.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <AutoResizeTextarea
                    value={block.value}
                    onChange={(e) => updateBlock(block.id, { value: e.target.value })}
                    placeholder={t('notes.writePlaceholder')}
                    style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 14, lineHeight: 1.6, color: theme.textPrimary, fontFamily: 'inherit', flex: 1, minWidth: 0 }}
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

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="link" size={12} /> {t('notes.linkedNotes')}
              </div>
              <span onClick={openLinkPicker} style={{ fontSize: 11, fontWeight: 700, color: theme.accentText, cursor: 'pointer' }}>
                {t('notes.addLink')}
              </span>
            </div>
            {(selected.links || []).length === 0 ? (
              <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('notes.noLinkedNotes')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(selected.links || []).map((link) => {
                  const target = notes.find((n) => n.id === link.noteId);
                  if (!target) return null;
                  return (
                    <div
                      key={link.noteId}
                      onClick={() => setPreviewNoteId(link.noteId)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: theme.subtleBg }}
                    >
                      <Icon name="doc" size={14} color={theme.textMuted} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {link.label && (
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.accentText }}>{link.label}</div>
                        )}
                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{target.title}</div>
                      </div>
                      <span
                        onClick={(e) => { e.stopPropagation(); removeLink(link.noteId); }}
                        title={t('notes.removeLink')}
                        style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '0 4px', flexShrink: 0 }}
                      >
                        &times;
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="link" size={12} /> {t('notes.linkedFrom')}
            </div>
            {backlinks.length === 0 ? (
              <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('notes.noBacklinks')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {backlinks.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => setSelectedId(n.id)}
                    style={{ padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: theme.subtleBg }}
                  >
                    {n.title}
                  </div>
                ))}
              </div>
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

      {linkPickerOpen && (
        <div
          onClick={() => setLinkPickerOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 420, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
              borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 800 }}>{t('notes.linkPickerTitle')}</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '9px 12px' }}>
              <Icon name="search" size={14} />
              <input
                value={linkPickerSearch}
                onChange={(e) => setLinkPickerSearch(e.target.value)}
                placeholder={t('notes.linkPickerSearchPlaceholder')}
                autoFocus
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: theme.textPrimary, flex: 1, minWidth: 0 }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto' }}>
              {linkCandidates.length === 0 && (
                <div style={{ fontSize: 12.5, color: theme.textMuted, padding: '6px 4px' }}>{t('notes.noNotesFound')}</div>
              )}
              {linkCandidates.map((n) => (
                <div
                  key={n.id}
                  onClick={() => setLinkPickTarget(n.id)}
                  style={{
                    padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    background: linkPickTarget === n.id ? theme.accentSoftBg : 'transparent',
                    color: linkPickTarget === n.id ? theme.accentText : theme.textPrimary,
                  }}
                >
                  {n.title}
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                {t('notes.linkLabelPlaceholder')}
              </div>
              <input
                value={linkLabelDraft}
                onChange={(e) => setLinkLabelDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmAddLink()}
                placeholder={t('notes.linkLabelPlaceholder')}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={() => setLinkPickerOpen(false)}
                style={{ flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmAddLink}
                disabled={!linkPickTarget}
                style={{
                  flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', opacity: linkPickTarget ? 1 : 0.5,
                }}
              >
                {t('common.add')}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewNote && (
        <div
          onClick={() => setPreviewNoteId(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 560, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
              borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, fontSize: 17, fontWeight: 800, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{previewNote.title}</div>
              <span onClick={() => setPreviewNoteId(null)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 20, padding: '0 2px', flexShrink: 0 }}>
                &times;
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {getBlocks(previewNote).map((block) => {
                if (block.type === 'code') {
                  const lines = highlightCode(block.value, block.language || 'abap');
                  return (
                    <pre key={block.id} style={{ margin: 0, padding: 12, fontSize: 13, lineHeight: 1.6, overflowX: 'auto', fontFamily: 'var(--font-mono)', background: theme.subtleBg, border: `1px solid ${theme.border}`, borderRadius: 10 }}>
                      {lines.map((tokens, i) => (
                        <div key={i} style={{ display: 'flex' }}>
                          <span style={{ display: 'inline-block', width: 28, flexShrink: 0, textAlign: 'right', marginRight: 12, color: theme.textMuted, opacity: 0.5, userSelect: 'none' }}>
                            {i + 1}
                          </span>
                          <span>
                            {tokens.map((tok, j) => (
                              <span key={j} style={{ color: tokenColor(tok.type, theme.dark) }}>
                                {tok.text}
                              </span>
                            ))}
                            {tokens.length === 0 && ' '}
                          </span>
                        </div>
                      ))}
                    </pre>
                  );
                }
                if (block.type === 'image') {
                  return <img key={block.id} src={block.url} alt="" style={{ maxWidth: '100%', borderRadius: 10, display: 'block' }} />;
                }
                if (block.type === 'link') {
                  return (
                    <a
                      key={block.id}
                      href={block.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10,
                        border: `1px solid ${theme.border}`, background: theme.subtleBg, textDecoration: 'none', color: 'inherit',
                      }}
                    >
                      {block.favicon ? (
                        <img src={block.favicon} alt="" style={{ width: 18, height: 18, flexShrink: 0 }} />
                      ) : (
                        <Icon name="link" size={16} color={theme.textMuted} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{block.title || block.url}</div>
                        <div style={{ fontSize: 11.5, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{block.url}</div>
                      </div>
                    </a>
                  );
                }
                return (
                  <div key={block.id} style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: theme.textPrimary }}>
                    {block.value}
                  </div>
                );
              })}
            </div>

            <button
              onClick={openNoteFromPreview}
              style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              {t('notes.openNote')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
