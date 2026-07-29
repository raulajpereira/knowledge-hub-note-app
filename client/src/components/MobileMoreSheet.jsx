import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';
import { sidebarItemLabel } from '../lib/sidebarItems.js';

function userInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

export default function MobileMoreSheet({ theme, t, lang, user, items, counts, onClose, onOpenAccount, onLogout }) {
  const rowStyle = ({ isActive } = {}) => ({
    display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px',
    textDecoration: 'none', color: isActive ? theme.accentText : theme.textPrimary,
    background: isActive ? theme.accentSoftBg : 'transparent',
  });

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 90, background: theme.pageBg,
        display: 'flex', flexDirection: 'column',
        paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{t('nav.more')}</div>
        <span onClick={onClose} style={{ fontSize: 22, lineHeight: 1, color: theme.textMuted, cursor: 'pointer', padding: 4 }}>
          &times;
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div
          onClick={() => { onClose(); onOpenAccount(); }}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', cursor: 'pointer', borderBottom: `1px solid ${theme.border}` }}
        >
          <div
            style={{
              width: 42, height: 42, borderRadius: '50%', flexShrink: 0, background: theme.accent,
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, overflow: 'hidden',
            }}
          >
            {user?.settings?.avatarUrl ? (
              <img src={user.settings.avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              userInitials(user?.name)
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
            <div style={{ fontSize: 12, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
          </div>
          <Icon name="external" size={15} color={theme.textMuted} />
        </div>

        <div style={{ padding: '6px 0' }}>
          {items.map((item) => (
            <NavLink key={item.key} to={item.to} end={!!item.end} onClick={onClose} style={rowStyle}>
              <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={item.icon} size={18} />
              </span>
              <span style={{ fontSize: 14.5, fontWeight: 500, flex: 1, minWidth: 0 }}>{sidebarItemLabel(item, lang, t)}</span>
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
          ))}
          <NavLink to="/trash" onClick={onClose} style={rowStyle}>
            <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="trash" size={18} />
            </span>
            <span style={{ fontSize: 14.5, fontWeight: 500, flex: 1 }}>{t('nav.trash')}</span>
            {counts.trash > 0 && (
              <span style={{ fontSize: 10.5, fontWeight: 700, flexShrink: 0, padding: '1px 7px', borderRadius: 20, background: theme.subtleBg, color: theme.textMuted }}>
                {counts.trash}
              </span>
            )}
          </NavLink>
          <NavLink to="/settings" onClick={onClose} style={rowStyle}>
            <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="settings" size={18} />
            </span>
            <span style={{ fontSize: 14.5, fontWeight: 500, flex: 1 }}>{t('nav.settings')}</span>
          </NavLink>
        </div>

        <div
          onClick={() => { onClose(); onLogout(); }}
          style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', cursor: 'pointer', color: 'oklch(0.6 0.18 25)' }}
        >
          <span style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="logout" size={18} color="oklch(0.6 0.18 25)" />
          </span>
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>{t('nav.logout')}</span>
        </div>
      </div>
    </div>
  );
}
