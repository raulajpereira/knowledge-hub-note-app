import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useCounts } from '../context/CountsContext.jsx';
import { api } from '../api.js';
import { useClickOutside } from '../lib/useClickOutside.js';
import { useIsMobile } from '../lib/useIsMobile.js';
import Icon from './Icon.jsx';
import AgentChatWidget from './AgentChatWidget.jsx';
import AccountModal from './AccountModal.jsx';
import AboutModal from './AboutModal.jsx';
import HeaderSearch from './HeaderSearch.jsx';
import TransactionsQuickSearch from './TransactionsQuickSearch.jsx';
import NewsTicker from './NewsTicker.jsx';
import MobileMoreSheet from './MobileMoreSheet.jsx';
import WhiteboardModal from './WhiteboardModal.jsx';
import ActivityModal from './ActivityModal.jsx';
import logoDefault from '../assets/logo-default.png';
import logoIcon from '../assets/logo-icon.png';
import { resolveSidebarLayout, sidebarItemLabel, sidebarGroupLabel } from '../lib/sidebarItems.js';

const MOBILE_TABS = [
  { key: 'home', to: '/', end: true, icon: 'home', labelKey: 'nav.home' },
  { key: 'notes', to: '/notes', icon: 'doc', labelKey: 'nav.notes' },
  { key: 'tasks', to: '/tasks', icon: 'check', labelKey: 'nav.tasks' },
];

function userInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

