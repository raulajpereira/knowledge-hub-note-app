import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { useCounts } from '../context/CountsContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import CodeBlock from '../components/CodeBlock.jsx';

const FOLDER_KINDS = ['program', 'class', 'function_module'];
const ITEM_TYPES = ['snippet', 'characteristics', 'table', 'data_element', 'domain'];
const ITEM_ICON = { snippet: 'code', characteristics: 'settings', table: 'archive', data_element: 'tag', domain: 'doc' };
const optionStyle = { color: '#1a1a1a', background: '#fff' };

function inputStyle(theme) {
  return { border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', width: '100%', boxSizing: 'border-box' };
}

function Field({ label, children }) {
  const { theme } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</label>
      {children}
    </div>
  );
}

function Checkbox({ label, checked, onChange }) {
  const { theme } = useTheme();
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: theme.textPrimary, cursor: 'pointer' }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function defaultAttributes(type, folderKind) {
  if (type === 'characteristics') {
    if (folderKind === 'class') return { description: '', category: 'Usual ABAP Class', instantiation: 'Public', superclass: '', interfaces: '' };
    if (folderKind === 'function_module') return { shortText: '', functionGroup: '', remoteEnabled: false, updateModule: false, importing: '', exporting: '', changing: '', exceptions: '' };
    return { title: '', programType: 'Executable Program', status: 'Active', application: '', package: '', fixedPointArithmetic: false, unicodeChecksActive: true };
  }
  if (type === 'table') return { shortText: '', deliveryClass: 'A', tableCategory: 'Transparent Table', fields: [] };
  if (type === 'data_element') return { shortText: '', domain: '', headingText: '', mediumText: '', longText: '' };
  if (type === 'domain') return { dataType: 'CHAR', length: '10', decimals: '0', outputLength: '', lowerCase: false, valueTable: '', fixedValues: [] };
  return {};
}

function ProgramCharacteristics({ a, set, t }) {
  const { theme } = useTheme();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <Field label={t('codeLibrary.fieldTitle')}>
        <input value={a.title || ''} onChange={(e) => set({ title: e.target.value })} style={inputStyle(theme)} />
      </Field>
      <Field label={t('codeLibrary.fieldProgramType')}>
        <select value={a.programType || 'Executable Program'} onChange={(e) => set({ programType: e.target.value })} style={inputStyle(theme)}>
          {['Executable Program', 'Include Program', 'Module Pool', 'Function Group', 'Class Pool', 'Interface Pool', 'Subroutine Pool'].map((v) => (
            <option key={v} value={v} style={optionStyle}>{v}</option>
          ))}
        </select>
      </Field>
      <Field label={t('codeLibrary.fieldStatus')}>
        <select value={a.status || 'Active'} onChange={(e) => set({ status: e.target.value })} style={inputStyle(theme)}>
          {['Active', 'Inactive'].map((v) => <option key={v} value={v} style={optionStyle}>{v}</option>)}
        </select>
      </Field>
      <Field label={t('codeLibrary.fieldApplication')}>
        <input value={a.application || ''} onChange={(e) => set({ application: e.target.value })} style={inputStyle(theme)} />
      </Field>
      <Field label={t('codeLibrary.fieldPackage')}>
        <input value={a.package || ''} onChange={(e) => set({ package: e.target.value })} placeholder="$TMP, ZPACKAGE..." style={inputStyle(theme)} />
      </Field>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', paddingTop: 18 }}>
        <Checkbox label={t('codeLibrary.fieldFixedPoint')} checked={a.fixedPointArithmetic} onChange={(v) => set({ fixedPointArithmetic: v })} />
        <Checkbox label={t('codeLibrary.fieldUnicodeChecks')} checked={a.unicodeChecksActive !== false} onChange={(v) => set({ unicodeChecksActive: v })} />
      </div>
    </div>
  );
}

