import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';

export default function Templates() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [templates, setTemplates] = useState(null);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [editTemplateName, setEditTemplateName] = useState('');

  const card = { background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 18 };

  useEffect(() => {
    api.listDocTemplatesAdmin().then((r) => setTemplates(r.templates));
  }, []);

  const startEditTemplate = (tpl) => {
    setEditingTemplateId(tpl.id);
    setEditTemplateName(tpl.name);
  };

  const commitTemplateRename = async () => {
    const id = editingTemplateId;
    setEditingTemplateId(null);
    if (!id || !editTemplateName.trim()) return;
    const { template } = await api.updateDocTemplate(id, { name: editTemplateName.trim() });
    setTemplates((prev) => prev.map((tpl) => (tpl.id === id ? template : tpl)));
  };

  if (!templates) return null;

  return (
    <div style={card}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{t('settings.templateManagement')}</div>
        <div style={{ fontSize: 12, color: theme.textMuted }}>{t('settings.templateManagementDesc')}</div>
      </div>
      {templates.length === 0 && <div style={{ fontSize: 12.5, color: theme.textMuted }}>{t('settings.noDocTemplatesYet')}</div>}
      {templates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {templates.map((tpl) => (
            <div key={tpl.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, background: theme.subtleBg }}>
              {editingTemplateId === tpl.id ? (
                <input
                  value={editTemplateName}
                  onChange={(e) => setEditTemplateName(e.target.value)}
                  onBlur={commitTemplateRename}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  autoFocus
                  style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, border: `1px solid ${theme.accent}`, borderRadius: 6, padding: '3px 7px', background: theme.cardBg, color: theme.textPrimary, outline: 'none' }}
                />
              ) : (
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tpl.name}</span>
              )}
              <span onClick={() => startEditTemplate(tpl)} title={t('common.edit')} style={{ display: 'flex', opacity: 0.6, cursor: 'pointer', flexShrink: 0 }}>
                <Icon name="edit" size={13} color={theme.textMuted} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
