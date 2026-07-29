import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

// Colored combobox: shows a dot + label for the current value, and opens a
// panel of dot+label options on click. Used wherever a plain <select> would
// lose the per-option color coding (native <option> styling is unreliable
// across browsers), e.g. Issues status/priority.
export default function ColorSelect({ value, options, onChange, theme, placeholder = '—' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const current = options.find((o) => o.value === value);
  const hue = current?.hue ?? 220;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none',
          border: `1px solid ${current ? `oklch(0.90 0.11 ${hue})` : theme.border}`, borderRadius: 8, padding: '7px 10px',
          background: current ? `oklch(0.90 0.11 ${hue})` : theme.cardBg, fontSize: 12.5, fontWeight: 700,
          color: current ? `oklch(0.32 0.17 ${hue})` : theme.textMuted,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: `oklch(0.55 0.20 ${hue})`, flexShrink: 0, opacity: current ? 1 : 0.4 }} />
        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{current?.label || placeholder}</span>
        <span style={{ display: 'flex', flexShrink: 0, transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
          <Icon name="chevron" size={12} strokeWidth={2.2} color={current ? `oklch(0.32 0.17 ${hue})` : theme.textMuted} />
        </span>
      </div>
      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30,
            background: theme.dark ? 'oklch(0.22 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`, borderRadius: 10, padding: 4,
            boxShadow: '0 12px 30px rgba(0,0,0,0.28)', maxHeight: 240, overflowY: 'auto',
          }}
        >
          {options.map((o) => (
            <div
              key={o.value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 7, cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600, color: theme.textPrimary,
                background: o.value === value ? theme.accentSoftBg : 'transparent',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: `oklch(0.55 0.20 ${o.hue})`, flexShrink: 0 }} />
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