function ClassCharacteristics({ a, set, t }) {
  const { theme } = useTheme();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div style={{ gridColumn: '1 / -1' }}>
        <Field label={t('codeLibrary.fieldDescription')}>
          <input value={a.description || ''} onChange={(e) => set({ description: e.target.value })} style={inputStyle(theme)} />
        </Field>
      </div>
      <Field label={t('codeLibrary.fieldCategory')}>
        <select value={a.category || 'Usual ABAP Class'} onChange={(e) => set({ category: e.target.value })} style={inputStyle(theme)}>
          {['Usual ABAP Class', 'Exception Class', 'Persistent Class', 'Test Class'].map((v) => <option key={v} value={v} style={optionStyle}>{v}</option>)}
        </select>
      </Field>
      <Field label={t('codeLibrary.fieldInstantiation')}>
        <select value={a.instantiation || 'Public'} onChange={(e) => set({ instantiation: e.target.value })} style={inputStyle(theme)}>
          {['Public', 'Protected', 'Private'].map((v) => <option key={v} value={v} style={optionStyle}>{v}</option>)}
        </select>
      </Field>
      <Field label={t('codeLibrary.fieldSuperclass')}>
        <input value={a.superclass || ''} onChange={(e) => set({ superclass: e.target.value })} style={inputStyle(theme)} />
      </Field>
      <Field label={t('codeLibrary.fieldInterfaces')}>
        <input value={a.interfaces || ''} onChange={(e) => set({ interfaces: e.target.value })} style={inputStyle(theme)} />
      </Field>
    </div>
  );
}

function FunctionModuleCharacteristics({ a, set, t }) {
  const { theme } = useTheme();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div style={{ gridColumn: '1 / -1' }}>
        <Field label={t('codeLibrary.fieldShortText')}>
          <input value={a.shortText || ''} onChange={(e) => set({ shortText: e.target.value })} style={inputStyle(theme)} />
        </Field>
      </div>
      <Field label={t('codeLibrary.fieldFunctionGroup')}>
        <input value={a.functionGroup || ''} onChange={(e) => set({ functionGroup: e.target.value })} style={inputStyle(theme)} />
      </Field>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', paddingTop: 18 }}>
        <Checkbox label={t('codeLibrary.fieldRemoteEnabled')} checked={a.remoteEnabled} onChange={(v) => set({ remoteEnabled: v })} />
        <Checkbox label={t('codeLibrary.fieldUpdateModule')} checked={a.updateModule} onChange={(v) => set({ updateModule: v })} />
      </div>
      <Field label={t('codeLibrary.fieldImporting')}>
        <input value={a.importing || ''} onChange={(e) => set({ importing: e.target.value })} placeholder="IV_PARAM TYPE STRING, ..." style={inputStyle(theme)} />
      </Field>
      <Field label={t('codeLibrary.fieldExporting')}>
        <input value={a.exporting || ''} onChange={(e) => set({ exporting: e.target.value })} style={inputStyle(theme)} />
      </Field>
      <Field label={t('codeLibrary.fieldChanging')}>
        <input value={a.changing || ''} onChange={(e) => set({ changing: e.target.value })} style={inputStyle(theme)} />
      </Field>
      <Field label={t('codeLibrary.fieldExceptions')}>
        <input value={a.exceptions || ''} onChange={(e) => set({ exceptions: e.target.value })} style={inputStyle(theme)} />
      </Field>
    </div>
  );
}

