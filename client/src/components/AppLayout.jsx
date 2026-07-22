import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from './Icon.jsx';
import AgentChatWidget from './AgentChatWidget.jsx';
import AccountModal from './AccountModal.jsx';
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
  const { theme, mode, setMode } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);

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
          <div style={{ height: 48, width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '4px 8px' }}>
            <img
              src={user?.settings?.logoUrl || logoDefault}
              alt="Knowledge Hub"
              style={{ height: '100%', width: '100%', objectFit: 'contain', objectPosition: 'left center', display: 'block' }}
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
            <div
              style={{
                flex: '1 1 200px', minWidth: 0, maxWidth: 520, display: 'flex', alignItems: 'center', gap: 8,
                background: theme.subtleBg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '10px 14px',
              }}
            >
              <span style={{ opacity: 0.65, display: 'flex' }}>
                <Icon name="search" size={16} />
              </span>
              <span style={{ color: theme.textPrimary, opacity: 0.65, fontSize: 14, flex: 1 }}>
                Search notes...
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span
                onClick={() => navigate('/trash')}
                title="Trash"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 9,
                  cursor: 'pointer', color: theme.textMuted, border: `1px solid ${theme.border}`, background: theme.subtleBg,
                }}
              >
                <Icon name="trash" size={16} />
              </span>
              <span
                onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
                title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', height: 36, borderRadius: 9, padding: '0 12px',
                  cursor: 'pointer', color: theme.textMuted, border: `1px solid ${theme.border}`, background: theme.subtleBg,
                  fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                }}
              >
                {mode === 'dark' ? 'Dark mode' : 'Light mode'}
              </span>
              <span
                onClick={() => setAccountOpen(true)}
                title="Account"
                style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: theme.accent, cursor: 'pointer',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12.5, overflow: 'hidden',
                }}
              >
                {user?.settings?.avatarUrl ? (
                  <img src={user.settings.avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  userInitials(user?.name)
                )}
              </span>
            </div>
          </div>

          <Outlet />
        </div>
      </div>

      {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}

      <AgentChatWidget />
    </div>
  );
}
