import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { api, downloadBlob } from '../api.js';
import Icon from '../components/Icon.jsx';
import IconPicker from '../components/IconPicker.jsx';
import DateInput from '../components/DateInput.jsx';
import AutoResizeTextarea from '../components/AutoResizeTextarea.jsx';
import CodeBlock from '../components/CodeBlock.jsx';
import { backdropClose } from '../lib/backdropClose.js';
import { useIsMobile } from '../lib/useIsMobile.js';

function fieldStyle(theme) {
  return {
    border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, background: theme.subtleBg,
    color: theme.textPrimary, outline: 'none', width: '100%', boxSizing: 'border-box',
  };
}

// Dropdown of known options with an "Other…" entry that reveals a free-text
// fallback — for select fields whose value may not match any known option.
function ComboField({ value, options, onChange, theme, t }) {
  const [forcedCustom, setForcedCustom] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const customMode = forcedCustom || (!!value && !options.includes(value));

  return (
    <div>
      <select
        value={customMode ? '__other__' : value || ''}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__other__') {
            setForcedCustom(true);
            setDraft(value || '');
          } else {
            setForcedCustom(false);
            setDraft(v);
            onChange(v);
          }
        }}
        style={fieldStyle(theme)}
      >
        <option value="" style={{ color: '#1a1a1a', background: '#fff' }} />
        {options.map((o) => <option key={o} value={o} style={{ color: '#1a1a1a', background: '#fff' }}>{o}</option>)}
        <option value="__other__" style={{ color: '#1a1a1a', background: '#fff' }}>{t('documentacao.otherOption')}</option>
      </select>
      {customMode && (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onChange(draft)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder={t('documentacao.customPlaceholder')}
          style={{ ...fieldStyle(theme), marginTop: 6 }}
        />
      )}
    </div>
  );
}

function FieldLabel({ children, help, theme }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{children}</div>
      {help && <div style={{ fontSize: 11.5, color: theme.textMuted, opacity: 0.8, marginTop: 2 }}>{help}</div>}
    </div>
  );
}

