export default function PreAuthLanguageToggle({ lang, onChange }) {
  return (
    <div
      style={{
        position: 'absolute', top: 20, right: 24, zIndex: 2, display: 'flex', background: 'rgba(255,255,255,0.14)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.28)',
        borderRadius: 8, padding: 3, gap: 2,
      }}
    >
      {['pt', 'en'].map((l) => (
        <div
          key={l}
          onClick={() => onChange(l)}
          style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase',
            background: lang === l ? 'rgba(255,255,255,0.9)' : 'transparent',
            color: lang === l ? '#1a1a1a' : 'rgba(255,255,255,0.85)',
          }}
        >
          {l}
        </div>
      ))}
    </div>
  );
}
