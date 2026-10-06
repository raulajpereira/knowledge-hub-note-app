import { NavIcon } from './icons';

/** Glass panel for screens that arrive in a later phase (or aren't in the plan). */
export function Placeholder({
  icon,
  title,
  body,
  muted,
}: {
  icon: string;
  title: string;
  body: string;
  muted?: boolean;
}) {
  return (
    <section className="kh-soon" data-muted={muted || undefined}>
      <span className="kh-soon__icon">
        <NavIcon id={icon} size={26} />
      </span>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: '-.02em' }}>{title}</h1>
      <p style={{ margin: 0, maxWidth: 440, fontSize: 14.5, lineHeight: 1.5, color: 'var(--text-2)' }}>
        {body}
      </p>
    </section>
  );
}
