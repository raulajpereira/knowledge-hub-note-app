import { useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import Icon from './Icon.jsx';

function userInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

export default function AccountModal({ onClose }) {
  const { theme } = useTheme();
  const { user, updateUserSettings, updateProfile, logout } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef(null);

  const onAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { settings } = await api.uploadAvatar(file);
    updateUserSettings(settings);
  };

  const saveName = async () => {
    if (!name.trim() || name.trim() === user?.name) return;
    setSaving(true);
    setSaved(false);
    try {
      await updateProfile({ name: name.trim() });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 380, maxWidth: '92vw', background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Account</div>
          <span onClick={onClose} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 20, lineHeight: 1 }}>
            &times;
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 72, height: 72, borderRadius: '50%', background: theme.accent, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 24, overflow: 'hidden', flexShrink: 0,
            }}
          >
            {user?.settings?.avatarUrl ? (
              <img src={user.settings.avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              userInitials(user?.name)
            )}
          </div>
          <label style={{ fontSize: 12, fontWeight: 700, color: theme.accentText, cursor: 'pointer' }}>
            Change photo
            <input ref={fileInputRef} type="file" accept="image/*" onChange={onAvatarUpload} style={{ display: 'none' }} />
          </label>
        </div>

        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Name</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setSaved(false); }}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
            />
            <button
              onClick={saveName}
              disabled={saving || !name.trim() || name.trim() === user?.name}
              style={{
                background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 700,
                cursor: 'pointer', opacity: saving || !name.trim() || name.trim() === user?.name ? 0.5 : 1, flexShrink: 0,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          {saved && <div style={{ fontSize: 11.5, color: 'oklch(0.55 0.15 145)', marginTop: 6 }}>Saved.</div>}
        </div>

        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Email</div>
          <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13.5, color: theme.textMuted, background: theme.subtleBg }}>
            {user?.email}
          </div>
        </div>

        <button
          onClick={logout}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          <Icon name="logout" size={15} /> Log out
        </button>
      </div>
    </div>
  );
}
