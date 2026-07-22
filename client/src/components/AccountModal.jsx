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

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

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

  const savePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess(false);
    if (newPw.length < 8) return setPwError('New password must be at least 8 characters.');
    if (newPw !== confirmPw) return setPwError('New passwords do not match.');
    setPwSaving(true);
    try {
      await api.changePassword({ currentPassword: currentPw, newPassword: newPw });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPwSuccess(true);
    } catch (err) {
      setPwError(err.message || 'Could not change password.');
    } finally {
      setPwSaving(false);
    }
  };

  const modalBg = theme.dark ? 'oklch(0.20 0.025 275)' : '#ffffff';
  const fieldBg = theme.dark ? 'oklch(0.26 0.02 275)' : 'oklch(0.97 0.005 280)';
  const fieldStyle = {
    width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13.5,
    background: fieldBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', background: modalBg, border: `1px solid ${theme.border}`,
          borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Account & Data</div>
          <span onClick={onClose} style={{ cursor: 'pointer', opacity: 0.6, fontSize: 20, lineHeight: 1 }}>
            &times;
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div
              style={{
                width: 52, height: 52, borderRadius: '50%', background: theme.accent, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 17, overflow: 'hidden',
              }}
            >
              {user?.settings?.avatarUrl ? (
                <img src={user.settings.avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                userInitials(user?.name)
              )}
            </div>
            <label style={{ fontSize: 10.5, fontWeight: 700, color: theme.accentText, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Change photo
              <input ref={fileInputRef} type="file" accept="image/*" onChange={onAvatarUpload} style={{ display: 'none' }} />
            </label>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); setSaved(false); }}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
                style={fieldStyle}
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
            <div style={{ ...fieldStyle, color: theme.textMuted, background: 'transparent', border: 'none', padding: '0 2px' }}>{user?.email}</div>
          </div>
        </div>
        {saved && <div style={{ fontSize: 11.5, color: 'oklch(0.55 0.15 145)', marginTop: -10 }}>Name saved.</div>}

        <div style={{ height: 1, background: theme.border }} />

        <form onSubmit={savePassword} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>Login password</div>
            <div style={{ fontSize: 11.5, color: theme.textMuted }}>Used to sign in to Knowledge Hub.</div>
          </div>
          <input
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            type="password"
            placeholder="Current password"
            style={fieldStyle}
          />
          <input
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            type="password"
            placeholder="New password"
            style={fieldStyle}
          />
          <input
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            type="password"
            placeholder="Confirm new password"
            style={fieldStyle}
          />
          {pwError && <div style={{ fontSize: 11.5, color: 'oklch(0.55 0.18 25)', fontWeight: 600 }}>{pwError}</div>}
          {pwSuccess && <div style={{ fontSize: 11.5, color: 'oklch(0.55 0.15 145)', fontWeight: 600 }}>Password updated.</div>}
          <button
            type="submit"
            disabled={pwSaving || !currentPw || !newPw || !confirmPw}
            style={{
              alignSelf: 'flex-start', background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: pwSaving || !currentPw || !newPw || !confirmPw ? 0.5 : 1,
            }}
          >
            {pwSaving ? 'Saving…' : 'Change password'}
          </button>
        </form>

        <div style={{ height: 1, background: theme.border }} />

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
