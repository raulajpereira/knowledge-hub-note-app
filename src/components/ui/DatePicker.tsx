'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { holidayName, holidayOf } from '@/lib/alloc';
import { cx } from './cx';
import { Popover } from './Popover';

// Calendar in the app's liquid glass (a Popover; a sheet on phones): Monday-first
// weeks, today and the selected day marked, weekends and Portuguese national
// holidays shaded, ‹ › months, a month / year view, "Hoje" and "Limpar", and
// the keyboard (arrows, PgUp / PgDn = month, Shift+PgUp / PgDn = year,
// Home / End = week, Enter, Esc). Days are 'YYYY-MM-DD' strings (UTC math).

const DAY = 86_400_000;
const toDn = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const toIso = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`));
/** 0 = Monday */
const wdOf = (n: number) => (((n + 3) % 7) + 7) % 7;
const ymOf = (n: number) => {
  const d = new Date(n * DAY);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
};
/** "novembro de 2026" → "Novembro de 2026" */
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const firstOf = (y: number, m: number) => Math.floor(Date.UTC(y, m, 1) / DAY);
const todayDn = () => {
  const d = new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
};

export type DatePickerLabels = {
  today: string;
  clear: string;
  prev: string;
  next: string;
  months: string;
  dialog: string;
};
const LABELS: Record<'pt' | 'en', DatePickerLabels> = {
  pt: {
    today: 'Hoje',
    clear: 'Limpar',
    prev: 'Mês anterior',
    next: 'Mês seguinte',
    months: 'Escolher mês e ano',
    dialog: 'Calendário',
  },
  en: {
    today: 'Today',
    clear: 'Clear',
    prev: 'Previous month',
    next: 'Next month',
    months: 'Choose month and year',
    dialog: 'Calendar',
  },
};

export function DatePicker({
  anchor,
  value,
  onPick,
  onClose,
  lang = 'pt',
  min,
  max,
  clearable,
  labels,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  /** 'YYYY-MM-DD' or '' */
  value: string;
  onPick: (iso: string) => void;
  onClose: () => void;
  lang?: string;
  min?: string;
  max?: string;
  /** shows "Limpar" (picks '') */
  clearable?: boolean;
  labels?: Partial<DatePickerLabels>;
}) {
  const L = { ...LABELS[lang === 'en' ? 'en' : 'pt'], ...labels };
  const loc = lang === 'en' ? 'en-GB' : 'pt-PT';
  const today = todayDn();
  const sel = isIso(value) ? toDn(value) : null;
  const lo = min && isIso(min) ? toDn(min) : -Infinity;
  const hi = max && isIso(max) ? toDn(max) : Infinity;
  const [focus, setFocus] = useState(() => Math.min(hi, Math.max(lo, sel ?? today)));
  const [mode, setMode] = useState<'days' | 'months'>('days');
  const { y, m } = ymOf(focus);
  const [yearView, setYearView] = useState(y);
  const grid = useRef<HTMLDivElement>(null);

  const fmt = useMemo(
    () => ({
      title: new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      month: new Intl.DateTimeFormat(loc, { month: 'short', timeZone: 'UTC' }),
      wd: new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' }),
      full: new Intl.DateTimeFormat(loc, { dateStyle: 'full', timeZone: 'UTC' }),
    }),
    [loc],
  );
  // Monday … Sunday (5 Jan 1970 was a Monday)
  const wds = Array.from({ length: 7 }, (_, i) =>
    fmt.wd
      .format(new Date((4 + i) * DAY))
      .replace('.', '')
      .slice(0, 3),
  );
  const start = firstOf(y, m) - wdOf(firstOf(y, m));
  const days = Array.from({ length: 42 }, (_, i) => start + i);
  const pick = (n: number) => {
    if (n < lo || n > hi) return;
    onPick(toIso(n));
    onClose();
  };
  const move = (n: number) => setFocus(Math.min(hi, Math.max(lo, n)));
  const addMonths = (n: number, k: number) => {
    const d = new Date(n * DAY);
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1));
    const dim = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    return Math.floor(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d.getUTCDate(), dim)) / DAY);
  };

  // the focused day keeps the keyboard focus (the popover draws a frame later: retry a few frames)
  useEffect(() => {
    if (mode !== 'days') return;
    let tries = 0;
    let raf = 0;
    const go = () => {
      const el = grid.current?.querySelector<HTMLElement>(`[data-dn="${focus}"]`);
      if (el) el.focus();
      else if (tries++ < 10) raf = requestAnimationFrame(go);
    };
    go();
    return () => cancelAnimationFrame(raf);
  }, [focus, mode]);

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (k in map) move(focus + map[k]!);
    else if (k === 'PageUp') move(addMonths(focus, e.shiftKey ? -12 : -1));
    else if (k === 'PageDown') move(addMonths(focus, e.shiftKey ? 12 : 1));
    else if (k === 'Home') move(focus - wdOf(focus));
    else if (k === 'End') move(focus - wdOf(focus) + 6);
    else if (k === 'Enter' || k === ' ') pick(focus);
    else return;
    e.preventDefault();
  };

  return (
    <Popover
      anchor={anchor}
      align="left"
      width={300}
      flip
      sheet
      onClose={onClose}
      className="kh-dp"
      role="dialog"
      aria-label={L.dialog}
    >
      <div className="kh-dp__head">
        <button
          type="button"
          className="kh-dp__nav"
          aria-label={L.prev}
          onClick={() => (mode === 'days' ? move(addMonths(focus, -1)) : setYearView(yearView - 1))}
        >
          ‹
        </button>
        <button
          type="button"
          className="kh-dp__title"
          aria-label={L.months}
          aria-expanded={mode === 'months'}
          onClick={() => {
            setYearView(y);
            setMode(mode === 'days' ? 'months' : 'days');
          }}
        >
          {mode === 'days' ? cap1(fmt.title.format(new Date(firstOf(y, m) * DAY))) : yearView}
        </button>
        <button
          type="button"
          className="kh-dp__nav"
          aria-label={L.next}
          onClick={() => (mode === 'days' ? move(addMonths(focus, 1)) : setYearView(yearView + 1))}
        >
          ›
        </button>
      </div>
      {mode === 'days' ? (
        <div ref={grid} className="kh-dp__grid" role="grid" onKeyDown={onKey}>
          {wds.map((w, i) => (
            <span key={i} className={cx('kh-dp__wd', i >= 5 && 'kh-dp__wd--we')} role="columnheader">
              {w}
            </span>
          ))}
          {days.map((n) => {
            const out = ymOf(n).m !== m;
            const hol = holidayOf(n);
            const off = n < lo || n > hi;
            return (
              <button
                key={n}
                type="button"
                role="gridcell"
                data-dn={n}
                tabIndex={n === focus ? 0 : -1}
                disabled={off}
                aria-selected={n === sel}
                aria-current={n === today ? 'date' : undefined}
                aria-label={`${fmt.full.format(new Date(n * DAY))}${hol ? ` · ${holidayName(hol, lang)}` : ''}`}
                title={hol ? holidayName(hol, lang) : undefined}
                className={cx(
                  'kh-dp__day',
                  out && 'kh-dp__day--out',
                  wdOf(n) >= 5 && 'kh-dp__day--we',
                  hol && 'kh-dp__day--hol',
                  n === today && 'kh-dp__day--today',
                  n === sel && 'kh-dp__day--sel',
                )}
                onClick={() => pick(n)}
              >
                {new Date(n * DAY).getUTCDate()}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="kh-dp__months">
          {Array.from({ length: 12 }, (_, i) => (
            <button
              key={i}
              type="button"
              className={cx('kh-dp__month', yearView === y && i === m && 'kh-dp__day--sel')}
              onClick={() => {
                move(
                  addMonths(firstOf(yearView, i), 0) + Math.min(new Date(focus * DAY).getUTCDate() - 1, 27),
                );
                setMode('days');
              }}
            >
              {fmt.month.format(new Date(firstOf(2026, i) * DAY)).replace('.', '')}
            </button>
          ))}
        </div>
      )}
      <div className="kh-dp__foot">
        {clearable && (
          <button
            type="button"
            className="kh-dp__act"
            onClick={() => {
              onPick('');
              onClose();
            }}
          >
            {L.clear}
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="kh-dp__act kh-dp__act--main" onClick={() => pick(today)}>
          {L.today}
        </button>
      </div>
    </Popover>
  );
}
