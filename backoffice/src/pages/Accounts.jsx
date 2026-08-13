import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import FeatureCheckboxGrid, { FEATURE_KEYS } from '../components/FeatureCheckboxGrid.jsx';

function FeatureAccessModal({ theme, t, user, onClose, onSaved }) {
  const [selected, setSelected] = useState(new Set(Array.isArray(user.enabledFeatures) ? user.enabledFeatures : FEATURE_KEYS));
  const [saving, setSaving] = useState(false);
  const toggle = (key) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const save = async () => {
    setSaving(true);
    try {
      await api.updateAdminUser(user.id, { enabledFeatures: [...selected] });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', borderRadius: 14, padding: 22, width: 480, maxWidth: '92vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 14, border: `1px solid ${theme.border}` }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{t('settings.manageFeatures')}</div>
          <div style={{ fontSize: 12.5, color: theme.textMuted }}>{user.name}</div>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 11.5, fontWeight: 700 }}>
          <span onClick={() => setSelected(new Set(FEATURE_KEYS))} style={{ cursor: 'pointer', color: theme.accentText }}>{t('settings.selectAll')}</span>
          <span onClick={() => setSelected(new Set())} style={{ cursor: 'pointer', color: theme.textMuted }}>{t('settings.selectNone')}</span>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 40 }}>
          <FeatureCheckboxGrid theme={theme} t={t} selected={selected} onToggle={toggle} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: theme.textPrimary }}>
            {t('common.cancel')}
          </button>
          <button onClick={save} disabled={saving} style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplateAccessModal({ theme, t, user, onClose }) {
  const [templates, setTemplates] = useState(null);
  const [allowed, setAllowed] = useState(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getDocTemplateAccess(user.id).then((r) => {
      setTemplates(r.templates);
      setAllowed(new Set(r.templates.filter((tpl) => tpl.allowed).map((tpl) => tpl.id)));
    });
  }, [user.id]);

  const toggle = (id) => {
    setAllowed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.setDocTemplateAccess(user.id, [...allowed]);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: theme.cardBg, borderRadius: 14, padding: 22, width: 420, maxWidth: '90vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 14, border: `1px solid ${theme.border}` }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{t('settings.manageDocTemplates')}</div>
          <div style={{ fontSize: 12.5, color: theme.textMuted }}>{user.name}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', flex: 1, minHeight: 40 }}>
          {templates == null && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('common.loading')}</div>}
          {templates?.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.noDocTemplatesYet')}</div>}
          {templates?.map((tpl) => (
            <label key={tpl.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: theme.subtleBg, cursor: 'pointer' }}>
              <input type="checkbox" checked={allowed.has(tpl.id)} onChange={() => toggle(tpl.id)} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{tpl.name}</span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: theme.textPrimary }}>
            {t('common.cancel')}
          </button>
          <button onClick={save} disabled={saving || templates == null} style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Accounts() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const confirm = useConfirm();
  const [users, setUsers] = useState(null);
  const [busyUserId, setBusyUserId] = useState(null);
  const [templateAccessUser, setTemplateAccessUser] = useState(null);
  const [featureAccessUser, setFeatureAccessUser] = useState(null);

  const card = { background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 18 };
  const outlineButton = { background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' };

  const load = () => api.listAdminUsers().then((r) => setUsers(r.users));

  useEffect(() => {
    load();
  }, []);

  const toggleSuspend = async (u) => {
    setBusyUserId(u.id);
    try {
      await api.updateAdminUser(u.id, { status: u.status === 'suspended' ? 'active' : 'suspended' });
      await load();
    } finally {
      setBusyUserId(null);
    }
  };

  const toggleRole = async (u) => {
    setBusyUserId(u.id);
    try {
      await api.updateAdminUser(u.id, { role: u.role === 'admin' ? 'member' : 'admin' });
      await load();
    } finally {
      setBusyUserId(null);
    }
  };

  const deleteAccount = async (u) => {
    const ok = await confirm({ message: t('settings.confirmDeleteAccount', { name: u.name }), tone: 'danger', confirmLabel: t('common.delete') });
    if (!ok) return;
    setBusyUserId(u.id);
    try {
      await api.deleteAdminUser(u.id);
      await load();
    } finally {
      setBusyUserId(null);
    }
  };

  if (!users) return null;
  const suspendedCount = users.filter((u) => u.status === 'suspended').length;

  return (
    <>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="users" size={14} color={theme.textMuted} /> {t('settings.manageAccounts')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ textAlign: 'center', background: theme.subtleBg, borderRadius: 9, padding: '6px 12px' }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{users.length}</div>
              <div style={{ fontSize: 9.5, color: theme.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>{t('settings.statAccounts')}</div>
            </div>
            {suspendedCount > 0 && (
              <div style={{ textAlign: 'center', background: 'oklch(0.6 0.16 50 / 0.15)', borderRadius: 9, padding: '6px 12px' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'oklch(0.6 0.16 50)' }}>{suspendedCount}</div>
                <div style={{ fontSize: 9.5, color: 'oklch(0.6 0.16 50)', fontWeight: 700, textTransform: 'uppercase' }}>{t('settings.statPaused')}</div>
              </div>
            )}
          </div>
        </div>
        {users.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.noAccountsYet')}</div>}
        {users.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {users.map((u) => {
              const busy = busyUserId === u.id;
              return (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, background: theme.subtleBg, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {u.name}
                      {u.status === 'suspended' && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'oklch(0.6 0.16 50)', background: 'oklch(0.6 0.16 50 / 0.15)', padding: '1px 6px', borderRadius: 5 }}>
                          {t('settings.statusSuspended')}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: theme.textMuted }}>{u.email}</div>
                  </div>
                  <button onClick={() => toggleRole(u)} disabled={busy} style={{ ...outlineButton, padding: '5px 10px', fontSize: 11.5, opacity: busy ? 0.5 : 1 }}>
                    {u.role === 'admin' ? t('settings.roleAdmin') : t('settings.roleMember')}
                  </button>
                  <button onClick={() => toggleSuspend(u)} disabled={busy} style={{ ...outlineButton, padding: '5px 10px', fontSize: 11.5, opacity: busy ? 0.5 : 1 }}>
                    {u.status === 'suspended' ? t('settings.reactivate') : t('settings.pause')}
                  </button>
                  <button onClick={() => setTemplateAccessUser(u)} disabled={busy} style={{ ...outlineButton, padding: '5px 10px', fontSize: 11.5, opacity: busy ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="doc" size={12} /> {t('settings.manageDocTemplates')}
                  </button>
                  <button onClick={() => setFeatureAccessUser(u)} disabled={busy} style={{ ...outlineButton, padding: '5px 10px', fontSize: 11.5, opacity: busy ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="shield" size={12} /> {t('settings.manageFeatures')}
                  </button>
                  <span
                    onClick={() => (busy ? null : deleteAccount(u))}
                    title={t('common.delete')}
                    style={{ cursor: busy ? 'default' : 'pointer', color: 'oklch(0.55 0.18 25)', fontSize: 16, padding: '0 4px', opacity: busy ? 0.5 : 1 }}
                  >
                    &times;
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {templateAccessUser && (
        <TemplateAccessModal theme={theme} t={t} user={templateAccessUser} onClose={() => setTemplateAccessUser(null)} />
      )}
      {featureAccessUser && (
        <FeatureAccessModal
          theme={theme}
          t={t}
          user={featureAccessUser}
          onClose={() => setFeatureAccessUser(null)}
          onSaved={() => { setFeatureAccessUser(null); load(); }}
        />
      )}
    </>
  );
}
