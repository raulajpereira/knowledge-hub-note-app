import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { api } from '../api.js';

export default function NewsTicker() {
  const { theme } = useTheme();
  const { lang } = useLanguage();
  const [items, setItems] = useState([]);

  useEffect(() => {
    api.getNews().then(({ items }) => setItems(items)).catch(() => {});
  }, []);

  if (items.length === 0) return null;

  const looped = items.concat(items);
  const tickerBg = theme.dark ? 'oklch(0.13 0.02 255)' : `oklch(0.93 0.025 ${theme.hue})`;
  const tickerText = theme.dark ? 'oklch(0.85 0.01 255)' : 'oklch(0.32 0.015 280)';
  const dotColor = theme.dark ? 'oklch(0.5 0.02 255)' : 'oklch(0.65 0.015 280)';
  const durationSec = Math.max(30, items.length * 5);

  return (
    <div style={{ flexShrink: 0, height: 30, background: tickerBg, display: 'flex', alignItems: 'center', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
      <div
        style={{
          flexShrink: 0, padding: '0 12px', height: '100%', display: 'flex', alignItems: 'center',
          background: theme.accent, color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', zIndex: 1,
        }}
      >
        {lang === 'pt' ? 'ÚLTIMAS' : 'LATEST'}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', height: '100%', position: 'relative' }}>
        <div
          style={{
            position: 'absolute', top: 0, left: 0, height: '100%', display: 'flex', alignItems: 'center', gap: 40,
            whiteSpace: 'nowrap', animation: `kh-ticker-scroll ${durationSec}s linear infinite`,
          }}
        >
          {looped.map((item, i) => (
            <a
              key={i}
              href={item.link}
              target="_blank"
              rel="noreferrer"
              style={{ color: tickerText, fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 7 }}
            >
              <span style={{ color: theme.accentText, fontWeight: 800, letterSpacing: '0.04em' }}>{item.source}</span>
              {item.text}
              <span style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: dotColor, flexShrink: 0, marginLeft: 34 }} />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
