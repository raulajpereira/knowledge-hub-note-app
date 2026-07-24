import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useCounts } from '../context/CountsContext.jsx';
import { api } from '../api.js';
import Icon from './Icon.jsx';

const NAV_ITEMS = [
  { path: '/', labelKey: 'nav.home', icon: 'home' },
  { path: '/notes', labelKey: 'nav.notes', icon: 'doc' },
  { path: '/tasks', labelKey: 'nav.tasks', icon: 'check' },
  { path: '/tags', labelKey: 'nav.tags', icon: 'tag' },
  { path: '/voice', labelKey: 'nav.voice', icon: 'mic' },
  { path: '/passwords', labelKey: 'nav.passwords', icon: 'lock' },
  { path: '/issues', labelKey: 'nav.issues', icon: 'archive' },
  { path: '/artifacts', labelKey: 'nav.artifacts', icon: 'code' },
  { path: '/code-library', labelKey: 'nav.codeLibrary', icon: 'folder' },
  { path: '/calendar', labelKey: 'nav.calendar', icon: 'calendar' },
  { path: '/sap-news', labelKey: 'nav.sapNews', icon: 'news' },
  { path: '/trash', labelKey: 'nav.trash', icon: 'trash' },
  { path: '/settings', labelKey: 'nav.settings', icon: 'settings' },
];

