'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Modal, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import { isoD } from '@/lib/calendar';
import { fold } from '@/lib/search/fold';
import { searchHref, searchPageHref } from '@/lib/search/global';
import { notesApi } from '@/components/notes/notesApi';
import { clearSearchCache, useGlobalSearch } from '@/components/search/useGlobalSearch';
import { Highlight, useGroupLabel } from '@/components/search/SearchResults';
import { refreshCounts } from './counts';
import { Icon, NavIcon } from './icons';
import { hrefOf, isKnownItem, moduleOf } from './nav';
import { NAV_DEFAULT } from './navData';
import { usePref } from './PrefsProvider';
import { useShell } from './ShellContext';
import './cmdk.css';

// Command palette (Ctrl/⌘ + K): create things, go to any page of the plan,
// app commands (focus, lock, theme…) and the global search's results, all
// from the keyboard. ↑/↓ move, Enter runs, Escape closes. Typing filters the
// commands (no accents, every word) and searches the content at the same time.

type Cmd = {
  id: string;
  group: 'create' | 'go' | 'app';
  label: string;
  /** extra words that also find it */
  keys?: string;
  icon: React.ReactNode;
  hint?: string;
  run: () => void | Promise<void>;
};
type Row =
  | { kind: 'cmd'; cmd: Cmd }
  | { kind: 'hit'; type: string; module: string; id: string; title: string; snippet?: string }
  | { kind: 'all' };

const MAX_CMDS = 8;
const HITS = 4;

/** Every word typed is found (start of a word in the label or the extra words). */
function matches(c: Cmd, words: string[]) {
  const hay = ` ${fold(`${c.label} ${c.keys ?? ''}`).toLowerCase()}`;
  return words.every((w) => hay.includes(` ${w}`) || (w.length > 2 && hay.includes(w)));
}

