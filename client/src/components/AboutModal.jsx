import Icon from './Icon.jsx';
import logoIcon from '../assets/logo-icon.png';
import { backdropClose } from '../lib/backdropClose.js';

const APP_VERSION = '1.0.0';
const MANUAL_URL = '/manual/index.html';
const MANUAL_PDF_BY_LANG = {
  pt: { href: '/manual/Knowledge-Hub-Manual-PT.pdf', filename: 'Knowledge-Hub-Manual-PT.pdf' },
  en: { href: '/manual/Knowledge-Hub-Manual-EN.pdf', filename: 'Knowledge-Hub-Manual-EN.pdf' },
};

export default function AboutModal({ theme, t, lang, onClose }) {
  return (
    <div
      onMouseDown={backdropClose(onClose)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 340, maxWidth: '100%', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
          borderRadius: 20, padding: '36px 28px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          boxShadow: '0 24px 70px rgba(0,0,0,0.45)', textAlign: 'center', position: 'relative',
        }}
      >
        <span
          onClick={onClose}
          style={{ position: 'absolute', top: 14, right: 14, cursor: 'pointer', opacity: 0.5, color: theme.textPrimary, fontSize: 18, lineHeight: 1 }}
        >
          ×
        </span>
        <div
          style={{
            width: 64, height: 64, borderRadius: 18, background: '#fff', border: `1px solid ${theme.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6, padding: 11,
            boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
          }}
        >
          <img src={logoIcon} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <div style={{ fontSize: 19, fontWeight: 800 }}>
          <span style={{ color: theme.accentText }}>{t('common.brand')}</span>{t('common.brandRest')}
        </div>
        <div style={{ fontSize: 12.5, color: theme.textMuted, marginBottom: 14, maxWidth: 260 }}>
          {t('login.heroTitle')} {t('login.heroTitle2')}
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {t('settings.version')} {APP_VERSION}
        </div>

        <div
          onClick={() => window.open(MANUAL_URL, '_blank', 'noopener,noreferrer')}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginTop: 18,
            padding: '10px 10px 10px 12px', borderRadius: 13, background: theme.accentSoftBg,
            border: `1px solid ${theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)'}`,
            cursor: 'pointer', boxSizing: 'border-box', textAlign: 'left',
          }}
        >
          <span
            style={{
              width: 32, height: 32, borderRadius: 9, background: theme.accent, color: '#fff', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="doc" size={16} color="#fff" />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: theme.textPrimary }}>{t('settings.manual')}</div>
            <div style={{ fontSize: 11, color: theme.textMuted }}>{t('settings.manualDesc')}</div>
          </span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              const pdf = MANUAL_PDF_BY_LANG[lang] || MANUAL_PDF_BY_LANG.pt;
              const a = document.createElement('a');
              a.href = pdf.href;
              a.download = pdf.filename;
              a.click();
            }}
            title={t('settings.manualDownload')}
            style={{
              width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: theme.textPrimary, background: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.7)',
            }}
          >
            <Icon name="download" size={15} />
          </span>
        </div>

        <div style={{ fontSize: 13, marginTop: 10 }}>
          {t('settings.developedBy')} <span style={{ fontWeight: 700 }}>Raul Pereira</span>
        </div>
        <div style={{ fontSize: 10.5, color: theme.textMuted, marginTop: 18 }}>&copy; {new Date().getFullYear()} {t('common.brand')}{t('common.brandRest')}</div>
      </div>
    </div>
  );
}
