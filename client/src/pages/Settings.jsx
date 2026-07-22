import { useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAgents } from '../context/AgentsContext.jsx';
import { ACCENTS } from '../styles/theme.js';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import logoDefault from '../assets/logo-default.png';

function userInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

function AgentRow({ agent, theme }) {
  const { updateAgent, deleteAgent } = useAgents();
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
      setTestResult({ ok: true, message: 'Connected' });
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
          placeholder="Agent name"
          style={{ flex: 1, border: 'none', borderBottom: '1px solid transparent', padding: '2px 0', fontSize: 14.5, fontWeight: 700, background: 'transparent', color: theme.textPrimary, outline: 'none' }}
        />
        <select
          value={agent.provider}
          onChange={(e) => updateAgent(agent.id, { provider: e.target.value })}
          style={{ border: `1px solid ${theme.border}`, borderRadius: 7, padding: '5px 8px', fontSize: 12, background: theme.subtleBg, color: theme.textPrimary }}
        >
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI-compatible</option>
        </select>
        <span onClick={() => deleteAgent(agent.id)} style={{ cursor: 'pointer', opacity: 0.45, fontSize: 16, padding: '2px 6px', flexShrink: 0 }}>
          &times;
        </span>
      </div>

      {agent.provider === 'openai' && (
        <input
          value={agent.baseUrl || ''}
          onChange={(e) => updateAgent(agent.id, { baseUrl: e.target.value })}
          placeholder="Base URL (optional — defaults to api.openai.com)"
          style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 11px', fontSize: 12.5, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
        />
      )}

      <div style={{ position: 'relative', display: 'flex' }}>
        <input
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          type={tokenReveal ? 'text' : 'password'}
          placeholder={agent.hasToken ? 'API token saved — enter a new one to replace it' : 'API token'}
          style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '9px 90px 9px 11px', fontSize: 12.5, fontFamily: 'monospace', background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
        />
        <span onClick={() => setTokenReveal((v) => !v)} style={{ position: 'absolute', right: 60, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', opacity: 0.5, display: 'flex' }}>
          <Icon name={tokenReveal ? 'eyeOff' : 'eye'} size={15} />
        </span>
        <button onClick={saveToken} style={{ position: 'absolute', right: 4, top: 4, bottom: 4, background: theme.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '0 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          Save
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
          Active
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10 }}>
          {testResult && (
            <div style={{ fontSize: 12, fontWeight: 600, color: testResult.ok ? 'oklch(0.55 0.15 145)' : 'oklch(0.55 0.18 25)' }}>
              {testResult.message}
            </div>
          )}
          <button onClick={runTest} disabled={testing || !agent.hasToken} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 7, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: agent.hasToken ? 'pointer' : 'default', opacity: agent.hasToken ? 1 : 0.5 }}>
            {testing ? 'Testing…' : 'Test'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { theme, mode, accentColor, setMode, setAccentColor } = useTheme();
  const { user, updateUserSettings } = useAuth();
  const { agents, createAgent } = useAgents();
  const fileInputRef = useRef(null);

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

  const card = { background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 18 };
  const outlineButton = { background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', width: '100%', padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>Settings</div>

      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Appearance</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Theme</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>Choose a light or dark interface</div>
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
                {m}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Accent color</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>Applied across buttons, links and highlights</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {ACCENTS.map((a) => {
              const key = a.name.toLowerCase();
              const active = accentColor === key;
              return (
                <div
                  key={key}
                  onClick={() => setAccentColor(key)}
                  title={a.name}
                  style={{
                    width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
                    background: `oklch(0.6 0.19 ${a.hue})`,
                    boxShadow: active ? `0 0 0 2px ${theme.cardBg}, 0 0 0 4px oklch(0.6 0.19 ${a.hue})` : 'none',
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>App logo</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 220, height: 66, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', border: `1px solid ${theme.border}`, padding: '0 12px' }}>
            <img
              src={user?.settings?.logoUrl || logoDefault}
              alt="Logo"
              style={{ height: 44, width: 'auto', maxWidth: '100%', objectFit: 'contain', display: 'block' }}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200 }}>
            <div style={{ fontSize: 12.5, color: theme.textMuted }}>Replaces the whole sidebar logo (icon + app name).</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ ...outlineButton, alignSelf: 'flex-start' }}>
                Upload logo
                <input ref={fileInputRef} type="file" accept="image/*" onChange={onLogoUpload} style={{ display: 'none' }} />
              </label>
              <button onClick={onResetLogo} style={{ ...outlineButton, alignSelf: 'flex-start' }}>
                Reset logo
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Account</div>
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

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>AI Agents</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>Connect AI agents to assist across your workspace.</div>
          </div>
          <button
            onClick={() => createAgent({ name: 'New Agent', provider: 'anthropic' })}
            style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Add agent
          </button>
        </div>
        {agents.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>No agents yet — add one to enable the chat widget.</div>}
        {agents.map((agent) => (
          <AgentRow key={agent.id} agent={agent} theme={theme} />
        ))}
      </div>
    </div>
  );
}
