import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAgents } from '../context/AgentsContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useConfirm } from '../context/ConfirmContext.jsx';
import { FONT_OPTIONS } from '../styles/theme.js';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import ColorWheel from '../components/ColorWheel.jsx';
import SidebarSettingsModal from '../components/SidebarSettingsModal.jsx';
import logoDefault from '../assets/logo-default.png';
import logoIcon from '../assets/logo-icon.png';

const APP_VERSION = '1.0.0';

function userInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

function TeamCard({ theme, t, card, outlineButton }) {
  const confirm = useConfirm();
  const [team, setTeam] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [inviting, setInviting] = useState(false);

  const load = () => api.getTeam().then(setTeam);

  useEffect(() => {
    load();
  }, []);

  const invite = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !email.trim() || !password) return;
    setInviting(true);
    try {
      await api.inviteTeamMember({ name: name.trim(), email: email.trim(), password });
      setName('');
      setEmail('');
      setPassword('');
      setInviteOpen(false);
      await load();
    } catch (err) {
      setError(err.message || t('settings.couldNotInvite'));
    } finally {
      setInviting(false);
    }
  };

  const remove = async (id) => {
    const ok = await confirm({ message: t('common.confirmRemoveMemberMessage') });
    if (!ok) return;
    await api.removeTeamMember(id);
    await load();
  };

  if (!team) return null;

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.team')}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>
            {team.isOwner ? t('settings.teamOwnerDesc') : t('settings.teamMemberDesc', { name: team.owner.name })}
          </div>
        </div>
        {team.isOwner && (
          <button onClick={() => setInviteOpen((v) => !v)} style={outlineButton}>
            {inviteOpen ? t('common.cancel') : t('settings.inviteMember')}
          </button>
        )}
      </div>

      {inviteOpen && (
        <form onSubmit={invite} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('settings.namePlaceholder')} style={{ flex: '1 1 140px', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder={t('settings.emailPlaceholder')} style={{ flex: '1 1 160px', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }} />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder={t('settings.tempPasswordPlaceholder')} style={{ flex: '1 1 160px', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }} />
          <button type="submit" disabled={inviting} style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: inviting ? 0.6 : 1 }}>
            {inviting ? t('settings.inviting') : t('settings.invite')}
          </button>
          {error && <div style={{ fontSize: 12, color: 'oklch(0.55 0.18 25)', width: '100%' }}>{error}</div>}
        </form>
      )}

      {team.members.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.noMembersYet')}</div>}
      {team.members.map((m) => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: `1px solid ${theme.border}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{m.name}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{m.email}</div>
          </div>
          {team.isOwner && (
            <span onClick={() => remove(m.id)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '2px 6px' }}>
              &times;
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function detectedProviderLabel(agent) {
  if (agent.provider === 'anthropic') return 'Anthropic';
  const host = (() => {
    try {
      return agent.baseUrl ? new URL(agent.baseUrl).hostname : '';
    } catch {
      return '';
    }
  })();
  if (host.includes('groq.com')) return 'Groq';
  if (host.includes('openrouter.ai')) return 'OpenRouter';
  if (host.includes('perplexity.ai')) return 'Perplexity';
  return 'OpenAI';
}

function AgentRow({ agent, theme, t }) {
  const { updateAgent, deleteAgent } = useAgents();
  const confirm = useConfirm();
  const [tokenInput, setTokenInput] = useState('');
  const [tokenReveal, setTokenReveal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const saveToken = async () => {
    if (!tokenInput.trim()) return;
    await updateAgent(agent.id, { token: tokenInput.trim() });
    setTokenInput('');
    setTestResult(null);
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await api.testAgent(agent.id);
      setTestResult({ ok: true, message: t('settings.connected') });
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          value={agent.name}
          onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
          placeholder={t('settings.agentNamePlaceholder')}
          style={{ flex: 1, border: 'none', borderBottom: '1px solid transparent', padding: '2px 0', fontSize: 14.5, fontWeight: 700, background: 'transparent', color: theme.textPrimary, outline: 'none' }}
        />
        <span
          onClick={async () => {
            const ok = await confirm({ message: t('common.confirmDeleteAgentMessage') });
            if (ok) deleteAgent(agent.id);
          }}
          style={{ cursor: 'pointer', opacity: 0.45, fontSize: 16, padding: '2px 6px', flexShrink: 0 }}
        >
          &times;
        </span>
      </div>

      {agent.hasToken && (
        <div style={{ fontSize: 11.5, color: theme.textMuted }}>
          {t('settings.detectedProvider', { provider: detectedProviderLabel(agent) })}
        </div>
      )}

      <div style={{ position: 'relative', display: 'flex' }}>
        <input
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          type={tokenReveal ? 'text' : 'password'}
          placeholder={agent.hasToken ? t('settings.tokenSavedPlaceholder') : t('settings.tokenPlaceholder')}
          style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 90px 9px 11px', fontSize: 12.5, fontFamily: 'var(--font-mono)', background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
        />
        <span onClick={() => setTokenReveal((v) => !v)} style={{ position: 'absolute', right: 60, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', opacity: 0.5, display: 'flex' }}>
          <Icon name={tokenReveal ? 'eyeOff' : 'eye'} size={15} />
        </span>
        <button onClick={saveToken} style={{ position: 'absolute', right: 4, top: 4, bottom: 4, background: theme.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '0 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          {t('common.save')}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', paddingTop: 2, borderTop: `1px solid ${theme.border}` }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: theme.textMuted, cursor: 'pointer', paddingTop: 10 }}>
          <div
            onClick={() => updateAgent(agent.id, { active: !agent.active })}
            style={{ width: 34, height: 20, borderRadius: 10, background: agent.active ? theme.accent : theme.subtleBg, position: 'relative', transition: 'background 0.15s' }}
          >
            <div style={{ position: 'absolute', top: 2, left: agent.active ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
          </div>
          {t('settings.active')}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10 }}>
          {testResult && (
            <div style={{ fontSize: 12, fontWeight: 600, color: testResult.ok ? 'oklch(0.55 0.15 145)' : 'oklch(0.55 0.18 25)' }}>
              {testResult.message}
            </div>
          )}
          <button onClick={runTest} disabled={testing || !agent.hasToken} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 7, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: agent.hasToken ? 'pointer' : 'default', opacity: agent.hasToken ? 1 : 0.5 }}>
            {testing ? t('settings.testing') : t('settings.test')}
          </button>
        </div>
      </div>
    </div>
  );
}

const AUTO_LOCK_OPTIONS = [30, 60, 120, 300, 600];

export default function Settings() {
  const { theme, mode, accentHue, fontFamily, setMode, setAccentHue, setFontFamily } = useTheme();
  const { user, updateUserSettings } = useAuth();
  const { agents, createAgent } = useAgents();
  const { t, lang, setLanguage } = useLanguage();
  const fileInputRef = useRef(null);
  const [newAgentOpen, setNewAgentOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentToken, setNewAgentToken] = useState('');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [sidebarSettingsOpen, setSidebarSettingsOpen] = useState(false);

  const openNewAgent = () => {
    setNewAgentName('');
    setNewAgentToken('');
    setNewAgentOpen(true);
  };

  const submitNewAgent = async () => {
    if (!newAgentName.trim() || !newAgentToken.trim()) return;
    await createAgent({ name: newAgentName.trim(), token: newAgentToken.trim() });
    setNewAgentOpen(false);
  };

  const onLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { settings } = await api.uploadLogo(file);
    updateUserSettings(settings);
  };

  const onResetLogo = async () => {
    const { settings } = await api.resetLogo();
    updateUserSettings(settings);
  };

  const onAutoLockChange = async (seconds) => {
    const { settings } = await api.updateSettings({ vaultAutoLockSeconds: seconds });
    updateUserSettings(settings);
  };

  const onTrashRetentionChange = async (days) => {
    const { settings } = await api.updateSettings({ trashRetentionDays: days });
    updateUserSettings(settings);
  };

  const card = { background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 18 };
  const outlineButton = { background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', width: '100%', padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{t('settings.title')}</div>

      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.appearance')}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.theme')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.themeDesc')}</div>
          </div>
          <div style={{ display: 'flex', background: theme.subtleBg, borderRadius: 9, padding: 3, gap: 3 }}>
            {['dark', 'light'].map((m) => (
              <div
                key={m}
                onClick={() => setMode(m)}
                style={{
                  padding: '7px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
                  background: mode === m ? theme.cardBg : 'transparent', color: mode === m ? theme.textPrimary : theme.textMuted,
                }}
              >
                {t(`settings.${m}`)}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.accentColor')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.accentColorDesc')}</div>
          </div>
          <ColorWheel hue={theme.hue} onChange={setAccentHue} title={t('settings.colorWheelHint')} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.font')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.fontDesc')}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {FONT_OPTIONS.map((f) => {
              const active = (fontFamily || 'inter') === f.id;
              return (
                <div
                  key={f.id}
                  onClick={() => setFontFamily(f.id)}
                  style={{
                    padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                    background: active ? theme.accentSoftBg : theme.subtleBg,
                    color: active ? theme.accentText : theme.textMuted,
                    fontFamily: f.display,
                  }}
                >
                  {t(`settings.font${f.id.charAt(0).toUpperCase()}${f.id.slice(1)}`)}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.language')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.languageDesc')}</div>
          </div>
          <div style={{ display: 'flex', background: theme.subtleBg, borderRadius: 9, padding: 3, gap: 3 }}>
            {['pt', 'en'].map((l) => (
              <div
                key={l}
                onClick={() => setLanguage(l)}
                style={{
                  padding: '7px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  background: lang === l ? theme.cardBg : 'transparent', color: lang === l ? theme.textPrimary : theme.textMuted,
                }}
              >
                {l.toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>App logo</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 220, height: 76, borderRadius: 10, flexShrink: 0, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', border: `1px solid ${theme.border}`, padding: '10px 12px' }}>
            <img
              src={user?.settings?.logoUrl || logoDefault}
              alt="Logo"
              style={{
                height: '100%', width: '100%', display: 'block',
                objectFit: user?.settings?.logoUrl ? 'cover' : 'contain',
                objectPosition: user?.settings?.logoUrl ? 'center' : 'left center',
              }}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200 }}>
            <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.appLogoDesc')}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ ...outlineButton, alignSelf: 'flex-start' }}>
                {t('settings.uploadLogo')}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={onLogoUpload} style={{ display: 'none' }} />
              </label>
              <button onClick={onResetLogo} style={{ ...outlineButton, alignSelf: 'flex-start' }}>
                {t('settings.resetLogo')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.vault')}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.autoLock')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.autoLockDesc')}</div>
          </div>
          <select
            value={user?.settings?.vaultAutoLockSeconds ?? 60}
            onChange={(e) => onAutoLockChange(Number(e.target.value))}
            style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, fontWeight: 600, background: theme.subtleBg, color: theme.textPrimary }}
          >
            {AUTO_LOCK_OPTIONS.map((s) => (
              <option key={s} value={s} style={{ color: '#1a1a1a', background: '#fff' }}>
                {s < 60 ? t('settings.seconds', { n: s }) : t(s === 60 ? 'settings.minute' : 'settings.minutes', { n: s / 60 })}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.trash')}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.trashRetention')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.trashRetentionDesc')}</div>
          </div>
          <select
            value={user?.settings?.trashRetentionDays ?? 30}
            onChange={(e) => onTrashRetentionChange(Number(e.target.value))}
            style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, fontWeight: 600, background: theme.subtleBg, color: theme.textPrimary }}
          >
            <option value={7} style={{ color: '#1a1a1a', background: '#fff' }}>{t('settings.trashRetentionDays', { n: 7 })}</option>
            <option value={30} style={{ color: '#1a1a1a', background: '#fff' }}>{t('settings.trashRetentionDays', { n: 30 })}</option>
            <option value={90} style={{ color: '#1a1a1a', background: '#fff' }}>{t('settings.trashRetentionDays', { n: 90 })}</option>
            <option value={0} style={{ color: '#1a1a1a', background: '#fff' }}>{t('settings.trashRetentionNever')}</option>
          </select>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.account')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: theme.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 17, flexShrink: 0 }}>
            {userInitials(user?.name)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{user?.name}</div>
            <div style={{ fontSize: 12.5, color: theme.textMuted }}>{user?.email}</div>
          </div>
        </div>
      </div>

      <TeamCard theme={theme} t={t} card={card} outlineButton={outlineButton} />

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.aiAgents')}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.aiAgentsDesc')}</div>
          </div>
          <button
            onClick={openNewAgent}
            style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {t('settings.addAgent')}
          </button>
        </div>
        {agents.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.noAgentsYet')}</div>}
        {agents.map((agent) => (
          <AgentRow key={agent.id} agent={agent} theme={theme} t={t} />
        ))}
      </div>

      <div
        onClick={() => setSidebarSettingsOpen(true)}
        style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 14, cursor: 'pointer', padding: 18 }}
      >
        <div style={{ width: 38, height: 38, borderRadius: 10, background: theme.subtleBg, border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="sidebar" size={17} color={theme.textPrimary} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{t('sidebarSettings.sectionTitle')}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>{t('sidebarSettings.sectionSubtitle')}</div>
        </div>
        <Icon name="external" size={15} color={theme.textMuted} />
      </div>

      {sidebarSettingsOpen && (
        <SidebarSettingsModal theme={theme} t={t} lang={lang} onClose={() => setSidebarSettingsOpen(false)} />
      )}

      <div
        onClick={() => setAboutOpen(true)}
        style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 14, cursor: 'pointer', padding: 18 }}
      >
        <div style={{ width: 38, height: 38, borderRadius: 10, background: '#fff', border: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 6 }}>
          <img src={logoIcon} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>{t('settings.about')}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>{t('common.brand')}{t('common.brandRest')} {t('settings.version')} {APP_VERSION}</div>
        </div>
        <Icon name="external" size={15} color={theme.textMuted} />
      </div>

      {aboutOpen && (
        <div
          onClick={() => setAboutOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 340, maxWidth: '100%', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
              borderRadius: 20, padding: '36px 28px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              boxShadow: '0 24px 70px rgba(0,0,0,0.45)', textAlign: 'center', position: 'relative',
            }}
          >
            <span
              onClick={() => setAboutOpen(false)}
              style={{ position: 'absolute', top: 14, right: 14, cursor: 'pointer', opacity: 0.5, color: theme.textPrimary, fontSize: 18, lineHeight: 1 }}
            >
              ×
            </span>
            <div
              style={{
                width: 64, height: 64, borderRadius: 18, background: '#fff', border: `1px solid ${theme.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6, padding: 11,
                boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
              }}
            >
              <img src={logoIcon} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ fontSize: 19, fontWeight: 800 }}>
              <span style={{ color: theme.accentText }}>{t('common.brand')}</span>{t('common.brandRest')}
            </div>
            <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 14, maxWidth: 260 }}>
              {t('login.heroTitle')} {t('login.heroTitle2')}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {t('settings.version')} {APP_VERSION}
            </div>
            <div style={{ fontSize: 13, marginTop: 10 }}>
              {t('settings.developedBy')} <span style={{ fontWeight: 700 }}>Raul Pereira</span>
            </div>
            <div style={{ fontSize: 10.5, color: theme.textMuted, marginTop: 18 }}>&copy; {new Date().getFullYear()} {t('common.brand')}{t('common.brandRest')}</div>
          </div>
        </div>
      )}

      {newAgentOpen && (
        <div
          onClick={() => setNewAgentOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 400, maxWidth: '100%', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
              borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 800 }}>{t('settings.newAgentModalTitle')}</div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                {t('settings.agentNameLabel')}
              </div>
              <input
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitNewAgent()}
                placeholder={t('settings.agentNamePlaceholder')}
                autoFocus
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                {t('settings.tokenLabel')}
              </div>
              <input
                value={newAgentToken}
                onChange={(e) => setNewAgentToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitNewAgent()}
                type="password"
                placeholder={t('settings.tokenPlaceholder')}
                style={{ width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 13.5, fontFamily: 'var(--font-mono)', background: theme.subtleBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={() => setNewAgentOpen(false)}
                style={{ flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={submitNewAgent}
                disabled={!newAgentName.trim() || !newAgentToken.trim()}
                style={{
                  flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', opacity: newAgentName.trim() && newAgentToken.trim() ? 1 : 0.5,
                }}
              >
                {t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
