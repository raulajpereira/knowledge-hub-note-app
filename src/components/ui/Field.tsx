'use client';

import { forwardRef, useId, useState } from 'react';
import { cx } from './cx';
import { Eye, EyeOff, Search } from './icons';

type FieldProps = {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
};

/** Label + control + hint/error, wired for screen readers. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  const hasMsg = Boolean(error || hint);
  return (
    <div className={cx('kh-field', className)}>
      {label && (
        <label className="kh-field__label" htmlFor={id}>
          {label}
        </label>
      )}
      {children({ id, describedBy: hasMsg ? msgId : undefined, invalid: Boolean(error) })}
      {error ? (
        <span id={msgId} className="kh-field__error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={msgId} className="kh-field__hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** lg: auth pages (46px) · md: panels, drawers, settings (38px) */
  size?: 'lg' | 'md';
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, Omit<InputProps, 'size'> & { size?: 'lg' | 'md' }>(
  function Input({ size = 'lg', invalid, className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cx('kh-input', size === 'md' && 'kh-input--md', className)}
        {...rest}
      />
    );
  },
);

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  size?: 'lg' | 'md';
  invalid?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { size = 'lg', invalid, className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx('kh-input', size === 'md' && 'kh-input--md', className)}
      {...rest}
    />
  );
});

/** Password with show/hide toggle (Login / Register / ResetPassword). */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type'> & { toggleLabel: string }>(
  function PasswordInput({ toggleLabel, className, size = 'lg', invalid, ...rest }, ref) {
    const [show, setShow] = useState(false);
    return (
      <span className="kh-input-wrap">
        <input
          ref={ref}
          type={show ? 'text' : 'password'}
          aria-invalid={invalid || undefined}
          className={cx('kh-input', 'kh-input--with-end', size === 'md' && 'kh-input--md', className)}
          {...rest}
        />
        <button
          type="button"
          className="kh-input-end"
          onClick={() => setShow((s) => !s)}
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-pressed={show}
        >
          {show ? <EyeOff /> : <Eye />}
        </button>
      </span>
    );
  },
);

/** Header search: glass pill with a leading icon. */
export const SearchInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function SearchInput({ className, style, ...rest }, ref) {
    return (
      <span className={cx('kh-search', className)} style={style}>
        <Search />
        <input ref={ref} type="search" {...rest} />
      </span>
    );
  },
);
