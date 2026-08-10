import { useState } from 'react';
import { api } from '../api.js';
import { backdropClose } from '../lib/backdropClose.js';

// Pre-auth: no ThemeContext/AuthContext available here, so this styles
// itself directly to match Login.jsx's glass-card look instead of reading
// from useTheme().
export default function RequestCodeModal({ t, onClose }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [area, setArea] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const inputStyle = {
    border: 'none', borderRadius: 11, padding: '12px 14px', fontSize: 14,
    background: 'rgba(255,255,255,0.94)', color: '#1a1a1a', outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.requestInviteCode({ name, email, professionalArea: area, reason });
      setDone(true);
    } catch (err) {
      setError(err.message || t('requestCode.errDefault'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onMouseDown={backdropClose(onClose)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420, maxWidth: '100%', background: 'rgba(40,40,55,0.55)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.28)', borderRadius: 20, padding: '28px 26px',
          display: 'flex', flexDirection: 'column', gap: 16, color: '#fff', boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
        }}
      >
        {done ? (
          <>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{t('requestCode.successTitle')}</div>
            <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>{t('requestCode.successDesc')}</div>
            <button
              onClick={onClose}
              style={{
                background: 'oklch(0.55 0.19 290)', color: '#fff', border: 'none', borderRadius: 11,
                padding: '12px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', marginTop: 4,
              }}
            >
              {t('requestCode.close')}
            </button>
          </>
        ) : (
          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{t('requestCode.title')}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>{t('requestCode.desc')}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{t('requestCode.name')}</div>
              <input value={name} onChange={(e) => setName(e.target.value)} type="text" required maxLength={200} placeholder={t('requestCode.namePlaceholder')} style={inputStyle} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{t('requestCode.email')}</div>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder={t('requestCode.emailPlaceholder')} style={inputStyle} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{t('requestCode.area')}</div>
              <input value={area} onChange={(e) => setArea(e.target.value)} type="text" maxLength={200} placeholder={t('requestCode.areaPlaceholder')} style={inputStyle} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{t('requestCode.reason')}</div>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                maxLength={2000}
                rows={4}
                placeholder={t('requestCode.reasonPlaceholder')}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            {error && (
              <div style={{ fontSize: 12, color: 'oklch(0.8 0.16 25)', fontWeight: 600 }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
              <button
                type="button"
                onClick={onClose}
                style={{ flex: 1, background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 11, padding: '12px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  flex: 1, background: 'oklch(0.55 0.19 290)', color: '#fff', border: 'none', borderRadius: 11,
                  padding: '12px 14px', fontWeight: 700, fontSize: 13, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? t('requestCode.submitting') : t('requestCode.submit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
