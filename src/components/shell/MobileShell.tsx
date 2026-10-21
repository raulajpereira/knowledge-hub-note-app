'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Logo } from '@/components/brand/Logo';
import { Sheet, useToast } from '@/components/ui';
import { TcodesPopup } from '@/components/sap/TcodesPopup';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import { isoD } from '@/lib/calendar';
import { notesApi } from '@/components/notes/notesApi';
import { AvatarFace } from './Avatar';
import { refreshCounts, useCounts } from './counts';
import { Icon, NavIcon } from './icons';
import { idFromSegment, isKnownItem } from './nav';
import { NotificationBell } from './NotificationBell';
import { useShell } from './ShellContext';
import { Sidebar } from './Sidebar';

// Phones and tablets (D68): compact header, the sidebar as an off-canvas
// drawer, and (phones) a bottom bar with a quick-capture "+" sheet. Desktop
// never renders any of this.

const FOCUSABLE =
  'button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

const Burger = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h16" />
  </svg>
);
const Plus = ({ size = 24 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

/** The page's name for the compact header (null: show the logo). */
function usePageTitle(): string | null {
  const { t } = useI18n();
  const seg = usePathname().split('/')[2];
  if (!seg) return t('nav_home');
  if (seg === 'settings') return t('settings');
  if (seg === 'trash' || seg === 'whiteboard') return t(`nav_${seg}`);
  if (seg === 'news') return 'SAP News';
  const id = idFromSegment(seg);
  return isKnownItem(id) ? t(`nav_${id}`) : null;
}

// ── Compact header ─────────────────────────────────────────────────────────
export function MobileHeader({ onMenu, menuOpen }: { onMenu: () => void; menuOpen: boolean }) {
  const { t } = useI18n();
  const { me, openAccount, query, setQuery } = useShell();
  const title = usePageTitle();
  const [searching, setSearching] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searching) input.current?.focus();
  }, [searching]);

  return (
    <header className="kh-hdr kh-hdr--m" data-searching={searching || undefined}>
      <button
        type="button"
        className="kh-hdr__btn kh-hdr__glass"
        aria-label={t('mob_menu')}
        title={t('mob_menu')}
        aria-expanded={menuOpen}
        aria-controls="kh-navdrawer"
        onClick={onMenu}
      >
        <Burger />
      </button>
      <Link href="/app" className="kh-hdr__mtitle" aria-label="KnowledgeHub">
        <Logo size={30} showWordmark={false} />
        <span>
          {title ?? (
            <>
              Knowledge<span style={{ color: 'var(--accent-text)' }}>Hub</span>
            </>
          )}
        </span>
      </Link>
      <button
        type="button"
        className="kh-hdr__btn kh-hdr__glass"
        aria-label={t('mob_search')}
        title={t('mob_search')}
        aria-expanded={searching}
        data-on={!!query || undefined}
        onClick={() => setSearching(true)}
      >
        <Icon name="search" size={18} sw={2} />
      </button>
      <NotificationBell />
      <button
        type="button"
        className="kh-hdr__macct"
        aria-label={t('acc_title')}
        title={t('acc_title')}
        onClick={openAccount}
      >
        <AvatarFace name={me.user.name} photoV={me.assets.avatar} size={38} fontSize={13} />
      </button>
      {searching && (
        <label className="kh-hdr__search kh-hdr__glass kh-hdr__msearch">
          <span style={{ display: 'flex', opacity: 0.65 }}>
            <Icon name="search" size={16} sw={2} />
          </span>
          <input
            ref={input}
            type="search"
            name="kh-search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            data-1p-ignore=""
            data-lpignore="true"
            data-bwignore=""
            data-form-type="other"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSearching(false);
              else if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            placeholder={t('search')}
            aria-label={t('search')}
          />
          <button
            type="button"
            className="kh-hdr__mclose"
            aria-label={t('mob_searchClose')}
            title={t('mob_searchClose')}
            onClick={() => {
              setQuery('');
              setSearching(false);
            }}
          >
            <Icon name="close" size={16} sw={2.2} />
          </button>
        </label>
      )}
    </header>
  );
}

