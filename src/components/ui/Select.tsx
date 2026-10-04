'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { Check, ChevronDown } from './icons';

export type SelectOption<T extends string = string> = { value: T; label: string; disabled?: boolean };

type SelectProps<T extends string> = {
  value: T | null;
  options: ReadonlyArray<SelectOption<T>>;
  onChange: (value: T) => void;
  placeholder?: string;
  /** Placeholder of the filter box shown when there are more than 10 options. */
  searchPlaceholder: string;
  noResults?: string;
  size?: 'lg' | 'md';
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
};

const SEARCH_THRESHOLD = 10;

/**
 * Glass select — the prototype replaces every native <select> with this menu
 * (ZNotes `initSelects`): fixed-position glass list under (or above) the
 * trigger, filter box for long lists, full keyboard support.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder,
  noResults = '—',
  size = 'md',
  invalid,
  disabled,
  id,
  className,
  ...aria
}: SelectProps<T>) {
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number; minW: number; maxW: number; maxH: number }>();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const searchable = options.length > SEARCH_THRESHOLD;
  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return options.map((o, i) => ({ o, i })).filter(({ o }) => !f || o.label.toLowerCase().includes(f));
  }, [options, filter]);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    setFilter('');
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openMenu = () => {
    if (disabled) return;
    setActive(selectedIndex);
    setOpen(true);
  };

  const pick = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange(o.value);
    close(true);
  };

  // Position like the prototype: below when there's room, else above.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const mh = menuRef.current.offsetHeight;
    const below = window.innerHeight - r.bottom - 8;
    const placeBelow = below >= Math.min(mh, 200) || below > r.top;
    const top = placeBelow ? r.bottom + 6 : Math.max(8, r.top - mh - 6);
    const minW = Math.max(160, r.width);
    const left = Math.max(
      8,
      Math.min(r.left, window.innerWidth - Math.max(minW, menuRef.current.offsetWidth) - 8),
    );
    const maxH = placeBelow && below < mh ? Math.max(120, below - (searchable ? 50 : 14)) : 300;
    setPos({ top, left, minW, maxW: Math.max(320, r.width), maxH });
    // Only on open: the menu must not jump while filtering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (searchable) setTimeout(() => searchRef.current?.focus(), 0);
    const sel = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (sel && listRef.current) listRef.current.scrollTop = sel.offsetTop - 60;

    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) close();
    };
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) close();
    };
    const onResize = () => close();
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, searchable, close]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (!open || active < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-i="${active}"]`);
    const list = listRef.current;
    if (!el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top - 4;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 4;
  }, [active, open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (
        e.key === ' ' ||
        e.key === 'Enter' ||
        e.key === 'F4' ||
        (e.altKey && e.key === 'ArrowDown') ||
        e.key === 'ArrowDown'
      ) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    const idx = visible.map((v) => v.i);
    const p = idx.indexOf(active);
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(idx[Math.min(idx.length - 1, p + 1)] ?? idx[0] ?? -1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(idx[Math.max(0, p - 1)] ?? idx[0] ?? -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0) pick(active);
    } else if (e.key === 'Tab') {
      close();
    }
  };

  const current = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        className={cx('kh-input', size === 'md' && 'kh-input--md', 'kh-select', className)}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKey}
        {...aria}
      >
        <span className={cx('kh-select__value', !current && 'kh-select__placeholder')}>
          {current?.label ?? placeholder ?? ''}
        </span>
        <span className="kh-select__chev">
          <ChevronDown />
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="kh-menu"
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              minWidth: pos?.minW,
              maxWidth: pos?.maxW,
              fontSize: size === 'lg' ? 14 : 13,
            }}
            onKeyDown={onKey}
          >
            {searchable && (
              <input
                ref={searchRef}
                className="kh-menu__search"
                placeholder={searchPlaceholder}
                value={filter}
                aria-controls={listId}
                aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                onChange={(e) => {
                  setFilter(e.target.value);
                  const f = e.target.value.trim().toLowerCase();
                  const first = options.findIndex((o) => !f || o.label.toLowerCase().includes(f));
                  setActive(first);
                }}
              />
            )}
            <div
              ref={listRef}
              id={listId}
              role="listbox"
              className="kh-menu__list"
              data-zs=""
              style={{ maxHeight: pos?.maxH ?? 300 }}
            >
              {visible.length === 0 && <div className="kh-menu__empty">{noResults}</div>}
              {visible.map(({ o, i }) => (
                <div
                  key={o.value}
                  id={`${listId}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={i === selectedIndex}
                  aria-disabled={o.disabled || undefined}
                  data-active={i === active || undefined}
                  className="kh-menu__item"
                  onPointerEnter={() => setActive(i)}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pick(i)}
                >
                  <span className="kh-menu__label">{o.label}</span>
                  <span style={{ width: 14, flex: 'none', display: 'flex', justifyContent: 'center' }}>
                    {i === selectedIndex && <Check />}
                  </span>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
