import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from './Icon.jsx';
import AgentChatWidget from './AgentChatWidget.jsx';
import AccountModal from './AccountModal.jsx';
import HeaderSearch from './HeaderSearch.jsx';
import logoDefault from '../assets/logo-default.png';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/notes', label: 'Notes', icon: 'doc' },
  { to: '/voice', label: 'Voice Notes', icon: 'mic' },
  { to: '/tasks', label: 'Tasks', icon: 'check' },
  { to: '/tags', label: 'Tags', icon: 'tag' },
  { to: '/passwords', label: 'Passwords', icon: 'lock' },
  { to: '/issues', label: 'Project Issues', icon: 'archive' },
];

function userInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

export default function AppLayout() {
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '4px 8px' }}>
            <img
              src={user?.settings?.logoUrl || logoDefault}
              alt="Knowledge Hub"
              style={{ height: 44, width: 'auto', maxWidth: '100%', objectFit: 'contain', display: 'block' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.soon ? '#' : item.to}
                end={item.end}
                onClick={(e) => item.soon && e.preventDefault()}
                style={({ isActive }) => navItemStyle(isActive && !item.soon)}
              >
                <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={item.icon} size={18} />
                </span>
                <span style={{ fontSize: 14, fontWeight: 500, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.label}
                </span>
                {item.soon && (
                  <span style={{ fontSize: 9.5, fontWeight: 700, opacity: 0.5, flexShrink: 0 }}>SOON</span>
                )}
              </NavLink>
            ))}
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <NavLink to="/trash" style={({ isActive }) => navItemStyle(isActive)}>
              <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="trash" size={18} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>Trash</span>
            </NavLink>
            <NavLink to="/settings" style={({ isActive }) => navItemStyle(isActive)}>
              <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="settings" size={18} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>Settings</span>
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
              <span onClick={(e) => { e.stopPropagation(); logout(); }} title="Log out" style={{ cursor: 'pointer', opacity: 0.6, display: 'flex', flexShrink: 0 }}>
                <Icon name="logout" size={17} />
              </span>
            </div>

            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', color: theme.textMuted, textAlign: 'center' }}>
              <span style={{ color: theme.accentText, fontWeight: 700 }}>Knowledge</span>Hub &copy; {new Date().getFullYear()}
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

            <div style={{ flex: 1 }} />

            <div style={{ position: 'relative', flexShrink: 0 }}>
              <span
                onClick={() => setNotifOpen((v) => !v)}
                title="Notifications"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: '50%',
                  cursor: 'pointer', color: theme.textPrimary, background: theme.subtleBg,
                }}
              >
                <Icon name="bell" size={17} />
              </span>
              {notifOpen && (
                <div
                  onMouseLeave={() => setNotifOpen(false)}
                  style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 240, background: theme.dark ? 'oklch(0.20 0.025 275)' : '#ffffff',
                    border: `1px solid ${theme.border}`, borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.25)', padding: 16, zIndex: 50,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Notifications</div>
                  <div style={{ fontSize: 12, color: theme.textMuted }}>No notifications yet.</div>
                </div>
              )}
            </div>

            <span
              onClick={logout}
              title="Lock platform"
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

      {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}

      <AgentChatWidget />
    </div>
  );
}