// ── Navigation drawer ──────────────────────────────────────────────────────
export function NavDrawer({
  open,
  onClose,
  onActivity,
}: {
  open: boolean;
  onClose: () => void;
  onActivity: () => void;
}) {
  const { t } = useI18n();
  const { modules, me, lock } = useShell();
  const counts = useCounts();
  const path = usePathname();
  const panel = useRef<HTMLDivElement>(null);
  const x0 = useRef<number | null>(null);
  const [tcOpen, setTcOpen] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // a new page closes it (links inside close it too, even to the same page)
  useEffect(() => {
    closeRef.current();
  }, [path]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus() ??
      panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!items.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open]);

  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <div
      id="kh-navdrawer"
      className="kh-navdrawer"
      data-open={open || undefined}
      aria-hidden={!open || undefined}
      inert={!open || undefined}
    >
      <div className="kh-navdrawer__dim" onClick={onClose} />
      <div
        ref={panel}
        className="kh-navdrawer__panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('mob_menu')}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a[href]')) onClose();
        }}
        onTouchStart={(e) => {
          x0.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const x = e.changedTouches[0]?.clientX;
          if (x0.current !== null && x !== undefined && x0.current - x > 60) onClose();
          x0.current = null;
        }}
      >
        <div className="kh-navdrawer__top">
          <Link href="/app" className="kh-hdr__brand" aria-label="KnowledgeHub">
            <Logo size={36} showWordmark={false} />
            <div className="kh-hdr__word" style={{ fontSize: 18 }}>
              <span>Knowledge</span>
              <span style={{ color: 'var(--accent-text)' }}>Hub</span>
            </div>
          </Link>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="kh-hdr__btn kh-hdr__glass"
            aria-label={t('mob_closeMenu')}
            title={t('mob_closeMenu')}
            onClick={onClose}
          >
            <Icon name="close" size={18} sw={2} />
          </button>
        </div>
        <div className="kh-navdrawer__acts">
          {modules.has('tcodes') && (
            <button
              type="button"
              className="kh-hdr__btn kh-hdr__glass"
              title="SAP TCodes"
              aria-label="SAP TCodes"
              onClick={act(() => setTcOpen(true))}
            >
              <Icon name="tcodes" size={18} />
            </button>
          )}
          {modules.has('news') && (
            <Link
              href="/app/news"
              className="kh-hdr__btn kh-hdr__glass"
              title="SAP News"
              aria-label="SAP News"
            >
              <Icon name="news" size={18} />
              {(counts.newsSaved ?? 0) > 0 && <span className="kh-hdr__badge">{counts.newsSaved}</span>}
            </Link>
          )}
          {modules.has('whiteboard') && (
            <Link
              href="/app/whiteboard"
              className="kh-hdr__btn kh-hdr__glass"
              title={t('nav_whiteboard')}
              aria-label={t('nav_whiteboard')}
            >
              <Icon name="whiteboard" />
            </Link>
          )}
          <button
            type="button"
            className="kh-hdr__btn kh-hdr__glass"
            title={t('activity')}
            aria-label={t('activity')}
            onClick={act(onActivity)}
          >
            <Icon name="activity" />
          </button>
          <div style={{ flex: 1 }} />
          {me.admin?.role === 'owner' && (
            <Link
              href="/admin"
              className="kh-hdr__btn kh-hdr__btn--admin"
              title={t('shell_adminLbl')}
              aria-label={t('shell_adminLbl')}
            >
              <Icon name="shield" sw={1.9} />
            </Link>
          )}
          <button
            type="button"
            className="kh-hdr__btn kh-hdr__btn--lock"
            title={t('lock')}
            aria-label={t('lock')}
            onClick={act(lock)}
          >
            <Icon name="lock" />
          </button>
        </div>
        <Sidebar />
      </div>
      {tcOpen && <TcodesPopup onClose={() => setTcOpen(false)} />}
    </div>
  );
}