function TableForm({ a, set, t }) {
  const { theme } = useTheme();
  const fields = a.fields || [];
  const setField = (idx, patch) => set({ fields: fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)) });
  const addField = () => set({ fields: [...fields, { fieldName: '', keyFlag: false, dataElement: '', dataType: '', length: '', notNull: false }] });
  const removeField = (idx) => set({ fields: fields.filter((_, i) => i !== idx) });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <Field label={t('codeLibrary.fieldShortText')}>
          <input value={a.shortText || ''} onChange={(e) => set({ shortText: e.target.value })} style={inputStyle(theme)} />
        </Field>
        <Field label={t('codeLibrary.fieldDeliveryClass')}>
          <select value={a.deliveryClass || 'A'} onChange={(e) => set({ deliveryClass: e.target.value })} style={inputStyle(theme)}>
            {['A', 'C', 'L', 'G', 'E', 'S', 'W'].map((v) => <option key={v} value={v} style={optionStyle}>{v}</option>)}
          </select>
        </Field>
        <Field label={t('codeLibrary.fieldTableCategory')}>
          <select value={a.tableCategory || 'Transparent Table'} onChange={(e) => set({ tableCategory: e.target.value })} style={inputStyle(theme)}>
            {['Transparent Table', 'Structure', 'Pooled Table', 'Cluster Table'].map((v) => <option key={v} value={v} style={optionStyle}>{v}</option>)}
          </select>
        </Field>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{t('codeLibrary.fieldsHeader')}</span>
          <span onClick={addField} style={{ fontSize: 11.5, fontWeight: 700, color: theme.accentText, cursor: 'pointer' }}>+ {t('codeLibrary.addField')}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fields.map((f, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={f.fieldName} onChange={(e) => setField(idx, { fieldName: e.target.value })} placeholder={t('codeLibrary.colField')} style={{ ...inputStyle(theme), width: 130 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: theme.textPrimary }}>
                <input type="checkbox" checked={!!f.keyFlag} onChange={(e) => setField(idx, { keyFlag: e.target.checked })} /> {t('codeLibrary.colKey')}
              </label>
              <input value={f.dataElement} onChange={(e) => setField(idx, { dataElement: e.target.value })} placeholder={t('codeLibrary.colDataElement')} style={{ ...inputStyle(theme), width: 140 }} />
              <input value={f.dataType} onChange={(e) => setField(idx, { dataType: e.target.value })} placeholder={t('codeLibrary.colType')} style={{ ...inputStyle(theme), width: 80 }} />
              <input value={f.length} onChange={(e) => setField(idx, { length: e.target.value })} placeholder={t('codeLibrary.colLength')} style={{ ...inputStyle(theme), width: 70 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: theme.textPrimary }}>
                <input type="checkbox" checked={!!f.notNull} onChange={(e) => setField(idx, { notNull: e.target.checked })} /> {t('codeLibrary.colNotNull')}
              </label>
              <span onClick={() => removeField(idx)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '0 4px' }}>&times;</span>
            </div>
          ))}
          {fields.length === 0 && <div style={{ fontSize: 12, color: theme.textMuted }}>{t('codeLibrary.noFields')}</div>}
        </div>
      </div>
    </div>
  );
}

function DataElementForm({ a, set, t }) {
  const { theme } = useTheme();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div style={{ gridColumn: '1 / -1' }}>
        <Field label={t('codeLibrary.fieldShortText')}>
          <input value={a.shortText || ''} onChange={(e) => set({ shortText: e.target.value })} style={inputStyle(theme)} />
        </Field>
      </div>
      <Field label={t('codeLibrary.fieldDomain')}>
        <input value={a.domain || ''} onChange={(e) => set({ domain: e.target.value })} style={inputStyle(theme)} />
      </Field>
      <Field label={t('codeLibrary.fieldHeadingText')}>
        <input value={a.headingText || ''} onChange={(e) => set({ headingText: e.target.value })} style={inputStyle(theme)} />
      </Field>
      <Field label={t('codeLibrary.fieldMediumText')}>
        <input value={a.mediumText || ''} onChange={(e) => set({ mediumText: e.target.value })} style={inputStyle(theme)} />
      </Field>
      <Field label={t('codeLibrary.fieldLongText')}>
        <input value={a.longText || ''} onChange={(e) => set({ longText: e.target.value })} style={inputStyle(theme)} />
      </Field>
    </div>
  );
}

