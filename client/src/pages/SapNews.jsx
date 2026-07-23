import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';

export default function SapNews() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.getSapNews().then(({ items }) => {
      setItems(items);
      setLoading(false);
    });
  }, []);

  if (loading) return <div style={{ padding: 28, color: theme.textMuted }}>{t('common.loading')}</div>;

  return (
    <div style={{ padding: '24px 28px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, overflowY: 'auto' }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{t('sapNews.title')}</div>

      {items.length === 0 && <div style={{ fontSize: 13, color: theme.textMuted }}>{t('sapNews.empty')}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => setSelected(item)}
            style={{
              background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: 'hidden',
              cursor: 'pointer', display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ width: '100%', height: 150, background: theme.subtleBg, flexShrink: 0 }}>
              {item.image ? (
                <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="news" size={28} color={theme.textMuted} />
                </div>
              )}
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.accentText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {item.source}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>{item.title}</div>
              <div style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {item.summary}
              </div>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 620, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff',
              border: `1px solid ${theme.border}`, borderRadius: 16, display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            {selected.image && (
              <img src={selected.image} alt="" style={{ width: '100%', maxHeight: 260, objectFit: 'cover', display: 'block' }} />
            )}
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: theme.accentText, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                    {selected.source}
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.3 }}>{selected.title}</div>
                </div>
                <span onClick={() => setSelected(null)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 20, padding: '0 2px', flexShrink: 0 }}>
                  &times;
                </span>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.7, color: theme.textPrimary, whiteSpace: 'pre-wrap' }}>
                {selected.content || selected.summary}
              </div>
              <a
                href={selected.link}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: theme.accent, color: '#fff',
                  border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'none',
                }}
              >
                <Icon name="external" size={14} color="#fff" /> {t('sapNews.readFull')}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
