import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { translate } from '../i18n/translations.js';
import { getPreAuthLanguage, setPreAuthLanguage } from '../lib/preAuthLanguage.js';
import PreAuthLanguageToggle from '../components/PreAuthLanguageToggle.jsx';
import Icon from '../components/Icon.jsx';
import logoIcon from '../assets/logo-icon.png';

export default function SuspendedAccount() {
  const { logout } = useAuth();
  const [lang, setLang] = useState(getPreAuthLanguage);
  const t = (path, vars) => translate(lang, path, vars);
  const changeLang = (next) => {
    setLang(next);
    setPreAuthLanguage(next);
  };

  return (
    <div style={{ minHeight: '100vh', width: '100%', position: 'relative', overflowY: 'auto', color: '#fff' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(160deg, oklch(0.32 0.05 250) 0%, oklch(0.24 0.04 260) 45%, oklch(0.16 0.03 280) 100%)',
          backgroundSize: '180% 180%',
          animation: 'kh-login-drift 24s ease-in-out infinite',
        }}
      />
      <PreAuthLanguageToggle lang={lang} onChange={changeLang} />
      <div
        style={{
          position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: '40px 6vw',
        }}
      >
        <div
          style={{
            width: 440, maxWidth: '100%', background: 'rgba(255,255,255,0.14)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.28)', borderRadius: 22, padding: '38px 34px',
            display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center', textAlign: 'center',
            boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
          }}
        >
          <img src={logoIcon} alt="" style={{ height: 28, width: 'auto', filter: 'brightness(0) invert(1)' }} />

          <div
            style={{
              width: 64, height: 64, borderRadius: '50%', background: 'oklch(0.6 0.16 50 / 0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <Icon name="lock" size={28} color="oklch(0.82 0.14 60)" />
          </div>

          <div>
            <div style={{ fontSize: 19, fontWeight: 800 }}>{t('suspended.title')}</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.82)', marginTop: 8, lineHeight: 1.55 }}>
              {t('suspended.message')}
            </div>
          </div>

          <div
            style={{
              width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 12, padding: '12px 14px', fontSize: 12.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5,
            }}
          >
            {t('suspended.contactAdmin')}
          </div>

          <button
            onClick={logout}
            style={{
              background: 'rgba(255,255,255,0.16)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 11,
              padding: '13px 14px', fontWeight: 700, fontSize: 13, letterSpacing: '0.03em',
              textTransform: 'uppercase', cursor: 'pointer', width: '100%',
            }}
          >
            {t('suspended.signOut')}
          </button>
        </div>
      </div>
    </div>
  );
}