function DomainForm({ a, set, t }) {
  const { theme } = useTheme();
  const values = a.fixedValues || [];
  const setValue = (idx, patch) => set({ fixedValues: values.map((v, i) => (i === idx ? { ...v, ...patch } : v)) });
  const addValue = () => set({ fixedValues: [...values, { low: '', high: '', text: '' }] });
  const removeValue = (idx) => set({ fixedValues: values.filter((_, i) => i !== idx) });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
        <Field label={t('codeLibrary.fieldDataType')}>
          <select value={a.dataType || 'CHAR'} onChange={(e) => set({ dataType: e.target.value })} style={inputStyle(theme)}>
            {['CHAR', 'NUMC', 'DEC', 'DATS', 'TIMS', 'INT4', 'CUKY', 'QUAN', 'STRG'].map((v) => <option key={v} value={v} style={optionStyle}>{v}</option>)}
          </select>
        </Field>
        <Field label={t('codeLibrary.fieldLength')}>
          <input value={a.length || ''} onChange={(e) => set({ length: e.target.value })} style={inputStyle(theme)} />
        </Field>
        <Field label={t('codeLibrary.fieldDecimals')}>
          <input value={a.decimals || ''} onChange={(e) => set({ decimals: e.target.value })} style={inputStyle(theme)} />
        </Field>
        <Field label={t('codeLibrary.fieldOutputLength')}>
          <input value={a.outputLength || ''} onChange={(e) => set({ outputLength: e.target.value })} style={inputStyle(theme)} />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
        <Checkbox label={t('codeLibrary.fieldLowerCase')} checked={a.lowerCase} onChange={(v) => set({ lowerCase: v })} />
      </div>
      <Field label={t('codeLibrary.fieldValueTable')}>
        <input value={a.valueTable || ''} onChange={(e) => set({ valueTable: e.target.value })} style={inputStyle(theme)} />
      </Field>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{t('codeLibrary.fixedValuesHeader')}</span>
          <span onClick={addValue} style={{ fontSize: 11.5, fontWeight: 700, color: theme.accentText, cursor: 'pointer' }}>+ {t('codeLibrary.addFixedValue')}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {values.map((v, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input value={v.low} onChange={(e) => setValue(idx, { low: e.target.value })} placeholder={t('codeLibrary.colLow')} style={{ ...inputStyle(theme), width: 100 }} />
              <input value={v.high} onChange={(e) => setValue(idx, { high: e.target.value })} placeholder={t('codeLibrary.colHigh')} style={{ ...inputStyle(theme), width: 100 }} />
              <input value={v.text} onChange={(e) => setValue(idx, { text: e.target.value })} placeholder={t('codeLibrary.colText')} style={{ ...inputStyle(theme), flex: 1 }} />
              <span onClick={() => removeValue(idx)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '0 4px' }}>&times;</span>
            </div>
          ))}
          {values.length === 0 && <div style={{ fontSize: 12, color: theme.textMuted }}>{t('codeLibrary.noFixedValues')}</div>}
        </div>
      </div>
    </div>
  );
}

