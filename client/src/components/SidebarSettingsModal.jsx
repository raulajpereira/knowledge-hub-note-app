import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { resolveSidebarLayout, sidebarItemLabel } from '../lib/sidebarItems.js';
import { translate } from '../i18n/translations.js';

export default function SidebarSettingsModal({ theme, t, lang, onClose }) {
  const { user, updateUserSettings } = useAuth();
  const [items, setItems] = useState(() => resolveSidebarLayout(user?.settings?.sidebarLayout));
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [saving, setSaving] = useState(false);

  const toggleHidden = (key) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, hidden: !i.hidden } : i)));
  };

  const setLabel = (key, field, value) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
  };

  const onDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(draggedIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDraggedIndex(index);
  };

  const save = async () => {
    setSaving(true);
    try {
      const sidebarLayout = items.map((i) => ({ key: i.key, hidden: !!i.hidden, labelPt: i.labelPt, labelEn: i.labelEn }));
      const { settings } = await api.updateSettings({ sidebarLayout });
      updateUserSettings(settings);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: theme.dark ? 'oklch(0.17 0.02 255)' : '#ffffff', border: `1px solid ${theme.border}`,
          borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{t('sidebarSettings.title')}</div>
          <div style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 2 }}>{t('sidebarSettings.subtitle')}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {items.map((item, index) => (
            <div
              key={item.key}
              draggable={editingKey !== item.key}
              onDragStart={() => setDraggedIndex(index)}
              onDragOver={(e) => onDragOver(e, index)}
              onDragEnd={() => setDraggedIndex(null)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 8px', borderRadius: 9,
                background: draggedIndex === index ? theme.accentSoftBg : theme.subtleBg,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: item.hidden ? 0.55 : 1 }}>
                <span style={{ cursor: 'grab', color: theme.textMuted, fontSize: 14, letterSpacing: '-2px', flexShrink: 0, userSelect: 'none' }}>⠿⠿</span>
                <span style={{ display: 'flex', flexShrink: 0, opacity: 0.75 }}>
                  <Icon name={item.icon} size={15} color={theme.textPrimary} />
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {sidebarItemLabel(item, lang, t)}
                </span>
                <span
                  onClick={() => setEditingKey((v) => (v === item.key ? null : item.key))}
                  title={t('sidebarSettings.rename')}
                  style={{ cursor: 'pointer', color: editingKey === item.key ? theme.accentText : theme.textMuted, display: 'flex', flexShrink: 0, opacity: 0.85 }}
                >
                  <Icon name="edit" size={14} />
                </span>
                <span
                  onClick={() => toggleHidden(item.key)}
                  style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0, cursor: 'pointer',
                    border: `1.5px solid ${!item.hidden ? theme.accent : theme.border}`,
                    background: !item.hidden ? theme.accent : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {!item.hidden && <Icon name="check" size={11} color="#fff" strokeWidth={3} />}
                </span>
              </div>

              {editingKey === item.key && (
                <div style={{ display: 'flex', gap: 8, paddingLeft: 24 }}>
                  <input
                    value={item.labelPt || ''}
                    onChange={(e) => setLabel(item.key, 'labelPt', e.target.value)}
                    placeholder={translate('pt', `nav.${item.key}`)}
                    style={{ flex: 1, minWidth: 0, border: `1px solid ${theme.border}`, borderRadius: 7, padding: '6px 9px', fontSize: 12, background: theme.cardBg, color: theme.textPrimary, outline: 'none' }}
                  />
                  <input
                    value={item.labelEn || ''}
                    onChange={(e) => setLabel(item.key, 'labelEn', e.target.value)}
                    placeholder={translate('en', `nav.${item.key}`)}
                    style={{ flex: 1, minWidth: 0, border: `1px solid ${theme.border}`, borderRadius: 7, padding: '6px 9px', fontSize: 12, background: theme.cardBg, color: theme.textPrimary, outline: 'none' }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textPrimary, borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={save}
            disabled={saving}
            style={{ flex: 1, background: theme.accent, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 14px', fontWeight: 700, fontSize: 13, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
