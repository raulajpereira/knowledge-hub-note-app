import { FEATURE_KEYS } from '../../../client/src/lib/features.js';

export default function FeatureCheckboxGrid({ theme, t, selected, onToggle }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
      {FEATURE_KEYS.map((key) => (
        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 8, background: theme.subtleBg, cursor: 'pointer' }}>
          <input type="checkbox" checked={selected.has(key)} onChange={() => onToggle(key)} />
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{t(`nav.${key}`)}</span>
        </label>
      ))}
    </div>
  );
}

export { FEATURE_KEYS };
