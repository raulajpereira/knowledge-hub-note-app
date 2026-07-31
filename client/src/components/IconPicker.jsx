import { useRef, useState } from 'react';
import { useClickOutside } from '../lib/useClickOutside.js';

const EMOJI_GROUPS = [
  ['📄', '📝', '📋', '📁', '📂', '🗂️', '📌', '📎', '🔖', '🏷️'],
  ['💼', '🏢', '🏭', '🏦', '🏗️', '🌐', '🔧', '⚙️', '🛠️', '🧰'],
  ['✅', '☑️', '🚩', '⭐', '🔥', '💡', '🎯', '📊', '📈', '📉'],
  ['🖥️', '💻', '🖨️', '☁️', '🔌', '🔐', '🔑', '🛡️', '🐞', '🧩'],
  ['👤', '👥', '🤝', '📞', '✉️', '📧', '💬', '🗓️', '⏰', '📅'],
  ['🇵🇹', '🇩🇪', '🇺🇸', '🇬🇧', '🇪🇸', '🇫🇷', '🚀', '🌟', '✨', '🎉'],
];

export default function IconPicker({ theme, t, value, onChange, size = 30, fallback, triggerStyle, align = 'left' }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <div
        onClick={(e) => {
          e.stopPropagation();
          setCustom('');
          setOpen((v) => !v);
        }}
        title={t('common.changeIcon')}
        style={{
          width: size, height: size, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.6, cursor: 'pointer', flexShrink: 0, lineHeight: 1, ...triggerStyle,
        }}
      >
        {value || fallback}
      </div>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', [align]: 0, zIndex: 60, width: 244,
            background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
            borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.3)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {EMOJI_GROUPS.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 4 }}>
                {row.map((emoji) => (
                  <div
                    key={emoji}
                    onClick={() => {
                      onChange(emoji);
                      setOpen(false);
                    }}
                    style={{
                      flex: 1, aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, borderRadius: 6, cursor: 'pointer', background: value === emoji ? theme.accentSoftBg : 'transparent',
                    }}
                  >
                    {emoji}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, borderTop: `1px solid ${theme.border}`, paddingTop: 10 }}>
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && custom.trim()) {
                  onChange(custom.trim());
                  setOpen(false);
                }
              }}
              placeholder={t('common.customIconPlaceholder')}
              style={{ flex: 1, minWidth: 0, border: `1px solid ${theme.border}`, borderRadius: 7, padding: '6px 9px', fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none' }}
            />
            <button
              onClick={() => {
                if (!custom.trim()) return;
                onChange(custom.trim());
                setOpen(false);
              }}
              disabled={!custom.trim()}
              style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '0 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: custom.trim() ? 1 : 0.5 }}
            >
              {t('common.use')}
            </button>
          </div>

          {value && (
            <div
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: theme.textMuted, cursor: 'pointer', padding: '2px 0' }}
            >
              {t('common.removeIcon')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
