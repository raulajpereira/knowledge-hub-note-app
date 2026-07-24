import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useAgents } from '../context/AgentsContext.jsx';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { parseReplyToBlocks, titleFromContent } from '../lib/parseAgentReply.js';
import { useClickOutside } from '../lib/useClickOutside.js';
import { navigateToEntity } from '../lib/entityNav.js';

function SourceChips({ sources, theme, t }) {
  const navigate = useNavigate();
  if (!sources || sources.length === 0) return null;
  const typeLabel = { note: t('search.typeNote'), task: t('search.typeTask'), issue: t('search.typeIssue'), code: t('search.typeCode') };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignSelf: 'flex-start', marginTop: 2 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {t('agent.sources')}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {sources.map((s) => (
          <span
            key={`${s.type}-${s.id}`}
            onClick={() => navigateToEntity(navigate, s)}
            style={{
              fontSize: 10.5, fontWeight: 600, color: theme.accentText, background: theme.accentSoftBg,
              borderRadius: 6, padding: '3px 7px', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden',
              textOverflow: 'ellipsis', maxWidth: 160,
            }}
          >
            {typeLabel[s.type]}: {s.title}
          </span>
        ))}
      </div>
    </div>
  );
}

function SaveAsNoteButton({ content, agentName, theme, t }) {
  const navigate = useNavigate();
  const [state, setState] = useState('idle'); // idle | saving | saved

  const save = async () => {
    setState('saving');
    const blocks = parseReplyToBlocks(content);
    const title = titleFromContent(content, `Note from ${agentName}`);
    const { note } = await api.createNote({
      title,
      content: blocks.map((b) => b.value).join('\n\n'),
      blocks,
    });
    setState('saved');
    setTimeout(() => setState('idle'), 2500);
    return note;
  };

  if (state === 'saved') {
    return (
      <span
        onClick={() => navigate('/notes')}
        style={{ fontSize: 11, fontWeight: 700, color: 'oklch(0.6 0.15 145)', cursor: 'pointer', alignSelf: 'flex-start' }}
      >
        {t('agent.savedToNotes')}
      </span>
    );
  }

  return (
    <span
      onClick={save}
      style={{
        fontSize: 11, fontWeight: 700, color: theme.accentText, cursor: state === 'saving' ? 'default' : 'pointer',
        alignSelf: 'flex-start', opacity: state === 'saving' ? 0.6 : 1,
      }}
    >
      {state === 'saving' ? t('agent.saving') : t('agent.saveAsNote')}
    </span>
  );
}

