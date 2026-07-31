import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useCounts } from '../context/CountsContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import IconPicker from '../components/IconPicker.jsx';
import { htmlToMarkdown, markdownToHtml } from '../lib/markdown.js';
import TemplateMenu from '../components/TemplateMenu.jsx';
import SaveTemplateButton from '../components/SaveTemplateButton.jsx';
import CodeBlock from '../components/CodeBlock.jsx';
import LinkedItemsPanel from '../components/LinkedItemsPanel.jsx';
import { highlightCode, tokenColor } from '../lib/highlight.js';
import { useClickOutside } from '../lib/useClickOutside.js';
import { backdropClose } from '../lib/backdropClose.js';
import { useIsMobile } from '../lib/useIsMobile.js';

const URL_ONLY_RE = /^(https?:\/\/|www\.)\S+$/i;
const BARE_URL_RE = /(https?:\/\/[^\s<>"')\]]+|www\.[^\s<>"')\]]+)/g;

function normalizeUrl(text) {
  // Drop trailing punctuation that tends to hitch a ride when a URL is
  // copied as part of a sentence (e.g. "see https://sap.com.").
  const trimmed = text.replace(/[.,;:)\]]+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Notes written before this feature (or through any other path that stores
// plain text) never got HTML-escaped, so a literal "<" or a leftover
// "**word**" from earlier testing must not be interpreted as markup when we
// hand it to innerHTML — only content explicitly tagged format:'html' (i.e.
// produced by this editor) is trusted as real HTML.
function textBlockToHtml(block) {
  if (block.format === 'html') return block.value || '';
  return escapeHtml(block.value || '').replace(/\n/g, '<br>');
}

function htmlToPlainText(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent || '';
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Turns bare URLs left in the text into real <a> elements (with a favicon)
// after the user finishes editing — done on blur via a DOM walk rather than
// on every keystroke so it doesn't fight the user while they're still typing.
function linkifyElement(el, theme) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    let insideLink = false;
    for (let p = node.parentElement; p && p !== el; p = p.parentElement) {
      if (p.tagName === 'A') { insideLink = true; break; }
    }
    if (!insideLink && BARE_URL_RE.test(node.textContent)) textNodes.push(node);
    BARE_URL_RE.lastIndex = 0;
  }
  if (textNodes.length === 0) return false;

  for (const textNode of textNodes) {
    const text = textNode.textContent;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let m;
    BARE_URL_RE.lastIndex = 0;
    while ((m = BARE_URL_RE.exec(text))) {
      if (m.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
      const cleaned = m[0].replace(/[.,;:)\]]+$/, '');
      const trailing = m[0].slice(cleaned.length);
      const href = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.style.color = theme.accentText;
      a.style.textDecoration = 'underline';
      a.style.textDecorationStyle = 'dashed';
      try {
        const host = new URL(href).hostname;
        const img = document.createElement('img');
        img.src = `https://www.google.com/s2/favicons?sz=32&domain=${host}`;
        img.alt = '';
        img.style.width = '13px';
        img.style.height = '13px';
        img.style.verticalAlign = 'text-bottom';
        img.style.marginRight = '4px';
        img.onerror = () => { img.style.display = 'none'; };
        a.appendChild(img);
      } catch {
        // malformed URL — link still works, just without a favicon
      }
      a.appendChild(document.createTextNode(cleaned));
      frag.appendChild(a);
      if (trailing) frag.appendChild(document.createTextNode(trailing));
      lastIndex = m.index + m[0].length;
    }
    if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    textNode.parentNode.replaceChild(frag, textNode);
  }
  return true;
}

// A plain <div contentEditable> for one text block. Native execCommand
// formatting needs a real focused DOM element to act on, so this stays
// uncontrolled — value is only pushed back into the DOM when the block
// isn't the one currently being typed into, to avoid resetting the cursor
// on every keystroke-triggered re-render.
function TextBlockEditor({ block, theme, placeholder, elRefCallback, onChange, onFocusBlock, onBlurBlock }) {
  const elRef = useRef(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el || document.activeElement === el) return;
    const html = textBlockToHtml(block);
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [block.value, block.format]);

  return (
    <div
      ref={(el) => { elRef.current = el; elRefCallback(el); }}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={(e) => {
        const el = e.currentTarget;
        // Browsers leave a stray <br> behind after the last character is
        // deleted, which would defeat the :empty placeholder selector.
        if (el.innerHTML === '<br>') el.innerHTML = '';
        onChange(el.innerHTML);
      }}
      onFocus={onFocusBlock}
      onBlur={(e) => {
        const el = e.currentTarget;
        if (linkifyElement(el, theme)) onChange(el.innerHTML);
        onBlurBlock();
      }}
      style={{
        border: 'none', outline: 'none', background: 'transparent', fontSize: 14, lineHeight: 1.6,
        color: theme.textPrimary, fontFamily: 'inherit', flex: 1, minWidth: 0, wordBreak: 'break-word',
      }}
    />
  );
}

// Single-line contentEditable for heading blocks — plain text only (no rich
// formatting) so headings can double as reliable, greppable TOC anchors.
function HeadingBlockEditor({ block, theme, placeholder, elRefCallback, onChange }) {
  const elRef = useRef(null);
  const sizeByLevel = { 1: 22, 2: 18, 3: 15.5 };

  useEffect(() => {
    const el = elRef.current;
    if (!el || document.activeElement === el) return;
    if (el.textContent !== (block.value || '')) el.textContent = block.value || '';
  }, [block.value]);

  return (
    <div
      ref={(el) => { elRef.current = el; elRefCallback(el); }}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={(e) => onChange(e.currentTarget.textContent)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
      }}
      style={{
        border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-display)',
        fontWeight: 800, fontSize: sizeByLevel[block.level] || 18, color: theme.textPrimary, flex: 1, minWidth: 0, wordBreak: 'break-word',
      }}
    />
  );
}

const SLASH_COMMAND_LABEL_KEYS = {
  heading1: 'notes.slashHeading1',
  heading2: 'notes.slashHeading2',
  heading3: 'notes.slashHeading3',
  toggle: 'notes.slashToggle',
  checklist: 'notes.slashChecklist',
  code: 'notes.slashCode',
  toc: 'notes.slashToc',
  page: 'notes.slashPage',
};

