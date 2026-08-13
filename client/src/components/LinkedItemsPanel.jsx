import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { navigateToEntity } from '../lib/entityNav.js';
import { backdropClose } from '../lib/backdropClose.js';

const TYPE_ICON = { note: 'doc', issue: 'archive', task: 'check', code: 'code' };

// Cross-entity connections panel: shows confirmed links (either direction)
// plus content-similarity suggestions the user can turn into a real link
// with one click. Reusable across Notes/Issues/Tasks/Code Library detail
// views — entityType/entityId identify whichever item is currently open.
export default function LinkedItemsPanel({ entityType, entityId, theme, t }) {
  const navigate = useNavigate();
  const [connections, setConnections] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [mentions, setMentions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [addingKey, setAddingKey] = useState(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const typeLabel = {
    note: t('search.typeNote'),
    issue: t('search.typeIssue'),
    task: t('search.typeTask'),
    code: t('search.typeCode'),
  };

  const load = async () => {
    const [linksRes, suggRes, mentionsRes] = await Promise.all([
      api.listLinks(entityType, entityId),
      api.listLinkSuggestions(entityType, entityId).catch(() => ({ suggestions: [] })),
      api.listUnlinkedMentions(entityType, entityId).catch(() => ({ mentions: [] })),
    ]);
    setConnections([...linksRes.outgoing, ...linksRes.incoming]);
    setSuggestions(suggRes.suggestions || []);
    setMentions(mentionsRes.mentions || []);
    setLoaded(true);
  };

  useEffect(() => {
    setLoaded(false);
    setSuggestionsOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    if (entityId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const { results } = await api.searchLinkable(entityType, entityId, q);
        setSearchResults(results || []);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, entityType, entityId]);

  const linkSuggestion = async (s) => {
    const key = `${s.type}-${s.id}`;
    setAddingKey(key);
    try {
      await api.createLink({ fromType: entityType, fromId: entityId, toType: s.type, toId: s.id });
      setSearchQuery('');
      setSearchResults([]);
      await load();
    } finally {
      setAddingKey(null);
    }
  };

  const removeLink = async (linkId) => {
    setConnections((prev) => prev.filter((c) => c.linkId !== linkId));
    await api.deleteLink(linkId);
  };

  if (!loaded) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10, paddingTop: 18, borderTop: `1px solid ${theme.border}` }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="link" size={12} /> {t('links.connections')}
        </div>
        {connections.length === 0 ? (
          <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('links.noConnections')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {connections.map((c) => (
              <div key={c.linkId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: theme.subtleBg }}>
                <span style={{ display: 'flex', flexShrink: 0, opacity: 0.7 }}>
                  <Icon name={TYPE_ICON[c.type]} size={14} color={theme.textMuted} />
                </span>
                <div onClick={() => navigateToEntity(navigate, c)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: theme.accentText, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{typeLabel[c.type]}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
                </div>
                <span
                  onClick={() => removeLink(c.linkId)}
                  title={t('links.removeConnection')}
                  style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '0 4px', flexShrink: 0 }}
                >
                  &times;
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: theme.subtleBg, borderRadius: 10, padding: '8px 10px' }}>
          <Icon name="search" size={13} color={theme.textMuted} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('links.searchPlaceholder')}
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, color: theme.textPrimary, width: '100%' }}
          />
        </div>
        {searchQuery.trim().length >= 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            {searching ? null : searchResults.length === 0 ? (
              <div style={{ fontSize: 12, color: theme.textMuted, padding: '4px 2px' }}>{t('links.searchNoResults')}</div>
            ) : (
              searchResults.map((s) => {
                const key = `${s.type}-${s.id}`;
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: theme.subtleBg }}>
                    <span style={{ display: 'flex', flexShrink: 0, opacity: 0.7 }}>
                      <Icon name={TYPE_ICON[s.type]} size={14} color={theme.textMuted} />
                    </span>
                    <div onClick={() => navigateToEntity(navigate, s)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{typeLabel[s.type]}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</div>
                    </div>
                    <span
                      onClick={() => (addingKey === key ? null : linkSuggestion(s))}
                      title={t('links.addConnection')}
                      style={{
                        cursor: addingKey === key ? 'default' : 'pointer', color: theme.accentText, fontSize: 11.5, fontWeight: 700,
                        padding: '4px 8px', flexShrink: 0, opacity: addingKey === key ? 0.5 : 1, whiteSpace: 'nowrap',
                      }}
                    >
                      + {t('common.add')}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {(suggestions.length > 0 || mentions.length > 0) && (
        <div
          onClick={() => setSuggestionsOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: theme.accentText,
            cursor: 'pointer', padding: '6px 2px',
          }}
        >
          <Icon name="sparkle" size={13} /> {t('links.viewSuggestions', { n: suggestions.length + mentions.length })}
        </div>
      )}

      {suggestionsOpen && (
        <div
          onMouseDown={backdropClose(() => setSuggestionsOpen(false))}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 420, maxWidth: '100%', maxHeight: '75vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
              borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{t('links.suggestionsTitle')}</div>
              <span onClick={() => setSuggestionsOpen(false)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 20, padding: '0 2px' }}>
                &times;
              </span>
            </div>
            {suggestions.length === 0 && mentions.length === 0 ? (
              <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('links.noSuggestions')}</div>
            ) : (
              <>
                {mentions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      {t('links.mentionsTitle')}
                    </div>
                    {mentions.map((s) => {
                      const key = `${s.type}-${s.id}`;
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: `1px dashed ${theme.accentText}` }}>
                          <span style={{ display: 'flex', flexShrink: 0, opacity: 0.7 }}>
                            <Icon name={TYPE_ICON[s.type]} size={14} color={theme.accentText} />
                          </span>
                          <div onClick={() => navigateToEntity(navigate, s)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{typeLabel[s.type]}</div>
                            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</div>
                          </div>
                          <span
                            onClick={() => (addingKey === key ? null : linkSuggestion(s))}
                            title={t('links.addConnection')}
                            style={{
                              cursor: addingKey === key ? 'default' : 'pointer', color: theme.accentText, fontSize: 11.5, fontWeight: 700,
                              padding: '4px 8px', flexShrink: 0, opacity: addingKey === key ? 0.5 : 1, whiteSpace: 'nowrap',
                            }}
                          >
                            + {t('common.add')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {suggestions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: mentions.length > 0 ? 4 : 0 }}>
                    {mentions.length > 0 && (
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        {t('links.similarTitle')}
                      </div>
                    )}
                    {suggestions.map((s) => {
                      const key = `${s.type}-${s.id}`;
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: `1px dashed ${theme.border}` }}>
                          <span style={{ display: 'flex', flexShrink: 0, opacity: 0.6 }}>
                            <Icon name={TYPE_ICON[s.type]} size={14} color={theme.textMuted} />
                          </span>
                          <div onClick={() => navigateToEntity(navigate, s)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{typeLabel[s.type]}</div>
                            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</div>
                          </div>
                          <span
                            onClick={() => (addingKey === key ? null : linkSuggestion(s))}
                            title={t('links.addConnection')}
                            style={{
                              cursor: addingKey === key ? 'default' : 'pointer', color: theme.accentText, fontSize: 11.5, fontWeight: 700,
                              padding: '4px 8px', flexShrink: 0, opacity: addingKey === key ? 0.5 : 1, whiteSpace: 'nowrap',
                            }}
                          >
                            + {t('common.add')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
