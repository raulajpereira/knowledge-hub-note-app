import Link from 'next/link';
import { CATALOG } from './catalog';

export default function CatalogIndex() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: '-.03em' }}>Componentes</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)' }}>
          Fundações de UI da v2, recriadas a partir dos protótipos em docs/handoff/design.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
        {CATALOG.map((c) => (
          <Link
            key={c.slug}
            href={`/ui/${c.slug}`}
            className="kh-glass kh-glass--card"
            style={{
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              textDecoration: 'none',
              minHeight: 120,
            }}
          >
            <span style={{ fontSize: 17, fontWeight: 600 }}>{c.title}</span>
            <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-2)' }}>{c.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
