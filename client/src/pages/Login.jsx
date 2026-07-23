import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { translate } from '../i18n/translations.js';
import { getPreAuthLanguage, setPreAuthLanguage } from '../lib/preAuthLanguage.js';
import PreAuthLanguageToggle from '../components/PreAuthLanguageToggle.jsx';
import logoIcon from '../assets/logo-icon.png';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [lang, setLang] = useState(getPreAuthLanguage);
  const t = (path, vars) => translate(lang, path, vars);
  const changeLang = (next) => {
    setLang(next);
    setPreAuthLanguage(next);
  };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || t('login.errDefault'));
    } finally {
      setSubmitting(false);
    }
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
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute', top: '-15%', left: '-10%', width: '60%', height: '70%', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.16) 0%, transparent 70%)',
            filter: 'blur(45px)', animation: 'kh-login-float1 16s ease-in-out infinite',
          }}
        />
        <div
          style={{
            position: 'absolute', bottom: '-20%', right: '-12%', width: '65%', height: '75%', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)',
            filter: 'blur(55px)', animation: 'kh-login-float2 20s ease-in-out infinite',
          }}
        />
        <div
          style={{
            position: 'absolute', top: '-20%', left: 0, width: '40%', height: '150%',
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
            filter: 'blur(20px)', animation: 'kh-login-sweep 10s ease-in-out infinite',
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, rgba(10,10,15,0.6) 0%, rgba(10,10,15,0.3) 48%, rgba(10,10,15,0.12) 100%)',
          pointerEvents: 'none',
        }}
      />
      <PreAuthLanguageToggle lang={lang} onChange={changeLang} />
      <div
        style={{
          position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 40, padding: '40px 6vw', flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 380px', maxWidth: 540, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={logoIcon} alt="" style={{ height: 26, width: 'auto', filter: 'brightness(0) invert(1)' }} />
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {t('login.tagline')}
            </div>
          </div>
          <div style={{ fontSize: 'clamp(32px, 4.4vw, 54px)', fontWeight: 800, lineHeight: 1.06, letterSpacing: '-0.02em' }}>
            {t('login.heroTitle')}<br />{t('login.heroTitle2')}
          </div>
          <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.82)', maxWidth: 420, lineHeight: 1.55 }}>
            {t('login.heroDesc')}
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          style={{
            width: 380, maxWidth: '100%', flexShrink: 0, background: 'rgba(255,255,255,0.14)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.28)', borderRadius: 22, padding: '34px 30px',
            display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center', textAlign: 'center',
            boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{t('login.welcomeBack')}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{t('login.signInTo')}</div>
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{t('login.email')}</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              placeholder={t('login.emailPlaceholder')}
              style={{
                border: 'none', borderRadius: 11, padding: '13px 14px', fontSize: 14,
                background: 'rgba(255,255,255,0.94)', color: '#1a1a1a', outline: 'none', width: '100%',
              }}
            />
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{t('login.password')}</div>
            <div style={{ position: 'relative', display: 'flex', width: '100%' }}>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={reveal ? 'text' : 'password'}
                required
                placeholder={t('login.passwordPlaceholder')}
                style={{
                  flex: 1, border: 'none', borderRadius: 11, padding: '13px 42px 13px 14px', fontSize: 14,
                  background: 'rgba(255,255,255,0.94)', color: '#1a1a1a', outline: 'none',
                }}
              />
              <span
                onClick={() => setReveal((v) => !v)}
                style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', opacity: 0.55, fontSize: 12, color: '#1a1a1a', fontWeight: 700 }}
              >
                {reveal ? t('login.hide') : t('login.show')}
              </span>
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 12, color: 'oklch(0.8 0.16 25)', fontWeight: 600, alignSelf: 'flex-start' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              background: 'oklch(0.55 0.19 290)', color: '#fff', border: 'none', borderRadius: 11,
              padding: '14px 14px', fontWeight: 700, fontSize: 13.5, letterSpacing: '0.04em',
              textTransform: 'uppercase', cursor: submitting ? 'default' : 'pointer', width: '100%',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? t('login.signingIn') : t('login.signIn')}
          </button>

          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.75)' }}>
            {t('login.noAccount')}{' '}
            <Link to="/register" style={{ color: '#fff', fontWeight: 700 }}>
              {t('login.createOne')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
