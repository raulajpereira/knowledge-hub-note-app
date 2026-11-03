'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { cx } from './cx';
import { DatePicker } from './DatePicker';

// A date typed as dd/mm/aaaa (ISO and d-m-aa also accepted) with a button
// that opens the glass calendar (DatePicker). The value is 'YYYY-MM-DD' (or
// '' when empty), like a native <input type="date">; the field keeps the
// look of the module (its class goes on the text input).

/** 'YYYY-MM-DD' from what was typed; `full`: only a 4-digit year (while typing). */
export function parseTypedDay(s: string, full = false): string | null {
  const t = s.trim();
  let y: number;
  let m: number;
  let d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const pt = (
    full ? /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/ : /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/
  ).exec(t);
  if (iso) [y, m, d] = [+iso[1]!, +iso[2]!, +iso[3]!];
  else if (pt) [d, m, y] = [+pt[1]!, +pt[2]!, pt[3]!.length === 2 ? 2000 + +pt[3]! : +pt[3]!];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
const show = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '';

const CalIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden
  >
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

export type DateInputProps = {
  value: string;
  onChange: (iso: string) => void;
  /** class of the text input (the module's field style) */
  className?: string;
  /** style of the wrapper */
  style?: React.CSSProperties;
  min?: string;
  max?: string;
  /** can be emptied (typing nothing, or "Limpar" in the calendar) → onChange('') */
  clearable?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  id?: string;
  title?: string;
  'aria-label'?: string;
  /** label of the calendar button */
  pickLabel?: string;
  'data-late'?: boolean;
};

export function DateInput({
  value,
  onChange,
  className,
  style,
  min,
  max,
  clearable,
  disabled,
  readOnly,
  required,
  id,
  title,
  pickLabel,
  ...rest
}: DateInputProps) {
  const { lang } = useI18n();
  const en = lang === 'en';
  const [txt, setTxt] = useState(show(value));
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => setTxt(show(value)), [value]);
  const locked = disabled || readOnly;
  return (
    <span ref={box} className="kh-di" style={style}>
      <input
        id={id}
        className={cx(className, 'kh-di__in')}
        value={txt}
        title={title}
        aria-label={rest['aria-label']}
        data-late={rest['data-late'] || undefined}
        placeholder={en ? 'dd/mm/yyyy' : 'dd/mm/aaaa'}
        inputMode="numeric"
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        onChange={(e) => {
          setTxt(e.target.value);
          const d = parseTypedDay(e.target.value, true);
          if (d) onChange(d);
          else if (clearable && !e.target.value.trim()) onChange('');
        }}
        onBlur={(e) => {
          // a 2-digit year ("12/11/26") is taken when leaving the field
          const d = parseTypedDay(e.target.value);
          if (d && d !== value) onChange(d);
          setTxt(show(d ?? value));
        }}
        onKeyDown={(e) => {
          if (e.altKey && e.key === 'ArrowDown' && !locked) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      />
      <button
        ref={btn}
        type="button"
        className="kh-di__btn"
        aria-label={pickLabel ?? (en ? 'Open calendar' : 'Abrir calendário')}
        title={pickLabel ?? (en ? 'Open calendar' : 'Abrir calendário')}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={locked}
        onClick={() => setOpen((o) => !o)}
      >
        <CalIcon />
      </button>
      {open && (
        <DatePicker
          anchor={box}
          value={value}
          lang={lang}
          min={min}
          max={max}
          clearable={clearable}
          onPick={(d) => {
            onChange(d);
            setTxt(show(d));
          }}
          onClose={() => {
            setOpen(false);
            btn.current?.focus();
          }}
        />
      )}
    </span>
  );
}

/**
 * A date and a time ('YYYY-MM-DDTHH:mm', local, like <input type="datetime-local">):
 * the glass date field and a time field next to it.
 */
export function DateTimeInput({
  value,
  onChange,
  className,
  timeLabel,
  ...p
}: Omit<DateInputProps, 'min' | 'max'> & { timeLabel?: string; min?: string; max?: string }) {
  const { lang } = useI18n();
  const [d = '', tm = ''] = value ? value.split('T') : [];
  const time = tm.slice(0, 5);
  return (
    <span className="kh-dti" style={p.style}>
      <DateInput
        {...p}
        style={undefined}
        className={className}
        value={d}
        min={p.min?.slice(0, 10)}
        max={p.max?.slice(0, 10)}
        onChange={(nd) => onChange(nd ? `${nd}T${time || '09:00'}` : '')}
      />
      <input
        type="time"
        className={cx(className, 'kh-dti__time')}
        value={time}
        aria-label={timeLabel ?? (lang === 'en' ? 'Time' : 'Hora')}
        disabled={p.disabled || !d}
        readOnly={p.readOnly}
        onChange={(e) => d && e.target.value && onChange(`${d}T${e.target.value}`)}
      />
    </span>
  );
}
