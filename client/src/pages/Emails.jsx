import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useCounts } from '../context/CountsContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { useIsMobile } from '../lib/useIsMobile.js';
import PanelDivider from '../components/PanelDivider.jsx';
import { useResizablePanel } from '../lib/useResizablePanel.js';

function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function recipientList(recipients) {
  if (!Array.isArray(recipients) || recipients.length === 0) return '—';
  return recipients.map((r) => r.name || r.email || '?').join(', ');
}

export default function Emails() {
  const { theme } = useTheme();
  const { t, lang } = useLanguage();
  const confirm = useConfirm();
  const { refresh: refreshCounts } = useCounts();
  const isMobile = useIsMobile();
  const listPanel = useResizablePanel('emails.list', 320, { min: 280, max: 560 });
  const [emails, setEmails] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState('all');
  const [detail, setDetail] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderParentId, setNewFolderParentId] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState(() => new Set());
  const [dragOverFolder, setDragOverFolder] = useState(null);
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editFolderName, setEditFolderName] = useState('');
  const fileInputRef = useRef(null);

  const load = async () => {
    const [{ emails }, { folders }] = await Promise.all([api.listEmails(), api.listEmailFolders()]);
    setEmails(emails);
    setFolders(folders);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const refreshFolders = async () => {
    const { folders } = await api.listEmailFolders();
    setFolders(folders);
  };

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    api.getEmail(selectedId).then(({ email }) => setDetail(email));
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return emails
      .filter((e) => (activeFolder === 'all' ? true : activeFolder === 'none' ? !e.folderId : e.folderId === activeFolder))
      .filter((e) => !q || e.subject.toLowerCase().includes(q) || (e.fromName || '').toLowerCase().includes(q) || (e.fromAddress || '').toLowerCase().includes(q));
  }, [emails, activeFolder, search]);

  const openFilePicker = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const folderId = activeFolder !== 'all' && activeFolder !== 'none' ? activeFolder : null;
      const { email } = await api.uploadEmail(file, folderId);
      setEmails((prev) => [email, ...prev]);
      setSelectedId(email.id);
      setMobileShowDetail(true);
      refreshCounts();
      refreshFolders();
    } catch (err) {
      setUploadError(err.message || t('emails.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const moveEmailToFolder = async (emailId, folderId) => {
    const { email } = await api.updateEmail(emailId, { folderId });
    setEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, folderId: email.folderId } : e)));
    if (detail?.id === email.id) setDetail((prev) => ({ ...prev, folderId: email.folderId }));
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
    const { folder } = await api.renameEmailFolder(folderId, { parentId });
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

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const { folder } = await api.createEmailFolder({ name: newFolderName.trim(), parentId: newFolderParentId });
    setFolders((prev) => [...prev, { ...folder, emailCount: 0 }]);
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
    const { folder } = await api.renameEmailFolder(id, { name });
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, ...folder } : f)));
  };

  const removeFolder = async (f, e) => {
    e.stopPropagation();
    const ok = await confirm({ message: t('emails.confirmDeleteFolder', { name: f.name }) });
    if (!ok) return;
    await api.deleteEmailFolder(f.id);
    if (activeFolder === f.id) setActiveFolder('all');
    await load();
  };

  const selectEmail = (id) => {
    setSelectedId(id);
    setMobileShowDetail(true);
  };

  const toggleFavorite = async () => {
    if (!detail) return;
    const { email } = await api.updateEmail(detail.id, { favorite: !detail.favorite });
    setDetail(email);
    setEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, favorite: email.favorite } : e)));
  };

  const removeEmail = async () => {
    if (!detail) return;
    const ok = await confirm({ message: t('common.confirmDeleteMessage') });
    if (!ok) return;
    await api.deleteEmail(detail.id);
    setEmails((prev) => prev.filter((e) => e.id !== detail.id));
    setSelectedId(null);
    setMobileShowDetail(false);
    refreshCounts();
    refreshFolders();
  };

  const dateStr = (d) => (d ? new Date(d).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

  const folderRowStyle = (isActive) => ({
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
            const emailId = e.dataTransfer.getData('text/email-id');
            const draggedFolderId = e.dataTransfer.getData('text/folder-id');
            if (emailId) moveEmailToFolder(emailId, f.id);
            else if (draggedFolderId) reparentFolder(draggedFolderId, f.id);
          }}
          style={{
            ...folderRowStyle(activeFolder === f.id), flexDirection: 'row', alignItems: 'center', gap: 8,
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
            title={t('emails.renameFolder')}
            style={{ display: 'flex', opacity: 0.5, cursor: 'pointer', flexShrink: 0 }}
          >
            <Icon name="edit" size={12} />
          </span>
          <span
            onClick={(e) => { e.stopPropagation(); setNewFolderParentId(f.id); setNewFolderOpen(true); }}
            title={t('emails.newSubfolder')}
            style={{ display: 'flex', opacity: 0.5, cursor: 'pointer', flexShrink: 0 }}
          >
            <Icon name="plus" size={12} />
          </span>
          <span
            onClick={(e) => removeFolder(f, e)}
            title={t('emails.deleteFolder')}
            style={{ display: 'flex', opacity: 0.5, cursor: 'pointer', flexShrink: 0 }}
          >
            <Icon name="trash" size={12} />
          </span>
          <span style={{ fontSize: 11.5, opacity: 0.7, flexShrink: 0 }}>{f.emailCount}</span>
        </div>
        {hasKids && !collapsed && kids.map((k) => renderFolderNode(k, depth + 1))}
      </div>
    );
  };

  return (
    <div style={{ padding: isMobile ? 14 : '24px 28px', flex: 1, display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{t('emails.title')}</div>
          <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 2 }}>{t('emails.subtitle')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input ref={fileInputRef} type="file" accept=".msg" onChange={handleFileChange} style={{ display: 'none' }} />
          <button
            onClick={openFilePicker}
            disabled={uploading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}
          >
            <Icon name="mail" size={14} color="#fff" /> {uploading ? t('emails.importing') : t('emails.importMsg')}
          </button>
        </div>
      </div>

      {uploadError && (
        <div style={{ background: 'oklch(0.95 0.05 25)', color: 'oklch(0.4 0.18 25)', border: '1px solid oklch(0.8 0.12 25)', borderRadius: 10, padding: '10px 14px', fontSize: 12.5 }}>
          {uploadError}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', gap: isMobile ? 0 : 8, minHeight: 0 }}>
        {(!isMobile || !mobileShowDetail) && (
          <div style={{ flex: isMobile ? '1 1 auto' : `0 0 ${listPanel.width}px`, minWidth: isMobile ? 0 : 280, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '9px 12px' }}>
              <Icon name="search" size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('emails.searchPlaceholder')}
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: theme.textPrimary, width: '100%' }}
              />
            </div>

            <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div
                onClick={() => setActiveFolder('all')}
                onDragOver={(e) => { e.preventDefault(); setDragOverFolder('none'); }}
                onDragLeave={() => setDragOverFolder((v) => (v === 'none' ? null : v))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverFolder(null);
                  const emailId = e.dataTransfer.getData('text/email-id');
                  if (emailId) moveEmailToFolder(emailId, null);
                }}
                style={{
                  ...folderRowStyle(activeFolder === 'all'), flexDirection: 'row', alignItems: 'center', gap: 8,
                  color: activeFolder === 'all' ? theme.accentText : theme.textMuted,
                  outline: dragOverFolder === 'none' ? `2px dashed ${theme.accent}` : 'none', outlineOffset: -2,
                }}
              >
                <Icon name="folder" size={15} />
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{t('emails.allEmails')}</span>
                <span style={{ fontSize: 11.5, opacity: 0.7 }}>{emails.length}</span>
              </div>
              {folders.filter((f) => !f.parentId).map((f) => renderFolderNode(f, 0))}
              {newFolderOpen ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 4px 2px' }}>
                  {newFolderParentId && (
                    <div style={{ fontSize: 11, color: theme.textMuted }}>
                      {t('emails.newFolderInside', { name: folders.find((f) => f.id === newFolderParentId)?.name || '' })}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && createFolder()}
                      placeholder={t('emails.newFolderName')}
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
                  <Icon name="plus" size={13} color="#fff" /> {t('emails.newFolder')}
                </div>
              )}
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {!loading && filtered.length === 0 && (
                <div style={{ padding: 20, fontSize: 12.5, color: theme.textMuted, textAlign: 'center' }}>{t('emails.noEmailsHere')}</div>
              )}
              {filtered.map((e) => {
                const isActive = e.id === selectedId;
                return (
                  <div
                    key={e.id}
                    draggable
                    onDragStart={(ev) => ev.dataTransfer.setData('text/email-id', e.id)}
                    onClick={() => selectEmail(e.id)}
                    style={{
                      padding: '10px 12px', borderRadius: 10, cursor: 'grab',
                      background: isActive ? theme.accentSoftBg : 'transparent',
                      border: `1px solid ${isActive ? theme.accent : 'transparent'}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: theme.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {e.subject}
                      </div>
                      {e.favorite && <Icon name="pin" size={12} color={theme.accentText} />}
                    </div>
                    <div style={{ fontSize: 11.5, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.fromName || e.fromAddress || '—'}
                    </div>
                    <div style={{ fontSize: 10.5, color: theme.textMuted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{dateStr(e.sentAt || e.createdAt)}</span>
                      {Array.isArray(e.attachments) && e.attachments.length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Icon name="download" size={10} /> {e.attachments.length}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isMobile && <PanelDivider theme={theme} onResize={listPanel.onResize} onResizeEnd={listPanel.onResizeEnd} />}

        {(!isMobile || mobileShowDetail) && (
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!detail ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted, fontSize: 13 }}>
                {t('emails.selectPrompt')}
              </div>
            ) : (
              <>
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    {isMobile && (
                      <span onClick={() => setMobileShowDetail(false)} style={{ display: 'flex', cursor: 'pointer', color: theme.textMuted, transform: 'rotate(180deg)', flexShrink: 0, marginTop: 2 }}>
                        <Icon name="chevron" size={18} />
                      </span>
                    )}
                    <div style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 800 }}>{detail.subject}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span onClick={toggleFavorite} title={t('emails.favorite')} style={{ cursor: 'pointer', display: 'flex' }}>
                        <Icon name="pin" size={16} color={detail.favorite ? theme.accentText : theme.textMuted} />
                      </span>
                      <a href={detail.fileUrl} download={detail.fileName} title={t('emails.downloadOriginal')} style={{ cursor: 'pointer', display: 'flex', color: theme.textMuted }}>
                        <Icon name="download" size={16} />
                      </a>
                      <span onClick={removeEmail} title={t('common.delete')} style={{ cursor: 'pointer', display: 'flex', color: theme.textMuted }}>
                        <Icon name="trash" size={16} />
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: theme.textMuted, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div><strong style={{ color: theme.textPrimary }}>{t('emails.from')}:</strong> {detail.fromName || detail.fromAddress || '—'}{detail.fromAddress && detail.fromName ? ` <${detail.fromAddress}>` : ''}</div>
                    <div><strong style={{ color: theme.textPrimary }}>{t('emails.to')}:</strong> {recipientList(detail.toRecipients)}</div>
                    {Array.isArray(detail.ccRecipients) && detail.ccRecipients.length > 0 && (
                      <div><strong style={{ color: theme.textPrimary }}>{t('emails.cc')}:</strong> {recipientList(detail.ccRecipients)}</div>
                    )}
                    <div><strong style={{ color: theme.textPrimary }}>{t('emails.date')}:</strong> {dateStr(detail.sentAt)}</div>
                  </div>
                  {Array.isArray(detail.attachments) && detail.attachments.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {detail.attachments.map((att, i) => (
                        <a
                          key={i}
                          href={att.url}
                          download={att.name}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: 20,
                            background: theme.subtleBg, color: theme.textPrimary, border: `1px solid ${theme.border}`, textDecoration: 'none',
                          }}
                        >
                          <Icon name="download" size={11} /> {att.name} <span style={{ opacity: 0.6 }}>({formatBytes(att.size)})</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  {detail.bodyHtml ? (
                    // Rendered untrusted external HTML in a fully sandboxed iframe
                    // (no allow-scripts / allow-same-origin) so it can never run
                    // script or reach the app's origin — same-origin-safe preview.
                    <iframe
                      title="email-body"
                      sandbox=""
                      srcDoc={detail.bodyHtml}
                      style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                    />
                  ) : (
                    <pre style={{ margin: 0, padding: 20, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: 13, color: theme.textPrimary, height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
                      {detail.bodyText || t('emails.noBody')}
                    </pre>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