export default function AgentChatWidget() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { agents, updateAgent } = useAgents();
  const activeAgents = agents.filter((a) => a.active);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(null);
  const [messagesByAgent, setMessagesByAgent] = useState({});
  const [loadedAgents, setLoadedAgents] = useState({});
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState(false);
  const [sourcesByMessageId, setSourcesByMessageId] = useState({});
  const widgetRef = useRef(null);
  useClickOutside(widgetRef, () => setOpen(false), open);

  const currentAgentId = activeTab || activeAgents[0]?.id;
  const currentAgent = activeAgents.find((a) => a.id === currentAgentId) || activeAgents[0];

  useEffect(() => {
    if (!open || !currentAgent || loadedAgents[currentAgent.id]) return;
    api.getAgentMessages(currentAgent.id).then(({ messages }) => {
      setMessagesByAgent((prev) => ({ ...prev, [currentAgent.id]: messages }));
      setLoadedAgents((prev) => ({ ...prev, [currentAgent.id]: true }));
    });
  }, [open, currentAgent, loadedAgents]);

  if (activeAgents.length === 0) return null;

  const messages = messagesByAgent[currentAgent.id] || [];

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    const optimisticUser = { id: `local-${Date.now()}`, role: 'user', content: text };
    setMessagesByAgent((prev) => ({ ...prev, [currentAgent.id]: [...(prev[currentAgent.id] || []), optimisticUser] }));
    setSending(true);
    try {
      const { assistantMessage, sources } = workspaceMode
        ? await api.askAgentWorkspace(currentAgent.id, { message: text })
        : await api.chatWithAgent(currentAgent.id, { message: text });
      setMessagesByAgent((prev) => ({ ...prev, [currentAgent.id]: [...(prev[currentAgent.id] || []), assistantMessage] }));
      if (sources) setSourcesByMessageId((prev) => ({ ...prev, [assistantMessage.id]: sources }));
    } catch (err) {
      setMessagesByAgent((prev) => ({
        ...prev,
        [currentAgent.id]: [...(prev[currentAgent.id] || []), { id: `err-${Date.now()}`, role: 'assistant', content: `⚠ ${err.message}` }],
      }));
    } finally {
      setSending(false);
    }
  };

  const clearHistory = async () => {
    await api.clearAgentMessages(currentAgent.id);
    setMessagesByAgent((prev) => ({ ...prev, [currentAgent.id]: [] }));
  };

  return (
    <div ref={widgetRef}>
      {open && (
        <div
          style={{
            position: 'fixed', bottom: 88, right: 24, width: 340, maxWidth: 'calc(100vw - 48px)', height: 460,
            background: theme.modalBg, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            border: `1px solid ${theme.border}`, borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
            display: 'flex', flexDirection: 'column', zIndex: 60, overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 8px 0', borderBottom: `1px solid ${theme.border}` }}>
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flex: 1 }}>
              {activeAgents.map((a) => (
                <div
                  key={a.id}
                  onClick={() => setActiveTab(a.id)}
                  style={{
                    padding: '7px 12px', borderRadius: '8px 8px 0 0', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                    background: currentAgent.id === a.id ? theme.cardBg : 'transparent',
                    color: currentAgent.id === a.id ? theme.textPrimary : theme.textMuted,
                  }}
                >
                  {a.name}
                </div>
              ))}
            </div>
            <span onClick={clearHistory} title={t('agent.clear')} style={{ cursor: 'pointer', opacity: 0.5, fontSize: 11, fontWeight: 600, padding: '4px 6px', flexShrink: 0, color: theme.textMuted }}>
              {t('agent.clear')}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: `1px solid ${theme.border}` }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, flexShrink: 0 }}>{t('agent.model')}</span>
            <select
              value={currentAgent.model || currentAgent.modelOptions?.[0]?.id || ''}
              onChange={(e) => updateAgent(currentAgent.id, { model: e.target.value })}
              style={{
                flex: 1, minWidth: 0, fontSize: 11.5, border: `1px solid ${theme.border}`, borderRadius: 6,
                padding: '3px 6px', background: theme.subtleBg, color: theme.textPrimary,
              }}
            >
              {(currentAgent.modelOptions || []).map((m) => (
                <option key={m.id} value={m.id} style={{ color: '#1a1a1a', background: '#fff' }}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: `1px solid ${theme.border}` }}>
            <span
              onClick={() => setWorkspaceMode((v) => !v)}
              title={t('agent.workspaceModeHint')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                padding: '4px 9px', borderRadius: 20, border: `1px solid ${workspaceMode ? theme.accent : theme.border}`,
                background: workspaceMode ? theme.accentSoftBg : 'transparent',
                color: workspaceMode ? theme.accentText : theme.textMuted,
              }}
            >
              <Icon name="sparkle" size={11} color={workspaceMode ? theme.accentText : theme.textMuted} />
              {t('agent.workspaceMode')}
            </span>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ fontSize: 12.5, color: theme.textMuted, textAlign: 'center', marginTop: 20 }}>
                {t('agent.sayHello', { name: currentAgent.name })}
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div
                  style={{
                    maxWidth: '85%', background: m.role === 'user' ? theme.accent : theme.subtleBg,
                    color: m.role === 'user' ? '#fff' : theme.textPrimary,
                    borderRadius: 12, padding: '8px 12px', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.content}
                </div>
                {m.role === 'assistant' && !m.content.startsWith('⚠') && (
                  <SaveAsNoteButton content={m.content} agentName={currentAgent.name} theme={theme} t={t} />
                )}
                {m.role === 'assistant' && <SourceChips sources={sourcesByMessageId[m.id]} theme={theme} t={t} />}
              </div>
            ))}
            {sending && <div style={{ fontSize: 12, color: theme.textMuted }}>{t('agent.thinking')}</div>}
          </div>

          <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: `1px solid ${theme.border}` }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={workspaceMode ? t('agent.workspaceMessagePlaceholder') : t('agent.messagePlaceholder')}
              style={{ flex: 1, border: `1px solid ${theme.border}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
            />
            <button
              onClick={send}
              disabled={sending}
              style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, width: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sending ? 'default' : 'pointer', flexShrink: 0 }}
            >
              <Icon name="send" size={15} color="#fff" />
            </button>
          </div>
        </div>
      )}

      <div
        onClick={() => setOpen((v) => !v)}
        title={t('settings.aiAgents')}
        style={{
          position: 'fixed', bottom: 24, right: 24, width: 52, height: 52, borderRadius: '50%',
          background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentDark})`, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)', zIndex: 60,
        }}
      >
        <Icon name={open ? 'chat' : 'sparkle'} size={22} color="#fff" />
      </div>
    </div>
  );
}
