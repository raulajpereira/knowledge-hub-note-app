'use client';

import { cx } from './cx';
import { Check } from './icons';

type CheckboxProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

/** Checkbox with the prototype's rounded-square look ("Lembrar-me"). */
export function Checkbox({ checked, onChange, className, children, ...rest }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={cx('kh-check', className)}
      onClick={() => onChange(!checked)}
      {...rest}
    >
      <span className="kh-check__box">{checked && <Check size={11} strokeWidth={3.4} />}</span>
      {children}
    </button>
  );
}

type SwitchProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name when there's no visible label next to it. */
  label?: string;
};

/** On/off switch (Definições). */
export function Switch({ checked, onChange, label, className, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cx('kh-switch', className)}
      onClick={() => onChange(!checked)}
      {...rest}
    >
      <span className="kh-switch__knob" />
    </button>
  );
}

type SegmentedProps<T extends string> = {
  value: T;
  options: ReadonlyArray<{ value: T; label: React.ReactNode }>;
  onChange: (value: T) => void;
  label: string;
  className?: string;
};

/** Pill segmented control (PT / EN, view switches). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('kh-seg', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Inline result message (success / error), as on the auth pages. */
export function Message({
  tone = 'error',
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { tone?: 'ok' | 'error' }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('kh-msg', tone === 'ok' && 'kh-msg--ok', className)}
      {...rest}
    />
  );
}
