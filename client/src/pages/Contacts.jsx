import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import IconPicker from '../components/IconPicker.jsx';
import { backdropClose } from '../lib/backdropClose.js';
import { useIsMobile } from '../lib/useIsMobile.js';

function Field({ label, children, theme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      {children}
    </div>
  );
}

// Native <option> elements are rendered by the OS/browser chrome, not by our
// theme — without an explicit color/background they inherit the (light in
// dark mode) text color onto the browser's own (usually white) dropdown
// popup background, making them unreadable.
const optionStyle = { color: '#1a1a1a', background: '#fff' };

function inputStyle(theme) {
  return {
    border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, background: theme.subtleBg,
    color: theme.textPrimary, outline: 'none', width: '100%', boxSizing: 'border-box',
    // Without this, native <select> dropdown popups render with the OS's
    // default light background while inheriting our light `color` text —
    // unreadable white-on-white in dark mode.
    colorScheme: theme.dark ? 'dark' : 'light',
  };
}

const emptyForm = { name: '', clientId: '', systemId: '', role: '', email: '', phone: '', notes: '' };

export default function Contacts() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const isMobile = useIsMobile();
  const [contacts, setContacts] = useState([]);
  const [clients, setClients] = useState([]);
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);

  useEffect(() => {
    Promise.all([api.listContacts(), api.listClients(), api.listSapSystems()]).then(([contactRes, clientRes, sysRes]) => {
      setContacts(contactRes.contacts);
      setClients(clientRes.clients);
      setSystems(sysRes.systems);
      setLoading(false);
    });
  }, []);

  const systemsForClient = (clientId) => (clientId ? systems.filter((s) => s.clientId === clientId) : systems);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      c.name.toLowerCase().includes(q) || (c.role || '').toLowerCase().includes(q) || (c.client?.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const openNew = () => {
    setForm(emptyForm);
    setEditing({});
  };

  const openEdit = (c) => {
    setForm({ name: c.name, clientId: c.clientId || '', systemId: c.systemId || '', role: c.role || '', email: c.email || '', phone: c.phone || '', notes: c.notes || '' });
    setEditing(c);
  };

  const closeModal = () => setEditing(null);

  const setIcon = async (c, icon) => {
    const { contact } = await api.updateContact(c.id, { icon });
    setContacts((prev) => prev.map((x) => (x.id === contact.id ? contact : x)));
    setEditing((prev) => (prev && prev.id === contact.id ? { ...prev, icon: contact.icon } : prev));
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, clientId: form.clientId || null, systemId: form.systemId || null };
      if (editing?.id) {
        const { contact } = await api.updateContact(editing.id, payload);
        setContacts((prev) => prev.map((c) => (c.id === contact.id ? contact : c)));
      } else {
        const { contact } = await api.createContact(payload);
        setContacts((prev) => [contact, ...prev]);
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
    await api.deleteContact(editing.id);
    setContacts((prev) => prev.filter((c) => c.id !== editing.id));
    setEditing(null);
  };

  return (
    <div style={{ padding: isMobile ? 14 : '24px 28px', flex: 1, display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{t('contacts.title')}</div>
          <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 2 }}>{t('contacts.subtitle')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '8px 12px' }}>
            <Icon name="search" size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('contacts.searchPlaceholder')}
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: theme.textPrimary, width: isMobile ? 140 : 190 }}
            />
          </div>
          <button
            onClick={openNew}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            <Icon name="plus" size={14} color="#fff" /> {t('contacts.newContact')}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 0.9fr 1fr 1fr 1.2fr 0.9fr', minWidth: '100%' }}>
          {!isMobile && ['contacts.colName', 'contacts.colRole', 'contacts.colClient', 'contacts.colSystem', 'contacts.colEmail', 'contacts.colPhone'].map((k, i) => (
            <div key={i} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: `2px solid ${theme.border}`, background: theme.subtleBg }}>
              {t(k)}
            </div>
          ))}
          {!loading && filtered.map((c) => {
            const isHovered = hoveredId === c.id;
            const cell = { padding: 'var(--kh-row-py, 12px) 14px', fontSize: 12.5, color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', background: isHovered ? theme.subtleBg : 'transparent', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
            if (isMobile) {
              return (
                <div key={c.id} onClick={() => openEdit(c)} style={{ padding: 'var(--kh-row-py, 12px) 14px', borderBottom: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: theme.textPrimary }}>{c.icon ? `${c.icon} ` : ''}{c.name}</div>
                  <div style={{ fontSize: 11.5, color: theme.textMuted }}>{[c.role, c.client?.name].filter(Boolean).join(' · ') || '—'}</div>
                </div>
              );
            }
            return (
              <div key={c.id} style={{ display: 'contents' }} onMouseEnter={() => setHoveredId(c.id)} onMouseLeave={() => setHoveredId(null)} onClick={() => openEdit(c)}>
                <div style={cell}><span style={{ color: theme.textPrimary, fontWeight: 600 }}>{c.icon ? `${c.icon} ` : ''}{c.name}</span></div>
                <div style={cell}>{c.role || '—'}</div>
                <div style={cell}>{c.client?.name || '—'}</div>
                <div style={cell}>{c.system?.name || '—'}</div>
                <div style={cell}>{c.email || '—'}</div>
                <div style={cell}>{c.phone || '—'}</div>
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
              width: 460, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff',
              border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {editing?.id && (
                  <IconPicker
                    theme={theme} t={t} value={editing.icon} onChange={(icon) => setIcon(editing, icon)}
                    size={32} fallback={<Icon name="idCard" size={16} color={theme.accentText} />}
                    triggerStyle={{ background: theme.accentSoftBg }}
                  />
                )}
                <div style={{ fontSize: 17, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editing?.id ? editing.name : t('contacts.newContact')}</div>
              </div>
              <span onClick={closeModal} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 20, lineHeight: 1, flexShrink: 0 }}>&times;</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label={t('contacts.fieldName')} theme={theme}>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle(theme)} />
              </Field>
              <Field label={t('contacts.fieldRole')} theme={theme}>
                <input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder={t('contacts.fieldRolePlaceholder')} style={inputStyle(theme)} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label={t('contacts.fieldClient')} theme={theme}>
                <select value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value, systemId: '' }))} style={inputStyle(theme)}>
                  <option value="" style={optionStyle}>{t('contacts.fieldClientNone')}</option>
                  {clients.map((c) => <option key={c.id} value={c.id} style={optionStyle}>{c.name}</option>)}
                </select>
              </Field>
              <Field label={t('contacts.fieldSystem')} theme={theme}>
                <select value={form.systemId} onChange={(e) => setForm((f) => ({ ...f, systemId: e.target.value }))} style={inputStyle(theme)}>
                  <option value="" style={optionStyle}>{t('contacts.fieldSystemNone')}</option>
                  {systemsForClient(form.clientId).map((s) => <option key={s.id} value={s.id} style={optionStyle}>{s.name}</option>)}
                </select>
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label={t('contacts.fieldEmail')} theme={theme}>
                <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} style={inputStyle(theme)} />
              </Field>
              <Field label={t('contacts.fieldPhone')} theme={theme}>
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} style={inputStyle(theme)} />
              </Field>
            </div>

            <Field label={t('contacts.fieldNotes')} theme={theme}>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inputStyle(theme), resize: 'vertical', fontFamily: 'inherit' }} />
            </Field>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              {editing?.id && (
                <button onClick={remove} style={{ background: 'transparent', border: `1px solid oklch(0.6 0.2 25)`, color: 'oklch(0.6 0.2 25)', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  <Icon name="trash" size={14} color="oklch(0.6 0.2 25)" />
                </button>
              )}
              <button onClick={closeModal} style={{ flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {t('common.cancel')}
              </button>
              <button onClick={save} disabled={saving || !form.name.trim()} style={{ flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving || !form.name.trim() ? 0.6 : 1 }}>
                {editing?.id ? t('common.save') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