// --- Rich block field: ordered list of {type:'text'|'code'|'image', value} ---
function BlockField({ value, onChange, theme, t }) {
  const blocks = Array.isArray(value) ? value : [];
  const update = (idx, patch) => onChange(blocks.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  const remove = (idx) => onChange(blocks.filter((_, i) => i !== idx));
  const add = (type) => onChange([...blocks, type === 'code' ? { type, value: '', language: 'abap' } : { type, value: '' }]);
  const uploadImg = async (idx, file) => {
    const { url } = await api.uploadDocImage(file);
    update(idx, { value: url });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {blocks.map((b, idx) => (
        b.type === 'code' ? (
          <CodeBlock
            key={idx}
            value={b.value}
            language={b.language || 'abap'}
            onChange={(v) => update(idx, { value: v })}
            onLanguageChange={(language) => update(idx, { language })}
            onDelete={() => remove(idx)}
          />
        ) : (
          <div key={idx} style={{ position: 'relative', border: `1px solid ${theme.border}`, borderRadius: 8, padding: 10, background: theme.subtleBg }}>
            <span
              onClick={() => remove(idx)}
              style={{ position: 'absolute', top: 6, right: 8, cursor: 'pointer', opacity: 0.5, fontSize: 15, lineHeight: 1 }}
            >
              &times;
            </span>
            {b.type === 'text' && (
              <AutoResizeTextarea
                value={b.value}
                onChange={(e) => update(idx, { value: e.target.value })}
                placeholder={t('documentacao.blockTextPlaceholder')}
                style={{ ...fieldStyle(theme), background: 'transparent', border: 'none', padding: '2px 20px 2px 2px', fontFamily: 'inherit' }}
              />
            )}
            {b.type === 'image' && (
              b.value ? (
                <img src={b.value} alt="" style={{ maxWidth: '100%', borderRadius: 6, display: 'block' }} />
              ) : (
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80, border: `1px dashed ${theme.border}`, borderRadius: 6, cursor: 'pointer', fontSize: 12.5, color: theme.textMuted }}>
                  {t('documentacao.uploadImage')}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && uploadImg(idx, e.target.files[0])} />
                </label>
              )
            )}
          </div>
        )
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <span onClick={() => add('text')} style={{ fontSize: 12, fontWeight: 700, color: theme.accentText, cursor: 'pointer' }}>{t('documentacao.addTextBlock')}</span>
        <span onClick={() => add('code')} style={{ fontSize: 12, fontWeight: 700, color: theme.accentText, cursor: 'pointer' }}>{t('documentacao.addCodeBlock')}</span>
        <span onClick={() => add('image')} style={{ fontSize: 12, fontWeight: 700, color: theme.accentText, cursor: 'pointer' }}>{t('documentacao.addImageBlock')}</span>
      </div>
    </div>
  );
}

function FixedTableField({ field, value, onChange, theme }) {
  const rows = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const setCell = (rowKey, colKey, v) => onChange({ ...rows, [rowKey]: { ...(rows[rowKey] || {}), [colKey]: v } });
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: theme.textMuted, fontSize: 11 }}></th>
            {field.columns.map((c) => (
              <th key={c.key} style={{ textAlign: 'left', padding: '6px 8px', color: theme.textMuted, fontSize: 11, textTransform: 'uppercase' }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {field.rows.map((r) => (
            <tr key={r.key}>
              <td style={{ padding: '4px 8px', fontWeight: 700, whiteSpace: 'nowrap', color: theme.textPrimary }}>{r.label}</td>
              {field.columns.map((c) => (
                <td key={c.key} style={{ padding: '4px 8px' }}>
                  {c.type === 'date' ? (
                    <DateInput value={rows[r.key]?.[c.key] || ''} onChange={(v) => setCell(r.key, c.key, v)} style={{ ...fieldStyle(theme), padding: '6px 8px' }} />
                  ) : (
                    <input value={rows[r.key]?.[c.key] || ''} onChange={(e) => setCell(r.key, c.key, e.target.value)} style={{ ...fieldStyle(theme), padding: '6px 8px' }} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RepeatableTableField({ field, value, onChange, theme, t }) {
  const rows = Array.isArray(value) ? value : [];
  const setCell = (idx, colKey, v) => onChange(rows.map((r, i) => (i === idx ? { ...r, [colKey]: v } : r)));
  const addRow = () => onChange([...rows, Object.fromEntries(field.columns.map((c) => [c.key, '']))]);
  const removeRow = (idx) => onChange(rows.filter((_, i) => i !== idx));
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5, minWidth: 600 }}>
          <thead>
            <tr>
              {field.columns.map((c) => (
                <th key={c.key} style={{ textAlign: 'left', padding: '6px 8px', color: theme.textMuted, fontSize: 11, textTransform: 'uppercase' }}>{c.label}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                {field.columns.map((c) => (
                  <td key={c.key} style={{ padding: '4px 8px' }}>
                    {c.type === 'select' ? (
                      <select value={row[c.key] || ''} onChange={(e) => setCell(idx, c.key, e.target.value)} style={{ ...fieldStyle(theme), padding: '6px 8px' }}>
                        <option value="" style={{ color: '#1a1a1a', background: '#fff' }} />
                        {c.options.map((o) => <option key={o} value={o} style={{ color: '#1a1a1a', background: '#fff' }}>{o}</option>)}
                      </select>
                    ) : (
                      <input value={row[c.key] || ''} onChange={(e) => setCell(idx, c.key, e.target.value)} style={{ ...fieldStyle(theme), padding: '6px 8px' }} />
                    )}
                  </td>
                ))}
                <td>
                  <span onClick={() => removeRow(idx)} style={{ cursor: 'pointer', opacity: 0.5, fontSize: 15 }}>&times;</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span onClick={addRow} style={{ display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 700, color: theme.accentText, cursor: 'pointer' }}>{t('documentacao.addRow')}</span>
    </div>
  );
}

function FieldEditor({ field, value, onChange, theme, t }) {
  return (
    <div>
      <FieldLabel help={field.help} theme={theme}>{field.label}</FieldLabel>
      {field.type === 'text' && (
        <input value={value || ''} onChange={(e) => onChange(e.target.value)} style={fieldStyle(theme)} />
      )}
      {field.type === 'date' && (
        <DateInput value={value || ''} onChange={onChange} style={fieldStyle(theme)} />
      )}
      {field.type === 'select' && field.allowCustom && (
        <ComboField value={value} options={field.options} onChange={onChange} theme={theme} t={t} />
      )}
      {field.type === 'select' && !field.allowCustom && (
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} style={fieldStyle(theme)}>
          <option value="" style={{ color: '#1a1a1a', background: '#fff' }} />
          {field.options.map((o) => <option key={o} value={o} style={{ color: '#1a1a1a', background: '#fff' }}>{o}</option>)}
        </select>
      )}
      {field.type === 'image' && (
        value ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={value} alt="" style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 8, border: `1px solid ${theme.border}` }} />
            <span onClick={() => onChange('')} style={{ fontSize: 12, color: theme.textMuted, cursor: 'pointer' }}>&times;</span>
          </div>
        ) : (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: `1px dashed ${theme.border}`, cursor: 'pointer', fontSize: 12.5, color: theme.textMuted }}>
            <Icon name="plus" size={12} /> {t('documentacao.uploadImage')}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const { url } = await api.uploadDocImage(file);
              onChange(url);
            }} />
          </label>
        )
      )}
      {field.type === 'block' && <BlockField value={value} onChange={onChange} theme={theme} t={t} />}
      {field.type === 'fixedTable' && <FixedTableField field={field} value={value} onChange={onChange} theme={theme} />}
      {field.type === 'repeatableTable' && <RepeatableTableField field={field} value={value} onChange={onChange} theme={theme} t={t} />}
    </div>
  );
}

export default function Documentacao() {
  const { theme } = useTheme();
  const { t, lang } = useLanguage();
  const confirm = useConfirm();
  const isMobile = useIsMobile();

  const [folders, setFolders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [activeFolder, setActiveFolder] = useState(null);
  const [collapsedFolders, setCollapsedFolders] = useState(new Set());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderParentId, setNewFolderParentId] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [editFolderName, setEditFolderName] = useState('');

  const [pickTemplateOpen, setPickTemplateOpen] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [activeDoc, setActiveDoc] = useState(null);
  const [fieldsData, setFieldsData] = useState({});
  const [dragOverFolder, setDragOverFolder] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('docx');
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState(null);
  const saveTimer = useRef(null);

  const load = () => {
    Promise.all([api.listDocFolders(), api.listDocuments(), api.listDocTemplates()]).then(([f, d, tpl]) => {
      setFolders(f.folders);
      setDocuments(d.documents);
      setTemplates(tpl.templates);
      setLoading(false);
    });
  };

  const refreshFolders = () => {
    api.listDocFolders().then((f) => setFolders(f.folders));
  };

  useEffect(load, []);

  useEffect(() => {
    if (!selectedId) { setActiveDoc(null); return; }
    api.getDocument(selectedId).then(({ document }) => {
      setActiveDoc(document);
      setFieldsData(document.fieldsData || {});
    });
  }, [selectedId]);

  const scheduleSave = (nextFieldsData) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.updateDocument(selectedId, { fieldsData: nextFieldsData }).then(({ document }) => {
        setDocuments((prev) => prev.map((d) => (d.id === document.id ? { ...d, ...document } : d)));
      });
    }, 700);
  };

  const setFieldValue = (key, val) => {
    setFieldsData((prev) => {
      const next = { ...prev, [key]: val };
      scheduleSave(next);
      return next;
    });
  };

  const filteredDocuments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (activeFolder !== null && d.folderId !== activeFolder) return false;
      if (activeFolder === null && q === '' && false) return true;
      if (q && !d.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [documents, activeFolder, search]);

  const toggleFolderCollapsed = (id) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openNewFolder = (parentId) => {
    setNewFolderParentId(parentId);
    setNewFolderName('');
    setNewFolderOpen(true);
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const { folder } = await api.createDocFolder({ name: newFolderName.trim(), parentId: newFolderParentId });
    setFolders((prev) => [...prev, folder]);
    setNewFolderOpen(false);
  };

  const startEditFolder = (f) => {
    setEditingFolderId(f.id);
    setEditFolderName(f.name);
  };

  const commitFolderRename = async () => {
    const id = editingFolderId;
    setEditingFolderId(null);
    if (!id || !editFolderName.trim()) return;
    const { folder } = await api.updateDocFolder(id, { name: editFolderName.trim() });
    setFolders((prev) => prev.map((f) => (f.id === id ? folder : f)));
  };

  const removeFolder = async (f, e) => {
    e.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDeleteMessage') });
    if (!ok) return;
    await api.deleteDocFolder(f.id);
    setFolders((prev) => prev.filter((x) => x.id !== f.id).map((x) => (x.parentId === f.id ? { ...x, parentId: f.parentId } : x)));
    setDocuments((prev) => prev.map((d) => (d.folderId === f.id ? { ...d, folderId: null } : d)));
    if (activeFolder === f.id) setActiveFolder(null);
  };

  const moveDocumentToFolder = async (docId, folderId) => {
    const { document } = await api.updateDocument(docId, { folderId });
    setDocuments((prev) => prev.map((d) => (d.id === document.id ? { ...d, ...document } : d)));
    refreshFolders();
  };

  const reparentFolder = async (folderId, parentId) => {
    if (folderId === parentId) return;
    const target = folders.find((f) => f.id === folderId);
    if (!target || target.parentId === parentId) return;
    let ancestor = parentId;
    while (ancestor) {
      if (ancestor === folderId) return;
      ancestor = folders.find((f) => f.id === ancestor)?.parentId || null;
    }
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, parentId } : f)));
    const { folder } = await api.updateDocFolder(folderId, { parentId });
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, ...folder } : f)));
  };

  const createDocument = async (templateId) => {
    const template = templates.find((tp) => tp.id === templateId);
    const { document } = await api.createDocument({ templateId, folderId: activeFolder, title: template?.name });
    setDocuments((prev) => [document, ...prev]);
    setPickTemplateOpen(false);
    setSelectedId(document.id);
    refreshFolders();
  };

  const renameActiveDoc = async (title) => {
    setActiveDoc((prev) => ({ ...prev, title }));
    setDocuments((prev) => prev.map((d) => (d.id === selectedId ? { ...d, title } : d)));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.updateDocument(selectedId, { title });
    }, 700);
  };

  const setActiveDocIcon = async (icon) => {
    setActiveDoc((prev) => ({ ...prev, icon }));
    setDocuments((prev) => prev.map((d) => (d.id === selectedId ? { ...d, icon } : d)));
    const { document } = await api.updateDocument(selectedId, { icon });
    setActiveDoc((prev) => (prev?.id === document.id ? { ...prev, icon: document.icon } : prev));
  };

  const removeDocument = async (id, e) => {
    e?.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDeleteMessage') });
    if (!ok) return;
    await api.trashDocument(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    if (selectedId === id) setSelectedId(null);
    refreshFolders();
  };

  const generateDocument = async () => {
    if (!selectedId || generating) return;
    setGenerating(true);
    setGenerateError('');
    try {
      const { blob, filename } = await api.generateDocument(selectedId);
      if (exportFormat !== 'pdf') downloadBlob(blob, filename);
      if (exportFormat !== 'docx') {
        const { blob: pdfBlob, filename: pdfFilename } = await api.generateDocumentPdf(selectedId);
        downloadBlob(pdfBlob, pdfFilename);
      }
      const { document } = await api.getDocument(selectedId);
      setActiveDoc(document);
      setDocuments((prev) => prev.map((d) => (d.id === selectedId ? { ...d, exportedAt: document.exportedAt } : d)));
      setExportOpen(false);
    } catch (err) {
      setGenerateError(err.message || t('documentacao.generateError'));
    } finally {
      setGenerating(false);
    }
  };

  const openVersions = async () => {
    setVersionsOpen(true);
    setVersions(null);
    const { versions: list } = await api.listDocumentVersions(selectedId);
    setVersions(list);
  };

  const downloadVersion = async (versionId) => {
    const { blob, filename } = await api.downloadDocumentVersion(selectedId, versionId);
    downloadBlob(blob, filename);
  };

  const renderFolderNode = (f, depth) => {
    const kids = folders.filter((c) => c.parentId === f.id);
    const hasKids = kids.length > 0;
    const collapsed = collapsedFolders.has(f.id);
    return (
      <div key={f.id}>
        <div
          draggable
          onDragStart={(e) => e.dataTransfer.setData('text/doc-folder-id', f.id)}
          onClick={() => setActiveFolder(f.id)}
          onDragOver={(e) => { e.preventDefault(); setDragOverFolder(f.id); }}
          onDragLeave={() => setDragOverFolder((v) => (v === f.id ? null : v))}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverFolder(null);
            const docId = e.dataTransfer.getData('text/document-id');
            const draggedFolderId = e.dataTransfer.getData('text/doc-folder-id');
            if (docId) moveDocumentToFolder(docId, f.id);
            else if (draggedFolderId) reparentFolder(draggedFolderId, f.id);
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, cursor: 'pointer',
            paddingLeft: 8 + depth * 16,
            background: activeFolder === f.id ? theme.accentSoftBg : 'transparent',
            color: activeFolder === f.id ? theme.accentText : theme.textMuted,
            outline: dragOverFolder === f.id ? `2px dashed ${theme.accent}` : 'none', outlineOffset: -2,
          }}
        >
          {hasKids ? (
            <span onClick={(e) => { e.stopPropagation(); toggleFolderCollapsed(f.id); }} style={{ display: 'flex', cursor: 'pointer', opacity: 0.6, flexShrink: 0, transform: collapsed ? 'none' : 'rotate(90deg)' }}>
              <Icon name="chevron" size={11} />
            </span>
          ) : <span style={{ width: 11, flexShrink: 0 }} />}
          <Icon name="folder" size={14} />
          {editingFolderId === f.id ? (
            <input
              value={editFolderName}
              onChange={(e) => setEditFolderName(e.target.value)}
              onBlur={commitFolderRename}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, border: `1px solid ${theme.accent}`, borderRadius: 6, padding: '2px 6px', background: theme.cardBg, color: theme.textPrimary, outline: 'none' }}
            />
          ) : (
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
          )}
          <span onClick={(e) => { e.stopPropagation(); startEditFolder(f); }} title={t('documentacao.renameFolder')} style={{ display: 'flex', opacity: 0.5, cursor: 'pointer', flexShrink: 0 }}>
            <Icon name="edit" size={11} />
          </span>
          <span onClick={(e) => { e.stopPropagation(); openNewFolder(f.id); }} title={t('documentacao.newFolder')} style={{ display: 'flex', opacity: 0.5, cursor: 'pointer', flexShrink: 0 }}>
            <Icon name="plus" size={11} />
          </span>
          <span onClick={(e) => removeFolder(f, e)} title={t('documentacao.deleteFolder')} style={{ display: 'flex', opacity: 0.5, cursor: 'pointer', flexShrink: 0 }}>
            <Icon name="trash" size={11} />
          </span>
          <span style={{ fontSize: 11, opacity: 0.7, flexShrink: 0 }}>{f.documentCount}</span>
        </div>
        {hasKids && !collapsed && kids.map((k) => renderFolderNode(k, depth + 1))}
      </div>
    );
  };

  const exportDate = activeDoc?.exportedAt ? new Date(activeDoc.exportedAt).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB') : null;
  const mobileShowDetail = isMobile && !!selectedId;

  return (
    <div style={{ padding: isMobile ? 14 : '24px 28px', flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : 20, minHeight: 0 }}>
      {/* Folder tree */}
      {(!isMobile || !mobileShowDetail) && (
      <div style={{ width: isMobile ? '100%' : 260, flexShrink: 0, maxHeight: isMobile ? 140 : 'none', background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div
          onClick={() => setActiveFolder(null)}
          onDragOver={(e) => { e.preventDefault(); setDragOverFolder('__root__'); }}
          onDragLeave={() => setDragOverFolder((v) => (v === '__root__' ? null : v))}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverFolder(null);
            const docId = e.dataTransfer.getData('text/document-id');
            if (docId) moveDocumentToFolder(docId, null);
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
            background: activeFolder === null ? theme.accentSoftBg : 'transparent',
            color: activeFolder === null ? theme.accentText : theme.textMuted, fontWeight: 700, fontSize: 13,
            outline: dragOverFolder === '__root__' ? `2px dashed ${theme.accent}` : 'none', outlineOffset: -2,
          }}
        >
          <Icon name="doc" size={14} /> {t('documentacao.allDocuments')}
        </div>
        {folders.filter((f) => !f.parentId).map((f) => renderFolderNode(f, 0))}
        <div onClick={() => openNewFolder(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', marginTop: 6, borderRadius: 8, cursor: 'pointer', fontSize: 12.5, color: theme.accentText, fontWeight: 700 }}>
          <Icon name="plus" size={12} /> {t('documentacao.newFolder')}
        </div>
      </div>
      )}

      {/* Document list */}
      {(!isMobile || !mobileShowDetail) && (
      <div style={{ flex: isMobile ? '1 1 auto' : '1 1 280px', maxWidth: isMobile ? 'none' : 320, minWidth: isMobile ? 0 : 240, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '9px 12px', flex: 1, minWidth: 0 }}>
            <span style={{ opacity: 0.5, display: 'flex' }}>
              <Icon name="search" size={15} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('documentacao.searchPlaceholder')}
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, flex: 1, minWidth: 0, color: theme.textPrimary }}
            />
          </div>
          <button
            onClick={() => setPickTemplateOpen(true)}
            title={t('documentacao.newDocument')}
            style={{ display: 'flex', alignItems: 'center', background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 12px', cursor: 'pointer', flexShrink: 0 }}
          >
            <Icon name="plus" size={16} color="#fff" />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {!loading && filteredDocuments.length === 0 && (
            <div style={{ padding: 20, fontSize: 12.5, color: theme.textMuted, textAlign: 'center' }}>{t('documentacao.noneYet')}</div>
          )}
          {filteredDocuments.map((d) => (
            <div
              key={d.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/document-id', d.id)}
              onClick={() => setSelectedId(d.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer',
                borderBottom: `1px solid ${theme.border}`, background: selectedId === d.id ? theme.accentSoftBg : 'transparent',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: theme.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.icon ? `${d.icon} ` : ''}{d.title || t('documentacao.untitled')}</div>
                <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>{d.template?.name}</div>
                <div style={{ marginTop: 5 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                    background: d.exportedAt ? 'oklch(0.90 0.11 145)' : theme.subtleBg,
                    color: d.exportedAt ? 'oklch(0.32 0.17 145)' : theme.textMuted,
                  }}>
                    {d.exportedAt ? t('documentacao.generated') : t('documentacao.notGenerated')}
                  </span>
                </div>
              </div>
              <span onClick={(e) => removeDocument(d.id, e)} style={{ opacity: 0.4, cursor: 'pointer', flexShrink: 0 }}>
                <Icon name="trash" size={13} />
              </span>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Detail */}
      {(!isMobile || mobileShowDetail) && (
        <div style={{ flex: '1 1 auto', minWidth: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, overflowY: 'auto', padding: activeDoc ? (isMobile ? 16 : 24) : 0 }}>
          {!activeDoc ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 13, color: theme.textMuted }}>
              {t('documentacao.selectPrompt')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                {isMobile && (
                  <span onClick={() => setSelectedId(null)} style={{ display: 'flex', cursor: 'pointer', color: theme.textMuted, transform: 'rotate(180deg)', flexShrink: 0 }}>
                    <Icon name="chevron" size={18} />
                  </span>
                )}
                <IconPicker
                  theme={theme} t={t} value={activeDoc.icon} onChange={setActiveDocIcon}
                  size={30} fallback={<Icon name="doc" size={15} color={theme.accentText} />}
                  triggerStyle={{ background: theme.accentSoftBg }}
                />
                <input
                  value={activeDoc.title || ''}
                  onChange={(e) => renameActiveDoc(e.target.value)}
                  style={{ fontSize: 19, fontWeight: 800, border: 'none', outline: 'none', background: 'transparent', color: theme.textPrimary, flex: 1, minWidth: 200 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {exportDate && <span style={{ fontSize: 11.5, color: theme.textMuted }}>{t('documentacao.lastGenerated', { date: exportDate })}</span>}
                  <span onClick={openVersions} style={{ fontSize: 11.5, fontWeight: 700, color: theme.accentText, cursor: 'pointer' }}>
                    {t('documentacao.versions')}
                  </span>
                  <button
                    onClick={() => { setGenerateError(''); setExportOpen(true); }}
                    disabled={generating}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 16px', fontWeight: 700, fontSize: 13, cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.6 : 1 }}
                  >
                    <Icon name="download" size={14} color="#fff" /> {t('documentacao.generate')}
                  </button>
                </div>
              </div>

              {activeDoc.template?.fields?.map((field) => (
                <FieldEditor
                  key={field.key}
                  field={field}
                  value={fieldsData[field.key]}
                  onChange={(v) => setFieldValue(field.key, v)}
                  theme={theme}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {newFolderOpen && (
        <div onMouseDown={backdropClose(() => setNewFolderOpen(false))} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 340, maxWidth: '100%', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{t('documentacao.newFolder')}</div>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createFolder()}
              placeholder={t('documentacao.folderNamePlaceholder')}
              style={fieldStyle(theme)}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setNewFolderOpen(false)} style={{ flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{t('common.cancel')}</button>
              <button onClick={createFolder} style={{ flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{t('common.create')}</button>
            </div>
          </div>
        </div>
      )}

      {pickTemplateOpen && (
        <div onMouseDown={backdropClose(() => setPickTemplateOpen(false))} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: '100%', maxHeight: '80vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 24px 70px rgba(0,0,0,0.45)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{t('documentacao.pickTemplate')}</div>
              <span onClick={() => setPickTemplateOpen(false)} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 20, lineHeight: 1 }}>&times;</span>
            </div>
            {templates.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('documentacao.noTemplates')}</div>}
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => createDocument(tpl.id)}
                style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 14px', borderRadius: 10, border: `1px solid ${theme.border}`, cursor: 'pointer', background: theme.subtleBg }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 700, color: theme.textPrimary }}>{tpl.name}</div>
                {tpl.description && <div style={{ fontSize: 12, color: theme.textMuted }}>{tpl.description}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {exportOpen && (
        <div onMouseDown={backdropClose(() => !generating && setExportOpen(false))} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 380, maxWidth: '100%', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 24px 70px rgba(0,0,0,0.45)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{t('documentacao.exportFormat')}</div>
              <span onClick={() => !generating && setExportOpen(false)} style={{ cursor: generating ? 'default' : 'pointer', opacity: 0.6, fontSize: 20, lineHeight: 1 }}>&times;</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { value: 'docx', label: t('documentacao.exportDocx') },
                { value: 'pdf', label: t('documentacao.exportPdf') },
                { value: 'both', label: t('documentacao.exportBoth') },
              ].map((opt) => (
                <label
                  key={opt.value}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${exportFormat === opt.value ? theme.accent : theme.border}`, cursor: 'pointer', background: exportFormat === opt.value ? theme.accentSoftBg : theme.subtleBg }}
                >
                  <input type="radio" name="exportFormat" checked={exportFormat === opt.value} onChange={() => setExportFormat(opt.value)} />
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{opt.label}</span>
                </label>
              ))}
            </div>
            {generateError && <div style={{ fontSize: 12, color: 'oklch(0.55 0.18 25)' }}>{generateError}</div>}
            <button
              onClick={generateDocument}
              disabled={generating}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 16px', fontWeight: 700, fontSize: 13, cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.6 : 1 }}
            >
              <Icon name="download" size={14} color="#fff" /> {generating ? t('documentacao.generating') : t('documentacao.exportConfirm')}
            </button>
          </div>
        </div>
      )}

      {versionsOpen && (
        <div onMouseDown={backdropClose(() => setVersionsOpen(false))} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: '100%', maxHeight: '80vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 24px 70px rgba(0,0,0,0.45)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{t('documentacao.versions')}</div>
              <span onClick={() => setVersionsOpen(false)} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 20, lineHeight: 1 }}>&times;</span>
            </div>
            {versions == null && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('common.loading')}</div>}
            {versions?.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('documentacao.versionsEmpty')}</div>}
            {versions?.map((v) => (
              <div
                key={v.id}
                onClick={() => downloadVersion(v.id)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${theme.border}`, cursor: 'pointer', background: theme.subtleBg }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>{new Date(v.createdAt).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB')}</span>
                <Icon name="download" size={14} color={theme.textMuted} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
