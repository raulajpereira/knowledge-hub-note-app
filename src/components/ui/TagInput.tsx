'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import type { TagCount } from '@/lib/tags';
import { suggestTags } from '@/lib/tags';
import { Popover } from './Popover';

// Every tag in the app (notes, artifacts, snippets, SAP objects), most used
// first — fetched once per page load and kept up to date as tags are added.
type Known = TagCount;
let known: Known[] | null = null;
let loading: Promise<Known[]> | null = null;
const listeners = new Set<(k: Known[]) => void>();

function loadTags() {
  loading ??= api<{ tags: Known[] }>('/tags/all')
    .catch(() => ({ tags: [] as Known[] }))
    .then((r) => {
      // tags added while the list was loading are kept
      const extra = (known ?? []).filter((k) => !r.tags.some((x) => x.name === k.name));
      known = [...r.tags, ...extra];
      for (const l of listeners) l(known);
      return known;
    });
  return loading;
}

function remember(name: string) {
  const list = known ?? [];
  const hit = list.find((k) => k.name === name);
  known = hit
    ? list.map((k) => (k === hit ? { ...k, count: k.count + 1 } : k))
    : [...list, { name, count: 1 }];
  for (const l of listeners) l(known);
}

function useAllTags() {
  const [tags, setTags] = useState<Known[]>(known ?? []);
  useEffect(() => {
    listeners.add(setTags);
    // the current list, not the one the (cached) first load resolved with
    void loadTags().then(() => setTags(known ?? []));
    return () => void listeners.delete(setTags);
  }, []);
  return tags;
}

/**
 * A text box for adding tags one at a time with suggestions from the tags
 * already used anywhere in the app: ↑/↓ to pick, Enter adds the picked or
 * typed tag (an existing tag with other case is reused) and clears the box
 * for the next one.
 */
export function TagInput({
  exclude,
  onAdd,
  commitOnBlur,
  onBlur,
  onEscape,
  className,
  placeholder,
  autoFocus,
  maxLength = 40,
  'aria-label': label,
}: {
  exclude: readonly string[];
  onAdd: (tag: string) => void;
  /** leaving the box adds what is typed */
  commitOnBlur?: boolean;
  onBlur?: () => void;
  onEscape?: () => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  maxLength?: number;
  'aria-label'?: string;
}) {
  const all = useAllTags();
  const ref = useRef<HTMLInputElement>(null);
  const id = useId();
  const [val, setVal] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const list = useMemo(() => (open ? suggestTags(all, val, exclude) : []), [all, val, exclude, open]);

  const add = (raw: string) => {
    const v = raw.trim().slice(0, maxLength);
    setVal('');
    setHi(-1);
    if (!v) return;
    const same = all.find((k) => k.name.toLowerCase() === v.toLowerCase())?.name ?? v;
    if (exclude.some((x) => x.toLowerCase() === same.toLowerCase())) return;
    remember(same);
    onAdd(same);
  };

  return (
    <>
      <input
        ref={ref}
        className={className}
        value={val}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={autoFocus}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={list.length > 0}
        aria-controls={list.length ? id : undefined}
        aria-activedescendant={hi >= 0 && list[hi] ? `${id}-${hi}` : undefined}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setVal(e.target.value);
          setHi(-1);
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
          if (commitOnBlur) add(val);
          onBlur?.();
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (!list.length) return;
            e.preventDefault();
            const d = e.key === 'ArrowDown' ? 1 : -1;
            // -1 is the typed text, then each suggestion, wrapping around
            setHi((h) => ((h + 1 + d + list.length + 1) % (list.length + 1)) - 1);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            add(hi >= 0 && list[hi] ? list[hi] : val);
          } else if (e.key === 'Escape') {
            if (list.length) return; // the suggestions close first
            setVal('');
            onEscape?.();
          }
        }}
      />
      {list.length > 0 && (
        <Popover
          anchor={ref}
          align="left"
          onClose={() => setOpen(false)}
          className="kh-taglist"
          width={Math.max(200, ref.current?.offsetWidth ?? 0)}
          maxHeight={300}
          id={id}
          role="listbox"
          aria-label={label}
        >
          {list.map((name, i) => (
            <button
              key={name}
              id={`${id}-${i}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={i === hi}
              // keep the focus in the box (its blur would add what is typed)
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(name)}
            >
              {name}
            </button>
          ))}
        </Popover>
      )}
    </>
  );
}
