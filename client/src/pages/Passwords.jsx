import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import {
  setupVault as cryptoSetupVault,
  unlockWithPassword,
  unlockWithRecoveryKey,
  rewrapMasterKey,
  encryptEntry,
  decryptEntry,
} from '../lib/vaultCrypto.js';

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function formatSeconds(s) {
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return `${m} minute${m === 1 ? '' : 's'}`;
}

export default function Passwords() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const autoLockMs = (user?.settings?.vaultAutoLockSeconds ?? 60) * 1000;
  const [phase, setPhase] = useState('checking'); // checking | setup | gate | recovery | unlocked
  const [vaultInfo, setVaultInfo] = useState(null);
  const [masterKey, setMasterKey] = useState(null);

  const [setupPw, setSetupPw] = useState('');
  const [setupPwConfirm, setSetupPwConfirm] = useState('');
  const [setupError, setSetupError] = useState('');
  const [recoveryToSave, setRecoveryToSave] = useState('');
  const [savedConfirmed, setSavedConfirmed] = useState(false);

  const [gatePassword, setGatePassword] = useState('');
  const [gateReveal, setGateReveal] = useState(false);
  const [gateError, setGateError] = useState('');

  const [recoveryInput, setRecoveryInput] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryNewPw, setRecoveryNewPw] = useState('');
  const [recoveryNewPwConfirm, setRecoveryNewPwConfirm] = useState('');
  const [recoveryStage, setRecoveryStage] = useState('key'); // key | newPassword

  const [entries, setEntries] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [revealPasswordField, setRevealPasswordField] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwChangeError, setPwChangeError] = useState('');
  const [pwChangeSuccess, setPwChangeSuccess] = useState(false);
  const [regenRecovery, setRegenRecovery] = useState(false);
  const [newRecoveryToSave, setNewRecoveryToSave] = useState('');

  const lastActivityRef = useRef(Date.now());

  const loadVaultInfo = async () => {
    const info = await api.getVaultInfo();
    setVaultInfo(info);
    setPhase(info.hasVault ? 'gate' : 'setup');
  };

  useEffect(() => {
    loadVaultInfo();
  }, []);

  const lock = () => {
    setMasterKey(null);
    setEntries([]);
    setSelectedId(null);
    setPhase('gate');
  };

  useEffect(() => {
    if (phase !== 'unlocked') return undefined;
    lastActivityRef.current = Date.now();
    const onActivity = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('mousedown', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('scroll', onActivity, true);
    window.addEventListener('touchstart', onActivity);
    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= autoLockMs) lock();
    }, 1000);
    return () => {
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('mousedown', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('scroll', onActivity, true);
      window.removeEventListener('touchstart', onActivity);
      clearInterval(interval);
    };
  }, [phase, autoLockMs]);

  const decryptAllEntries = async (key) => {
    const { entries: raw } = await api.listPasswords();
    const decrypted = await Promise.all(
      raw.map(async (e) => {
        try {
          const plain = await decryptEntry(key, e.envelope);
          return { id: e.id, createdAt: e.createdAt, updatedAt: e.updatedAt, ...plain };
        } catch {
          return { id: e.id, createdAt: e.createdAt, updatedAt: e.updatedAt, title: '(Could not decrypt)', username: '', password: '', url: '', notes: '', group: '' };
        }
      })
    );
    setEntries(decrypted);
  };

  const submitSetup = async (e) => {
    e.preventDefault();
    setSetupError('');
    if (setupPw.length < 8) return setSetupError('Vault password must be at least 8 characters.');
    if (setupPw !== setupPwConfirm) return setSetupError('Passwords do not match.');
    const { masterKeyBytes, recoveryFormatted, payload } = await cryptoSetupVault(setupPw);
    await api.setupVault(payload);
    setMasterKey(masterKeyBytes);
    setRecoveryToSave(recoveryFormatted);
    setEntries([]);
    setPhase('recovery-display');
  };

  const finishSetupRecoveryDisplay = async () => {
    setPhase('unlocked');
  };

  const downloadRecoveryKey = (key) => {
    const blob = new Blob(
      [`Knowledge Hub — Passwords vault recovery key\n\nKeep this somewhere safe. Anyone with this key can unlock your vault and reset your vault password.\nIf you lose both your vault password and this key, your saved passwords cannot be recovered.\n\nRecovery key:\n${key}\n`],
      { type: 'text/plain' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'knowledge-hub-vault-recovery-key.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const submitUnlock = async (e) => {
    e.preventDefault();
    setGateError('');
    try {
      const key = await unlockWithPassword(gatePassword, vaultInfo);
      setMasterKey(key);
      setGatePassword('');
      await decryptAllEntries(key);
      setPhase('unlocked');
    } catch {
      setGateError('Incorrect vault password.');
    }
  };

  const submitRecoveryKey = async (e) => {
    e.preventDefault();
    setRecoveryError('');
    try {
      const key = await unlockWithRecoveryKey(recoveryInput.trim(), vaultInfo);
      setMasterKey(key);
      setRecoveryStage('newPassword');
    } catch {
      setRecoveryError('That recovery key is not valid.');
    }
  };

  const submitNewPasswordAfterRecovery = async (e) => {
    e.preventDefault();
    setRecoveryError('');
    if (recoveryNewPw.length < 8) return setRecoveryError('Vault password must be at least 8 characters.');
    if (recoveryNewPw !== recoveryNewPwConfirm) return setRecoveryError('Passwords do not match.');
    const { recoveryFormatted, payload } = await rewrapMasterKey(masterKey, recoveryNewPw, { regenerateRecovery: true });
    await api.rewrapVault(payload);
    setRecoveryToSave(recoveryFormatted);
    await decryptAllEntries(masterKey);
    setPhase('recovery-display');
  };

  const filtered = useMemo(
    () => entries.filter((p) => !search.trim() || p.title.toLowerCase().includes(search.toLowerCase())),
    [entries, search]
  );

  const selected = entries.find((p) => p.id === selectedId) || filtered[0] || null;

  useEffect(() => {
    setRevealPasswordField(false);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const addEntry = async () => {
    const obj = { title: 'New entry', username: '', password: '', url: '', notes: '', group: '' };
    const envelope = await encryptEntry(masterKey, obj);
    const { entry } = await api.createPassword({ envelope });
    setEntries((prev) => [{ id: entry.id, createdAt: entry.createdAt, updatedAt: entry.updatedAt, ...obj }, ...prev]);
    setSelectedId(entry.id);
  };

  const patch = async (id, fieldPatch) => {
    const current = entries.find((e) => e.id === id);
    if (!current) return;
    const next = { ...current, ...fieldPatch };
    const { id: _id, createdAt: _c, updatedAt: _u, ...plainFields } = next;
    const envelope = await encryptEntry(masterKey, plainFields);
    const { entry } = await api.updatePassword(id, { envelope });
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...next, updatedAt: entry.updatedAt } : e)));
  };

  const remove = async () => {
    if (!selected) return;
    await api.deletePassword(selected.id);
    setEntries((prev) => prev.filter((p) => p.id !== selected.id));
    setSelectedId(null);
  };

  const copyPassword = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(selected.password || '');
  };

  const submitVaultPasswordChange = async (e) => {
    e.preventDefault();
    setPwChangeError('');
    setPwChangeSuccess(false);
    if (pwNew !== pwConfirm) return setPwChangeError('New passwords do not match.');
    if (pwNew.length < 8) return setPwChangeError('New password must be at least 8 characters.');
    try {
      const currentKey = await unlockWithPassword(pwCurrent, vaultInfo);
      if (!bytesEqual(currentKey, masterKey)) {
        setPwChangeError('Current vault password is incorrect.');
        return;
      }
      const { recoveryFormatted, payload } = await rewrapMasterKey(masterKey, pwNew, { regenerateRecovery: regenRecovery });
      await api.rewrapVault(payload);
      const infoNow = await api.getVaultInfo();
      setVaultInfo(infoNow);
      setPwCurrent('');
      setPwNew('');
      setPwConfirm('');
      setPwChangeSuccess(true);
      if (regenRecovery && recoveryFormatted) setNewRecoveryToSave(recoveryFormatted);
    } catch (err) {
      setPwChangeError('Current vault password is incorrect.');
    }
  };

  const inputStyle = {
    flex: '1 1 160px', minWidth: 140, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 12px',
    fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none',
  };

  const glassCardStyle = {
    width: 400, maxWidth: '100%', background: theme.modalBg, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    border: `1px solid ${theme.border}`, borderRadius: 16, padding: 28, display: 'flex', flexDirection: 'column', gap: 16,
  };

  if (phase === 'checking') return <div style={{ padding: 28, color: theme.textMuted }}>Checking vault…</div>;

  if (phase === 'setup') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <form onSubmit={submitSetup} style={{ ...glassCardStyle, alignItems: 'center', textAlign: 'center' }}>
          <div style={{ width: 46, height: 46, borderRadius: 11, background: theme.accentSoftBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="lock" size={22} color={theme.accentText} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Set up your Passwords vault</div>
            <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 4 }}>
              This vault is end-to-end encrypted in your browser. We never see your vault password or your data —
              only you can decrypt it.
            </div>
          </div>
          <input
            value={setupPw}
            onChange={(e) => setSetupPw(e.target.value)}
            type="password"
            placeholder="Choose a vault password"
            autoFocus
            style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 10, padding: '11px 12px', fontSize: 14, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
          />
          <input
            value={setupPwConfirm}
            onChange={(e) => setSetupPwConfirm(e.target.value)}
            type="password"
            placeholder="Confirm vault password"
            style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 10, padding: '11px 12px', fontSize: 14, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
          />
          {setupError && <div style={{ fontSize: 12, color: 'oklch(0.55 0.18 25)', fontWeight: 600, alignSelf: 'flex-start' }}>{setupError}</div>}
          <button type="submit" style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%' }}>
            Create vault
          </button>
          <div style={{ fontSize: 11, color: theme.textMuted }}>
            There's no "forgot password" email reset — you'll get a one-time recovery key on the next screen instead.
          </div>
        </form>
      </div>
    );
  }

  if (phase === 'recovery-display') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <div style={{ ...glassCardStyle, width: 460 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>Save your recovery key</div>
          <div style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.5 }}>
            If you forget your vault password, this is the only way back in. We don't store it — download or copy it
            somewhere safe now. It won't be shown again.
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, letterSpacing: '0.05em', textAlign: 'center', background: theme.subtleBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '14px 10px', wordBreak: 'break-all' }}>
            {recoveryToSave}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => downloadRecoveryKey(recoveryToSave)}
              style={{ flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              Download as file
            </button>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(recoveryToSave)}
              style={{ flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              Copy to clipboard
            </button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: theme.textMuted, cursor: 'pointer' }}>
            <input type="checkbox" checked={savedConfirmed} onChange={(e) => setSavedConfirmed(e.target.checked)} />
            I've saved my recovery key somewhere safe
          </label>
          <button
            type="button"
            disabled={!savedConfirmed}
            onClick={finishSetupRecoveryDisplay}
            style={{ background: savedConfirmed ? theme.accent : theme.subtleBg, color: savedConfirmed ? '#fff' : theme.textMuted, border: 'none', borderRadius: 10, padding: '11px 14px', fontWeight: 700, fontSize: 13, cursor: savedConfirmed ? 'pointer' : 'default', width: '100%' }}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'gate') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <form onSubmit={submitUnlock} style={{ ...glassCardStyle, alignItems: 'center', textAlign: 'center' }}>
          <div style={{ width: 46, height: 46, borderRadius: 11, background: theme.accentSoftBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="lock" size={22} color={theme.accentText} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Vault locked</div>
            <div style={{ fontSize: 12.5, color: theme.textMuted }}>Enter your vault password to continue</div>
          </div>
          <div style={{ position: 'relative', display: 'flex', width: '100%' }}>
            <input
              value={gatePassword}
              onChange={(e) => setGatePassword(e.target.value)}
              type={gateReveal ? 'text' : 'password'}
              autoFocus
              placeholder="Vault password"
              style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '11px 40px 11px 12px', fontSize: 14, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
            />
            <span onClick={() => setGateReveal((v) => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', opacity: 0.6, display: 'flex' }}>
              <Icon name={gateReveal ? 'eye' : 'eyeOff'} size={16} />
            </span>
          </div>
          {gateError && <div style={{ fontSize: 12, color: 'oklch(0.55 0.18 25)', fontWeight: 600, alignSelf: 'flex-start' }}>{gateError}</div>}
          <button type="submit" style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%' }}>
            Unlock
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
            <span onClick={() => { setPhase('recovery'); setRecoveryStage('key'); }} style={{ fontSize: 12, color: theme.accentText, cursor: 'pointer', fontWeight: 600 }}>
              Forgot your vault password?
            </span>
            <div style={{ fontSize: 11, color: theme.textMuted }}>Locked automatically after {formatSeconds(autoLockMs / 1000)} of inactivity</div>
          </div>
        </form>
      </div>
    );
  }

  if (phase === 'recovery') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        {recoveryStage === 'key' ? (
          <form onSubmit={submitRecoveryKey} style={{ ...glassCardStyle, alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Use your recovery key</div>
            <div style={{ fontSize: 12.5, color: theme.textMuted }}>Enter the recovery key you saved when you set up the vault.</div>
            <input
              value={recoveryInput}
              onChange={(e) => setRecoveryInput(e.target.value.toUpperCase())}
              placeholder="XXXXX-XXXXX-XXXXX-..."
              autoFocus
              style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 10, padding: '11px 12px', fontSize: 13, fontFamily: 'var(--font-mono)', background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
            />
            {recoveryError && <div style={{ fontSize: 12, color: 'oklch(0.55 0.18 25)', fontWeight: 600, alignSelf: 'flex-start' }}>{recoveryError}</div>}
            <button type="submit" style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%' }}>
              Continue
            </button>
            <span onClick={() => setPhase('gate')} style={{ fontSize: 12, color: theme.textMuted, cursor: 'pointer' }}>
              Back to password unlock
            </span>
          </form>
        ) : (
          <form onSubmit={submitNewPasswordAfterRecovery} style={{ ...glassCardStyle, alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>Set a new vault password</div>
            <div style={{ fontSize: 12.5, color: theme.textMuted }}>Recovery key verified. Choose a new vault password — a new recovery key will be generated too.</div>
            <input
              value={recoveryNewPw}
              onChange={(e) => setRecoveryNewPw(e.target.value)}
              type="password"
              placeholder="New vault password"
              autoFocus
              style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 10, padding: '11px 12px', fontSize: 14, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
            />
            <input
              value={recoveryNewPwConfirm}
              onChange={(e) => setRecoveryNewPwConfirm(e.target.value)}
              type="password"
              placeholder="Confirm new vault password"
              style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 10, padding: '11px 12px', fontSize: 14, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
            />
            {recoveryError && <div style={{ fontSize: 12, color: 'oklch(0.55 0.18 25)', fontWeight: 600, alignSelf: 'flex-start' }}>{recoveryError}</div>}
            <button type="submit" style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%' }}>
              Save new password
            </button>
          </form>
        )}
      </div>
    );
  }

  // phase === 'unlocked'
  return (
    <div style={{ padding: '24px 28px', flex: 1, display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>Passwords</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setSettingsOpen((v) => !v)} title="Vault password settings" style={{ display: 'flex', alignItems: 'center', background: theme.subtleBg, border: 'none', color: theme.textPrimary, borderRadius: 9, padding: '9px 10px', cursor: 'pointer' }}>
            <Icon name="settings" size={16} />
          </button>
          <button onClick={addEntry} style={{ display: 'flex', alignItems: 'center', gap: 6, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <Icon name="plus" size={14} color="#fff" /> New Password
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>Change vault password</div>
          <form onSubmit={submitVaultPasswordChange} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} type="password" placeholder="Current vault password" style={inputStyle} />
            <input value={pwNew} onChange={(e) => setPwNew(e.target.value)} type="password" placeholder="New vault password" style={inputStyle} />
            <input value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} type="password" placeholder="Confirm new password" style={inputStyle} />
            <button type="submit" style={{ alignSelf: 'flex-start', background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
              Save Password
            </button>
          </form>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: theme.textMuted, cursor: 'pointer' }}>
            <input type="checkbox" checked={regenRecovery} onChange={(e) => setRegenRecovery(e.target.checked)} />
            Also generate a new recovery key (invalidates the old one)
          </label>
          {pwChangeError && <div style={{ fontSize: 12, color: 'oklch(0.55 0.18 25)', fontWeight: 600 }}>{pwChangeError}</div>}
          {pwChangeSuccess && <div style={{ fontSize: 12, color: 'oklch(0.55 0.15 145)', fontWeight: 600 }}>Vault password updated.</div>}
          {newRecoveryToSave && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: theme.subtleBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>New recovery key — save it now, it won't be shown again:</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, wordBreak: 'break-all' }}>{newRecoveryToSave}</div>
              <button type="button" onClick={() => downloadRecoveryKey(newRecoveryToSave)} style={{ alignSelf: 'flex-start', background: theme.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Download as file
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 24, flex: 1, minHeight: 0 }}>
        <div style={{ flex: '1 1 340px', minWidth: 280, maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '9px 12px' }}>
            <span style={{ opacity: 0.5, display: 'flex' }}>
              <Icon name="search" size={15} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search passwords..."
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, flex: 1, minWidth: 0, color: theme.textPrimary }}
            />
          </div>
          <div style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 8, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {filtered.length === 0 && <div style={{ padding: 14, fontSize: 13, color: theme.textMuted }}>No passwords yet.</div>}
            {filtered.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', background: selected?.id === p.id ? theme.accentSoftBg : 'transparent' }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 9, background: theme.accentSoftBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="lock" size={15} color={theme.accentText} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.username || 'No username'}</div>
                </div>
                {p.group && (
                  <div style={{ fontSize: 11, color: theme.textMuted, background: theme.subtleBg, padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>{p.group}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {selected ? (
          <div style={{ flex: '1 1 380px', minWidth: 0, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ width: 46, height: 46, borderRadius: 11, background: theme.accentSoftBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="lock" size={20} color={theme.accentText} />
              </div>
              <div style={{ flex: '1 1 160px', minWidth: 160 }}>
                <input
                  value={selected.title}
                  onChange={(e) => patch(selected.id, { title: e.target.value })}
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 17, fontWeight: 800, color: theme.textPrimary, width: '100%' }}
                />
                <input
                  value={selected.group || ''}
                  onChange={(e) => patch(selected.id, { group: e.target.value })}
                  placeholder="Group (e.g. Personal, Work)"
                  style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, color: theme.textMuted, width: '100%' }}
                />
              </div>
              <button onClick={remove} style={{ background: 'transparent', border: '1px solid oklch(0.55 0.18 25 / 0.35)', color: 'oklch(0.55 0.18 25)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                Delete
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Username</div>
              <input
                value={selected.username || ''}
                onChange={(e) => patch(selected.id, { username: e.target.value })}
                style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Password</div>
              <div style={{ position: 'relative', display: 'flex' }}>
                <input
                  value={selected.password || ''}
                  onChange={(e) => patch(selected.id, { password: e.target.value })}
                  type={revealPasswordField ? 'text' : 'password'}
                  style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 74px 9px 12px', fontSize: 13.5, fontFamily: 'var(--font-mono)', background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
                />
                <span onClick={() => setRevealPasswordField((v) => !v)} title="Reveal" style={{ position: 'absolute', right: 38, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', opacity: 0.6, display: 'flex' }}>
                  <Icon name={revealPasswordField ? 'eyeOff' : 'eye'} size={16} />
                </span>
                <span onClick={copyPassword} title="Copy" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', opacity: 0.6, display: 'flex' }}>
                  <Icon name="copy" size={16} />
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Website</div>
              <input
                value={selected.url || ''}
                onChange={(e) => patch(selected.id, { url: e.target.value })}
                placeholder="https://"
                style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Notes</div>
              <textarea
                value={selected.notes || ''}
                onChange={(e) => patch(selected.id, { notes: e.target.value })}
                rows={4}
                style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: 10, fontSize: 13, lineHeight: 1.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          </div>
        ) : (
          <div style={{ flex: '1 1 380px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted }}>
            Select or create an entry to get started.
          </div>
        )}
      </div>
    </div>
  );
}
