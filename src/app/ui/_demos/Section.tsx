// Layout helpers for catalogue pages.
export function Page({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: '-.03em' }}>{title}</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)' }}>{desc}</p>
      </div>
      {children}
    </div>
  );
}

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="kh-glass kh-glass--panel"
      style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h2>
        {note && <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{note}</span>}
      </div>
      {children}
    </section>
  );
}

export function Row({
  children,
  gap = 12,
  align = 'center',
}: {
  children: React.ReactNode;
  gap?: number;
  align?: string;
}) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: align, gap }}>{children}</div>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}
    >
      {children}
    </span>
  );
}
