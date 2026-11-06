'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { Button, Modal, Popover, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { WS_COLORS, WS_ICONS, wsTint, type Workspace } from '@/lib/workspaces';
import { useShell } from './ShellContext';
import './workspaces.css';

// Ambientes (docs/AMBIENTES.md): the pill next to the logo shows the active
// workspace (its colour and name); its menu lists the person's workspaces and
// opens "Personalizar". Creating more arrives with phase 2b.

export function WorkspaceDot({ w, size = 10 }: { w: Pick<Workspace, 'color'>; size?: number }) {
  const c = wsTint(w);
  return (
    <span
      className="kh-ws-dot"
      style={{ width: size, height: size, background: c, boxShadow: `0 0 10px ${c}` }}
      aria-hidden="true"
    />
  );
}

export function WorkspaceSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { me } = useShell();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Workspace | null>(null);
  const list = me.workspaces.list;
  const active = list.find((w) => w.id === me.workspaces.active) ?? list[0];
  if (!active) return null;

  const switchTo = async (w: Workspace) => {
    setOpen(false);
    if (w.id === active.id) return;
    try {
      await api('/workspaces/active', { id: w.id }, 'PUT');
      // the look and the lists of the other workspace come from the server
      window.location.assign(`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/app`);
    } catch {
      toast({ message: t('ws_switchFail'), tone: 'error' });
    }
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="kh-ws-pill"
        data-compact={compact || undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('ws_title')}: ${active.name}`}
        title={t('ws_title')}
        onClick={() => setOpen((o) => !o)}
      >
        {active.icon ? <span className="kh-ws-pill__ic">{active.icon}</span> : <WorkspaceDot w={active} />}
        {!compact && <span className="kh-ws-pill__n">{active.name}</span>}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <Popover
          anchor={btn}
          align="left"
          onClose={() => setOpen(false)}
          className="kh-ws-menu"
          width={320}
          role="menu"
          aria-label={t('ws_title')}
        >
          <div className="kh-ws-menu__h">{t('ws_title')}</div>
          {list.map((w) => (
            <button
              key={w.id}
              type="button"
              role="menuitemradio"
              aria-checked={w.id === active.id}
              className="kh-ws-item"
              data-on={w.id === active.id || undefined}
              onClick={() => void switchTo(w)}
            >
              <span
                className="kh-ws-item__ic"
                style={{ background: `color-mix(in oklch, ${wsTint(w)} 35%, transparent)` }}
              >
                {w.icon || <WorkspaceDot w={w} size={12} />}
              </span>
              <span className="kh-ws-item__t">
                <b>{w.name}</b>
                <span>{w.id === active.id ? t('ws_active') : t('ws_switch')}</span>
              </span>
            </button>
          ))}
          <div className="kh-ws-menu__sep" />
          <button
            type="button"
            role="menuitem"
            className="kh-ws-item"
            onClick={() => {
              setOpen(false);
              setEditing(active);
            }}
          >
            <span className="kh-ws-item__ic kh-ws-item__ic--plain">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </span>
            <span className="kh-ws-item__t">
              <b>{t('ws_customize')}</b>
              <span>{t('ws_customizeSub')}</span>
            </span>
          </button>
        </Popover>
      )}
      {editing && (
        <WorkspaceDialog
          w={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function WorkspaceDialog({
  w,
  onClose,
  onSaved,
}: {
  w: Workspace;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState(w.name);
  const [color, setColor] = useState(w.color || WS_COLORS[0]);
  const [icon, setIcon] = useState(w.icon);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api(`/workspaces/${w.id}`, { name: name.trim(), color, icon }, 'PATCH');
      toast({ message: t('ws_saved'), tone: 'success' });
      onSaved();
    } catch {
      toast({ message: t('ws_saveFail'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('ws_customize')}
      subtitle={t('ws_customizeDesc')}
      closeLabel={t('i_close')}
      footer={
        <>
          <Button variant="glass" onClick={onClose}>
            {t('tr_cancel')}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy || !name.trim()}>
            {t('ws_save')}
          </Button>
        </>
      }
    >
      <div className="kh-ws-form">
        <label className="kh-ws-form__f" htmlFor={`${id}-n`}>
          <span className="kh-ws-form__l">{t('ws_name')}</span>
          <input
            id={`${id}-n`}
            className="kh-ws-form__in"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            data-autofocus=""
          />
        </label>
        <div className="kh-ws-form__f">
          <span className="kh-ws-form__l">{t('ws_color')}</span>
          <div className="kh-ws-form__row" role="radiogroup" aria-label={t('ws_color')}>
            {WS_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                className="kh-ws-sw"
                data-on={color === c || undefined}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        <div className="kh-ws-form__f">
          <span className="kh-ws-form__l">{t('ws_icon')}</span>
          <div className="kh-ws-form__row" role="radiogroup" aria-label={t('ws_icon')}>
            <button
              type="button"
              role="radio"
              aria-checked={icon === ''}
              className="kh-ws-ic"
              data-on={icon === '' || undefined}
              onClick={() => setIcon('')}
            >
              <WorkspaceDot w={{ color }} size={12} />
            </button>
            {WS_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                role="radio"
                aria-checked={icon === ic}
                className="kh-ws-ic"
                data-on={icon === ic || undefined}
                onClick={() => setIcon(ic)}
              >
                {ic}
              </button>
            ))}
          </div>
        </div>
        <div className="kh-ws-form__look">
          <span>{t('ws_lookHint')}</span>
          <Button
            variant="glass"
            onClick={() => {
              onClose();
              router.push('/app/settings?tab=look');
            }}
          >
            {t('ws_lookOpen')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
