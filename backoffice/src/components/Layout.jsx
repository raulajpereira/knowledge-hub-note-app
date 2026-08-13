import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import AccountModal from './AccountModal.jsx';
import logoWordmarkDark from '../assets/logo-wordmark-dark.png';
import logoWordmarkLight from '../assets/logo-wordmark-light.png';

const NAV_ITEMS = [
  { to: '/', end: true, icon: 'home', labelKey: 'backoffice.navOverview' },
  { to: '/pedidos-de-codigo', icon: 'mail', labelKey: 'backoffice.navCodeRequests', countKey: 'pendingRequests' },
  { to: '/criar-codigos', icon: 'lock', labelKey: 'backoffice.navCreateCodes' },
  { to: '/contas', icon: 'users', labelKey: 'backoffice.navAccounts' },
  { to: '/templates', icon: 'doc', labelKey: 'backoffice.navTemplates' },
  { to: '/logs', icon: 'history', labelKey: 'backoffice.navActivityLog' },
];

function userInitials(name) {
  if (!name) return '';
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

const SIDEBAR_MIN = 190;
const SIDEBAR_MAX = 420;

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, sidebarWidth, setSidebarWidth } = useTheme();
  const { t } = useLanguage();
  const location = useLocation();
  const [pendingRequests, setPendingRequests] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef(null);

  const onResizeDown = (e) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    setResizing(true);
  };

  useEffect(() => {
    if (!resizing) return undefined;
    const onMove = (e) => {
      if (!resizeRef.current) return;
      const { startX, startWidth } = resizeRef.current;
      setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startWidth + (e.clientX - startX))));
    };
    const onUp = () => {
      setResizing(false);
      resizeRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => window.removeEventListener('pointermove', onMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  const loadPending = () => {
    api.listCodeRequests().then((r) => setPendingRequests(r.requests.filter((req) => req.status === 'pending').length)).catch(() => {});
  };

  useEffect(() => {
    loadPending();
    const onChanged = () => loadPending();
    window.addEventListener('kh-backoffice:code-requests-changed', onChanged);
    return () => window.removeEventListener('kh-backoffice:code-requests-changed', onChanged);
  }, []);

  const activeItem = NAV_ITEMS.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)))
    || (location.pathname === '/aparencia' ? { labelKey: 'backoffice.navAppearance' } : null);

  const navItemStyle = (isActive) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 9, fontSize: 13.5, fontWeight: 600,
    color: isActive ? theme.textPrimary : theme.textMuted, cursor: 'pointer', textDecoration: 'none',
    background: isActive ? theme.subtleBg : 'transparent', boxShadow: isActive ? `inset 3px 0 0 0 ${theme.accent}` : 'none',
  });

  return (
    <div className="app-shell-height" style={{ width: '100%', display: 'flex', background: theme.pageBg, color: theme.textPrimary, overflow: 'hidden' }}>
      <div
        style={{
          width: sidebarWidth, flexShrink: 0, background: theme.sidebarBg, borderRight: `1px solid ${theme.border}`,
          padding: '20px 14px 16px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', minHeight: 0,
          transition: resizing ? 'none' : 'width 0.15s',
        }}
      >
        <div style={{ height: 46, boxSizing: 'border-box', display: 'flex', alignItems: 'center', padding: '4px 6px', marginBottom: 6 }}>
          <img src={theme.dark ? logoWordmarkDark : logoWordmarkLight} alt="Knowledge Hub" style={{ height: '100%', width: 'auto', maxWidth: '100%', objectFit: 'contain', objectPosition: 'left center' }} />
        </div>
        <span
          style={{
            display: 'inline-flex', alignSelf: 'flex-start', margin: '0 6px 18px', padding: '4px 9px', borderRadius: 20,
            background: theme.accentSoftBg, border: `1px solid ${theme.accent}66`, fontFamily: 'var(--font-mono)', fontSize: 10,
            fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: theme.accentText,
          }}
        >
          {t('backoffice.badge')}
        </span>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 14 }}>
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} style={({ isActive }) => navItemStyle(isActive)}>
              <span style={{ flex: 1 }}>{t(item.labelKey)}</span>
              {item.countKey === 'pendingRequests' && pendingRequests > 0 && (
                <span style={{ background: theme.accent, color: '#fff', fontSize: 10, fontWeight: 800, borderRadius: 20, padding: '1px 7px' }}>
                  {pendingRequests}
                </span>
              )}
            </NavLink>
          ))}
          <NavLink to="/aparencia" style={({ isActive }) => navItemStyle(isActive)}>
            <span style={{ flex: 1 }}>{t('backoffice.navAppearance')}</span>
          </NavLink>
        </div>

        <div
          onClick={() => setAccountOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, background: theme.subtleBg, marginTop: 10, cursor: 'pointer' }}
        >
          <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: theme.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12.5 }}>
            {userInitials(user?.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
            <div style={{ fontSize: 11, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
          </div>
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', color: theme.textMuted, padding: '10px 6px 0' }}>
          <span style={{ color: theme.accentText, fontWeight: 800 }}>Knowledge</span>Hub &copy; {new Date().getFullYear()} &middot; {t('backoffice.badge')}
        </div>
      </div>

      <div
        onPointerDown={onResizeDown}
        style={{ width: 5, flexShrink: 0, cursor: 'col-resize', background: resizing ? theme.accent : 'transparent', position: 'relative', zIndex: 5, marginLeft: -3, marginRight: -2 }}
      />
      {resizing && <div style={{ position: 'fixed', inset: 0, zIndex: 999, cursor: 'col-resize' }} />}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 32px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }}>
              {activeItem ? t(activeItem.labelKey) : ''}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <NavLink
              to="/pedidos-de-codigo"
              title={t('backoffice.navCodeRequests')}
              style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: theme.subtleBg, color: theme.textPrimary, position: 'relative' }}
            >
              <Icon name="mail" size={16} />
              {pendingRequests > 0 && (
                <span style={{ position: 'absolute', top: -2, right: -2, background: 'oklch(0.6 0.2 25)', color: '#fff', fontSize: 9.5, fontWeight: 800, width: 15, height: 15, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {pendingRequests}
                </span>
              )}
            </NavLink>
            <span
              onClick={logout}
              title={t('common.lockPlatform')}
              style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: theme.accent, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="lock" size={16} color="#fff" />
            </span>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '28px 32px' }}>
          <Outlet context={{ onCodeRequestsChanged: () => window.dispatchEvent(new Event('kh-backoffice:code-requests-changed')) }} />
        </div>
      </div>
      {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}
    </div>
  );
}
