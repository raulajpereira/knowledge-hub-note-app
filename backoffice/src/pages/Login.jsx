import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import PreAuthLanguageToggle from '../components/PreAuthLanguageToggle.jsx';
import logoIcon from '../assets/logo-icon.png';

export default function Login() {
  const { login, completeLogin2fa } = useAuth();
  const navigate = useNavigate();
  const { t, lang, setLanguage } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingToken, setPendingToken] = useState(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result?.requires2fa) {
        setPendingToken(result.pendingToken);
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err.message === 'backoffice.notSuperAdmin' ? t('backoffice.notSuperAdmin') : err.message || t('login.errDefault'));
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit2fa = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await completeLogin2fa(
        useBackupCode ? { pendingToken, backupCode: twoFaCode } : { pendingToken, code: twoFaCode }
      );
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message === 'backoffice.notSuperAdmin' ? t('backoffice.notSuperAdmin') : err.message || t('login.errDefault'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', width: '100%', position: 'relative', overflowY: 'auto', color: '#fff' }}>
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(160deg, oklch(0.26 0.028 55) 0%, oklch(0.175 0.022 50) 45%, oklch(0.10 0.015 42) 100%)',
          backgroundSize: '180% 180%', animation: 'kh-login-drift 24s ease-in-out infinite',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute', top: '-15%', left: '-10%', width: '60%', height: '70%', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.10) 0%, transparent 70%)',
            filter: 'blur(45px)', animation: 'kh-login-float1 16s ease-in-out infinite',
          }}
        />
        <div
          style={{
            position: 'absolute', bottom: '-20%', right: '-12%', width: '65%', height: '75%', borderRadius: '50%',
            background: 'radial-gradient(circle, oklch(0.74 0.16 70 / 0.16) 0%, transparent 70%)',
            filter: 'blur(55px)', animation: 'kh-login-float2 20s ease-in-out infinite',
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(90deg, rgba(6,7,10,0.62) 0%, rgba(6,7,10,0.3) 48%, rgba(6,7,10,0.12) 100%)',
        }}
      />
      <PreAuthLanguageToggle lang={lang} onChange={setLanguage} />
      <div
        style={{
          position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 40, padding: '46px 6vw 40px', flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 380px', maxWidth: 540, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <img src={logoIcon} alt="" style={{ height: 26, width: 'auto', alignSelf: 'flex-start', filter: 'brightness(0) invert(1)' }} />
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 4.4vw, 54px)', fontWeight: 800, lineHeight: 1.06, letterSpacing: '-0.02em' }}>
            {t('backoffice.heroTitle')}<br />{t('backoffice.heroTitle2')}
          </div>
        </div>

        <form
          onSubmit={pendingToken ? onSubmit2fa : onSubmit}
          style={{
            width: 380, maxWidth: '100%', flexShrink: 0, background: 'rgba(255,255,255,0.10)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid oklch(0.74 0.16 70 / 0.32)', borderRadius: 22, padding: '34px 30px',
            display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center', textAlign: 'center',
            boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
          }}
        >
          {pendingToken ? (
            <>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{t('login.twoFaTitle')}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                  {useBackupCode ? t('login.twoFaBackupDesc') : t('login.twoFaDesc')}
                </div>
              </div>
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
                <input
                  value={twoFaCode}
                  onChange={(e) => setTwoFaCode(e.target.value)}
                  type="text"
                  autoFocus
                  required
                  placeholder={useBackupCode ? t('login.twoFaBackupPlaceholder') : t('login.twoFaPlaceholder')}
                  style={{
                    border: 'none', borderRadius: 11, padding: '13px 14px', fontSize: useBackupCode ? 14 : 20,
                    letterSpacing: useBackupCode ? 'normal' : '0.3em', textAlign: 'center', fontFamily: 'var(--font-mono)',
                    background: 'rgba(255,255,255,0.94)', color: '#1a1a1a', outline: 'none', width: '100%', boxSizing: 'border-box',
                  }}
                />
              </div>
              {error && <div style={{ fontSize: 12, color: 'oklch(0.8 0.16 25)', fontWeight: 600, alignSelf: 'flex-start' }}>{error}</div>}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  background: 'oklch(0.74 0.16 70)', color: '#241300', border: 'none', borderRadius: 11,
                  padding: '14px 14px', fontWeight: 800, fontSize: 13.5, letterSpacing: '0.04em',
                  textTransform: 'uppercase', cursor: submitting ? 'default' : 'pointer', width: '100%', opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? t('login.signingIn') : t('login.verifyCode')}
              </button>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.75)' }}>
                <span
                  onClick={() => { setUseBackupCode((v) => !v); setTwoFaCode(''); setError(''); }}
                  style={{ color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                >
                  {useBackupCode ? t('login.useCodeInstead') : t('login.useBackupCodeInstead')}
                </span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{t('backoffice.signInTitle')}</div>

              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{t('login.email')}</div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                  placeholder={t('login.emailPlaceholder')}
                  style={{ border: 'none', borderRadius: 11, padding: '13px 14px', fontSize: 14, background: 'rgba(255,255,255,0.94)', color: '#1a1a1a', outline: 'none', width: '100%' }}
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
                    style={{ flex: 1, border: 'none', borderRadius: 11, padding: '13px 42px 13px 14px', fontSize: 14, background: 'rgba(255,255,255,0.94)', color: '#1a1a1a', outline: 'none' }}
                  />
                  <span
                    onClick={() => setReveal((v) => !v)}
                    style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', opacity: 0.55, fontSize: 12, color: '#1a1a1a', fontWeight: 700 }}
                  >
                    {reveal ? t('login.hide') : t('login.show')}
                  </span>
                </div>
              </div>

              {error && <div style={{ fontSize: 12, color: 'oklch(0.8 0.16 25)', fontWeight: 600, alignSelf: 'flex-start' }}>{error}</div>}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  background: 'oklch(0.74 0.16 70)', color: '#241300', border: 'none', borderRadius: 11,
                  padding: '14px 14px', fontWeight: 800, fontSize: 13.5, letterSpacing: '0.04em',
                  textTransform: 'uppercase', cursor: submitting ? 'default' : 'pointer', width: '100%', opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? t('login.signingIn') : t('backoffice.signIn')}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