export default function HeaderSearch() {
  const { theme, mode, setMode } = useTheme();
  const { t } = useLanguage();
  const { refresh: refreshCounts } = useCounts();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setResults([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const [{ notes }, { tasks }, { voiceNotes }, { artifacts }] = await Promise.all([
          api.listNotes(),
          api.listTasks(),
          api.listVoiceNotes(),
          api.listArtifacts(),
        ]);
        const noteHits = notes
          .filter((n) => n.title.toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q))
          .slice(0, 5)
          .map((n) => ({ type: 'note', id: n.id, label: n.title }));
        const taskHits = tasks
          .filter((tk) => tk.title.toLowerCase().includes(q))
          .slice(0, 5)
          .map((tk) => ({ type: 'task', id: tk.id, label: tk.title }));
        const voiceHits = voiceNotes
          .filter((v) => v.title.toLowerCase().includes(q))
          .slice(0, 5)
          .map((v) => ({ type: 'voice', id: v.id, label: v.title }));
        const artifactHits = artifacts
          .filter((a) => a.title.toLowerCase().includes(q))
          .slice(0, 5)
          .map((a) => ({ type: 'artifact', id: a.id, label: a.title }));
        setResults([...noteHits, ...taskHits, ...voiceHits, ...artifactHits].slice(0, 8));
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const closeAndReset = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
    setActiveIndex(0);
    inputRef.current?.blur();
  };

  const commands = useMemo(() => {
    const navCommands = NAV_ITEMS.map((n) => ({
      id: `nav-${n.path}`,
      kind: 'command',
      icon: n.icon,
      label: t('search.goTo', { page: t(n.labelKey) }),
      run: () => navigate(n.path),
    }));
    const actionCommands = [
      {
        id: 'new-note',
        kind: 'command',
        icon: 'plus',
        label: t('home.newNoteTitle'),
        run: async () => {
          await api.createNote({ title: t('notes.untitledNote'), content: '' });
          refreshCounts();
          navigate('/notes');
        },
      },
      {
        id: 'new-task',
        kind: 'command',
        icon: 'plus',
        label: t('home.newTaskTitle'),
        run: () => navigate('/tasks'),
      },
      {
        id: 'new-issue',
        kind: 'command',
        icon: 'plus',
        label: t('issues.newIssueModalTitle'),
        run: async () => {
          await api.createIssue({});
          refreshCounts();
          navigate('/issues');
        },
      },
      {
        id: 'new-artifact',
        kind: 'command',
        icon: 'plus',
        label: t('artifacts.newArtifact'),
        run: async () => {
          await api.createArtifact({});
          refreshCounts();
          navigate('/artifacts');
        },
      },
      {
        id: 'toggle-theme',
        kind: 'command',
        icon: 'sparkle',
        label: mode === 'dark' ? t('search.switchToLight') : t('search.switchToDark'),
        run: () => setMode(mode === 'dark' ? 'light' : 'dark'),
      },
    ];
    return [...actionCommands, ...navCommands];
  }, [t, mode, navigate, refreshCounts, setMode]);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  const typeLabel = { note: t('search.typeNote'), task: t('search.typeTask'), voice: t('search.typeVoice'), artifact: t('search.typeArtifact') };
  const typeIcon = { note: 'doc', task: 'check', voice: 'mic', artifact: 'code' };

  const resultItems = results.map((r) => ({
    id: `${r.type}-${r.id}`,
    kind: r.type,
    icon: typeIcon[r.type],
    label: r.label,
    badge: typeLabel[r.type],
    run: () => {
      if (r.type === 'note') navigate('/notes', { state: { noteId: r.id } });
      else if (r.type === 'task') navigate('/tasks', { state: { taskId: r.id } });
      else if (r.type === 'artifact') navigate('/artifacts', { state: { artifactId: r.id } });
      else navigate('/voice', { state: { voiceId: r.id } });
    },
  }));

  const combined = [...filteredCommands, ...resultItems];

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  const runItem = (item) => {
    if (!item) return;
    closeAndReset();
    item.run();
  };

  const onInputKeyDown = (e) => {
    if (!open || combined.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, combined.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runItem(combined[activeIndex]);
    }
  };

  return (
    <div style={{ flex: '1 1 200px', minWidth: 0, maxWidth: 520, position: 'relative' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: theme.subtleBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '10px 14px',
        }}
      >
        <span style={{ opacity: 0.65, display: 'flex', flexShrink: 0 }}>
          <Icon name="search" size={16} />
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onInputKeyDown}
          placeholder={t('search.placeholder')}
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: theme.textPrimary, fontSize: 14 }}
        />
        {!query && (
          <span style={{ fontSize: 11, background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 5, padding: '2px 6px', color: theme.textMuted, flexShrink: 0 }}>
            {isMac ? '⌘K' : 'Ctrl K'}
          </span>
        )}
      </div>

      {open && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff',
            border: `1px solid ${theme.border}`, borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.25)', overflow: 'hidden', zIndex: 50,
            maxHeight: 360, overflowY: 'auto', padding: 6,
          }}
        >
          {!query.trim() && (
            <div style={{ padding: '6px 8px 4px', fontSize: 10.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('search.quickActions')}
            </div>
          )}
          {filteredCommands.map((item, i) => (
            <div
              key={item.id}
              onClick={() => runItem(item)}
              onMouseEnter={() => setActiveIndex(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
                background: activeIndex === i ? theme.accentSoftBg : 'transparent',
              }}
            >
              <span style={{ opacity: 0.7, display: 'flex', flexShrink: 0, color: activeIndex === i ? theme.accentText : theme.textPrimary }}>
                <Icon name={item.icon} size={14} />
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: activeIndex === i ? theme.accentText : theme.textPrimary }}>
                {item.label}
              </span>
            </div>
          ))}

          {query.trim() && (
            <>
              <div style={{ padding: '6px 8px 4px', fontSize: 10.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {t('search.resultsHeading')}
              </div>
              {loading && <div style={{ padding: '10px 10px', fontSize: 12.5, color: theme.textMuted }}>{t('search.searching')}</div>}
              {!loading && resultItems.length === 0 && (
                <div style={{ padding: '10px 10px', fontSize: 12.5, color: theme.textMuted }}>{t('search.noResults', { q: query })}</div>
              )}
              {!loading &&
                resultItems.map((item, ri) => {
                  const i = filteredCommands.length + ri;
                  return (
                    <div
                      key={item.id}
                      onClick={() => runItem(item)}
                      onMouseEnter={() => setActiveIndex(i)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
                        background: activeIndex === i ? theme.accentSoftBg : 'transparent',
                      }}
                    >
                      <span style={{ opacity: 0.6, display: 'flex', flexShrink: 0 }}>
                        <Icon name={item.icon} size={14} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: theme.textMuted, flexShrink: 0 }}>{item.badge}</span>
                    </div>
                  );
                })}
            </>
          )}

          {!query.trim() && filteredCommands.length === 0 && (
            <div style={{ padding: '10px 10px', fontSize: 12.5, color: theme.textMuted }}>{t('search.noResults', { q: query })}</div>
          )}
        </div>
      )}
    </div>
  );
}