export default function AppLayout() {
  const { theme } = useTheme();
  const { user, logout, updateUserSettings } = useAuth();
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [accountOpen, setAccountOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchFocusTick, setSearchFocusTick] = useState(0);
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    if (!focusMode) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setFocusMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode]);

  // Focus mode is a manual, per-session toggle (not persisted) meant to hide
  // the sidebar/header/news-ticker chrome while working inside a detail
  // panel (a note, a project, a document, ...) — it applies the same way
  // regardless of which page's detail view is open, so it lives here at the
  // layout level instead of being wired into every individual page.
  useEffect(() => {
    setFocusMode(false);
  }, [location.pathname]);
  const { counts, issueAlerts } = useCounts();
  const notifRef = useRef(null);
  useClickOutside(notifRef, () => setNotifOpen(false), notifOpen);

  const [sidebarItems, setSidebarItems] = useState([]);
  const [draggedKey, setDraggedKey] = useState(null);
  useEffect(() => {
    setSidebarItems(resolveSidebarLayout(user?.settings?.sidebarLayout).filter((item) => !item.hidden));
  }, [user?.settings?.sidebarLayout]);

  const sidebarCollapsed = !isMobile && !!user?.settings?.sidebarCollapsed;
  const toggleSidebarCollapsed = async () => {
    const { settings } = await api.updateSettings({ sidebarCollapsed: !user?.settings?.sidebarCollapsed });
    updateUserSettings(settings);
  };

  const onSidebarDragOver = (e, index) => {
    e.preventDefault();
    const fromIndex = sidebarItems.findIndex((i) => i.key === draggedKey);
    if (fromIndex === -1 || fromIndex === index) return;
    setSidebarItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
  };

  const onSidebarDrop = async () => {
    if (draggedKey === null) return;
    setDraggedKey(null);
    const hiddenItems = resolveSidebarLayout(user?.settings?.sidebarLayout).filter((i) => i.hidden);
    const serialize = (i) => {
      if (i.type === 'spacer') return { key: i.key, type: 'spacer' };
      if (i.type === 'group-start') return { key: i.key, type: 'group-start', groupId: i.groupId, labelPt: i.labelPt, labelEn: i.labelEn, collapsed: !!i.collapsed };
      if (i.type === 'group-end') return { key: i.key, type: 'group-end', groupId: i.groupId };
      return { key: i.key, hidden: false, labelPt: i.labelPt, labelEn: i.labelEn };
    };
    const sidebarLayout = [...sidebarItems.map(serialize), ...hiddenItems.map(serialize)];
    const { settings } = await api.updateSettings({ sidebarLayout });
    updateUserSettings(settings);
  };

  const toggleGroupCollapsed = async (groupId) => {
    const fullLayout = resolveSidebarLayout(user?.settings?.sidebarLayout);
    const sidebarLayout = fullLayout.map((i) =>
      i.type === 'group-start' && i.groupId === groupId
        ? { key: i.key, type: 'group-start', groupId: i.groupId, labelPt: i.labelPt, labelEn: i.labelEn, collapsed: !i.collapsed }
        : i.type === 'spacer'
          ? { key: i.key, type: 'spacer' }
          : i.type === 'group-end'
            ? { key: i.key, type: 'group-end', groupId: i.groupId }
            : { key: i.key, hidden: !!i.hidden, labelPt: i.labelPt, labelEn: i.labelEn },
    );
    const { settings } = await api.updateSettings({ sidebarLayout });
    updateUserSettings(settings);
  };

  const navItemStyle = (isActive) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
    gap: 12,
    padding: sidebarCollapsed ? '10px' : '10px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    textDecoration: 'none',
    background: isActive ? theme.accentSoftBg : 'transparent',
    color: isActive ? theme.accentText : theme.textMuted,
  });

  return (
    <div
      className="app-shell-height"
      style={{
        display: 'flex', flexDirection: 'column', width: '100%',
        background: theme.pageBg, color: theme.textPrimary, position: 'relative', overflow: 'hidden',
      }}
    >
      {/* zoom (not the outer 100vh/100dvh shell) so the "text size" setting scales
          content without fighting the shell's own viewport-height sizing — any
          extra space it needs is absorbed by this row's own internal scroll
          regions (sidebar, main content), not the page itself. */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%', position: 'relative', zIndex: 1, zoom: 'var(--app-zoom, 1)' }}>
        {!isMobile && !focusMode && (
        <div
          style={{
            width: sidebarCollapsed ? 76 : 260, flexShrink: 0, background: theme.sidebarBg, borderRight: `1px solid ${theme.border}`,
            display: 'flex', flexDirection: 'column', padding: sidebarCollapsed ? '20px 10px 16px' : '20px 16px 16px', gap: 24, overflowY: 'auto', minHeight: 0,
            transition: 'width 0.15s',
          }}
        >
          <div
            onClick={() => navigate('/')}
            style={{
              height: 60, boxSizing: 'border-box', display: 'flex', alignItems: 'center',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '4px 0' : '4px 8px', cursor: 'pointer',
            }}
          >
            {sidebarCollapsed ? (
              <img src={logoIcon} alt="Knowledge Hub" style={{ height: 38, width: 38, objectFit: 'contain', display: 'block' }} />
            ) : (
              <img
                src={user?.settings?.logoUrl || logoDefault}
                alt="Knowledge Hub"
                style={{
                  height: '100%', width: '100%', display: 'block',
                  objectFit: user?.settings?.logoUrl ? 'cover' : 'contain',
                  objectPosition: user?.settings?.logoUrl ? 'center' : 'left center',
                }}
              />
            )}
          </div>

          <div
            onClick={toggleSidebarCollapsed}
            title={sidebarCollapsed ? t('sidebarSettings.expand') : t('sidebarSettings.collapse')}
            style={{
              display: 'flex', alignItems: 'center', cursor: 'pointer', color: theme.textMuted, opacity: 0.5,
              justifyContent: sidebarCollapsed ? 'center' : 'flex-end', padding: sidebarCollapsed ? '6px' : '6px 2px', marginTop: -12,
            }}
          >
            <span style={{ display: 'flex', transform: sidebarCollapsed ? 'none' : 'rotate(180deg)', transition: 'transform 0.15s' }}>
              <Icon name="chevron" size={15} strokeWidth={2.2} />
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(() => {
              // Groups are two markers (group-start/group-end) in the same
              // flat array as everything else — walking it top-to-bottom
              // with a small stack tells us, for each row, how deep it is
              // nested and whether any ancestor group is currently
              // collapsed (in which case the row renders nothing). In
              // icon-only mode groups don't collapse/indent at all (there's
              // no room for a label anyway) — they just get a thin divider
              // above the group's first item, per the "small separator"
              // design used elsewhere in the collapsed sidebar.
              const collapsedAncestors = [];
              let depth = 0;
              return sidebarItems.map((item, index) => {
                if (item.type === 'group-end') {
                  collapsedAncestors.pop();
                  depth = Math.max(0, depth - 1);
                  return null;
                }
                const hiddenByAncestor = !sidebarCollapsed && collapsedAncestors.some(Boolean);
                if (item.type === 'group-start') {
                  const currentDepth = depth;
                  const isHidden = hiddenByAncestor;
                  collapsedAncestors.push(item.collapsed);
                  depth += 1;
                  if (sidebarCollapsed) {
                    return <div key={item.key} style={{ borderTop: `1px solid ${theme.border}`, margin: '4px 4px 2px' }} />;
                  }
                  if (isHidden) return null;
                  return (
                    <div
                      key={item.key}
                      draggable
                      onDragStart={() => setDraggedKey(item.key)}
                      onDragOver={(e) => onSidebarDragOver(e, index)}
                      onDrop={onSidebarDrop}
                      onDragEnd={onSidebarDrop}
                      onClick={() => toggleGroupCollapsed(item.groupId)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginLeft: currentDepth * 12,
                        cursor: 'pointer', color: theme.textMuted, opacity: draggedKey === item.key ? 0.5 : 1,
                      }}
                    >
                      <span style={{ display: 'flex', transform: item.collapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.15s' }}>
                        <Icon name="chevron" size={12} strokeWidth={2.4} />
                      </span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {sidebarGroupLabel(item, lang, t)}
                      </span>
                    </div>
                  );
                }
                if (hiddenByAncestor) return null;
                const currentDepth = sidebarCollapsed ? 0 : depth;
                return item.type === 'spacer' ? (
                  <div
                    key={item.key}
                    draggable
                    onDragStart={() => setDraggedKey(item.key)}
                    onDragOver={(e) => onSidebarDragOver(e, index)}
                    onDrop={onSidebarDrop}
                    onDragEnd={onSidebarDrop}
                    style={{ height: 14, opacity: draggedKey === item.key ? 0.5 : 1 }}
                  />
                ) : (
                <div
                  key={item.key}
                  draggable
                  onDragStart={() => setDraggedKey(item.key)}
                  onDragOver={(e) => onSidebarDragOver(e, index)}
                  onDrop={onSidebarDrop}
                  onDragEnd={onSidebarDrop}
                  style={{ opacity: draggedKey === item.key ? 0.5 : 1, marginLeft: currentDepth * 12 }}
                >
                  <NavLink
                    to={item.to}
                    end={item.end}
                    draggable={false}
                    title={sidebarCollapsed ? sidebarItemLabel(item, lang, t) : undefined}
                    style={({ isActive }) => navItemStyle(isActive)}
                  >
                    <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
                      <Icon name={item.icon} size={18} />
                      {sidebarCollapsed && item.countKey && counts[item.countKey] > 0 && (
                        <span style={{ position: 'absolute', top: -4, right: -6, width: 8, height: 8, borderRadius: '50%', background: theme.accent }} />
                      )}
                    </span>
                    {!sidebarCollapsed && (
                      <>
                        <span style={{ fontSize: 14, fontWeight: 500, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {sidebarItemLabel(item, lang, t)}
                        </span>
                        {item.countKey && counts[item.countKey] > 0 && (
                          <span
                            style={{
                              fontSize: 10.5, fontWeight: 700, flexShrink: 0, padding: '1px 7px', borderRadius: 20,
                              background: theme.subtleBg, color: theme.textMuted,
                            }}
                          >
                            {counts[item.countKey]}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </div>
                );
              });
            })()}
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <NavLink to="/trash" title={sidebarCollapsed ? t('nav.trash') : undefined} style={({ isActive }) => navItemStyle(isActive)}>
                <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
                  <Icon name="trash" size={18} />
                  {sidebarCollapsed && counts.trash > 0 && (
                    <span style={{ position: 'absolute', top: -4, right: -6, width: 8, height: 8, borderRadius: '50%', background: theme.accent }} />
                  )}
                </span>
                {!sidebarCollapsed && (
                  <>
                    <span style={{ fontSize: 14, fontWeight: 500, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t('nav.trash')}
                    </span>
                    {counts.trash > 0 && (
                      <span
                        style={{
                          fontSize: 10.5, fontWeight: 700, flexShrink: 0, padding: '1px 7px', borderRadius: 20,
                          background: theme.subtleBg, color: theme.textMuted,
                        }}
                      >
                        {counts.trash}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
              <NavLink to="/settings" title={sidebarCollapsed ? t('nav.settings') : undefined} style={({ isActive }) => navItemStyle(isActive)}>
                <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="settings" size={18} />
                </span>
                {!sidebarCollapsed && <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{t('nav.settings')}</span>}
              </NavLink>
              <div
                onClick={() => setAboutOpen(true)}
                title={sidebarCollapsed ? t('settings.about') : undefined}
                style={navItemStyle(false)}
              >
                <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="external" size={18} />
                </span>
                {!sidebarCollapsed && <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{t('settings.about')}</span>}
              </div>

              <div
                onClick={() => setAccountOpen(true)}
                title={sidebarCollapsed ? user?.name : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, background: theme.subtleBg, cursor: 'pointer',
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                }}
              >
                <div
                  style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: theme.accent,
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12.5, overflow: 'hidden',
                  }}
                >
                  {user?.settings?.avatarUrl ? (
                    <img src={user.settings.avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    userInitials(user?.name)
                  )}
                </div>
                {!sidebarCollapsed && (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.name}
                  </div>
                  <div style={{ fontSize: 11, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.email}
                  </div>
                </div>
                )}
              </div>
            </div>

            {!sidebarCollapsed && (
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', color: theme.textMuted, textAlign: 'left' }}>
                <span style={{ color: theme.accentText, fontWeight: 700 }}>{t('common.brand')}</span>{t('common.brandRest')} &copy; {new Date().getFullYear()}
              </div>
            )}
          </div>
        </div>
        )}

        <div
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto', background: theme.pageBg,
            paddingBottom: isMobile ? 'calc(var(--mobile-nav-height) + var(--safe-bottom))' : 0,
          }}
        >
          {!focusMode && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16,
              padding: isMobile ? 'calc(10px + var(--safe-top)) 14px 10px' : '18px 28px',
              background: theme.sidebarBg, borderBottom: `1px solid ${theme.border}`,
              position: isMobile ? 'sticky' : 'static', top: 0, zIndex: isMobile ? 40 : 'auto',
            }}
          >
            <HeaderSearch compact={isMobile} focusSignal={searchFocusTick} />

            {!isMobile && (
              <span
                onClick={() => navigate('/sap-news')}
                title={t('nav.sapNews')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: '50%',
                  cursor: 'pointer', flexShrink: 0, color: '#fff',
                  background: location.pathname === '/sap-news' ? theme.accentDark : theme.accent,
                }}
              >
                <Icon name="news" size={17} color="#fff" />
              </span>
            )}

            {!isMobile && <TransactionsQuickSearch />}

            <div style={{ flex: 1 }} />

            <span
              onClick={() => setActivityOpen(true)}
              title={t('activity.title')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: '50%',
                cursor: 'pointer', flexShrink: 0, color: theme.textPrimary, background: theme.subtleBg,
              }}
            >
              <Icon name="calendar" size={17} />
            </span>

            <span
              onClick={() => setWhiteboardOpen(true)}
              title={t('nav.whiteboard')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: '50%',
                cursor: 'pointer', flexShrink: 0, color: theme.textPrimary, background: theme.subtleBg,
              }}
            >
              <Icon name="whiteboard" size={17} />
            </span>

            <div ref={notifRef} style={{ position: 'relative', flexShrink: 0 }}>
              <span
                onClick={() => setNotifOpen((v) => !v)}
                title={t('notifications.title')}
                style={{
                  position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: '50%',
                  cursor: 'pointer', color: theme.textPrimary, background: theme.subtleBg,
                }}
              >
                <Icon name="bell" size={17} />
                {issueAlerts.length > 0 && (
                  <div
                    style={{
                      position: 'absolute', top: -2, right: -2, background: 'oklch(0.6 0.2 25)', color: '#fff', fontSize: 10, fontWeight: 700,
                      width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {issueAlerts.length}
                  </div>
                )}
              </span>
              {notifOpen && (
                <div
                  style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    width: isMobile ? 'min(300px, calc(100vw - 28px))' : 300, maxHeight: 360, overflowY: 'auto',
                    background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff',
                    border: `1px solid ${theme.border}`, borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.25)', padding: 14, zIndex: 50,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t('notifications.title')}</div>
                  {issueAlerts.length === 0 && <div style={{ fontSize: 12, color: theme.textMuted }}>{t('notifications.empty')}</div>}
                  {issueAlerts.map(({ issue, kind, days }) => (
                    <div
                      key={issue.id}
                      onClick={() => { setNotifOpen(false); navigate('/issues', { state: { issueId: issue.id } }); }}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 4px', cursor: 'pointer', borderRadius: 8 }}
                    >
                      <div
                        style={{
                          width: 7, height: 7, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                          background: kind === 'overdue' ? 'oklch(0.6 0.2 25)' : 'oklch(0.75 0.15 70)',
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{issue.title}</div>
                        <div style={{ fontSize: 11, color: theme.textMuted }}>
                          {kind === 'overdue'
                            ? t(days === 1 ? 'notifications.overdue' : 'notifications.overduePlural', { days })
                            : days === 0
                            ? t('notifications.dueToday')
                            : t(days === 1 ? 'notifications.dueIn' : 'notifications.dueInPlural', { days })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!isMobile && (
              <span
                onClick={() => setFocusMode(true)}
                title={t('common.focusMode')}
                style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                  color: theme.textPrimary, background: theme.subtleBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Icon name="focus" size={16} />
              </span>
            )}

            <span
              onClick={logout}
              title={t('common.lockPlatform')}
              style={{
                width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: theme.accent, cursor: 'pointer',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Icon name="lock" size={16} color="#fff" />
            </span>
          </div>
          )}

          {focusMode && (
            <span
              onClick={() => setFocusMode(false)}
              title={t('common.exitFocusMode')}
              style={{
                position: 'fixed', top: 16, right: 16, zIndex: 90,
                width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: theme.textPrimary, background: theme.subtleBg, border: `1px solid ${theme.border}`,
                boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
              }}
            >
              <Icon name="focus" size={16} />
            </span>
          )}

          <Outlet />
        </div>
      </div>

      {!isMobile && !focusMode && <NewsTicker />}

      {isMobile && !focusMode && (
        <div
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 80,
            display: 'flex', alignItems: 'stretch',
            height: 'calc(var(--mobile-nav-height) + var(--safe-bottom))',
            paddingBottom: 'var(--safe-bottom)',
            background: theme.dark ? 'oklch(0.15 0.02 255 / 0.97)' : 'rgba(255,255,255,0.94)',
            backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            borderTop: `1px solid ${theme.border}`,
          }}
        >
          {MOBILE_TABS.map((tab) => (
            <NavLink
              key={tab.key}
              to={tab.to}
              end={tab.end}
              onClick={() => window.dispatchEvent(new CustomEvent('mobile-tab-tap', { detail: tab.key }))}
              style={({ isActive }) => ({
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                textDecoration: 'none', color: isActive ? theme.accentText : theme.textMuted,
              })}
            >
              <Icon name={tab.icon} size={21} />
              <span style={{ fontSize: 10.5, fontWeight: 600 }}>{t(tab.labelKey)}</span>
            </NavLink>
          ))}
          <div
            onClick={() => setSearchFocusTick((v) => v + 1)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: theme.textMuted, cursor: 'pointer' }}
          >
            <Icon name="search" size={21} />
            <span style={{ fontSize: 10.5, fontWeight: 600 }}>{t('nav.search')}</span>
          </div>
          <div
            onClick={() => setMoreOpen(true)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: moreOpen ? theme.accentText : theme.textMuted, cursor: 'pointer' }}
          >
            <Icon name="dots" size={21} />
            <span style={{ fontSize: 10.5, fontWeight: 600 }}>{t('nav.more')}</span>
          </div>
        </div>
      )}

      {isMobile && moreOpen && (
        <MobileMoreSheet
          theme={theme}
          t={t}
          lang={lang}
          user={user}
          items={sidebarItems.filter((i) => i.type !== 'spacer')}
          counts={counts}
          onClose={() => setMoreOpen(false)}
          onOpenAccount={() => setAccountOpen(true)}
          onLogout={logout}
        />
      )}

      {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}
      {aboutOpen && <AboutModal theme={theme} t={t} lang={lang} onClose={() => setAboutOpen(false)} />}
      {whiteboardOpen && <WhiteboardModal onClose={() => setWhiteboardOpen(false)} />}
      {activityOpen && <ActivityModal onClose={() => setActivityOpen(false)} />}

      <AgentChatWidget />
    </div>
  );
}
