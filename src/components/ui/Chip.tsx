import { cx } from './cx';

type ChipProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  selected?: boolean;
  count?: number | string;
  dot?: string;
};

/** Filter chip — prototype `chip(on)`: light when selected, glass otherwise. */
export function Chip({
  selected = false,
  count,
  dot,
  className,
  children,
  type = 'button',
  ...rest
}: ChipProps) {
  return (
    <button type={type} aria-pressed={selected} className={cx('kh-chip', className)} {...rest}>
      {dot && <span className="kh-chip__dot" style={{ background: dot }} aria-hidden="true" />}
      {children}
      {count !== undefined && <span className="kh-chip__count">{count}</span>}
    </button>
  );
}

/** Small counter (sidebar item counts). */
export function Badge({ className, ...rest }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx('kh-badge', className)} {...rest} />;
}

/** Admin Console status colours (prototype `ST`). */
export const STATUS_TONES = {
  ok: 'oklch(0.75 0.13 150 / .45)',
  info: 'oklch(0.75 0.12 245 / .5)',
  warn: 'oklch(0.72 0.15 50 / .55)',
  danger: 'oklch(0.66 0.17 25 / .5)',
  neutral: 'rgba(255,255,255,.14)',
} as const;

type TagProps = React.HTMLAttributes<HTMLSpanElement> & {
  /** status: rounded pill (states) · code: mono uppercase, radius 7 (SID, types) */
  shape?: 'status' | 'code';
  tone?: keyof typeof STATUS_TONES;
  /** Explicit background colour; overrides `tone`. */
  bg?: string;
};

/** Table tags — prototype `chipC(text, bg)` and the code badges. */
export function Tag({ shape = 'status', tone = 'neutral', bg, className, style, ...rest }: TagProps) {
  return (
    <span
      className={cx('kh-tag', shape === 'status' && 'kh-tag--status', className)}
      style={{ background: bg ?? STATUS_TONES[tone], ...style }}
      {...rest}
    />
  );
}

/** Soft rounded label (weather stats, meta). */
export function Pill({ className, ...rest }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx('kh-pill', className)} {...rest} />;
}
