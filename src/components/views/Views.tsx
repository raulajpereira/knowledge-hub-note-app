'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Input, Modal, Popover, useConfirm, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { refreshViews, viewHref, VIEWS_EVENT, type SavedView } from '@/lib/views';
import { Icon, NavIcon } from '@/components/shell/icons';
import { usePref } from '@/components/shell/PrefsProvider';
import './views.css';

// "Vistas guardadas" (smart folders): the "Guardar vista" dialog the Notes and
// Tasks pages open, and the "Vistas" group of the sidebar — each view with
// its live count, opening its page with the filter in the URL.

/** Asks for a name and saves the filter as a view (or renames one). */
export function ViewNameDialog({
  open,
  title,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  initial: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  const save = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      await onSave(n);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={t('vw_saveSub')}
      size="sm"
      closeLabel={t('i_close')}
      footer={
        <>
          <Button variant="glass" onClick={onClose}>
            {t('tr_cancel')}
          </Button>
          <Button variant="primary" disabled={!name.trim() || busy} onClick={() => void save()}>
            {t('vw_saveBtn')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input
          size="md"
          data-autofocus
          value={name}
          maxLength={60}
          aria-label={t('vw_name')}
          placeholder={t('vw_name')}
          onChange={(e) => setName(e.target.value)}
        />
      </form>
    </Modal>
  );
}

/** Saves a filter as a new view; resolves with it (the caller puts its id in the URL). */
export async function saveView(kind: 'notes' | 'tasks', name: string, filter: unknown) {
  const r = await api<{ view: SavedView }>('/views', { kind, name, filter });
  refreshViews();
  return r.view;
}

function useViews() {
  const [views, setViews] = useState<SavedView[] | null>(null);
  const load = useCallback(
    () =>
      api<{ views: SavedView[] }>('/views')
        .then((r) => setViews(r.views))
        .catch(() => {}),
    [],
  );
  useEffect(() => {
    void load();
    // counts change with the content: reload with the sidebar badges
    window.addEventListener(VIEWS_EVENT, load);
    window.addEventListener('kh:counts', load);
    return () => {
      window.removeEventListener(VIEWS_EVENT, load);
      window.removeEventListener('kh:counts', load);
    };
  }, [load]);
  return { views, setViews, load };
}

function ViewMenu({
  view,
  first,
  last,
  onRename,
  onMove,
  onDelete,
}: {
  view: SavedView;
  first: boolean;
  last: boolean;
  onRename: () => void;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const item = (label: string, f: () => void, danger?: boolean, disabled?: boolean) => (
    <button
      type="button"
      role="menuitem"
      className="kh-vw-mi"
      data-danger={danger || undefined}
      disabled={disabled}
      onClick={() => {
        setOpen(false);
        f();
      }}
    >
      {label}
    </button>
  );
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="kh-vw-more"
        aria-label={`${t('vw_actions')} ${view.name}`}
        title={t('vw_actions')}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        ⋯
      </button>
      {open && (
        <Popover
          anchor={ref}
          align="left"
          onClose={() => setOpen(false)}
          className="kh-vw-menu"
          width={190}
          role="menu"
          aria-label={view.name}
        >
          {item(t('vw_rename'), onRename)}
          {item(t('vw_up'), () => onMove(-1), false, first)}
          {item(t('vw_down'), () => onMove(1), false, last)}
          {item(t('del'), onDelete, true)}
        </Popover>
      )}
    </>
  );
}

/** Sidebar group "Vistas": the saved views, with icon and live count. */
export function SidebarViews() {
  const { t } = useI18n();
  const path = usePathname();
  const sp = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { views, setViews, load } = useViews();
  const [open, setOpen] = usePref<boolean>('ui.viewsOpen', true);
  const [renaming, setRenaming] = useState<SavedView | null>(null);
  if (!views?.length) return null;
  const active = sp.get('view');

  const move = async (i: number, d: -1 | 1) => {
    const next = [...views];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    setViews(next);
    await api('/views/order', { ids: next.map((v) => v.id) }, 'POST').catch(() => void load());
  };
  const remove = async (v: SavedView) => {
    const ok = await confirm({
      title: t('vw_delT'),
      body: t('vw_delB').replace('{x}', v.name),
      confirmLabel: t('del'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/views/${v.id}`, undefined, 'DELETE');
      setViews(views.filter((x) => x.id !== v.id));
    } catch {
      toast({ message: t('ui_delFail'), tone: 'error' });
    }
  };

  return (
    <div className="kh-vw" aria-label={t('vw_group')} role="group">
      <button type="button" className="kh-nav__group" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="chevDown" size={12} sw={2.6} />
        <span>{t('vw_group')}</span>
      </button>
      {open &&
        views.map((v, i) => {
          const href = viewHref(v);
          const on = active === v.id && path === href.split('?')[0];
          return (
            <div key={v.id} className="kh-vw-row" data-on={on || undefined}>
              <Link
                scroll={false}
                href={href}
                className="kh-nav__item kh-vw-item"
                aria-current={on ? 'page' : undefined}
                title={v.name}
              >
                <span className="kh-nav__icon kh-vw-icon">
                  <NavIcon id={v.kind} size={16} />
                </span>
                <span className="kh-nav__label">{v.name}</span>
                {v.count !== null && <span className="kh-nav__count">{v.count}</span>}
              </Link>
              <ViewMenu
                view={v}
                first={i === 0}
                last={i === views.length - 1}
                onRename={() => setRenaming(v)}
                onMove={(d) => void move(i, d)}
                onDelete={() => void remove(v)}
              />
            </div>
          );
        })}
      <ViewNameDialog
        open={!!renaming}
        title={t('vw_rename')}
        initial={renaming?.name ?? ''}
        onClose={() => setRenaming(null)}
        onSave={async (name) => {
          if (!renaming) return;
          try {
            await api(`/views/${renaming.id}`, { name }, 'PATCH');
            setViews(views.map((x) => (x.id === renaming.id ? ({ ...x, name } as SavedView) : x)));
            setRenaming(null);
          } catch {
            toast({ message: t('ne_saveFail'), tone: 'error' });
          }
        }}
      />
    </div>
  );
}
