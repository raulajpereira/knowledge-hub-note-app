'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { Button, Modal, Popover, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import { WS_COLORS, WS_EVERYWHERE, WS_ICONS, WS_SEPARATED, wsTint, type Workspace } from '@/lib/workspaces';
import { useShell } from './ShellContext';
import './workspaces.css';

// Ambientes (docs/AMBIENTES.md): the pill next to the logo shows the active
// workspace (its colour and name); its menu lists the person's workspaces,
// creates a new one and opens "Personalizar" (name, colour, icon, modules,
// delete an empty one).

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
  const [editing, setEditing] = useState<Workspace | 'new' | null>(null);
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
              setEditing('new');
            }}
          >
            <span className="kh-ws-item__ic kh-ws-item__ic--plain">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span className="kh-ws-item__t">
              <b>{t('ws_new')}</b>
              <span>{t('ws_newSub')}</span>
            </span>
          </button>
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
          w={editing === 'new' ? null : editing}
          first={editing !== 'new' && editing.id === list[0]?.id}
          canDelete={editing !== 'new' && list.length > 1}
          isActive={editing !== 'new' && editing.id === active.id}
          planModules={me.workspaces.planModules}
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

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** The modules a workspace can show: all of the plan in the first one, the separated ones in the others. */
function choosable(planModules: string[], first: boolean) {
  const everywhere = WS_EVERYWHERE as readonly string[];
  return planModules.filter(
    (m) => !everywhere.includes(m) && (first || (WS_SEPARATED as readonly string[]).includes(m)),
  );
}

function WorkspaceDialog({
  w,
  first,
  canDelete,
  isActive,
  planModules,
  onClose,
  onSaved,
}: {
  /** null: a new workspace */
  w: Workspace | null;
  first: boolean;
  canDelete: boolean;
  isActive: boolean;
  planModules: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const id = useId();
  const options = choosable(planModules, first);
  const [name, setName] = useState(w?.name ?? '');
  const [color, setColor] = useState(w?.color || WS_COLORS[w ? 0 : 1]);
  const [icon, setIcon] = useState(w?.icon ?? '');
  const [mods, setMods] = useState<string[]>(() =>
    w?.modules ? options.filter((m) => w.modules!.includes(m)) : options,
  );
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [problem, setProblem] = useState('');

  const toggle = (m: string) => setMods((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m]));
  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setProblem('');
    // every module chosen in the first workspace: none listed (it keeps the plan's new ones too)
    const modules = first && mods.length === options.length ? null : mods;
    try {
      if (!w) {
        const r = await api<{ workspace: Workspace }>('/workspaces', {
          name: name.trim(),
          color,
          icon,
          modules,
        });
        toast({ message: t('ws_created').replace('{name}', r.workspace.name), tone: 'success' });
        // straight into the new workspace
        await api('/workspaces/active', { id: r.workspace.id }, 'PUT');
        window.location.assign(`${BASE}/app`);
        return;
      }
      await api(`/workspaces/${w.id}`, { name: name.trim(), color, icon, modules }, 'PATCH');
      toast({ message: t('ws_saved'), tone: 'success' });
      onSaved();
    } catch (e) {
      if (isApiFailure(e) && e.code === 'limit_reached')
        setProblem(t('ws_limit').replace('{max}', String(e.data?.max ?? '')));
      else toast({ message: t(w ? 'ws_saveFail' : 'ws_createFail'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!w || busy) return;
    setBusy(true);
    setProblem('');
    try {
      await api(`/workspaces/${w.id}`, undefined, 'DELETE');
      toast({ message: t('ws_deleted'), tone: 'success' });
      if (isActive) window.location.assign(`${BASE}/app`);
      else onSaved();
    } catch (e) {
      setConfirmDel(false);
      if (isApiFailure(e) && e.code === 'workspace_not_empty') {
        const items = (e.data?.items ?? {}) as Record<string, number>;
        const n = Object.values(items).reduce((a, b) => a + b, 0);
        setProblem(t('ws_notEmpty').replace('{n}', String(n)));
      } else if (isApiFailure(e) && e.code === 'last_workspace') setProblem(t('ws_last'));
      else toast({ message: t('ws_deleteFail'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={w ? t('ws_customize') : t('ws_new')}
      subtitle={w ? t('ws_customizeDesc') : t('ws_newDesc')}
      closeLabel={t('i_close')}
      footer={
        <>
          {w && canDelete && (
            <span className="kh-ws-form__del">
              {confirmDel ? (
                <Button variant="danger" onClick={() => void remove()} disabled={busy}>
                  {t('ws_delete')}
                </Button>
              ) : (
                <Button variant="danger-ghost" onClick={() => setConfirmDel(true)} disabled={busy}>
                  {t('ws_delete')}
                </Button>
              )}
            </span>
          )}
          <Button variant="glass" onClick={onClose}>
            {t('tr_cancel')}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy || !name.trim()}>
            {w ? t('ws_save') : t('ws_create')}
          </Button>
        </>
      }
    >
      <div className="kh-ws-form">
        {confirmDel && w && (
          <p className="kh-ws-form__warn" role="alert">
            {t('ws_deleteAsk').replace('{name}', w.name)}
          </p>
        )}
        {problem && (
          <p className="kh-ws-form__warn" role="alert">
            {problem}
          </p>
        )}
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
        {options.length > 0 && (
          <div className="kh-ws-form__f">
            <span className="kh-ws-form__l">{t('ws_modules')}</span>
            <div className="kh-ws-mods">
              {options.map((m) => (
                <label key={m} className="kh-ws-mod" data-on={mods.includes(m) || undefined}>
                  <input type="checkbox" checked={mods.includes(m)} onChange={() => toggle(m)} />
                  <span>{t(`nav_${m}`)}</span>
                </label>
              ))}
            </div>
            {!first && <span className="kh-ws-form__hint">{t('ws_modulesFirst')}</span>}
          </div>
        )}
        {w && (
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
        )}
      </div>
    </Modal>
  );
}
