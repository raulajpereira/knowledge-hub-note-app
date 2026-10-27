'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Popover } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { Icon } from '@/components/shell/icons';
import { useShell } from '@/components/shell/ShellContext';
import { DROPDOWN_PER_GROUP, searchHref, searchPageHref } from '@/lib/search/global';
import { GroupHead, ResultRow, useGroupLabel } from './SearchResults';
import { useGlobalSearch } from './useGlobalSearch';

// The header search box (computer and the phone's search bar): results from
// every module appear under it while typing — no Enter needed. ↑/↓ move
// through them, Enter opens the chosen one (or, with none chosen, the full
// results page), Escape closes the list. The same text still filters the
// Notes list when on Notes.

const POP_ID = 'kh-gs-pop';
const LIST_ID = 'kh-gs-list';
const optId = (i: number) => `kh-gs-opt-${i}`;

export function HeaderSearch({
  className,
  inputRef,
  mobile = false,
  onClose,
  children,
}: {
  className: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** phone/tablet bar: the list stays open with the keyboard down */
  mobile?: boolean;
  /** Escape with the list closed (the phone bar closes) */
  onClose?: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const { query, setQuery } = useShell();
  const router = useRouter();
  const label = useGroupLabel();
  const onPage = usePathname() === '/app/search';
  const anchor = useRef<HTMLLabelElement>(null);
  const ownInput = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownInput;
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const s = useGlobalSearch(query, { limit: DROPDOWN_PER_GROUP, enabled: !onPage });
  const open = (focused || mobile) && !dismissed && !onPage && s.terms.length > 0;

  const flat = useMemo(
    () => s.data?.groups.flatMap((g) => g.items.map((item) => ({ type: g.type, item }))) ?? [],
    [s.data],
  );
  // new results: nothing chosen (Enter = all results) until ↑/↓
  useEffect(() => setActive(-1), [s.data]);
  // the chosen row stays in view
  useEffect(() => {
    if (active >= 0) document.getElementById(optId(active))?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // phones: the list ends above the keyboard (iOS keeps fixed boxes under it)
  // or, with the keyboard down, above the bottom bar
  const [room, setRoom] = useState<number | undefined>(undefined);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!mobile || !open || !vv) return;
    const fit = () => {
      const top = (anchor.current?.getBoundingClientRect().bottom ?? 0) + 6;
      const keyboard = vv.height < window.innerHeight - 120;
      setRoom(Math.max(160, vv.height + vv.offsetTop - top - (keyboard ? 8 : 104)));
    };
    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    return () => {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
    };
  }, [mobile, open]);

  // Escape with the list open only closes it (the Popover does): the box keeps its text
  useEffect(() => {
    if (!open) return;
    const keep = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && e.target === input.current) e.preventDefault();
    };
    window.addEventListener('keydown', keep, true);
    return () => window.removeEventListener('keydown', keep, true);
  }, [open, input]);

  const count = flat.length + 1; // + "all results"
  const leave = (href: string, keep = false) => {
    if (!keep) setQuery('');
    setDismissed(true);
    // the results page keeps the box focused to refine (the phone keyboard goes down)
    if (!keep || mobile) input.current?.blur();
    router.push(href);
  };
  const all = () => leave(searchPageHref(query), true);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!s.terms.length) return;
      e.preventDefault();
      if (!open) {
        setDismissed(false);
        return;
      }
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a < 0 ? (d > 0 ? 0 : count - 1) : (a + d + count) % count));
    } else if (e.key === 'Enter') {
      if (e.nativeEvent.isComposing || !s.terms.length) return;
      e.preventDefault();
      const pick = open && active >= 0 ? flat[active] : undefined;
      const href = pick && searchHref(pick.type, pick.item.id);
      if (href) leave(href);
      else all();
    } else if (e.key === 'Escape') {
      // (an open list is closed by the Popover first)
      onClose?.();
    }
  };

  const groups = s.data?.groups ?? [];
  let i = -1;
  return (
    <label ref={anchor} className={className}>
      <span style={{ display: 'flex', opacity: 0.65 }}>
        <Icon name="search" size={16} sw={2} />
      </span>
      {/* a search box, not a login field: browsers and password managers must not fill it */}
      <input
        ref={input}
        type="search"
        name="kh-search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore=""
        data-lpignore="true"
        data-bwignore=""
        data-form-type="other"
        enterKeyHint="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setDismissed(false);
        }}
        onFocus={() => {
          setFocused(true);
          setDismissed(false);
        }}
        onBlur={(e) => {
          if (!(e.relatedTarget as Element | null)?.closest(`#${POP_ID}`)) setFocused(false);
        }}
        onKeyDown={onKey}
        placeholder={t('search')}
        aria-label={t('search')}
        aria-autocomplete="list"
        aria-controls={open ? LIST_ID : undefined}
        aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
      />
      {s.loading && <span className="kh-gs__spin" role="status" aria-label={t('gs_loading')} />}
      {children}
      {open && (
        <Popover
          anchor={anchor}
          align="left"
          width={mobile ? 4000 : 560}
          maxHeight={mobile ? room : 560}
          className="kh-gs"
          id={POP_ID}
          onClose={() => setDismissed(true)}
        >
          {/* clicks in the list keep the focus (and the phone keyboard) in the box */}
          <div
            role="listbox"
            id={LIST_ID}
            aria-label={t('gs_results')}
            className="kh-gs__list"
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="kh-gs__scroll">
              {groups.map((g) => (
                <div key={g.type} role="group" aria-label={label(g)} className="kh-gs__group">
                  <GroupHead
                    group={g}
                    action={
                      g.count > g.items.length ? (
                        <Link
                          href={`${searchPageHref(query)}&type=${g.type}`}
                          className="kh-gs__more"
                          tabIndex={-1}
                          onClick={() => setDismissed(true)}
                        >
                          {t('gs_seeAll')}
                        </Link>
                      ) : undefined
                    }
                  />
                  {g.items.map((item) => {
                    const n = ++i;
                    return (
                      <ResultRow
                        key={item.id}
                        id={optId(n)}
                        type={g.type}
                        item={item}
                        terms={s.terms}
                        active={active === n}
                        onHover={() => setActive(n)}
                        onPick={() => {
                          setQuery('');
                          setDismissed(true);
                        }}
                      />
                    );
                  })}
                </div>
              ))}
              {!groups.length && (
                <div className="kh-gs__empty" role="status">
                  {s.error
                    ? t('gs_error')
                    : s.loading || !s.data
                      ? t('gs_loading')
                      : t('gs_none').replace('{q}', query.trim())}
                </div>
              )}
            </div>
            <div
              id={optId(count - 1)}
              role="option"
              aria-selected={active === count - 1}
              data-active={active === count - 1 || undefined}
              className="kh-gs__all"
              onMouseMove={() => setActive(count - 1)}
              onClick={all}
            >
              <Icon name="search" size={14} sw={2} />
              <span>{t('gs_all').replace('{q}', query.trim())}</span>
              <kbd aria-hidden="true">↵</kbd>
            </div>
          </div>
        </Popover>
      )}
    </label>
  );
}
