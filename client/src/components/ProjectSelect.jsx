import { useState } from 'react';

// Dropdown of project names (from the Projects page) with an "Other…"
// option that reveals a free-text fallback — for entities (Issues, Tasks)
// whose "project" field is a plain string, not a foreign key.
export default function ProjectSelect({ value, projectNames, onCommit, theme, t, style }) {
  // Whether "Other…" is pinned open by an explicit user pick. Custom mode
  // also applies whenever the value doesn't match the (possibly still
  // loading) project list — computed fresh every render so it can't go
  // stale if projectNames arrives after this component's first render.
  const [forcedCustom, setForcedCustom] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const customMode = forcedCustom || (!!value && !projectNames.includes(value));

  const fieldStyle = style || {
    width: '100%', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px',
    fontSize: 13, background: theme.subtleBg, color: theme.textPrimary, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div>
      <select
        value={customMode ? '__other__' : value || ''}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__other__') {
            setForcedCustom(true);
            setDraft(value || '');
          } else {
            setForcedCustom(false);
            setDraft(v);
            onCommit(v);
          }
        }}
        style={fieldStyle}
      >
        <option value="" style={{ color: '#1a1a1a', background: '#fff' }}>{t('common.projectNone')}</option>
        {projectNames.map((p) => (
          <option key={p} value={p} style={{ color: '#1a1a1a', background: '#fff' }}>{p}</option>
        ))}
        <option value="__other__" style={{ color: '#1a1a1a', background: '#fff' }}>{t('common.projectOther')}</option>
      </select>
      {customMode && (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommit(draft)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder={t('common.projectCustomPlaceholder')}
          style={{ ...fieldStyle, marginTop: 6 }}
        />
      )}
    </div>
  );
}
