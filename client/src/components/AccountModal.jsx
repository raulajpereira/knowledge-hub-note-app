import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { backdropClose } from '../lib/backdropClose.js';

function userInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

function RoleBadge({ role, theme, t }) {
  const isElevated = role === 'admin' || role === 'super_admin';
  const gold = 'oklch(0.68 0.14 85)';
  const label = role === 'super_admin' ? t('account.roleSuperAdmin') : role === 'admin' ? t('account.roleAdmin') : t('account.roleMember');
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em',
        textTransform: 'uppercase', flexShrink: 0, borderRadius: 6, padding: '4px 9px',
        color: isElevated ? gold : theme.textMuted,
        background: isElevated ? 'oklch(0.78 0.14 85 / 0.13)' : theme.subtleBg,
        border: `1px solid ${isElevated ? 'oklch(0.78 0.14 85 / 0.35)' : theme.border}`,
      }}
    >
      <Icon name={isElevated ? 'shield' : 'users'} size={11} color={isElevated ? gold : theme.textMuted} />
      {label}
    </span>
  );
}

function formatRelative(dateStr, t) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return t('account.justNow');
  if (mins < 60) return t('account.minutesAgo', { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('account.hoursAgo', { n: hours });
  const days = Math.round(hours / 24);
  return t('account.daysAgo', { n: days });
}

function TwoFactorSection({ theme, t, fieldStyle }) {
  const { user, refreshMe } = useAuth();
  const enabled = !!user?.twoFactorEnabled;
  const [step, setStep] = useState('idle'); // idle | enrolling | backupCodes
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState([]);
  const [disablePw, setDisablePw] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  const startEnroll = async () => {
    setError('');
    setBusy(true);
    try {
      const { secret, qrDataUrl } = await api.setup2fa();
      setSecret(secret);
      setQrDataUrl(qrDataUrl);
      setStep('enrolling');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnroll = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { backupCodes } = await api.verify2faSetup({ code });
      setBackupCodes(backupCodes);
      setStep('backupCodes');
      setCode('');
    } catch (err) {
      setError(err.message || t('account.twoFaInvalidCode'));
    } finally {
      setBusy(false);
    }
  };

  const finishBackupCodes = async () => {
    setStep('idle');
    await refreshMe();
  };

  const disable = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.disable2fa({ password: disablePw });
      setDisablePw('');
      setShowDisable(false);
      await refreshMe();
    } catch (err) {
      setError(err.message || t('account.incorrectPassword'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t('account.twoFaTitle')}</div>
          <div style={{ fontSize: 11.5, color: theme.textMuted }}>{t('account.twoFaDesc')}</div>
        </div>
        <span
          style={{
            fontSize: 10.5, fontWeight: 800, padding: '4px 9px', borderRadius: 6, whiteSpace: 'nowrap',
            color: enabled ? 'oklch(0.45 0.15 145)' : theme.textMuted,
            background: enabled ? 'oklch(0.88 0.13 145)' : theme.subtleBg,
          }}
        >
          {enabled ? t('account.twoFaOn') : t('account.twoFaOff')}
        </span>
      </div>

      {step === 'idle' && !enabled && (
        <button
          onClick={startEnroll}
          disabled={busy}
          style={{ alignSelf: 'flex-start', background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
        >
          {t('account.twoFaEnable')}
        </button>
      )}

      {step === 'idle' && enabled && !showDisable && (
        <button
          onClick={() => setShowDisable(true)}
          style={{ alignSelf: 'flex-start', background: 'transparent', border: `1px solid oklch(0.6 0.2 25)`, color: 'oklch(0.6 0.2 25)', borderRadius: 8, padding: '9px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
        >
          {t('account.twoFaDisable')}
        </button>
      )}

      {step === 'idle' && enabled && showDisable && (
        <form onSubmit={disable} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={disablePw} onChange={(e) => setDisablePw(e.target.value)} type="password" placeholder={t('account.currentPassword')} style={fieldStyle} />
          {error && <div style={{ fontSize: 11.5, color: 'oklch(0.55 0.18 25)', fontWeight: 600 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={busy || !disablePw} style={{ background: 'oklch(0.6 0.2 25)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: busy || !disablePw ? 0.6 : 1 }}>
              {t('account.twoFaDisable')}
            </button>
            <button type="button" onClick={() => { setShowDisable(false); setError(''); }} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '9px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {step === 'enrolling' && (
        <form onSubmit={confirmEnroll} style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', background: theme.subtleBg, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11.5, color: theme.textMuted, textAlign: 'center' }}>{t('account.twoFaScanQr')}</div>
          {qrDataUrl && <img src={qrDataUrl} alt="QR" style={{ width: 160, height: 160, borderRadius: 8, background: '#fff', padding: 6 }} />}
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: theme.textMuted, wordBreak: 'break-all', textAlign: 'center' }}>{secret}</div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('account.twoFaEnterCode')}
            style={{ ...fieldStyle, textAlign: 'center', letterSpacing: '0.3em', fontFamily: 'var(--font-mono)' }}
          />
          {error && <div style={{ fontSize: 11.5, color: 'oklch(0.55 0.18 25)', fontWeight: 600 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <button type="submit" disabled={busy || !code} style={{ flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: busy || !code ? 0.6 : 1 }}>
              {t('account.twoFaConfirm')}
            </button>
            <button type="button" onClick={() => { setStep('idle'); setError(''); }} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '9px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {step === 'backupCodes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: theme.subtleBg, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t('account.twoFaBackupCodesTitle')}</div>
          <div style={{ fontSize: 11, color: theme.textMuted }}>{t('account.twoFaBackupCodesDesc')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
            {backupCodes.map((c) => (
              <div key={c} style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>{c}</div>
            ))}
          </div>
          <button onClick={finishBackupCodes} style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            {t('account.twoFaSavedCodes')}
          </button>
        </div>
      )}
    </div>
  );
}

function SessionsSection({ theme, t }) {
  const { logout } = useAuth();
  const [sessions, setSessions] = useState(null);

  useEffect(() => {
    api.listSessions().then(({ sessions }) => setSessions(sessions));
  }, []);

  const revoke = async (session) => {
    await api.revokeSession(session.id);
    if (session.isCurrent) {
      logout();
      return;
    }
    setSessions((prev) => prev.filter((s) => s.id !== session.id));
  };

  if (!sessions) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t('account.sessionsTitle')}</div>
        <div style={{ fontSize: 11.5, color: theme.textMuted }}>{t('account.sessionsDesc')}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sessions.map((s) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: theme.subtleBg, borderRadius: 9, padding: '9px 11px' }}>
            <Icon name="terminal" size={14} color={theme.textMuted} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.userAgent || t('account.sessionUnknownDevice')} {s.isCurrent && <span style={{ color: theme.accentText, fontWeight: 800 }}>· {t('account.sessionCurrent')}</span>}
              </div>
              <div style={{ fontSize: 10.5, color: theme.textMuted }}>{s.ip || '—'} · {formatRelative(s.lastSeenAt, t)}</div>
            </div>
            <span onClick={() => revoke(s)} style={{ cursor: 'pointer', flexShrink: 0 }}>
              <Icon name="trash" size={13} color="oklch(0.6 0.2 25)" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AccountModal({ onClose }) {
  const { theme } = useTheme();
  const { t } = useLanguage();
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
  const [exporting, setExporting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'knowledge-hub-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

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
    if (newPw.length < 8) return setPwError(t('passwords.errTooShort'));
    if (newPw !== confirmPw) return setPwError(t('passwords.errMismatch'));
    setPwSaving(true);
    try {
      await api.changePassword({ currentPassword: currentPw, newPassword: newPw });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPwSuccess(true);
    } catch (err) {
      setPwError(err.message || t('account.couldNotChangePassword'));
    } finally {
      setPwSaving(false);
    }
  };

  const modalBg = theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff';
  const fieldBg = theme.dark ? 'oklch(0.24 0.02 255)' : 'oklch(0.97 0.005 280)';
  const fieldStyle = {
    width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13.5,
    background: fieldBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div
      onMouseDown={backdropClose(onClose)}
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
          <div style={{ fontSize: 17, fontWeight: 800 }}>{t('account.title')}</div>
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
              {t('account.changePhoto')}
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
                {saving ? t('account.saving') : t('account.save')}
              </button>
            </div>
            <div style={{ color: theme.textMuted, fontSize: 12.5, padding: '0 2px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: -6 }}>
          <RoleBadge role={user?.role} theme={theme} t={t} />
          {saved && <div style={{ fontSize: 11.5, color: 'oklch(0.55 0.15 145)' }}>{t('account.nameSaved')}</div>}
        </div>

        <button
          onClick={exportData}
          disabled={exporting}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: theme.subtleBg, border: 'none',
            color: theme.textPrimary, borderRadius: 9, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: exporting ? 0.6 : 1,
          }}
        >
          {exporting ? t('account.exporting') : t('account.exportData')}
        </button>

        <div style={{ height: 1, background: theme.border }} />

        <form onSubmit={savePassword} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t('account.loginPassword')}</div>
            <div style={{ fontSize: 11.5, color: theme.textMuted }}>{t('account.loginPasswordDesc')}</div>
          </div>
          <input
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            type="password"
            placeholder={t('account.currentPassword')}
            style={fieldStyle}
          />
          <input
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            type="password"
            placeholder={t('account.newPassword')}
            style={fieldStyle}
          />
          <input
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            type="password"
            placeholder={t('account.confirmNewPassword')}
            style={fieldStyle}
          />
          {pwError && <div style={{ fontSize: 11.5, color: 'oklch(0.55 0.18 25)', fontWeight: 600 }}>{pwError}</div>}
          {pwSuccess && <div style={{ fontSize: 11.5, color: 'oklch(0.55 0.15 145)', fontWeight: 600 }}>{t('account.passwordUpdated')}</div>}
          <button
            type="submit"
            disabled={pwSaving || !currentPw || !newPw || !confirmPw}
            style={{
              alignSelf: 'flex-start', background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: pwSaving || !currentPw || !newPw || !confirmPw ? 0.5 : 1,
            }}
          >
            {pwSaving ? t('account.saving') : t('account.changePassword')}
          </button>
        </form>

        <div style={{ height: 1, background: theme.border }} />

        <TwoFactorSection theme={theme} t={t} fieldStyle={fieldStyle} />

        <div style={{ height: 1, background: theme.border }} />

        <SessionsSection theme={theme} t={t} />

        <div style={{ height: 1, background: theme.border }} />

        <button
          onClick={logout}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          <Icon name="logout" size={15} /> {t('account.logout')}
        </button>
      </div>
    </div>
  );
}