// ── Bottom bar (phones) ────────────────────────────────────────────────────
const TABS = [
  { id: 'home', href: '/app', module: null },
  { id: 'notes', href: '/app/notes', module: 'notes' },
  { id: 'tasks', href: '/app/tasks', module: 'tasks' },
  { id: 'calendar', href: '/app/calendar', module: 'calendar' },
] as const;

export function BottomNav() {
  const { t } = useI18n();
  const { modules } = useShell();
  const path = usePathname();
  const [capture, setCapture] = useState(false);
  const tabs = TABS.filter((x) => !x.module || modules.has(x.module));
  const canCapture = ['notes', 'tasks', 'voice', 'meetings'].some((m) => modules.has(m));
  // the "+" sits in the middle: two tabs on each side when there are four
  const mid = Math.ceil(tabs.length / 2);
  const tab = (x: (typeof TABS)[number]) => (
    <Link
      key={x.id}
      href={x.href}
      scroll={false}
      className="kh-bnav__item"
      aria-current={path === x.href ? 'page' : undefined}
    >
      <NavIcon id={x.id} size={22} />
      <span>{t(`nav_${x.id}`)}</span>
    </Link>
  );
  return (
    <>
      <nav className="kh-bnav" aria-label={t('mob_tabs')}>
        {tabs.slice(0, mid).map(tab)}
        {canCapture && (
          <button
            type="button"
            className="kh-bnav__plus"
            aria-label={t('mob_capture')}
            title={t('mob_capture')}
            aria-haspopup="dialog"
            aria-expanded={capture}
            onClick={() => setCapture(true)}
          >
            <Plus size={26} />
          </button>
        )}
        {tabs.slice(mid).map(tab)}
      </nav>
      <QuickCapture open={capture} onClose={() => setCapture(false)} />
    </>
  );
}

// ── Quick capture ("+") ────────────────────────────────────────────────────
function QuickCapture({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const { modules } = useShell();
  const [busy, setBusy] = useState(false);

  // the same create calls as the pages' own "+" buttons; then the item opens
  const make = async (kind: 'note' | 'task' | 'meeting') => {
    if (busy) return;
    setBusy(true);
    try {
      if (kind === 'note') {
        const { note } = await notesApi.create(null);
        router.push(`/app/notes?n=${note.id}`);
      } else if (kind === 'task') {
        const { task } = await api<{ task: { id: string } }>('/tasks', { title: t('t_newTitle') });
        router.push(`/app/tasks?t=${task.id}`);
      } else {
        const { meeting } = await api<{ meeting: { id: string } }>('/meetings', {
          title: t('mt_newTitle'),
          heldOn: isoD(new Date()),
        });
        router.push(`/app/meetings?m=${meeting.id}`);
      }
      refreshCounts();
      onClose();
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

  const rows = [
    { m: 'notes', icon: 'notes', label: t('mob_newNote'), go: () => void make('note') },
    { m: 'tasks', icon: 'tasks', label: t('mob_newTask'), go: () => void make('task') },
    {
      m: 'voice',
      icon: 'voice',
      label: t('mob_newVoice'),
      go: () => {
        onClose();
        router.push('/app/voice');
      },
    },
    { m: 'meetings', icon: 'meetings', label: t('mob_newMeeting'), go: () => void make('meeting') },
  ].filter((r) => modules.has(r.m));

  return (
    <Sheet open={open} onClose={onClose} title={t('mob_capture')} closeLabel={t('i_close')}>
      <div className="kh-qc" aria-busy={busy || undefined}>
        {rows.map((r) => (
          <button key={r.m} type="button" className="kh-qc__item" disabled={busy} onClick={r.go}>
            <span className="kh-qc__icon">
              <NavIcon id={r.icon} size={22} />
            </span>
            <span>{r.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
