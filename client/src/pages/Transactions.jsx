import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { backdropClose } from '../lib/backdropClose.js';
import { MODULE_GROUPS, TYPE_OPTIONS, hueForModule } from '../lib/transactionsMeta.js';

function ModuleBadge({ module, theme }) {
  const hue = hueForModule(module);
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800,
        padding: '4px 10px', borderRadius: 6, background: `oklch(0.90 0.11 ${hue})`, color: `oklch(0.32 0.17 ${hue})`,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: `oklch(0.55 0.20 ${hue})`, flexShrink: 0 }} />
      {module}
    </span>
  );
}

function Field({ label, children, theme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      {children}
    </div>
  );
}

function inputStyle(theme) {
  return {
    border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, background: theme.subtleBg,
    color: theme.textPrimary, outline: 'none', width: '100%', boxSizing: 'border-box',
  };
}

const emptyForm = { tcode: '', module: '', description: '', program: '', type: TYPE_OPTIONS[0], notes: '', favorite: false };

export default function Transactions() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('Todos');
  const [editing, setEditing] = useState(null); // null closed, {} new, {...tx} editing
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);

  useEffect(() => {
    api.listTransactions().then(({ transactions }) => {
      setTransactions(transactions);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (moduleFilter !== 'Todos' && tx.moduleGroup !== moduleFilter) return false;
      if (!q) return true;
      return (
        tx.tcode.toLowerCase().includes(q) ||
        tx.description.toLowerCase().includes(q) ||
        (tx.program || '').toLowerCase().includes(q) ||
        tx.module.toLowerCase().includes(q)
      );
    });
  }, [transactions, search, moduleFilter]);

  const openNew = () => {
    setForm(emptyForm);
    setEditing({});
  };

  const openEdit = (tx) => {
    setForm({ tcode: tx.tcode, module: tx.module, description: tx.description, program: tx.program || '', type: tx.type, notes: tx.notes || '', favorite: tx.favorite });
    setEditing(tx);
  };

  const closeModal = () => setEditing(null);

  const moduleGroupFor = (module) => {
    const m = module.toLowerCase();
    if (m.startsWith('hcm')) return 'HCM';
    if (m.startsWith('successfactors')) return 'SuccessFactors';
    if (m === 'basis') return 'Basis';
    if (m === 'abap') return 'ABAP';
    return 'Outros';
  };

  const save = async () => {
    if (!form.tcode.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, moduleGroup: moduleGroupFor(form.module || 'Outros') };
      if (editing?.id) {
        const { transaction } = await api.updateTransaction(editing.id, payload);
        setTransactions((prev) => prev.map((t) => (t.id === transaction.id ? transaction : t)));
      } else {
        const { transaction } = await api.createTransaction(payload);
        setTransactions((prev) => [transaction, ...prev]);
      }
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing?.id) return;
    const ok = await confirm({ message: t('common.confirmDeleteMessage') });
    if (!ok) return;
    await api.deleteTransaction(editing.id);
    setTransactions((prev) => prev.filter((t) => t.id !== editing.id));
    setEditing(null);
  };

  const toggleFavorite = async (tx, e) => {
    e.stopPropagation();
    const { transaction } = await api.updateTransaction(tx.id, { favorite: !tx.favorite });
    setTransactions((prev) => prev.map((t) => (t.id === transaction.id ? transaction : t)));
  };

  const groupLabel = (g) => (g === 'Todos' ? t('transactions.groupAll') : g === 'Outros' ? t('transactions.groupOther') : g);

  return (
    <div style={{ padding: '24px 28px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{t('transactions.title')}</div>
          <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 2 }}>{t('transactions.subtitle')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '8px 12px' }}>
            <Icon name="search" size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('transactions.searchPlaceholder')}
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: theme.textPrimary, width: 190 }}
            />
          </div>
          <button
            onClick={openNew}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            <Icon name="plus" size={14} color="#fff" /> {t('transactions.newTransaction')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {MODULE_GROUPS.map((g) => (
          <div
            key={g}
            onClick={() => setModuleFilter(g)}
            style={{
              padding: '6px 13px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: moduleFilter === g ? theme.accent : theme.subtleBg, color: moduleFilter === g ? '#fff' : theme.textMuted,
              border: `1px solid ${moduleFilter === g ? theme.accent : theme.border}`,
            }}
          >
            {groupLabel(g)}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 190px 160px 150px 46px', minWidth: '100%' }}>
          {[t('transactions.colTcode'), t('transactions.colDescription'), t('transactions.colModule'), t('transactions.colProgram'), t('transactions.colType'), ''].map((h, i) => (
            <div
              key={i}
              style={{
                padding: '10px 14px', fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase',
                letterSpacing: '0.03em', borderBottom: `2px solid ${theme.border}`, background: theme.subtleBg,
              }}
            >
              {h}
            </div>
          ))}
          {!loading && filtered.map((tx) => {
            const isHovered = hoveredId === tx.id;
            const cellStyle = {
              padding: '12px 14px', fontSize: 12.5, color: theme.textMuted, borderBottom: `1px solid ${theme.border}`,
              cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              background: isHovered ? theme.subtleBg : 'transparent',
            };
            return (
              <div key={tx.id} style={{ display: 'contents' }} onMouseEnter={() => setHoveredId(tx.id)} onMouseLeave={() => setHoveredId(null)} onClick={() => openEdit(tx)}>
                <div style={cellStyle}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 12.5, color: theme.accentText,
                      background: theme.accentSoftBg, padding: '3px 8px', borderRadius: 6,
                    }}
                  >
                    {tx.tcode}
                  </span>
                </div>
                <div style={{ ...cellStyle, color: theme.textPrimary, fontWeight: 500 }}>{tx.description}</div>
                <div style={cellStyle}>
                  <ModuleBadge module={tx.module} theme={theme} />
                </div>
                <div style={{ ...cellStyle, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{tx.program || '—'}</div>
                <div style={cellStyle}>{tx.type}</div>
                <div style={{ ...cellStyle, textAlign: 'center' }} onClick={(e) => toggleFavorite(tx, e)}>
                  <Icon name={tx.favorite ? 'bookmarkFilled' : 'bookmark'} size={14} color={tx.favorite ? theme.accentText : theme.textMuted} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editing !== null && (
        <div onMouseDown={backdropClose(closeModal)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 480, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff',
              border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{editing?.id ? editing.tcode : t('transactions.newTransaction')}</div>
              <span onClick={closeModal} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 20, lineHeight: 1 }}>&times;</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label={t('transactions.fieldTcode')} theme={theme}>
                <input value={form.tcode} onChange={(e) => setForm((f) => ({ ...f, tcode: e.target.value }))} placeholder={t('transactions.fieldTcodePlaceholder')} style={{ ...inputStyle(theme), fontFamily: 'var(--font-mono)', fontWeight: 700 }} />
              </Field>
              <Field label={t('transactions.fieldModule')} theme={theme}>
                <input value={form.module} onChange={(e) => setForm((f) => ({ ...f, module: e.target.value }))} placeholder={t('transactions.fieldModulePlaceholder')} style={inputStyle(theme)} />
              </Field>
            </div>

            <Field label={t('transactions.fieldDescription')} theme={theme}>
              <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder={t('transactions.fieldDescriptionPlaceholder')} style={inputStyle(theme)} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label={t('transactions.fieldProgram')} theme={theme}>
                <input value={form.program} onChange={(e) => setForm((f) => ({ ...f, program: e.target.value }))} placeholder={t('transactions.fieldProgramPlaceholder')} style={{ ...inputStyle(theme), fontFamily: 'var(--font-mono)' }} />
              </Field>
              <Field label={t('transactions.fieldType')} theme={theme}>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} style={inputStyle(theme)}>
                  {TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            </div>

            <Field label={t('transactions.fieldNotes')} theme={theme}>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} placeholder={t('transactions.fieldNotesPlaceholder')} style={{ ...inputStyle(theme), resize: 'vertical', fontFamily: 'inherit' }} />
            </Field>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: theme.textPrimary, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.favorite} onChange={(e) => setForm((f) => ({ ...f, favorite: e.target.checked }))} /> {t('transactions.favoriteLabel')}
            </label>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              {editing?.id && (
                <button onClick={remove} style={{ background: 'transparent', border: `1px solid oklch(0.6 0.2 25)`, color: 'oklch(0.6 0.2 25)', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  <Icon name="trash" size={14} color="oklch(0.6 0.2 25)" />
                </button>
              )}
              <button onClick={closeModal} style={{ flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {t('common.cancel')}
              </button>
              <button onClick={save} disabled={saving || !form.tcode.trim()} style={{ flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving || !form.tcode.trim() ? 0.6 : 1 }}>
                {editing?.id ? t('common.save') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
