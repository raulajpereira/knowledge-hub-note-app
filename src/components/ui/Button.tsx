import { forwardRef } from 'react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'glass' | 'ghost' | 'danger' | 'danger-ghost' | 'accent';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'glass',
    size = 'md',
    block,
    loading,
    icon,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'kh-btn',
        `kh-btn--${variant}`,
        size !== 'md' && `kh-btn--${size}`,
        block && 'kh-btn--block',
        className,
      )}
      {...rest}
    >
      {loading ? <span className="kh-spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'glass' | 'accent' | 'light';
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', tone = 'glass', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'kh-icon-btn',
        size !== 'md' && `kh-icon-btn--${size}`,
        tone !== 'glass' && `kh-icon-btn--${tone}`,
        className,
      )}
      {...rest}
    />
  );
});
