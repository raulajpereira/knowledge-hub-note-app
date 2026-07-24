import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useTheme } from './ThemeContext.jsx';
import { useLanguage } from './LanguageContext.jsx';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setRequest(typeof opts === 'string' ? { message: opts } : opts || {});
    });
  }, []);

  const close = (result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && <ConfirmDialog request={request} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ request, onClose }) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  return (
    <div
      onClick={() => onClose(false)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 380, maxWidth: '100%', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
          borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: theme.textPrimary }}>{request.title || t('common.confirmDeleteTitle')}</div>
        <div style={{ fontSize: 13.5, color: theme.textMuted, lineHeight: 1.5 }}>{request.message || t('common.confirmDeleteMessage')}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            onClick={() => onClose(false)}
            style={{ flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() => onClose(true)}
            style={{ flex: 1, background: 'oklch(0.55 0.18 25)', color: '#fff', border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            {request.confirmLabel || t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
