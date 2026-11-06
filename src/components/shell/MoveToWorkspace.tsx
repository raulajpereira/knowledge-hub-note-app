'use client';

import { useContext, useState } from 'react';
import { Button, Modal, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { wsTint, type Workspace, type WsMovable } from '@/lib/workspaces';
import { ShellContext } from './ShellContext';
import { WorkspaceDot } from './WorkspaceSwitcher';
import './workspaces.css';

// Ambientes (docs/AMBIENTES.md): "Mover para outro ambiente". The item leaves
// the active workspace for the one picked; first the server says what goes
// (a folder takes its subfolders and items) and which linked items of this
// workspace could go too — the person decides; links are kept either way.

type Ref = { type: WsMovable; id: string };
type Linked = { type: Exclude<WsMovable, 'folder'>; id: string; title: string };
type Preview = { moved: Record<WsMovable, number>; linked: Linked[]; target: { id: string; name: string } };

const ORDER: WsMovable[] = ['folder', 'note', 'task', 'meeting', 'voice', 'file'];

/** The button (shown only when the person has more than one workspace). */
export function MoveToWorkspace({ items, onMoved }: { items: Ref[]; onMoved?: () => void }) {
  const { t } = useI18n();
  const shell = useContext(ShellContext);
  const [open, setOpen] = useState(false);
  if (!shell || shell.me.workspaces.list.length < 2) return null;
  return (
    <>
      <button type="button" className="kh-ws-movebtn" onClick={() => setOpen(true)}>
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
        {t('ws_move')}
      </button>
      {open && <MoveDialog items={items} onClose={() => setOpen(false)} onMoved={onMoved} />}
    </>
  );
}

export function MoveDialog({
  items,
  onClose,
  onMoved,
}: {
  items: Ref[];
  onClose: () => void;
  onMoved?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const shell = useContext(ShellContext);
  const others = (shell?.me.workspaces.list ?? []).filter((w) => w.id !== shell?.me.workspaces.active);
  const [target, setTarget] = useState<Workspace | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [withLinked, setWithLinked] = useState(false);
  const [busy, setBusy] = useState(false);

  const pick = async (w: Workspace) => {
    setTarget(w);
    setPreview(null);
    setBusy(true);
    try {
      setPreview(await api<Preview>('/workspaces/move', { items, target: w.id, preview: true }));
    } catch {
      toast({ message: t('ws_moveFail'), tone: 'error' });
      setTarget(null);
    } finally {
      setBusy(false);
    }
  };
  const go = async () => {
    if (!target || !preview || busy) return;
    setBusy(true);
    try {
      await api('/workspaces/move', { items, target: target.id, withLinked });
      toast({ message: t('ws_moved').replace('{name}', target.name), tone: 'success' });
      onClose();
      if (onMoved) onMoved();
      // the item is no longer in this workspace: the page without it
      else window.location.assign(window.location.pathname);
    } catch {
      toast({ message: t('ws_moveFail'), tone: 'error' });
      setBusy(false);
    }
  };
  const what = preview
    ? ORDER.filter((k) => preview.moved[k] > 0)
        .map((k) => `${preview.moved[k]} ${t(preview.moved[k] === 1 ? `ws_k1_${k}` : `ws_k_${k}`)}`)
        .join(' · ')
    : '';

  return (
    <Modal
      open
      onClose={onClose}
      title={t('ws_move')}
      subtitle={t('ws_moveDesc')}
      closeLabel={t('i_close')}
      footer={
        <>
          <Button variant="glass" onClick={onClose}>
            {t('tr_cancel')}
          </Button>
          <Button variant="primary" onClick={() => void go()} disabled={busy || !preview}>
            {t('ws_moveGo')}
          </Button>
        </>
      }
    >
      <div className="kh-ws-form">
        <div className="kh-ws-form__f">
          <span className="kh-ws-form__l">{t('ws_moveTo')}</span>
          <div className="kh-ws-targets" role="radiogroup" aria-label={t('ws_moveTo')}>
            {others.map((w) => (
              <button
                key={w.id}
                type="button"
                role="radio"
                aria-checked={target?.id === w.id}
                className="kh-ws-item"
                data-on={target?.id === w.id || undefined}
                onClick={() => void pick(w)}
              >
                <span
                  className="kh-ws-item__ic"
                  style={{ background: `color-mix(in oklch, ${wsTint(w)} 35%, transparent)` }}
                >
                  {w.icon || <WorkspaceDot w={w} size={12} />}
                </span>
                <span className="kh-ws-item__t">
                  <b>{w.name}</b>
                </span>
              </button>
            ))}
          </div>
        </div>
        {preview && (
          <>
            <p className="kh-ws-form__info">{t('ws_moveWill').replace('{what}', what)}</p>
            {preview.linked.length > 0 && (
              <div className="kh-ws-linked">
                <span>{t('ws_moveLinked').replace('{n}', String(preview.linked.length))}</span>
                <ul>
                  {preview.linked.map((l) => (
                    <li key={l.id}>
                      <em>{t(`ws_k1_${l.type}`)}</em> {l.title || '—'}
                    </li>
                  ))}
                </ul>
                <label className="kh-ws-mod" data-on={withLinked || undefined}>
                  <input
                    type="checkbox"
                    checked={withLinked}
                    onChange={(e) => setWithLinked(e.target.checked)}
                  />
                  <span>{t('ws_moveLinkedAll')}</span>
                </label>
                <span className="kh-ws-form__hint">{t('ws_moveLinkedKeep')}</span>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