export function useCommandPaletteKey(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { modules, toggleFocus, focus, lock, openAccount } = useShell();
  const [theme, setTheme] = usePref<string>('theme', 'dark');
  const groupLabel = useGroupLabel();
  const id = useId();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(0);
  }, [open]);

  const has = (m: string | null) => m === null || modules.has(m);
  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  // the same create calls as the pages' "+" buttons; then the new item opens
  const make = async (kind: 'note' | 'task' | 'meeting') => {
    if (busy) return;
    setBusy(true);
    try {
      let href: string;
      if (kind === 'note') {
        const { note } = await notesApi.create(null);
        href = `/app/notes?n=${note.id}`;
      } else if (kind === 'task') {
        const { task } = await api<{ task: { id: string } }>('/tasks', { title: t('t_newTitle') });
        href = `/app/tasks?t=${task.id}`;
      } else {
        const { meeting } = await api<{ meeting: { id: string } }>('/meetings', {
          title: t('mt_newTitle'),
          heldOn: isoD(new Date()),
        });
        href = `/app/meetings?m=${meeting.id}`;
      }
      refreshCounts();
      clearSearchCache();
      go(href);
    } catch (e) {
      const limit = isApiFailure(e) && e.code === 'limit_reached';
      toast({
        message: t(limit ? (kind === 'task' ? 'tk_limit' : 'ne_limit') : 'ne_saveFail'),
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const cmds = useMemo<Cmd[]>(() => {
    const out: Cmd[] = [];
    const create = (m: string, label: string, icon: string, run: () => void, keys?: string) => {
      if (has(m))
        out.push({
          id: `new-${m}-${icon}-${label}`,
          group: 'create',
          label,
          keys: `${t('cmdk_kNew')} ${keys ?? ''}`,
          icon: <NavIcon id={icon} size={16} />,
          run,
        });
    };
    create('notes', t('mob_newNote'), 'notes', () => void make('note'));
    create('tasks', t('mob_newTask'), 'tasks', () => void make('task'));
    create('meetings', t('mob_newMeeting'), 'meetings', () => void make('meeting'));
    create('voice', t('mob_newVoice'), 'voice', () => go('/app/voice?rec=1'), t('cmdk_kVoice'));
    create('notes', t('cmdk_import'), 'notes', () => go('/app/notes?import=1'), t('cmdk_kImport'));
    // every page of the plan, in the sidebar's default order
    for (const e of NAV_DEFAULT) {
      if (e.type !== 'item' || !isKnownItem(e.id) || !has(moduleOf(e.id))) continue;
      out.push({
        id: `go-${e.id}`,
        group: 'go',
        label: t(`nav_${e.id}`),
        keys: t('cmdk_kGo'),
        icon: <NavIcon id={e.id} size={16} />,
        run: () => go(hrefOf(e.id)),
      });
    }
    out.push(
      {
        id: 'settings',
        group: 'app',
        label: t('settings'),
        keys: t('cmdk_kSettings'),
        icon: <Icon name="settings" size={16} />,
        run: () => go('/app/settings'),
      },
      {
        id: 'account',
        group: 'app',
        label: t('acc_title'),
        keys: t('cmdk_kAccount'),
        icon: <Icon name="user" size={16} />,
        run: () => {
          onClose();
          openAccount();
        },
      },
      {
        id: 'theme',
        group: 'app',
        label: t(theme === 'light' ? 'cmdk_themeDark' : 'cmdk_themeLight'),
        keys: t('cmdk_kTheme'),
        icon: <Icon name={theme === 'light' ? 'moon' : 'sun'} size={16} />,
        run: () => {
          setTheme(theme === 'light' ? 'dark' : 'light');
          onClose();
        },
      },
      {
        id: 'focus',
        group: 'app',
        label: `${t('focus')} · ${t(focus ? 'cmdk_off' : 'cmdk_on')}`,
        keys: t('cmdk_kFocus'),
        icon: <Icon name="focus" size={16} />,
        run: () => {
          onClose();
          toggleFocus();
        },
      },
      {
        id: 'lock',
        group: 'app',
        label: t('lock'),
        keys: t('cmdk_kLock'),
        icon: <Icon name="lock" size={16} />,
        run: () => {
          onClose();
          lock();
        },
      },
    );
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, theme, focus, t, busy]);

  const words = useMemo(() => fold(q.trim().toLowerCase()).split(/\s+/).filter(Boolean), [q]);
  const s = useGlobalSearch(q, { limit: HITS, enabled: open && q.trim().length > 0 });

  const rows = useMemo<Row[]>(() => {
    if (!words.length) {
      // nothing typed: what to create, then the app commands (pages are found by typing)
      return cmds.filter((c) => c.group !== 'go').map((cmd) => ({ kind: 'cmd' as const, cmd }));
    }
    const found = cmds.filter((c) => matches(c, words)).slice(0, MAX_CMDS);
    const hits =
      s.data?.groups.flatMap((g) =>
        g.items.map((it) => ({
          kind: 'hit' as const,
          type: g.type,
          module: g.module,
          id: it.id,
          title: it.title,
          snippet: it.snippet,
        })),
      ) ?? [];
    return [...found.map((cmd) => ({ kind: 'cmd' as const, cmd })), ...hits, { kind: 'all' as const }];
  }, [cmds, words, s.data]);

  useEffect(() => setActive(0), [rows.length, q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const runRow = (r: Row | undefined) => {
    if (!r) return;
    if (r.kind === 'cmd') void r.cmd.run();
    else if (r.kind === 'hit') {
      const href = searchHref(r.type, r.id);
      if (href) go(href);
    } else go(searchPageHref(q.trim()));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + d + rows.length) % Math.max(1, rows.length));
    } else if (e.key === 'Enter') {
      if (e.nativeEvent.isComposing) return;
      e.preventDefault();
      runRow(rows[active]);
    }
  };

  const heading = (r: Row) =>
    r.kind === 'cmd'
      ? t(r.cmd.group === 'create' ? 'cmdk_gCreate' : r.cmd.group === 'go' ? 'cmdk_gGo' : 'cmdk_gApp')
      : r.kind === 'hit'
        ? groupLabel({ module: r.module, type: r.type })
        : '';
  const terms = words;

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeLabel={t('i_close')}
      hideClose
      labelledBy={`${id}-l`}
      className="kh-cmdk"
      overlayClassName="kh-cmdk-ov"
    >
      <span id={`${id}-l`} className="kh-sr">
        {t('cmdk_title')}
      </span>
      <label className="kh-cmdk__bar">
        <Icon name="search" size={18} sw={2} />
        <input
          data-autofocus=""
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder={t('cmdk_ph')}
          aria-label={t('cmdk_ph')}
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-activedescendant={rows.length ? `${id}-o${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          data-1p-ignore=""
          data-lpignore="true"
        />
        {(s.loading || busy) && <span className="kh-gs__spin" role="status" aria-label={t('gs_loading')} />}
        <kbd className="kh-cmdk__esc">Esc</kbd>
      </label>
      <div className="kh-cmdk__list" role="listbox" id={`${id}-list`} ref={listRef}>
        {rows.map((r, i) => {
          const head = heading(r);
          const prev = i ? heading(rows[i - 1]!) : null;
          const key = r.kind === 'cmd' ? r.cmd.id : r.kind === 'hit' ? `${r.type}:${r.id}` : 'all';
          return (
            <div key={key}>
              {head && head !== prev && <div className="kh-cmdk__head">{head}</div>}
              <div
                id={`${id}-o${i}`}
                data-i={i}
                role="option"
                aria-selected={active === i}
                data-active={active === i || undefined}
                className={`kh-cmdk__row${r.kind === 'all' ? ' all' : ''}`}
                onMouseMove={() => setActive(i)}
                onClick={() => runRow(r)}
              >
                <span className="kh-cmdk__ic" aria-hidden="true">
                  {r.kind === 'cmd' ? (
                    r.cmd.icon
                  ) : r.kind === 'hit' ? (
                    <NavIcon id={r.module} size={16} />
                  ) : (
                    <Icon name="search" size={15} sw={2} />
                  )}
                </span>
                <span className="kh-cmdk__txt">
                  {r.kind === 'cmd' ? (
                    <span className="kh-cmdk__t">{r.cmd.label}</span>
                  ) : r.kind === 'hit' ? (
                    <>
                      <span className="kh-cmdk__t">
                        <Highlight text={r.title} terms={terms} />
                      </span>
                      {r.snippet && (
                        <span className="kh-cmdk__s">
                          <Highlight text={r.snippet} terms={terms} />
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="kh-cmdk__t">{t('gs_all').replace('{q}', q.trim())}</span>
                  )}
                </span>
                {active === i && <kbd aria-hidden="true">↵</kbd>}
              </div>
            </div>
          );
        })}
        {words.length > 0 && !s.loading && rows.length === 1 && (
          <div className="kh-cmdk__empty" role="status">
            {t('gs_none').replace('{q}', q.trim())}
          </div>
        )}
      </div>
      <div className="kh-cmdk__foot" aria-hidden="true">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> {t('cmdk_move')}
        </span>
        <span>
          <kbd>↵</kbd> {t('cmdk_run')}
        </span>
        <span>
          <kbd>{typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.platform) ? '⌘' : 'Ctrl'}</kbd>
          <kbd>K</kbd> {t('cmdk_toggle')}
        </span>
      </div>
    </Modal>
  );
}