export default function CodeLibrary() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const { refresh: refreshCounts } = useCounts();

  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [search, setSearch] = useState('');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderKind, setNewFolderKind] = useState('program');
  const [newItemMenuOpen, setNewItemMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listCodeFolders().then(({ folders }) => {
      setFolders(folders);
      if (folders.length > 0) setSelectedFolderId(folders[0].id);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedFolderId) {
      setItems([]);
      setSelectedItemId(null);
      return;
    }
    api.listCodeItems(selectedFolderId).then(({ items }) => {
      setItems(items);
      setSelectedItemId(items[0]?.id || null);
    });
  }, [selectedFolderId]);

  const selectedFolder = folders.find((f) => f.id === selectedFolderId) || null;
  const selectedItem = items.find((i) => i.id === selectedItemId) || null;
  const filteredFolders = folders.filter((f) => f.name.toLowerCase().includes(search.trim().toLowerCase()));

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    const { folder } = await api.createCodeFolder({ name: newFolderName.trim(), kind: newFolderKind });
    setFolders((prev) => [folder, ...prev]);
    setSelectedFolderId(folder.id);
    setNewFolderName('');
    setNewFolderKind('program');
    setNewFolderOpen(false);
    refreshCounts();
  };

  const deleteFolder = async (id) => {
    const ok = await confirm({ title: t('common.confirmDeleteTitle'), message: t('codeLibrary.deleteFolderConfirm'), confirmLabel: t('common.deleteForever') });
    if (!ok) return;
    await api.deleteCodeFolder(id);
    setFolders((prev) => prev.filter((f) => f.id !== id));
    if (selectedFolderId === id) setSelectedFolderId(folders.find((f) => f.id !== id)?.id || null);
    refreshCounts();
  };

  const createItem = async (type) => {
    if (!selectedFolder) return;
    const names = {
      snippet: t('codeLibrary.newSnippetName'),
      characteristics: t('codeLibrary.characteristicsName'),
      table: t('codeLibrary.newTableName'),
      data_element: t('codeLibrary.newDataElementName'),
      domain: t('codeLibrary.newDomainName'),
    };
    const { item } = await api.createCodeItem(selectedFolder.id, {
      type,
      name: names[type],
      language: 'abap',
      content: type === 'snippet' ? '' : null,
      attributes: type === 'snippet' ? null : defaultAttributes(type, selectedFolder.kind),
    });
    setItems((prev) => [...prev, item]);
    setSelectedItemId(item.id);
    setNewItemMenuOpen(false);
    setFolders((prev) => prev.map((f) => (f.id === selectedFolder.id ? { ...f, itemCount: (f.itemCount || 0) + 1 } : f)));
  };

  const updateItem = async (patch) => {
    if (!selectedItem) return;
    const { item } = await api.updateCodeItem(selectedItem.id, patch);
    setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
  };

  const deleteItem = async (id) => {
    const ok = await confirm({ title: t('common.confirmDeleteTitle'), message: t('codeLibrary.deleteItemConfirm'), confirmLabel: t('common.deleteForever') });
    if (!ok) return;
    await api.deleteCodeItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (selectedItemId === id) setSelectedItemId(items.find((i) => i.id !== id)?.id || null);
    if (selectedFolder) setFolders((prev) => prev.map((f) => (f.id === selectedFolder.id ? { ...f, itemCount: Math.max(0, (f.itemCount || 1) - 1) } : f)));
  };

  const kindLabel = (kind) => t(`codeLibrary.kind${kind === 'program' ? 'Program' : kind === 'class' ? 'Class' : 'FunctionModule'}`);

  const rowStyle = (isActive) => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
    background: isActive ? theme.accentSoftBg : 'transparent', color: isActive ? theme.accentText : theme.textMuted,
  });

  if (loading) return <div style={{ padding: 28, color: theme.textMuted }}>{t('common.loading')}</div>;

  return (
    <div style={{ padding: '24px 28px', flex: 1, display: 'flex', gap: 24, minHeight: 0 }}>
      <div style={{ flex: '1 1 280px', minWidth: 240, maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '9px 12px' }}>
          <span style={{ opacity: 0.5, display: 'flex' }}><Icon name="search" size={15} /></span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('codeLibrary.searchPlaceholder')}
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, flex: 1, minWidth: 0, color: theme.textPrimary }}
          />
        </div>

        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {filteredFolders.length === 0 && <div style={{ padding: 14, fontSize: 13, color: theme.textMuted }}>{t('codeLibrary.noFolders')}</div>}
          {filteredFolders.map((f) => (
            <div key={f.id} onClick={() => setSelectedFolderId(f.id)} style={rowStyle(selectedFolderId === f.id)}>
              <Icon name="folder" size={15} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                <div style={{ fontSize: 10.5, opacity: 0.7 }}>{kindLabel(f.kind)}</div>
              </div>
              <span style={{ fontSize: 11.5, opacity: 0.7 }}>{f.itemCount}</span>
            </div>
          ))}

          {newFolderOpen ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 4px 2px' }}>
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createFolder()}
                placeholder={t('codeLibrary.newFolderNamePlaceholder')}
                autoFocus
                style={{ border: `1px solid ${theme.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
              />
              <select value={newFolderKind} onChange={(e) => setNewFolderKind(e.target.value)} style={{ border: `1px solid ${theme.border}`, borderRadius: 7, padding: '6px 8px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}>
                {FOLDER_KINDS.map((k) => <option key={k} value={k} style={optionStyle}>{kindLabel(k)}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={createFolder} style={{ flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {t('common.add')}
                </button>
                <button onClick={() => setNewFolderOpen(false)} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setNewFolderOpen(true)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: theme.accent, color: '#fff', borderRadius: 8, padding: '9px 12px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', marginTop: 2 }}
            >
              <Icon name="plus" size={13} color="#fff" /> {t('codeLibrary.newFolder')}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: '1 1 240px', minWidth: 220, maxWidth: 280, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {selectedFolder ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedFolder.name}</div>
                <div style={{ fontSize: 11.5, color: theme.textMuted }}>{kindLabel(selectedFolder.kind)}</div>
              </div>
              <span onClick={() => deleteFolder(selectedFolder.id)} style={{ cursor: 'pointer', color: theme.textMuted, display: 'flex' }}>
                <Icon name="trash" size={15} />
              </span>
            </div>

            <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {items.length === 0 && <div style={{ padding: 14, fontSize: 13, color: theme.textMuted }}>{t('codeLibrary.noItems')}</div>}
              {items.map((it) => (
                <div key={it.id} onClick={() => setSelectedItemId(it.id)} style={rowStyle(selectedItemId === it.id)}>
                  <Icon name={ITEM_ICON[it.type] || 'doc'} size={15} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
                </div>
              ))}
            </div>

            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div
                onClick={() => setNewItemMenuOpen((v) => !v)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: theme.accent, color: '#fff', borderRadius: 8, padding: '9px 12px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
              >
                <Icon name="plus" size={13} color="#fff" /> {t('codeLibrary.newItem')}
              </div>
              {newItemMenuOpen && (
                <div
                  onMouseLeave={() => setNewItemMenuOpen(false)}
                  style={{
                    position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 20,
                    background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
                    borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.25)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
                  }}
                >
                  {ITEM_TYPES.map((type) => (
                    <div
                      key={type}
                      onClick={() => createItem(type)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: theme.textPrimary }}
                    >
                      <Icon name={ITEM_ICON[type]} size={14} />
                      {t(`codeLibrary.new${type === 'snippet' ? 'Snippet' : type === 'characteristics' ? 'Characteristics' : type === 'table' ? 'Table' : type === 'data_element' ? 'DataElement' : 'Domain'}`)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ padding: 20, fontSize: 13, color: theme.textMuted }}>{t('codeLibrary.selectFolder')}</div>
        )}
      </div>

      <div style={{ flex: 2, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
        {selectedItem && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                value={selectedItem.name}
                onChange={(e) => setItems((prev) => prev.map((i) => (i.id === selectedItem.id ? { ...i, name: e.target.value } : i)))}
                onBlur={(e) => updateItem({ name: e.target.value })}
                placeholder={t('codeLibrary.itemNamePlaceholder')}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 20, fontWeight: 700, color: theme.textPrimary }}
              />
              <span onClick={() => deleteItem(selectedItem.id)} style={{ cursor: 'pointer', color: theme.textMuted, display: 'flex' }}>
                <Icon name="trash" size={16} />
              </span>
            </div>

            {selectedItem.type === 'snippet' && (
              <CodeBlock
                value={selectedItem.content || ''}
                language={selectedItem.language || 'abap'}
                onChange={(value) => {
                  setItems((prev) => prev.map((i) => (i.id === selectedItem.id ? { ...i, content: value } : i)));
                  updateItem({ content: value });
                }}
                onLanguageChange={(language) => updateItem({ language })}
                onDelete={() => deleteItem(selectedItem.id)}
              />
            )}

            {selectedItem.type === 'characteristics' && selectedFolder?.kind === 'program' && (
              <ProgramCharacteristics a={selectedItem.attributes || {}} set={(patch) => updateItem({ attributes: { ...selectedItem.attributes, ...patch } })} t={t} />
            )}
            {selectedItem.type === 'characteristics' && selectedFolder?.kind === 'class' && (
              <ClassCharacteristics a={selectedItem.attributes || {}} set={(patch) => updateItem({ attributes: { ...selectedItem.attributes, ...patch } })} t={t} />
            )}
            {selectedItem.type === 'characteristics' && selectedFolder?.kind === 'function_module' && (
              <FunctionModuleCharacteristics a={selectedItem.attributes || {}} set={(patch) => updateItem({ attributes: { ...selectedItem.attributes, ...patch } })} t={t} />
            )}
            {selectedItem.type === 'table' && (
              <TableForm a={selectedItem.attributes || {}} set={(patch) => updateItem({ attributes: { ...selectedItem.attributes, ...patch } })} t={t} />
            )}
            {selectedItem.type === 'data_element' && (
              <DataElementForm a={selectedItem.attributes || {}} set={(patch) => updateItem({ attributes: { ...selectedItem.attributes, ...patch } })} t={t} />
            )}
            {selectedItem.type === 'domain' && (
              <DomainForm a={selectedItem.attributes || {}} set={(patch) => updateItem({ attributes: { ...selectedItem.attributes, ...patch } })} t={t} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
