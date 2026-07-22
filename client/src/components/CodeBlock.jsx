import { useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { highlightCode, tokenColor, LANGUAGES } from '../lib/highlight.js';

export default function CodeBlock({ value, language, onChange, onLanguageChange, onDelete }) {
  const { theme } = useTheme();
  const [editing, setEditing] = useState(true);
  const lines = highlightCode(value, language);

  return (
    <div style={{ background: theme.subtleBg, border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: `1px solid ${theme.border}`, flexWrap: 'wrap' }}>
        {LANGUAGES.map((lo) => (
          <div
            key={lo.id}
            onClick={() => onLanguageChange(lo.id)}
            style={{
              padding: '4px 9px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
              background: language === lo.id ? theme.accentSoftBg : 'transparent',
              color: language === lo.id ? theme.accentText : theme.textMuted,
            }}
          >
            {lo.label}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setEditing((v) => !v)}
          style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 6, padding: '4px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
        >
          {editing ? 'Preview' : 'Edit'}
        </button>
        <span onClick={onDelete} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 16, padding: '0 4px' }}>
          &times;
        </span>
      </div>

      {editing ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={language === 'abap' ? 'Paste your ABAP snippet...' : 'Paste your code...'}
          rows={8}
          style={{ width: '100%', border: 'none', outline: 'none', resize: 'vertical', background: 'transparent', fontSize: 13, lineHeight: 1.6, color: theme.textPrimary, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', padding: 12 }}
        />
      ) : (
        <pre style={{ margin: 0, padding: 12, fontSize: 13, lineHeight: 1.6, overflowX: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
          {lines.map((tokens, i) => (
            <div key={i} style={{ display: 'flex' }}>
              <span style={{ display: 'inline-block', width: 28, flexShrink: 0, textAlign: 'right', marginRight: 12, color: theme.textMuted, opacity: 0.5, userSelect: 'none' }}>
                {i + 1}
              </span>
              <span>
                {tokens.map((t, j) => (
                  <span key={j} style={{ color: tokenColor(t.type, theme.dark) }}>
                    {t.text}
                  </span>
                ))}
                {tokens.length === 0 && ' '}
              </span>
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}
