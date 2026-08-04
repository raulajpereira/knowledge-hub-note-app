import { useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import Icon from './Icon.jsx';
import AutoResizeTextarea from './AutoResizeTextarea.jsx';

export default function TerminalBlock({ value, onChange, onDelete }) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(value || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ background: '#0d1117', border: `1px solid ${theme.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span style={{ display: 'flex', gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ff5f57' }} />
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#febc2e' }} />
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#28c840' }} />
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.03em' }}>
          {t('notes.terminal')}
        </span>
        <div style={{ flex: 1 }} />
        <span onClick={copy} title="Copy" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: copied ? '#28c840' : 'rgba(255,255,255,0.5)', padding: '2px 4px' }}>
          <Icon name={copied ? 'check' : 'copy'} size={14} />
        </span>
        <span onClick={onDelete} style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 16, padding: '0 4px' }}>
          &times;
        </span>
      </div>
      <AutoResizeTextarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('notes.terminalPlaceholder')}
        style={{
          width: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 13, lineHeight: 1.6,
          color: '#c9d1d9', fontFamily: 'var(--font-mono)', padding: 12, boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
