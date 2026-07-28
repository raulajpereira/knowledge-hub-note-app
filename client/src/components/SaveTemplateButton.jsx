import { useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { api } from '../api.js';
import Icon from './Icon.jsx';

// Inline "save current item as a template" control — an icon that expands
// into a name field + confirm, rather than a browser prompt() (which reads
// as jarring next to the rest of the app's popups).
export default function SaveTemplateButton({ entityType, getData }) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    await api.createTemplate({ entityType, name: name.trim(), data: getData() });
    setSaved(true);
    setOpen(false);
    setName('');
    setTimeout(() => setSaved(false), 1500);
  };

  if (!open) {
    return (
      <span onClick={() => setOpen(true)} title={t('templates.saveAsTemplate')} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: saved ? 'oklch(0.55 0.15 145)' : theme.textMuted }}>
        <Icon name="bookmark" size={14} color={saved ? 'oklch(0.55 0.15 145)' : theme.textMuted} />
        {saved ? t('templates.saved') : t('templates.saveAsTemplate')}
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setOpen(false); }}
        placeholder={t('templates.namePlaceholder')}
        autoFocus
        style={{ border: `1px solid ${theme.border}`, borderRadius: 7, padding: '5px 8px', fontSize: 12, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', width: 140 }}
      />
      <span onClick={save} style={{ cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: theme.accentText }}>{t('common.save')}</span>
      <span onClick={() => setOpen(false)} style={{ cursor: 'pointer', fontSize: 11.5, color: theme.textMuted }}>{t('common.cancel')}</span>
    </div>
  );
}
