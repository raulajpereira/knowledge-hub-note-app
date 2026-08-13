import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { FONT_OPTIONS } from '../../../client/src/styles/theme.js';
import ColorWheel from '../components/ColorWheel.jsx';

export default function Appearance() {
  const { theme, mode, fontFamily, fontScale, radiusStyle, density, setMode, setAccentHue, setFontFamily, setFontScale, setRadiusStyle, setDensity } = useTheme();
  const { t, lang, setLanguage } = useLanguage();

  const card = { background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 18 };
  const segmented = { display: 'flex', background: theme.subtleBg, borderRadius: 9, padding: 3, gap: 3 };
  const segOpt = (active) => ({
    padding: '7px 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    background: active ? theme.cardBg : 'transparent', color: active ? theme.textPrimary : theme.textMuted,
  });

  return (
    <div style={card}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{t('backoffice.appearanceTitle')}</div>
        <div style={{ fontSize: 12, color: theme.textMuted }}>{t('backoffice.appearanceDesc')}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.theme')}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.themeDesc')}</div>
        </div>
        <div style={segmented}>
          {['dark', 'light'].map((m) => (
            <div key={m} onClick={() => setMode(m)} style={segOpt(mode === m)}>{t(`settings.${m}`)}</div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.accentColor')}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>{t('backoffice.accentColorDesc')}</div>
        </div>
        <ColorWheel hue={theme.hue} onChange={setAccentHue} title={t('settings.colorWheelHint')} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.font')}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.fontDesc')}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FONT_OPTIONS.map((f) => {
            const active = (fontFamily || 'inter') === f.id;
            return (
              <div
                key={f.id}
                onClick={() => setFontFamily(f.id)}
                style={{
                  padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  background: active ? theme.accentSoftBg : theme.subtleBg, color: active ? theme.accentText : theme.textMuted, fontFamily: f.display,
                }}
              >
                {t(`settings.font${f.id.charAt(0).toUpperCase()}${f.id.slice(1)}`)}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.fontScale')}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.fontScaleDesc')}</div>
        </div>
        <div style={segmented}>
          {['small', 'medium', 'large'].map((s) => (
            <div key={s} onClick={() => setFontScale(s)} style={segOpt((fontScale || 'medium') === s)}>
              {t(`settings.fontScale${s.charAt(0).toUpperCase()}${s.slice(1)}`)}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.radiusStyle')}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.radiusStyleDesc')}</div>
        </div>
        <div style={segmented}>
          {['sharp', 'default', 'round'].map((s) => (
            <div key={s} onClick={() => setRadiusStyle(s)} style={segOpt((radiusStyle || 'default') === s)}>
              {t(`settings.radiusStyle${s.charAt(0).toUpperCase()}${s.slice(1)}`)}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.density')}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.densityDesc')}</div>
        </div>
        <div style={segmented}>
          {['comfortable', 'compact'].map((s) => (
            <div key={s} onClick={() => setDensity(s)} style={segOpt((density || 'comfortable') === s)}>
              {t(`settings.density${s.charAt(0).toUpperCase()}${s.slice(1)}`)}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t('settings.language')}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>{t('backoffice.languageDesc')}</div>
        </div>
        <div style={segmented}>
          {['pt', 'en'].map((l) => (
            <div key={l} onClick={() => setLanguage(l)} style={segOpt(lang === l)}>{l.toUpperCase()}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
