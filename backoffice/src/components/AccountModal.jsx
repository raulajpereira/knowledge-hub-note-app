import { useTheme } from '../context/ThemeContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import Icon from './Icon.jsx';
import { backdropClose } from '../lib/backdropClose.js';

function userInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

export default function AccountModal({ onClose }) {
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  return (
    <div
      onMouseDown={backdropClose(onClose)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 360, maxWidth: '100%', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
          borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 18, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, background: theme.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>
            {userInitials(user?.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
            <div style={{ fontSize: 12.5, color: theme.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
          </div>
        </div>

        <span
          style={{
            display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800,
            letterSpacing: '0.04em', textTransform: 'uppercase', borderRadius: 6, padding: '4px 9px',
            color: theme.accentText, background: theme.accentSoftBg, border: `1px solid ${theme.accent}66`,
          }}
        >
          <Icon name="shield" size={11} color="currentColor" /> super_admin
        </span>

        <button
          onClick={logout}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'transparent',
            border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 10, padding: '11px 14px',
            fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
          }}
        >
          <Icon name="logout" size={15} /> {t('account.logout')}
        </button>
      </div>
    </div>
  );
}