// Floating menu triggered by typing "/" as the only content of an empty text
// block — filters live as the user keeps typing after the slash.
function SlashMenu({ theme, t, query, commands, loading, onSelect }) {
  const filtered = commands.filter((c) => {
    const label = t(SLASH_COMMAND_LABEL_KEYS[c.key]).toLowerCase();
    return !query || label.includes(query) || c.key.includes(query);
  });
  return (
    <div
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: 'absolute', top: '100%', left: 0, marginTop: 4, background: theme.dark ? 'oklch(0.2 0.02 255)' : '#fff',
        border: `1px solid ${theme.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', padding: 6, minWidth: 230, zIndex: 20,
      }}
    >
      {filtered.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12, color: theme.textMuted }}>{t('notes.slashNoMatch')}</div>}
      {filtered.map((c) => (
        <div
          key={c.key}
          onClick={() => !loading && onSelect(c)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7,
            cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1, fontSize: 13, fontWeight: 600, color: theme.textPrimary,
          }}
        >
          <Icon name={c.icon} size={14} color={theme.textMuted} />
          {t(SLASH_COMMAND_LABEL_KEYS[c.key])}
        </div>
      ))}
    </div>
  );
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
    .filter((b) => b.type !== 'image' && b.type !== 'file' && b.type !== 'toc')
    .map((b) => {
      if (b.type === 'checklist') return (b.items || []).map((it) => it.text).join(' ');
      if (b.type === 'text' && b.format === 'html') return htmlToPlainText(b.value);
      if (b.type === 'toggle') return `${b.summary || ''} ${htmlToPlainText(b.value || '')}`.trim();
      if (b.type === 'page') return b.title || '';
      return b.value || '';
    })
    .join('\n\n')
    .trim();
}

export default function Notes() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const { refresh: refreshCounts } = useCounts();
  const location = useLocation();
  const isMobile = useIsMobile();
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
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiSuggestError, setAiSuggestError] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState(null);
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
  const [editingTextBlockId, setEditingTextBlockId] = useState(null);
  const [slashMenuBlockId, setSlashMenuBlockId] = useState(null);
  const [slashMenuQuery, setSlashMenuQuery] = useState('');
  const [creatingChildPage, setCreatingChildPage] = useState(false);
  const blockSaveTimerRef = useRef(null);
  const pendingBlockSaveRef = useRef(null);
  const textareaRefsRef = useRef({});
  const blockElRefsRef = useRef({});
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState('');
  const bulkMoveRef = useRef(null);
  useClickOutside(bulkMoveRef, () => setBulkMoveOpen(false), bulkMoveOpen);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef(null);
  useClickOutside(exportMenuRef, () => setExportMenuOpen(false), exportMenuOpen);
  const importInputRef = useRef(null);
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef(null);
  useClickOutside(shareRef, () => setShareOpen(false), shareOpen);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const fileInputRef = useRef(null);

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
  const mobileShowDetail = isMobile && (!!selectedId || showTrash);

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
    if (!isMobile && !selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId, isMobile]);

  // Tapping the "Notas" mobile tab while already on this page (e.g. deep in
  // a note's editor) doesn't trigger a route change, so react-router won't
  // reset anything on its own — the bottom nav broadcasts this event so we
  // can return to the list ourselves.
  useEffect(() => {
    if (!isMobile) return undefined;
    const onTabTap = (e) => {
      if (e.detail !== 'notes') return;
      setSelectedId(null);
      setShowTrash(false);
    };
    window.addEventListener('mobile-tab-tap', onTabTap);
    return () => window.removeEventListener('mobile-tab-tap', onTabTap);
  }, [isMobile]);

  // Selection is scoped to whatever's currently visible — switching folders
  // mid-selection left stale, invisible notes counted as "selected", which
  // read as the bulk toolbar being stuck/confused.
  useEffect(() => {
    setSelectedIds(new Set());
    setBulkMoveOpen(false);
  }, [activeFolder]);

  useEffect(() => {
    setTitleDraft(selected?.title ?? '');
    setHistoryOpen(false);
    setAiSuggestion(null);
    setAiSuggestError('');
    setShareOpen(false);
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

  const addNoteFromTemplate = async (tpl) => {
    const blocks = Array.isArray(tpl.data.blocks) && tpl.data.blocks.length ? tpl.data.blocks : [{ id: newBlockId(), type: 'text', value: '' }];
    const { note } = await api.createNote({
      title: tpl.data.title || tpl.name,
      content: contentFromBlocks(blocks),
      blocks,
      folderId: activeFolder !== 'all' && activeFolder !== 'none' ? activeFolder : null,
    });
    setNotes((prev) => [note, ...prev]);
    setSelectedId(note.id);
    refreshCounts();
  };

  const importMarkdownFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const folderId = activeFolder !== 'all' && activeFolder !== 'none' ? activeFolder : null;
    const created = [];
    for (const file of files) {
      const text = await file.text();
      const firstHeading = text.match(/^#\s+(.+)/m);
      const title = firstHeading ? firstHeading[1].trim() : file.name.replace(/\.(md|markdown)$/i, '');
      const html = markdownToHtml(firstHeading ? text.replace(firstHeading[0], '').trim() : text);
      const blocks = [{ id: newBlockId(), type: 'text', value: html, format: 'html' }];
      const { note } = await api.createNote({ title, content: contentFromBlocks(blocks), blocks, folderId });
      created.push(note);
    }
    setNotes((prev) => [...created, ...prev]);
    if (created[0]) setSelectedId(created[0].id);
    refreshCounts();
  };

  // The editable/renderable source of truth is `blocks`, not the plain-text
  // `content` field (which is a lossy search index derived from blocks) —
  // export has to walk the same blocks the editor renders, or formatting
  // and non-text block types (checklists, code) silently disappear.
  const noteBlocksAsHtml = (note) =>
    getBlocks(note)
      .map((b) => {
        if (b.type === 'checklist') {
          const items = (b.items || []).map((it) => `<li>${it.checked ? '☑' : '☐'} ${it.text || ''}</li>`).join('');
          return `<ul>${items}</ul>`;
        }
        if (b.type === 'code') return `<pre><code>${(b.value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code></pre>`;
        if (b.type === 'image' || b.type === 'file') return '';
        if (b.format === 'html') return `<div>${b.value || ''}</div>`;
        return `<p>${(b.value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`;
      })
      .join('\n');

  const exportNoteAsMarkdown = () => {
    if (!selected) return;
    const md = `# ${selected.title}\n\n${htmlToMarkdown(noteBlocksAsHtml(selected))}`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selected.title.replace(/[^\w\-]+/g, '_') || 'note'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleShare = async () => {
    if (!selected) return;
    setShareLoading(true);
    try {
      if (selected.shareToken) {
        await api.unshareNote(selected.id);
        setNotes((prev) => prev.map((n) => (n.id === selected.id ? { ...n, shareToken: null } : n)));
      } else {
        const { shareToken } = await api.shareNote(selected.id);
        setNotes((prev) => prev.map((n) => (n.id === selected.id ? { ...n, shareToken } : n)));
      }
    } finally {
      setShareLoading(false);
    }
  };

  const copyShareLink = () => {
    if (!selected?.shareToken) return;
    navigator.clipboard.writeText(`${window.location.origin}/s/${selected.shareToken}`);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1500);
  };

  const exportNoteAsPdf = () => {
    if (!selected) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>${selected.title}</title>
          <style>
            body { font-family: -apple-system, Segoe UI, sans-serif; max-width: 720px; margin: 40px auto; color: #1a1a1a; line-height: 1.6; }
            h1 { font-size: 22px; }
          </style>
        </head>
        <body>
          <h1>${selected.title}</h1>
          ${noteBlocksAsHtml(selected)}
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
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

  const refreshFolders = async () => {
    const { folders } = await api.listFolders();
    setFolders(folders);
  };

  const moveNoteToFolder = async (noteId, folderId) => {
    const { note } = await api.updateNote(noteId, { folderId });
    setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
    refreshFolders();
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
    refreshFolders();
  };

  const restoreNote = async (id) => {
    await api.restoreNote(id);
    await load();
    await loadTrash();
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkMoveOpen(false);
  };

  const bulkTrash = async () => {
    const ok = await confirm({ message: t('common.confirmTrashMessage') });
    if (!ok) return;
    const ids = [...selectedIds];
    await Promise.all(ids.map((id) => api.trashNote(id)));
    setNotes((prev) => prev.filter((n) => !selectedIds.has(n.id)));
    if (selectedId && selectedIds.has(selectedId)) setSelectedId(null);
    clearSelection();
    refreshCounts();
    refreshFolders();
  };

  const bulkMove = async (folderId) => {
    const ids = [...selectedIds];
    const updated = await Promise.all(ids.map((id) => api.updateNote(id, { folderId })));
    const byId = new Map(updated.map(({ note }) => [note.id, note]));
    setNotes((prev) => prev.map((n) => byId.get(n.id) || n));
    // The note shown on the right can otherwise keep pointing at a note
    // that just moved out of the folder currently being viewed, even
    // though it's no longer in the visible list on the left.
    if (selectedId && selectedIds.has(selectedId)) setSelectedId(null);
    clearSelection();
    refreshFolders();
  };

  const bulkAddTag = async () => {
    const tagName = bulkTagInput.trim();
    if (!tagName) return;
    let tag = tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
    if (!tag) {
      const res = await api.createTag({ name: tagName });
      tag = res.tag;
      setTags((prev) => [...prev, tag]);
    }
    const ids = [...selectedIds];
    const updated = await Promise.all(
      ids.map((id) => {
        const note = notes.find((n) => n.id === id);
        const noteTags = [...new Set([...(note?.tags || []), tag.name])];
        return api.updateNote(id, { tags: noteTags });
      })
    );
    const byId = new Map(updated.map(({ note }) => [note.id, note]));
    setNotes((prev) => prev.map((n) => byId.get(n.id) || n));
    setBulkTagInput('');
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

  const suggestTagsAndFolder = async () => {
    if (!selected) return;
    setAiSuggesting(true);
    setAiSuggestError('');
    setAiSuggestion(null);
    try {
      const { tags: suggested, folder } = await api.suggestNoteTags(selected.id);
      const newTags = suggested.filter((name) => !(selected.tags || []).includes(name));
      const matchedFolder = folder ? folders.find((f) => f.name === folder) : null;
      setAiSuggestion({
        tags: newTags.map((name) => ({ name, include: true })),
        folder: matchedFolder && matchedFolder.id !== selected.folderId ? matchedFolder : null,
        includeFolder: true,
      });
    } catch (err) {
      setAiSuggestError(err.message || t('notes.aiSuggestFailed'));
    } finally {
      setAiSuggesting(false);
    }
  };

  const applyAiSuggestion = async () => {
    if (!aiSuggestion || !selected) return;
    const tagsToAdd = aiSuggestion.tags.filter((tg) => tg.include).map((tg) => tg.name);
    const nextTags = [...new Set([...(selected.tags || []), ...tagsToAdd])];
    if (tagsToAdd.length > 0) await patchSelected({ tags: nextTags });
    if (aiSuggestion.folder && aiSuggestion.includeFolder) await moveNoteToFolder(selected.id, aiSuggestion.folder.id);
    setAiSuggestion(null);
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

  const flushBlockSave = () => {
    clearTimeout(blockSaveTimerRef.current);
    blockSaveTimerRef.current = null;
    const pending = pendingBlockSaveRef.current;
    pendingBlockSaveRef.current = null;
    if (pending) patchNoteById(pending.noteId, { blocks: pending.blocks, content: contentFromBlocks(pending.blocks) });
  };

  const updateBlocks = async (blocks) => {
    flushBlockSave();
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

  const addFileBlock = (url, name, size) => {
    if (!selected) return;
    updateBlocks([...getBlocks(selected), { id: newBlockId(), type: 'file', url, name, size }]);
  };

  const onFileInputChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const { url, name, size } = await api.uploadNoteFile(file);
    addFileBlock(url, name, size);
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
        if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          const { url } = await api.uploadNoteImage(file);
          addImageBlock(url);
          return;
        }
        if (item.kind === 'file') {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          const { url, name, size } = await api.uploadNoteFile(file);
          addFileBlock(url, name, size);
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

  const saveBlocksDebounced = (blocks) => {
    if (!selected) return;
    const noteId = selected.id;
    // Echo the keystroke into local state immediately (no network round-trip
    // in the render path — awaiting a PATCH per keystroke let out-of-order
    // responses clobber newer edits, garbling fast typing/paste).
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, blocks, content: contentFromBlocks(blocks) } : n)));
    pendingBlockSaveRef.current = { noteId, blocks };
    clearTimeout(blockSaveTimerRef.current);
    blockSaveTimerRef.current = setTimeout(flushBlockSave, 500);
  };

  const updateBlock = (blockId, patch) => {
    if (!selected) return;
    saveBlocksDebounced(getBlocks(selected).map((b) => (b.id === blockId ? { ...b, ...patch } : b)));
  };

  // Word-style instant formatting: toggles bold/italic/underline on the
  // current selection via the browser's own native command (no markup
  // symbols ever touch the stored value). Inline code has no execCommand
  // equivalent, so it's wrapped by hand with a Range.
  const applyFormatting = (command) => {
    const blockId = editingTextBlockId;
    const el = blockId && textareaRefsRef.current[blockId];
    if (!selected || !el) return;
    el.focus();
    if (command === 'code') {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return;
      const codeEl = document.createElement('code');
      codeEl.style.background = theme.subtleBg;
      codeEl.style.padding = '1px 5px';
      codeEl.style.borderRadius = '4px';
      codeEl.style.fontFamily = 'var(--font-mono)';
      codeEl.style.fontSize = '0.9em';
      try {
        range.surroundContents(codeEl);
      } catch {
        const contents = range.extractContents();
        codeEl.appendChild(contents);
        range.insertNode(codeEl);
      }
      sel.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(codeEl);
      sel.addRange(newRange);
    } else {
      document.execCommand(command, false, null);
    }
    updateBlock(blockId, { value: el.innerHTML, format: 'html' });
  };

  // Font family/size are applied via <select> dropdowns, which steal focus
  // (and collapse the contentEditable selection) the moment they're
  // interacted with — so the Range has to be captured on mousedown, before
  // the browser moves focus, and reused on change. Wraps the selection in a
  // styled <span> by hand (same technique as inline code) rather than the
  // deprecated execCommand('fontName'/'fontSize'), which emits legacy tags.
  // Blurring the contentEditable (which happens the instant the font
  // controls are interacted with) also resets editingTextBlockId to null via
  // onBlurBlock — so the block id has to be captured here too, not just the
  // Range, or applyInlineStyle would silently no-op once the blur has fired.
  const savedRangeRef = useRef(null);

  const saveSelectionRange = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed && editingTextBlockId) {
      savedRangeRef.current = { blockId: editingTextBlockId, range: sel.getRangeAt(0).cloneRange() };
    }
  };

  const applyInlineStyle = (styleProp, value) => {
    const saved = savedRangeRef.current;
    const blockId = saved?.blockId;
    const el = blockId && textareaRefsRef.current[blockId];
    const range = saved?.range;
    if (!selected || !el || !range || !el.contains(range.commonAncestorContainer)) return;
    const span = document.createElement('span');
    span.style[styleProp] = value;
    try {
      range.surroundContents(span);
    } catch {
      const contents = range.extractContents();
      span.appendChild(contents);
      range.insertNode(span);
    }
    el.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.addRange(newRange);
    savedRangeRef.current = { blockId, range: newRange.cloneRange() };
    setEditingTextBlockId(blockId);
    updateBlock(blockId, { value: el.innerHTML, format: 'html' });
  };

  const addChecklistBlock = () => {
    if (!selected) return;
    updateBlocks([...getBlocks(selected), { id: newBlockId(), type: 'checklist', items: [{ id: newBlockId(), text: '', done: false }] }]);
  };

  const updateChecklistItemText = (blockId, itemId, text) => {
    if (!selected) return;
    const blocks = getBlocks(selected).map((b) =>
      b.id === blockId ? { ...b, items: b.items.map((it) => (it.id === itemId ? { ...it, text } : it)) } : b
    );
    saveBlocksDebounced(blocks);
  };

  const toggleChecklistItemDone = (blockId, itemId) => {
    if (!selected) return;
    const blocks = getBlocks(selected).map((b) =>
      b.id === blockId ? { ...b, items: b.items.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it)) } : b
    );
    updateBlocks(blocks);
  };

  const addChecklistItem = (blockId) => {
    if (!selected) return;
    const blocks = getBlocks(selected).map((b) =>
      b.id === blockId ? { ...b, items: [...b.items, { id: newBlockId(), text: '', done: false }] } : b
    );
    updateBlocks(blocks);
  };

  const removeChecklistItem = (blockId, itemId) => {
    if (!selected) return;
    const blocks = getBlocks(selected)
      .map((b) => (b.id === blockId ? { ...b, items: b.items.filter((it) => it.id !== itemId) } : b))
      .filter((b) => b.id !== blockId || b.items.length > 0);
    updateBlocks(blocks);
  };

  const deleteBlock = (blockId) => {
    if (!selected) return;
    const blocks = getBlocks(selected).filter((b) => b.id !== blockId);
    updateBlocks(blocks.length > 0 ? blocks : [{ id: newBlockId(), type: 'text', value: '' }]);
  };

  // --- Slash-command-insertable block types: headings (TOC anchors), toggle
  // (collapsible) sections, an auto table-of-contents, and nested pages. ---

  const replaceBlockAt = (blockId, factory) => {
    if (!selected) return;
    const blocks = getBlocks(selected).map((b) => (b.id === blockId ? factory(b) : b));
    updateBlocks(blocks);
    setSlashMenuBlockId(null);
    setSlashMenuQuery('');
  };

  const addHeadingBlock = (level) => {
    if (!selected) return;
    updateBlocks([...getBlocks(selected), { id: newBlockId(), type: 'heading', level, value: '' }]);
  };

  const addToggleBlock = () => {
    if (!selected) return;
    updateBlocks([...getBlocks(selected), { id: newBlockId(), type: 'toggle', summary: '', value: '', open: true }]);
  };

  const addTocBlock = () => {
    if (!selected) return;
    updateBlocks([...getBlocks(selected), { id: newBlockId(), type: 'toc' }]);
  };

  const toggleToggleOpen = (blockId) => {
    if (!selected) return;
    const blocks = getBlocks(selected).map((b) => (b.id === blockId ? { ...b, open: !b.open } : b));
    updateBlocks(blocks);
  };

  const scrollToBlock = (blockId) => {
    blockElRefsRef.current[blockId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Creates a real child Note (parentNoteId = the note currently open) and
  // drops an inline "page" block referencing it — Notion-style pages inside
  // pages. Navigating into the child just swaps `selectedId`, since it's a
  // normal note already present in the `notes` list.
  const createChildPage = async (replaceBlockId) => {
    if (!selected || creatingChildPage) return;
    setCreatingChildPage(true);
    try {
      const parentId = selected.id;
      const { note: child } = await api.createNote({
        title: t('notes.untitledNote'),
        content: '',
        blocks: [{ id: newBlockId(), type: 'text', value: '' }],
        parentNoteId: parentId,
      });
      setNotes((prev) => [child, ...prev]);
      const pageBlock = { id: newBlockId(), type: 'page', childNoteId: child.id, title: child.title };
      const currentBlocks = getBlocks(selected);
      const blocks = replaceBlockId
        ? currentBlocks.map((b) => (b.id === replaceBlockId ? pageBlock : b))
        : [...currentBlocks, pageBlock];
      await patchNoteById(parentId, { blocks, content: contentFromBlocks(blocks) });
      setSlashMenuBlockId(null);
      setSlashMenuQuery('');
      setSelectedId(child.id);
    } finally {
      setCreatingChildPage(false);
    }
  };

  const SLASH_COMMANDS = [
    { key: 'heading1', icon: 'doc', run: (blockId) => replaceBlockAt(blockId, (b) => ({ id: b.id, type: 'heading', level: 1, value: '' })) },
    { key: 'heading2', icon: 'doc', run: (blockId) => replaceBlockAt(blockId, (b) => ({ id: b.id, type: 'heading', level: 2, value: '' })) },
    { key: 'heading3', icon: 'doc', run: (blockId) => replaceBlockAt(blockId, (b) => ({ id: b.id, type: 'heading', level: 3, value: '' })) },
    { key: 'toggle', icon: 'chevron', run: (blockId) => replaceBlockAt(blockId, (b) => ({ id: b.id, type: 'toggle', summary: '', value: '', open: true })) },
    { key: 'checklist', icon: 'check', run: (blockId) => replaceBlockAt(blockId, (b) => ({ id: b.id, type: 'checklist', items: [{ id: newBlockId(), text: '', done: false }] })) },
    { key: 'code', icon: 'code', run: (blockId) => replaceBlockAt(blockId, (b) => ({ id: b.id, type: 'code', language: 'abap', value: '' })) },
    { key: 'toc', icon: 'archive', run: (blockId) => replaceBlockAt(blockId, (b) => ({ id: b.id, type: 'toc' })) },
    { key: 'page', icon: 'doc', run: (blockId) => createChildPage(blockId) },
  ];

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const { folder } = await api.createFolder({ name: newFolderName.trim(), parentId: newFolderParentId });
    setFolders((prev) => [...prev, { ...folder, noteCount: 0 }]);
    setNewFolderName('');
    setNewFolderOpen(false);
    setNewFolderParentId(null);
  };

  const startEditFolder = (f) => {
    setEditingFolderId(f.id);
    setEditFolderName(f.name);
  };

  const commitFolderRename = async () => {
    const id = editingFolderId;
    const name = editFolderName.trim();
    setEditingFolderId(null);
    const target = folders.find((f) => f.id === id);
    if (!target || !name || name === target.name) return;
    const { folder } = await api.renameFolder(id, { name });
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, ...folder } : f)));
  };

  const setFolderIcon = async (f, icon) => {
    const { folder } = await api.renameFolder(f.id, { icon });
    setFolders((prev) => prev.map((x) => (x.id === folder.id ? { ...x, ...folder } : x)));
  };

  const removeFolder = async (f, e) => {
    e.stopPropagation();
    const ok = await confirm({ message: t('notes.confirmDeleteFolder', { name: f.name }) });
    if (!ok) return;
    await api.deleteFolder(f.id);
    if (activeFolder === f.id) setActiveFolder('all');
    await load();
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
          <IconPicker
            theme={theme} t={t} value={f.icon} onChange={(icon) => setFolderIcon(f, icon)}
            size={20} fallback={<Icon name="folder" size={15} />}
          />
          {editingFolderId === f.id ? (
            <input
              value={editFolderName}
              onChange={(e) => setEditFolderName(e.target.value)}
              onBlur={commitFolderRename}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, border: `1px solid ${theme.accent}`, borderRadius: 6, padding: '2px 6px', background: theme.cardBg, color: theme.textPrimary, outline: 'none' }}
            />
          ) : (
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
          )}
          <span
            onClick={(e) => { e.stopPropagation(); startEditFolder(f); }}
            title={t('notes.renameFolder')}
            style={{ display: 'flex', opacity: 0.5, cursor: 'pointer', flexShrink: 0 }}
          >
            <Icon name="edit" size={12} />
          </span>
          <span
            onClick={(e) => { e.stopPropagation(); setNewFolderParentId(f.id); setNewFolderOpen(true); }}
            title={t('codeLibrary.newSubfolder')}
            style={{ display: 'flex', opacity: 0.5, cursor: 'pointer', flexShrink: 0 }}
          >
            <Icon name="plus" size={12} />
          </span>
          <span
            onClick={(e) => removeFolder(f, e)}
            title={t('notes.deleteFolder')}
            style={{ display: 'flex', opacity: 0.5, cursor: 'pointer', flexShrink: 0 }}
          >
            <Icon name="trash" size={12} />
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
    <div style={{ padding: isMobile ? 14 : '24px 28px', flex: 1, display: 'flex', gap: isMobile ? 0 : 24, minHeight: 0 }}>
      {(!isMobile || !mobileShowDetail) && (
      <div style={{ flex: isMobile ? '1 1 auto' : '1 1 320px', minWidth: isMobile ? 0 : 280, maxWidth: isMobile ? 'none' : 380, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            onClick={() => (selectMode ? clearSelection() : setSelectMode(true))}
            title={t('notes.selectMode')}
            style={{
              display: 'flex', alignItems: 'center', background: selectMode ? theme.accentSoftBg : 'transparent',
              color: selectMode ? theme.accentText : theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: 9, padding: '9px 12px', cursor: 'pointer', flexShrink: 0,
            }}
          >
            <Icon name="check" size={16} />
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            title={t('notes.importMarkdown')}
            style={{ display: 'flex', alignItems: 'center', background: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: 9, padding: '9px 12px', cursor: 'pointer', flexShrink: 0 }}
          >
            <Icon name="external" size={16} />
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".md,.markdown"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { importMarkdownFiles(e.target.files); e.target.value = ''; }}
          />
          <TemplateMenu entityType="note" onUse={addNoteFromTemplate} />
          <button
            onClick={addNote}
            title={t('notes.newNoteButton')}
            style={{ display: 'flex', alignItems: 'center', background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 12px', cursor: 'pointer', flexShrink: 0 }}
          >
            <Icon name="plus" size={16} color="#fff" />
          </button>
        </div>

        {selectMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: theme.accentSoftBg, borderRadius: 10, padding: '8px 10px' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: theme.accentText, marginRight: 4 }}>
              {t('notes.selectedCount', { n: selectedIds.size })}
            </span>
            <button onClick={bulkTrash} disabled={selectedIds.size === 0} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: selectedIds.size ? 'pointer' : 'default', opacity: selectedIds.size ? 1 : 0.5 }}>
              {t('common.delete')}
            </button>
            <div ref={bulkMoveRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setBulkMoveOpen((v) => !v)}
                disabled={selectedIds.size === 0}
                style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 7, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: selectedIds.size ? 'pointer' : 'default', opacity: selectedIds.size ? 1 : 0.5 }}
              >
                {t('notes.moveTo')}
              </button>
              {bulkMoveOpen && (
                <div
                  style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, minWidth: 160,
                    background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
                    borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.25)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto',
                  }}
                >
                  <div onClick={() => { bulkMove(null); setBulkMoveOpen(false); }} style={{ padding: '7px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, color: theme.textPrimary }}>
                    {t('notes.allNotes')}
                  </div>
                  {folders.map((f) => (
                    <div key={f.id} onClick={() => { bulkMove(f.id); setBulkMoveOpen(false); }} style={{ padding: '7px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, color: theme.textPrimary }}>
                      {f.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <input
              value={bulkTagInput}
              onChange={(e) => setBulkTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && bulkAddTag()}
              placeholder={t('notes.bulkAddTagPlaceholder')}
              disabled={selectedIds.size === 0}
              style={{ border: `1px solid ${theme.border}`, borderRadius: 7, padding: '5px 9px', fontSize: 12, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', width: 110 }}
            />
            <span onClick={clearSelection} style={{ marginLeft: 'auto', cursor: 'pointer', color: theme.textMuted, fontSize: 12.5, fontWeight: 600 }}>
              {t('common.cancel')}
            </span>
          </div>
        )}

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
              draggable={!selectMode}
              onDragStart={(e) => e.dataTransfer.setData('text/note-id', n.id)}
              onClick={() => (selectMode ? toggleSelected(n.id) : setSelectedId(n.id))}
              style={{ ...rowStyle(selectMode ? selectedIds.has(n.id) : selected?.id === n.id), cursor: selectMode ? 'pointer' : 'grab' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {selectMode && (
                  <span
                    style={{
                      width: 16, height: 16, borderRadius: 5, border: `1.5px solid ${selectedIds.has(n.id) ? theme.accent : theme.border}`,
                      background: selectedIds.has(n.id) ? theme.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}
                  >
                    {selectedIds.has(n.id) && <Icon name="check" size={11} color="#fff" strokeWidth={3} />}
                  </span>
                )}
                {n.pinned && <Icon name="pin" size={13} color={theme.accentText} />}
                <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.icon ? `${n.icon} ` : ''}{n.title}</div>
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
      )}

      {(!isMobile || mobileShowDetail) && (showTrash ? (
        <div style={{ flex: isMobile ? '1 1 auto' : '1 1 480px', minWidth: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isMobile && (
              <span onClick={() => setShowTrash(false)} style={{ display: 'flex', cursor: 'pointer', color: theme.textMuted, transform: 'rotate(180deg)' }}>
                <Icon name="chevron" size={18} />
              </span>
            )}
            <div style={{ fontSize: 17, fontWeight: 800 }}>{t('notes.trash')}</div>
          </div>
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
        <div style={{ flex: isMobile ? '1 1 auto' : '1 1 480px', minWidth: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {selected.parentNoteId && (() => {
            const parent = notes.find((n) => n.id === selected.parentNoteId);
            return (
              <div
                onClick={() => setSelectedId(selected.parentNoteId)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: theme.textMuted, fontSize: 12, fontWeight: 600 }}
              >
                <span style={{ display: 'flex', transform: 'rotate(180deg)' }}>
                  <Icon name="chevron" size={13} color={theme.textMuted} />
                </span>
                {t('notes.backToParent', { title: parent ? parent.title : t('notes.untitledNote') })}
              </div>
            );
          })()}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {isMobile && (
              <span onClick={() => setSelectedId(null)} style={{ display: 'flex', cursor: 'pointer', color: theme.textMuted, transform: 'rotate(180deg)', flexShrink: 0 }}>
                <Icon name="chevron" size={18} />
              </span>
            )}
            <IconPicker
              theme={theme} t={t} value={selected.icon} onChange={(icon) => patchSelected({ icon })}
              size={30} fallback={<Icon name="doc" size={15} color={theme.accentText} />}
              triggerStyle={{ background: theme.accentSoftBg }}
            />
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
              <div ref={shareRef} style={{ position: 'relative' }}>
                <span onClick={() => setShareOpen((v) => !v)} title={t('notes.share')} style={{ display: 'flex', cursor: 'pointer' }}>
                  <Icon name="link" size={17} color={selected.shareToken ? theme.accentText : theme.textMuted} />
                </span>
                {shareOpen && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: theme.dark ? 'oklch(0.22 0.02 255)' : '#fff', border: `1px solid ${theme.border}`, borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, width: 280, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 10 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t('notes.shareTitle')}</div>
                    <div style={{ fontSize: 11.5, color: theme.textMuted, lineHeight: 1.5 }}>{t('notes.shareDesc')}</div>
                    {selected.shareToken ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: theme.subtleBg, borderRadius: 7, padding: '7px 9px' }}>
                          <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: theme.textMuted }}>
                            {`${window.location.origin}/s/${selected.shareToken}`}
                          </div>
                          <span onClick={copyShareLink} style={{ cursor: 'pointer', color: theme.accentText, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            {shareCopied ? t('notes.shareCopied') : t('notes.shareCopy')}
                          </span>
                        </div>
                        <button
                          onClick={toggleShare}
                          disabled={shareLoading}
                          style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '7px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: shareLoading ? 0.6 : 1 }}
                        >
                          {t('notes.shareDisable')}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={toggleShare}
                        disabled={shareLoading}
                        style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: shareLoading ? 0.6 : 1 }}
                      >
                        {shareLoading ? t('notes.shareEnabling') : t('notes.shareEnable')}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div ref={exportMenuRef} style={{ position: 'relative' }}>
                <span onClick={() => setExportMenuOpen((v) => !v)} title={t('notes.export')} style={{ display: 'flex', cursor: 'pointer' }}>
                  <Icon name="external" size={17} color={theme.textMuted} />
                </span>
                {exportMenuOpen && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: theme.dark ? 'oklch(0.22 0.02 255)' : '#fff', border: `1px solid ${theme.border}`, borderRadius: 10, padding: 6, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 10 }}>
                    <div
                      onClick={() => { exportNoteAsMarkdown(); setExportMenuOpen(false); }}
                      style={{ padding: '8px 10px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: theme.textPrimary }}
                    >
                      {t('notes.exportMarkdown')}
                    </div>
                    <div
                      onClick={() => { exportNoteAsPdf(); setExportMenuOpen(false); }}
                      style={{ padding: '8px 10px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: theme.textPrimary }}
                    >
                      {t('notes.exportPdf')}
                    </div>
                  </div>
                )}
              </div>
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
              onClick={() => { setTagPickerOpen((v) => !v); setNewTagInput(''); }}
              style={{ fontSize: 11, fontWeight: 700, border: `1px dashed ${theme.border}`, color: theme.textMuted, padding: '3px 9px', borderRadius: 6, cursor: 'pointer' }}
            >
              {t('notes.addTag')}
            </span>
            <SaveTemplateButton entityType="note" getData={() => ({ title: selected.title, blocks: getBlocks(selected) })} />
            <span
              onClick={suggestTagsAndFolder}
              style={{ fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, color: theme.accentText, padding: '3px 9px', borderRadius: 6, cursor: aiSuggesting ? 'default' : 'pointer', opacity: aiSuggesting ? 0.6 : 1 }}
            >
              <Icon name="sparkle" size={11} color={theme.accentText} />
              {aiSuggesting ? t('notes.aiSuggesting') : t('notes.aiSuggest')}
            </span>
          </div>

          {aiSuggestError && <div style={{ fontSize: 12, color: 'oklch(0.55 0.18 25)' }}>{aiSuggestError}</div>}

          {aiSuggestion && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: theme.subtleBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {t('notes.aiSuggestionTitle')}
              </div>
              {aiSuggestion.tags.length === 0 && !aiSuggestion.folder && (
                <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('notes.aiNoSuggestions')}</div>
              )}
              {aiSuggestion.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {aiSuggestion.tags.map((tg, i) => (
                    <span
                      key={tg.name}
                      onClick={() => setAiSuggestion((prev) => ({ ...prev, tags: prev.tags.map((t2, i2) => (i2 === i ? { ...t2, include: !t2.include } : t2)) }))}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 6, cursor: 'pointer',
                        background: tg.include ? theme.accentSoftBg : 'transparent', color: tg.include ? theme.accentText : theme.textMuted,
                        border: `1px solid ${tg.include ? theme.accentText : theme.border}`,
                      }}
                    >
                      {tg.include ? '✓ ' : ''}{tg.name}
                    </span>
                  ))}
                </div>
              )}
              {aiSuggestion.folder && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={aiSuggestion.includeFolder}
                    onChange={(e) => setAiSuggestion((prev) => ({ ...prev, includeFolder: e.target.checked }))}
                    style={{ cursor: 'pointer' }}
                  />
                  {t('notes.aiMoveToFolder', { name: aiSuggestion.folder.name })}
                </label>
              )}
              {(aiSuggestion.tags.length > 0 || aiSuggestion.folder) && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setAiSuggestion(null)}
                    style={{ flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={applyAiSuggestion}
                    style={{ flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {t('common.apply')}
                  </button>
                </div>
              )}
            </div>
          )}

          {tagPickerOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: theme.subtleBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createAndAddTag()}
                  placeholder={t('notes.newTagPlaceholder')}
                  autoFocus
                  style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 7, padding: '7px 10px', fontSize: 12.5, background: theme.cardBg, color: theme.textPrimary, outline: 'none' }}
                />
                <button onClick={createAndAddTag} style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {t('common.add')}
                </button>
              </div>
              {newTagInput.trim() && (() => {
                const q = newTagInput.trim().toLowerCase();
                const matches = tags.filter((t) => !(selected.tags || []).includes(t.name) && t.name.toLowerCase().includes(q)).slice(0, 8);
                return matches.length > 0 ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {matches.map((t) => (
                      <span
                        key={t.id}
                        onClick={() => { addTagToNote(t.name); setNewTagInput(''); }}
                        style={{ fontSize: 11, fontWeight: 700, background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textPrimary, padding: '4px 9px', borderRadius: 6, cursor: 'pointer' }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11.5, color: theme.textMuted }}>{t('tags.createNewTag', { name: newTagInput.trim() })}</div>
                );
              })()}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, background: theme.subtleBg, border: `1px solid ${theme.border}`, borderRadius: 9, padding: 4, width: 'fit-content' }}>
            {[
              { key: 'bold', label: 'B', command: 'bold', style: { fontWeight: 800 } },
              { key: 'italic', label: 'I', command: 'italic', style: { fontStyle: 'italic' } },
              { key: 'underline', label: 'U', command: 'underline', style: { textDecoration: 'underline' } },
              { key: 'code', label: '</>', command: 'code', style: { fontFamily: 'var(--font-mono)', fontSize: 11 } },
            ].map((btn) => (
              <button
                key={btn.key}
                title={t(`notes.format${btn.key.charAt(0).toUpperCase()}${btn.key.slice(1)}`)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyFormatting(btn.command)}
                style={{
                  width: 30, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', color: theme.textPrimary,
                  fontSize: 13, ...btn.style,
                }}
              >
                {btn.label}
              </button>
            ))}

            <span style={{ width: 1, alignSelf: 'stretch', background: theme.border, margin: '2px 2px' }} />

            <select
              title={t('notes.fontFamily')}
              defaultValue=""
              onMouseDown={saveSelectionRange}
              onChange={(e) => {
                const value = e.target.value;
                if (value) applyInlineStyle('fontFamily', value);
                e.target.value = '';
              }}
              style={{ height: 28, border: 'none', background: 'transparent', color: theme.textPrimary, fontSize: 12, padding: '0 4px', cursor: 'pointer', maxWidth: 120 }}
            >
              <option value="" style={{ color: '#1a1a1a', background: '#fff' }}>{t('notes.fontFamily')}</option>
              <option value="'Inter', -apple-system, sans-serif" style={{ color: '#1a1a1a', background: '#fff' }}>{t('notes.fontSans')}</option>
              <option value="Georgia, 'Times New Roman', serif" style={{ color: '#1a1a1a', background: '#fff' }}>{t('notes.fontSerif')}</option>
              <option value="Arial, Helvetica, sans-serif" style={{ color: '#1a1a1a', background: '#fff' }}>Arial</option>
              <option value="'Times New Roman', Times, serif" style={{ color: '#1a1a1a', background: '#fff' }}>Times New Roman</option>
              <option value="'Courier New', Courier, monospace" style={{ color: '#1a1a1a', background: '#fff' }}>Courier New</option>
              <option value="Verdana, Geneva, sans-serif" style={{ color: '#1a1a1a', background: '#fff' }}>Verdana</option>
              <option value="'Trebuchet MS', sans-serif" style={{ color: '#1a1a1a', background: '#fff' }}>Trebuchet MS</option>
              <option value="'Comic Sans MS', 'Comic Sans', cursive" style={{ color: '#1a1a1a', background: '#fff' }}>Comic Sans MS</option>
              <option value="'JetBrains Mono', ui-monospace, monospace" style={{ color: '#1a1a1a', background: '#fff' }}>{t('notes.fontMono')}</option>
            </select>

            <span style={{ width: 1, alignSelf: 'stretch', background: theme.border, margin: '2px 2px' }} />

            <input
              type="number"
              min={6}
              max={120}
              title={t('notes.fontSize')}
              placeholder={t('notes.fontSize')}
              onMouseDown={saveSelectionRange}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                // preventDefault before the blur/refocus below, or the
                // browser's native "Enter in contenteditable" action fires
                // on the block once it regains focus (still within this
                // same keydown dispatch) and wipes the just-styled, fully
                // selected span instead of just confirming the value.
                e.preventDefault();
                const value = e.currentTarget.value;
                e.currentTarget.value = '';
                if (value) applyInlineStyle('fontSize', `${value}px`);
                e.currentTarget.blur();
              }}
              onBlur={(e) => {
                const value = e.target.value;
                e.target.value = '';
                if (value) applyInlineStyle('fontSize', `${value}px`);
              }}
              style={{ width: 46, height: 28, border: 'none', background: 'transparent', color: theme.textPrimary, fontSize: 12, padding: '0 4px', textAlign: 'center' }}
            />
          </div>

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
              ) : block.type === 'file' ? (
                <a
                  key={block.id}
                  href={block.url}
                  download={block.name}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10,
                    border: `1px solid ${theme.border}`, background: theme.subtleBg, textDecoration: 'none', color: 'inherit',
                  }}
                >
                  <Icon name="doc" size={18} color={theme.textMuted} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{block.name}</div>
                    <div style={{ fontSize: 11.5, color: theme.textMuted }}>{formatFileSize(block.size)}</div>
                  </div>
                  <Icon name="external" size={14} color={theme.textMuted} />
                  <span
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteBlock(block.id); }}
                    style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '2px 6px', flexShrink: 0 }}
                  >
                    &times;
                  </span>
                </a>
              ) : block.type === 'checklist' ? (
                <div key={block.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {block.items.map((item) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        onClick={() => toggleChecklistItemDone(block.id, item.id)}
                        style={{
                          width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${item.done ? theme.accent : theme.border}`,
                          background: item.done ? theme.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', flexShrink: 0,
                        }}
                      >
                        {item.done && <Icon name="check" size={11} color="#fff" strokeWidth={3} />}
                      </span>
                      <input
                        value={item.text}
                        onChange={(e) => updateChecklistItemText(block.id, item.id, e.target.value)}
                        onBlur={flushBlockSave}
                        placeholder={t('notes.checklistItemPlaceholder')}
                        style={{
                          flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: theme.textPrimary,
                          textDecoration: item.done ? 'line-through' : 'none', opacity: item.done ? 0.6 : 1, fontFamily: 'inherit',
                        }}
                      />
                      <span
                        onClick={() => removeChecklistItem(block.id, item.id)}
                        style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 15, padding: '2px 6px', flexShrink: 0 }}
                      >
                        &times;
                      </span>
                    </div>
                  ))}
                  <div
                    onClick={() => addChecklistItem(block.id)}
                    style={{ fontSize: 12.5, fontWeight: 600, color: theme.accentText, cursor: 'pointer', padding: '4px 25px' }}
                  >
                    {t('notes.addChecklistItem')}
                  </div>
                </div>
              ) : block.type === 'heading' ? (
                <div key={block.id} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: block.level === 1 ? 6 : 2 }}>
                  <HeadingBlockEditor
                    block={block}
                    theme={theme}
                    placeholder={t('notes.headingPlaceholder')}
                    elRefCallback={(el) => { blockElRefsRef.current[block.id] = el; }}
                    onChange={(value) => updateBlock(block.id, { value })}
                  />
                  <span onClick={() => deleteBlock(block.id)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '2px 6px' }}>
                    &times;
                  </span>
                </div>
              ) : block.type === 'toggle' ? (
                <div
                  key={block.id}
                  style={{ display: 'flex', flexDirection: 'column', gap: 6, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '10px 12px', background: theme.subtleBg }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      onClick={() => toggleToggleOpen(block.id)}
                      style={{ display: 'flex', cursor: 'pointer', transform: block.open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
                    >
                      <Icon name="chevron" size={14} color={theme.textMuted} />
                    </span>
                    <input
                      value={block.summary || ''}
                      onChange={(e) => updateBlock(block.id, { summary: e.target.value })}
                      onBlur={flushBlockSave}
                      placeholder={t('notes.togglePlaceholder')}
                      style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, fontWeight: 700, color: theme.textPrimary, fontFamily: 'inherit' }}
                    />
                    <span onClick={() => deleteBlock(block.id)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '2px 6px' }}>
                      &times;
                    </span>
                  </div>
                  {block.open && (
                    <div style={{ paddingLeft: 22 }}>
                      <TextBlockEditor
                        block={{ id: block.id, value: block.value, format: block.format }}
                        theme={theme}
                        placeholder={t('notes.writePlaceholder')}
                        elRefCallback={(el) => { textareaRefsRef.current[`${block.id}-toggle`] = el; }}
                        onChange={(html) => updateBlock(block.id, { value: html, format: 'html' })}
                        onFocusBlock={() => setEditingTextBlockId(`${block.id}-toggle`)}
                        onBlurBlock={() => { setEditingTextBlockId((v) => (v === `${block.id}-toggle` ? null : v)); flushBlockSave(); }}
                      />
                    </div>
                  )}
                </div>
              ) : block.type === 'toc' ? (
                (() => {
                  const headings = getBlocks(selected).filter((b) => b.type === 'heading');
                  return (
                    <div
                      key={block.id}
                      style={{ display: 'flex', flexDirection: 'column', gap: 4, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '10px 12px', background: theme.subtleBg }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {t('notes.tocTitle')}
                        </div>
                        <span onClick={() => deleteBlock(block.id)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '2px 6px' }}>
                          &times;
                        </span>
                      </div>
                      {headings.length === 0 ? (
                        <div style={{ fontSize: 12, color: theme.textMuted }}>{t('notes.tocEmpty')}</div>
                      ) : (
                        headings.map((h) => (
                          <div
                            key={h.id}
                            onClick={() => scrollToBlock(h.id)}
                            style={{
                              fontSize: 13, fontWeight: h.level === 1 ? 700 : 500, cursor: 'pointer', color: theme.accentText,
                              paddingLeft: (h.level - 1) * 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}
                          >
                            {h.value?.trim() || t('notes.headingPlaceholder')}
                          </div>
                        ))
                      )}
                    </div>
                  );
                })()
              ) : block.type === 'page' ? (
                (() => {
                  const child = notes.find((n) => n.id === block.childNoteId);
                  return (
                    <div
                      key={block.id}
                      onClick={() => setSelectedId(block.childNoteId)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.subtleBg, cursor: 'pointer' }}
                    >
                      <Icon name="doc" size={16} color={theme.textMuted} />
                      <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {child ? child.title : block.title || t('notes.untitledNote')}
                      </div>
                      <Icon name="chevron" size={14} color={theme.textMuted} />
                      <span
                        onClick={(e) => { e.stopPropagation(); deleteBlock(block.id); }}
                        style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '2px 6px', flexShrink: 0 }}
                      >
                        &times;
                      </span>
                    </div>
                  );
                })()
              ) : (
                <div key={block.id} style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <TextBlockEditor
                      block={block}
                      theme={theme}
                      placeholder={t('notes.writePlaceholder')}
                      elRefCallback={(el) => { textareaRefsRef.current[block.id] = el; }}
                      onChange={(html) => {
                        const plain = htmlToPlainText(html);
                        if (plain.startsWith('/')) {
                          setSlashMenuBlockId(block.id);
                          setSlashMenuQuery(plain.slice(1).toLowerCase());
                        } else if (slashMenuBlockId === block.id) {
                          setSlashMenuBlockId(null);
                          setSlashMenuQuery('');
                        }
                        updateBlock(block.id, { value: html, format: 'html' });
                      }}
                      onFocusBlock={() => setEditingTextBlockId(block.id)}
                      onBlurBlock={() => {
                        setEditingTextBlockId((v) => (v === block.id ? null : v));
                        setSlashMenuBlockId((v) => (v === block.id ? null : v));
                        setSlashMenuQuery('');
                        flushBlockSave();
                      }}
                    />
                    {getBlocks(selected).length > 1 && (
                      <span onClick={() => deleteBlock(block.id)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '2px 6px' }}>
                        &times;
                      </span>
                    )}
                  </div>
                  {slashMenuBlockId === block.id && (
                    <SlashMenu
                      theme={theme}
                      t={t}
                      query={slashMenuQuery}
                      commands={SLASH_COMMANDS}
                      loading={creatingChildPage}
                      onSelect={(cmd) => cmd.run(block.id)}
                    />
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
            <button onClick={() => fileInputRef.current?.click()} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '7px 12px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
              {t('notes.addFile')}
            </button>
            <button onClick={addChecklistBlock} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '7px 12px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
              {t('notes.addChecklist')}
            </button>
            <button onClick={() => addHeadingBlock(2)} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '7px 12px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
              {t('notes.addHeading')}
            </button>
            <button onClick={addToggleBlock} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '7px 12px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
              {t('notes.addToggle')}
            </button>
            <button onClick={addTocBlock} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '7px 12px', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
              {t('notes.addToc')}
            </button>
            <button
              onClick={() => createChildPage()}
              disabled={creatingChildPage}
              style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '7px 12px', fontWeight: 600, fontSize: 12.5, cursor: creatingChildPage ? 'default' : 'pointer', opacity: creatingChildPage ? 0.6 : 1 }}
            >
              {t('notes.addPage')}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 10, paddingTop: 18, borderTop: `1px solid ${theme.border}` }}>
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
          </div>

          <LinkedItemsPanel entityType="note" entityId={selected.id} theme={theme} t={t} />

          <input ref={fileInputRef} type="file" onChange={onFileInputChange} style={{ display: 'none' }} />
        </div>
      ) : (
        <div style={{ flex: '1 1 480px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
          {t('notes.selectOrCreate')}
        </div>
      ))}

      {linkPickerOpen && (
        <div
          onMouseDown={backdropClose(() => setLinkPickerOpen(false))}
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
          onMouseDown={backdropClose(() => setPreviewNoteId(null))}
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
                return block.format === 'html' ? (
                  <div
                    key={block.id}
                    style={{ fontSize: 14, lineHeight: 1.6, wordBreak: 'break-word', color: theme.textPrimary }}
                    dangerouslySetInnerHTML={{ __html: block.value || '' }}
                  />
                ) : (
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
