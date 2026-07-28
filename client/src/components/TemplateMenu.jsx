import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { useClickOutside } from '../lib/useClickOutside.js';

// Dropdown of saved templates for one entity type (note/task/issue). Picking
// one hands its saved `data` payload back to the caller, which merges it
// into whatever "new X" form/flow it already has — this component doesn't
// know how to create a note/task/issue itself.
export default function TemplateMenu({ entityType, onUse }) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);

  useEffect(() => {
    if (open) api.listTemplates(entityType).then(({ templates }) => setTemplates(templates));
  }, [open, entityType]);

  const remove = async (id, e) => {
    e.stopPropagation();
    await api.deleteTemplate(id);
    setTemplates((prev) => prev.filter((x) => x.id !== id));
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={t('templates.pickerTitle')}
        style={{ display: 'flex', alignItems: 'center', background: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: 9, padding: '9px 12px', cursor: 'pointer', flexShrink: 0 }}
      >
        <Icon name="bookmark" size={16} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: theme.dark ? 'oklch(0.22 0.02 255)' : '#fff', border: `1px solid ${theme.border}`, borderRadius: 10, padding: 6, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 20 }}>
          {templates.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12, color: theme.textMuted }}>{t('templates.none')}</div>}
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              onClick={() => { onUse(tpl); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: theme.textPrimary }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.name}</span>
              <span onClick={(e) => remove(tpl.id, e)} style={{ color: theme.textMuted, flexShrink: 0 }}>&times;</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
