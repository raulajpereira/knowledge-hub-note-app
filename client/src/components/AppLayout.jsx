import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useCounts } from '../context/CountsContext.jsx';
import { api } from '../api.js';
import { useClickOutside } from '../lib/useClickOutside.js';
import Icon from './Icon.jsx';
import AgentChatWidget from './AgentChatWidget.jsx';
import AccountModal from './AccountModal.jsx';
import HeaderSearch from './HeaderSearch.jsx';
import NewsTicker from './NewsTicker.jsx';
import logoDefault from '../assets/logo-default.png';
import { resolveSidebarLayout, sidebarItemLabel } from '../lib/sidebarItems.js';

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
  const [accountOpen, setAccountOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { counts, issueAlerts } = useCounts();
  const notifRef = useRef(null);
  useClickOutside(notifRef, () => setNotifOpen(false), notifOpen);

  const [sidebarItems, setSidebarItems] = useState([]);
  const [draggedKey, setDraggedKey] = useState(null);
  useEffect(() => {
    setSidebarItems(resolveSidebarLayout(user?.settings?.sidebarLayout).filter((item) => !item.hidden));
  }, [user?.settings?.sidebarLayout]);

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
    const sidebarLayout = [
      ...sidebarItems.map((i) => ({ key: i.key, hidden: false, labelPt: i.labelPt, labelEn: i.labelEn })),
      ...hiddenItems.map((i) => ({ key: i.key, hidden: true, labelPt: i.labelPt, labelEn: i.labelEn })),
    ];
    const { settings } = await api.updateSettings({ sidebarLayout });
    updateUserSettings(settings);
  };

  const navItemStyle = (isActive) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 10,
    cursor: 'pointer',
    textDecoration: 'none',
    background: isActive ? theme.accentSoftBg : 'transparent',
    color: isActive ? theme.accentText : theme.textMuted,
  });

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', height: '100vh', width: '100%',
        background: theme.pageBg, color: theme.textPrimary, position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%', position: 'relative', zIndex: 1 }}>
        <div
          style={{
            width: 260, flexShrink: 0, background: theme.sidebarBg, borderRight: `1px solid ${theme.border}`,
            display: 'flex', flexDirection: 'column', padding: '20px 16px 16px', gap: 24, overflowY: 'auto', minHeight: 0,
          }}
        >
          <div
            onClick={() => navigate('/')}
            style={{ height: 60, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '4px 8px', cursor: 'pointer' }}
          >
            <img
              src={user?.settings?.logoUrl || logoDefault}
              alt="Knowledge Hub"
              style={{
                height: '100%', width: '100%', display: 'block',
                objectFit: user?.settings?.logoUrl ? 'cover' : 'contain',
                objectPosition: user?.settings?.logoUrl ? 'center' : 'left center',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {sidebarItems.map((item, index) => (
              <div
                key={item.key}
                draggable
                onDragStart={() => setDraggedKey(item.key)}
                onDragOver={(e) => onSidebarDragOver(e, index)}
                onDrop={onSidebarDrop}
                onDragEnd={onSidebarDrop}
                style={{ opacity: draggedKey === item.key ? 0.5 : 1 }}
              >
                <NavLink
                  to={item.to}
                  end={item.end}
                  draggable={false}
                  style={({ isActive }) => navItemStyle(isActive)}
                >
                  <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={item.icon} size={18} />
                  </span>
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
                </NavLink>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <NavLink to="/trash" style={({ isActive }) => navItemStyle(isActive)}>
                <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="trash" size={18} />
                </span>
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
              </NavLink>
              <NavLink to="/settings" style={({ isActive }) => navItemStyle(isActive)}>
                <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="settings" size={18} />
                </span>
                <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{t('nav.settings')}</span>
              </NavLink>

              <div
                onClick={() => setAccountOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, background: theme.subtleBg, cursor: 'pointer' }}
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
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.name}
                  </div>
                  <div style={{ fontSize: 11, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.email}
                  </div>
                </div>
                <span onClick={(e) => { e.stopPropagation(); logout(); }} title={t('nav.logout')} style={{ cursor: 'pointer', opacity: 0.6, display: 'flex', flexShrink: 0 }}>
                  <Icon name="logout" size={17} />
                </span>
              </div>
            </div>

            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', color: theme.textMuted, textAlign: 'left' }}>
              <span style={{ color: theme.accentText, fontWeight: 700 }}>{t('common.brand')}</span>{t('common.brandRest')} &copy; {new Date().getFullYear()}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto', background: theme.pageBg }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '18px 28px',
              background: theme.sidebarBg, borderBottom: `1px solid ${theme.border}`,
            }}
          >
            <HeaderSearch />

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

            <div style={{ flex: 1 }} />

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
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 300, maxHeight: 360, overflowY: 'auto',
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

          <Outlet />
        </div>
      </div>

      <NewsTicker />

      {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}

      <AgentChatWidget />
    </div>
  );
}
