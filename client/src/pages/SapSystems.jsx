import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { backdropClose } from '../lib/backdropClose.js';
import { useIsMobile } from '../lib/useIsMobile.js';

const ENV_OPTIONS = ['DEV', 'QAS', 'PRD', 'Sandbox'];
const ENV_HUE = { DEV: 210, QAS: 60, PRD: 25, Sandbox: 290 };

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

function EnvBadge({ env }) {
  const hue = ENV_HUE[env] ?? 280;
  return (
    <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 6, background: `oklch(0.90 0.11 ${hue})`, color: `oklch(0.32 0.17 ${hue})`, whiteSpace: 'nowrap' }}>
      {env}
    </span>
  );
}

const emptyForm = {
  name: '', clientId: '', sid: '', instanceNumber: '', saprouter: '', applicationServer: '',
  environment: 'PRD', url: '', notes: '', favorite: false,
};

export default function SapSystems() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const isMobile = useIsMobile();
  const [systems, setSystems] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);

  useEffect(() => {
    Promise.all([api.listSapSystems(), api.listClients()]).then(([sysRes, clientRes]) => {
      setSystems(sysRes.systems);
      setClients(clientRes.clients);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return systems;
    return systems.filter((s) =>
      s.name.toLowerCase().includes(q) || (s.sid || '').toLowerCase().includes(q) || (s.client?.name || '').toLowerCase().includes(q)
    );
  }, [systems, search]);

  const openNew = () => {
    setForm(emptyForm);
    setEditing({});
  };

  const openEdit = (s) => {
    setForm({
      name: s.name, clientId: s.clientId || '', sid: s.sid || '', instanceNumber: s.instanceNumber || '',
      saprouter: s.saprouter || '', applicationServer: s.applicationServer || '', environment: s.environment,
      url: s.url || '', notes: s.notes || '', favorite: s.favorite,
    });
    setEditing(s);
  };

  const closeModal = () => setEditing(null);

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, clientId: form.clientId || null };
      if (editing?.id) {
        const { system } = await api.updateSapSystem(editing.id, payload);
        setSystems((prev) => prev.map((s) => (s.id === system.id ? system : s)));
      } else {
        const { system } = await api.createSapSystem(payload);
        setSystems((prev) => [system, ...prev]);
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
    await api.deleteSapSystem(editing.id);
    setSystems((prev) => prev.filter((s) => s.id !== editing.id));
    setEditing(null);
  };

  const toggleFavorite = async (s, e) => {
    e.stopPropagation();
    const { system } = await api.updateSapSystem(s.id, { favorite: !s.favorite });
    setSystems((prev) => prev.map((x) => (x.id === system.id ? system : x)));
  };

  return (
    <div style={{ padding: isMobile ? 14 : '24px 28px', flex: 1, display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{t('sapSystems.title')}</div>
          <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 2 }}>{t('sapSystems.subtitle')}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '8px 12px' }}>
            <Icon name="search" size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('sapSystems.searchPlaceholder')}
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: theme.textPrimary, width: isMobile ? 140 : 190 }}
            />
          </div>
          <button
            onClick={openNew}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            <Icon name="plus" size={14} color="#fff" /> {t('sapSystems.newSystem')}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr 0.7fr 0.7fr 1fr 1fr 40px', minWidth: '100%' }}>
          {!isMobile && ['sapSystems.colName', 'sapSystems.colClient', 'sapSystems.colSid', 'sapSystems.colEnv', 'sapSystems.colAppServer', 'sapSystems.colInstance', ''].map((k, i) => (
            <div key={i} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: `2px solid ${theme.border}`, background: theme.subtleBg }}>
              {k ? t(k) : ''}
            </div>
          ))}
          {!loading && filtered.map((s) => {
            const isHovered = hoveredId === s.id;
            const cell = { padding: '12px 14px', fontSize: 12.5, color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', background: isHovered ? theme.subtleBg : 'transparent', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
            if (isMobile) {
              return (
                <div key={s.id} onClick={() => openEdit(s)} style={{ padding: '12px 14px', borderBottom: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: theme.textPrimary }}>{s.name}</span>
                    <EnvBadge env={s.environment} />
                  </div>
                  <div style={{ fontSize: 11.5, color: theme.textMuted }}>{s.client?.name || '—'}{s.sid ? ` · ${s.sid}` : ''}</div>
                </div>
              );
            }
            return (
              <div key={s.id} style={{ display: 'contents' }} onMouseEnter={() => setHoveredId(s.id)} onMouseLeave={() => setHoveredId(null)} onClick={() => openEdit(s)}>
                <div style={cell}><span style={{ color: theme.textPrimary, fontWeight: 600 }}>{s.name}</span></div>
                <div style={cell}>{s.client?.name || '—'}</div>
                <div style={{ ...cell, fontFamily: 'var(--font-mono)' }}>{s.sid || '—'}</div>
                <div style={cell}><EnvBadge env={s.environment} /></div>
                <div style={{ ...cell, fontFamily: 'var(--font-mono)' }}>{s.applicationServer || '—'}</div>
                <div style={{ ...cell, fontFamily: 'var(--font-mono)' }}>{s.instanceNumber || '—'}</div>
                <div style={{ ...cell, textAlign: 'center' }} onClick={(e) => toggleFavorite(s, e)}>
                  <Icon name={s.favorite ? 'bookmarkFilled' : 'bookmark'} size={14} color={s.favorite ? theme.accentText : theme.textMuted} />
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
              <div style={{ fontSize: 17, fontWeight: 800 }}>{editing?.id ? editing.name : t('sapSystems.newSystem')}</div>
              <span onClick={closeModal} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 20, lineHeight: 1 }}>&times;</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label={t('sapSystems.fieldClient')} theme={theme}>
                <select value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))} style={inputStyle(theme)}>
                  <option value="">{t('sapSystems.fieldClientNone')}</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label={t('sapSystems.fieldEnv')} theme={theme}>
                <select value={form.environment} onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value }))} style={inputStyle(theme)}>
                  {ENV_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
              {t('sapSystems.connectionParamsTitle')}
            </div>

            <Field label={t('sapSystems.fieldName')} theme={theme}>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('sapSystems.fieldNamePlaceholder')} style={inputStyle(theme)} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label={t('sapSystems.fieldSid')} theme={theme}>
                <input value={form.sid} onChange={(e) => setForm((f) => ({ ...f, sid: e.target.value }))} placeholder="JOG" style={{ ...inputStyle(theme), fontFamily: 'var(--font-mono)' }} />
              </Field>
              <Field label={t('sapSystems.fieldInstanceNumber')} theme={theme}>
                <input value={form.instanceNumber} onChange={(e) => setForm((f) => ({ ...f, instanceNumber: e.target.value }))} placeholder="00" style={{ ...inputStyle(theme), fontFamily: 'var(--font-mono)' }} />
              </Field>
            </div>

            <Field label={t('sapSystems.fieldApplicationServer')} theme={theme}>
              <input value={form.applicationServer} onChange={(e) => setForm((f) => ({ ...f, applicationServer: e.target.value }))} placeholder="vaciJOG" style={{ ...inputStyle(theme), fontFamily: 'var(--font-mono)' }} />
            </Field>

            <Field label={t('sapSystems.fieldSaprouter')} theme={theme}>
              <input value={form.saprouter} onChange={(e) => setForm((f) => ({ ...f, saprouter: e.target.value }))} placeholder={t('sapSystems.fieldSaprouterPlaceholder')} style={{ ...inputStyle(theme), fontFamily: 'var(--font-mono)' }} />
            </Field>

            <Field label={t('sapSystems.fieldUrl')} theme={theme}>
              <input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder={t('sapSystems.fieldUrlPlaceholder')} style={inputStyle(theme)} />
            </Field>
            <Field label={t('sapSystems.fieldNotes')} theme={theme}>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inputStyle(theme), resize: 'vertical', fontFamily: 'inherit' }} />
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: theme.textPrimary, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.favorite} onChange={(e) => setForm((f) => ({ ...f, favorite: e.target.checked }))} /> {t('sapSystems.favoriteLabel')}
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
