import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import Icon from '../components/Icon.jsx';

export default function NoAccess({ feature }) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', gap: 14, padding: 24, textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: theme.subtleBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="lock" size={26} color={theme.textMuted} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{t('noAccess.title')}</div>
      <div style={{ fontSize: 13.5, color: theme.textMuted, maxWidth: 380 }}>
        {t('noAccess.descFeature', { feature: t(`nav.${feature}`) })}
      </div>
      <button
        onClick={() => navigate('/')}
        style={{ marginTop: 6, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 20px', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}
      >
        {t('noAccess.backHome')}
      </button>
    </div>
  );
}
