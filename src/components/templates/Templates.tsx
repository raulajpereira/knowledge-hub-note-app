'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { builtinTemplates, type Tpl, type TplBody, type TplKind } from '@/lib/templates';
import { Button, Input, Modal, Popover, useConfirm, useToast } from '@/components/ui';
import './templates.css';

// Modelos: a "Modelos" button that lists the ready-made SAP templates and the
// person's own (each can be deleted), and "Guardar como modelo" for the item
// being edited.

const ICON =
  '<rect x="4" y="3" width="16" height="18" rx="2.5"></rect><line x1="8" y1="8" x2="16" y2="8"></line><line x1="8" y1="12" x2="16" y2="12"></line><line x1="8" y1="16" x2="12" y2="16"></line>';
const SAVE =
  '<rect x="4" y="3" width="16" height="18" rx="2.5"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line>';
const Svg = ({ d, s = 15 }: { d: string; s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: d }}
  />
);

export function TemplateButton({
  kind,
  onPick,
  compact,
  className,
}: {
  kind: TplKind;
  onPick: (tpl: Tpl) => void;
  /** icon only (narrow toolbars) */
  compact?: boolean;
  className?: string;
}) {
  const { t, lang } = useI18n();
  const confirm = useConfirm();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<'left' | 'right'>('left');
  const [own, setOwn] = useState<Tpl[] | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const builtin = builtinTemplates(kind, lang);

  const load = useCallback(() => {
    api<{ templates: Tpl[] }>(`/templates?kind=${kind}`)
      .then((r) => setOwn(r.templates))
      .catch(() => setOwn([]));
  }, [kind]);
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const pick = (tpl: Tpl) => {
    setOpen(false);
    onPick(tpl);
  };
  const remove = async (tpl: Tpl) => {
    const ok = await confirm({
      title: t('tp_delT'),
      body: tpl.name,
      confirmLabel: t('del'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    await api(`/templates/${tpl.id}`, undefined, 'DELETE').catch(() =>
      toast({ message: t('ui_delFail'), tone: 'error' }),
    );
    load();
  };

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`kh-tp-btn${compact ? ' kh-tp-btn--icon' : ''}${className ? ` ${className}` : ''}`}
        title={t('tp_title')}
        aria-label={t('tp_title')}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          // open towards the side with room
          const r = ref.current?.getBoundingClientRect();
          setSide(r && r.left > window.innerWidth / 2 ? 'right' : 'left');
          setOpen((v) => !v);
        }}
      >
        <Svg d={ICON} />
        {!compact && <span>{t('tp_title')}</span>}
      </button>
      {open && (
        <Popover
          anchor={ref}
          align={side}
          onClose={() => setOpen(false)}
          className="kh-tp-menu"
          width={330}
          maxHeight={520}
          role="menu"
          aria-label={t('tp_title')}
        >
          <div className="kh-tp-sec">{t('tp_builtin')}</div>
          {builtin.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              role="menuitem"
              className="kh-tp-item"
              onClick={() => pick(tpl)}
            >
              <b>{tpl.name}</b>
              {tpl.desc && <small>{tpl.desc}</small>}
            </button>
          ))}
          <div className="kh-tp-sec">{t('tp_mine')}</div>
          {own?.map((tpl) => (
            <div key={tpl.id} className="kh-tp-own">
              <button type="button" role="menuitem" className="kh-tp-item" onClick={() => pick(tpl)}>
                <b>{tpl.name}</b>
              </button>
              <button
                type="button"
                className="kh-tp-del"
                title={t('del')}
                aria-label={`${t('del')} ${tpl.name}`}
                onClick={() => void remove(tpl)}
              >
                ×
              </button>
            </div>
          ))}
          {own && !own.length && <p className="kh-tp-none">{t('tp_none')}</p>}
        </Popover>
      )}
    </>
  );
}

/** "Guardar como modelo": asks for a name and saves what `body()` returns. */
export function SaveTemplateButton({
  kind,
  body,
  defaultName,
  compact,
  className,
}: {
  kind: TplKind;
  body: () => TplBody;
  defaultName: string;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    setErr('');
    try {
      await api('/templates', { kind, name: n, body: body() });
      setOpen(false);
      toast({ message: t('tp_saved'), tone: 'success' });
    } catch {
      setErr(t('tp_err'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`kh-tp-btn${compact ? ' kh-tp-btn--icon' : ''}${className ? ` ${className}` : ''}`}
        title={t('tp_save')}
        aria-label={t('tp_save')}
        onClick={() => {
          setName(defaultName.slice(0, 120));
          setErr('');
          setOpen(true);
        }}
      >
        <Svg d={SAVE} />
        {!compact && <span>{t('tp_save')}</span>}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('tp_save')}
        subtitle={t('tp_saveSub')}
        size="sm"
        closeLabel={t('ai_close')}
        footer={
          <>
            <Button variant="glass" onClick={() => setOpen(false)}>
              {t('tr_cancel')}
            </Button>
            <Button variant="primary" disabled={!name.trim() || busy} onClick={() => void save()}>
              {t('tp_saveBtn')}
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
            maxLength={120}
            aria-label={t('tp_name')}
            placeholder={t('tp_name')}
            onChange={(e) => setName(e.target.value)}
          />
          {err && <p className="kh-tp-err">{err}</p>}
        </form>
      </Modal>
    </>
  );
}
