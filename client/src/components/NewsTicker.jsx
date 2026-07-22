import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { api } from '../api.js';

export default function NewsTicker() {
  const { theme } = useTheme();
  const [items, setItems] = useState([]);

  useEffect(() => {
    api.getNews().then(({ items }) => setItems(items)).catch(() => {});
  }, []);

  if (items.length === 0) return null;

  const looped = items.concat(items);
  const tickerBg = theme.dark ? 'oklch(0.12 0.02 280)' : 'oklch(0.2 0.02 280)';
  const durationSec = Math.max(30, items.length * 5);

  return (
    <div style={{ flexShrink: 0, height: 36, background: tickerBg, display: 'flex', alignItems: 'center', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
      <div
        style={{
          flexShrink: 0, padding: '0 14px', height: '100%', display: 'flex', alignItems: 'center',
          background: theme.accent, color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', zIndex: 1,
        }}
      >
        LATEST
      </div>
      <div style={{ flex: 1, overflow: 'hidden', height: '100%', position: 'relative' }}>
        <div
          style={{
            position: 'absolute', top: 0, left: 0, height: '100%', display: 'flex', alignItems: 'center', gap: 48,
            whiteSpace: 'nowrap', animation: `kh-ticker-scroll ${durationSec}s linear infinite`,
          }}
        >
          {looped.map((item, i) => (
            <a
              key={i}
              href={item.link}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'oklch(0.85 0.006 280)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span style={{ color: 'oklch(0.78 0.15 300)', fontWeight: 800, letterSpacing: '0.04em' }}>{item.source}</span>
              {item.text}
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'oklch(0.5 0.02 280)', flexShrink: 0, marginLeft: 40 }} />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
