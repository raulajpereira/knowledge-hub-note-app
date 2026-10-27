'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import { Modal, useToast } from '@/components/ui';
import { I, Ico, type TicketType } from './ticketUi';
import './tickets.css';

// Definições dos tickets: the person's list of types ("Tipo") — add, rename,
// reorder, remove (the tickets of a removed type stay, without one). In their
// shared folders everyone uses this list.

export function TicketTypesEditor({ onChange }: { onChange?: (types: TicketType[]) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [types, setTypes] = useState<TicketType[] | null>(null);
  const [name, setName] = useState('');
  const set = (x: TicketType[]) => {
    setTypes(x);
    onChange?.(x);
  };
  useEffect(() => {
    api<{ types: TicketType[] }>('/tickets/types')
      .then((r) => setTypes(r.types))
      .catch(() => setTypes([]));
  }, []);
  const fail = (e: unknown) =>
    toast({
      message: t(
        isApiFailure(e) && e.code === 'ticket_type_taken'
          ? 'tk_typeTaken'
          : isApiFailure(e) && e.code === 'ticket_type_last'
            ? 'tk_typeLast'
            : 'ne_saveFail',
      ),
      tone: 'error',
    });
  const add = async () => {
    const n = name.trim();
    if (!n || !types) return;
    try {
      const { type } = await api<{ type: TicketType }>('/tickets/types', { name: n.slice(0, 60) });
      set([...types, type]);
      setName('');
    } catch (e) {
      fail(e);
    }
  };
  const rename = async (x: TicketType, n: string) => {
    const v = n.trim();
    if (!types || !v || v === x.name) return;
    try {
      await api(`/tickets/types/${x.id}`, { name: v.slice(0, 60) }, 'PATCH');
      set(types.map((y) => (y.id === x.id ? { ...y, name: v } : y)));
    } catch (e) {
      fail(e);
      set([...types]);
    }
  };
  const remove = async (x: TicketType) => {
    if (!types) return;
    try {
      await api(`/tickets/types/${x.id}`, undefined, 'DELETE');
      set(types.filter((y) => y.id !== x.id));
    } catch (e) {
      fail(e);
    }
  };
  const move = async (i: number, d: -1 | 1) => {
    if (!types) return;
    const next = [...types];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    set(next);
    await api('/tickets/types', { ids: next.map((y) => y.id) }, 'PUT').catch(fail);
  };

  return (
    <div className="kh-tkt-types">
      <div className="kh-tkt-types__list" role="list" aria-label={t('tk_types')}>
        {(types ?? []).map((x, i) => (
          <div key={x.id} className="kh-tkt-types__row" role="listitem">
            <input
              className="kh-sap-input"
              defaultValue={x.name}
              maxLength={60}
              aria-label={`${t('tk_type')} ${i + 1}`}
              onBlur={(e) => void rename(x, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <button
              type="button"
              className="kh-sap-ico"
              disabled={i === 0}
              title={t('tk_typeUp')}
              aria-label={`${t('tk_typeUp')}: ${x.name}`}
              onClick={() => void move(i, -1)}
            >
              <Ico d={I.up} s={14} w={2.2} />
            </button>
            <button
              type="button"
              className="kh-sap-ico"
              disabled={i === (types?.length ?? 0) - 1}
              title={t('tk_typeDown')}
              aria-label={`${t('tk_typeDown')}: ${x.name}`}
              onClick={() => void move(i, 1)}
            >
              <Ico d={I.chev} s={14} w={2.2} />
            </button>
            <button
              type="button"
              className="kh-sap-ico kh-sap-ico--del"
              disabled={(types?.length ?? 0) <= 1}
              title={t('tk_typeDel')}
              aria-label={`${t('tk_typeDel')}: ${x.name}`}
              onClick={() => void remove(x)}
            >
              <Ico d={I.trash} s={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="kh-tkt-types__add">
        <input
          className="kh-sap-input"
          value={name}
          maxLength={60}
          placeholder={t('tk_typePh')}
          aria-label={t('tk_typePh')}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
        />
        <button type="button" className="kh-sap-new" disabled={!name.trim()} onClick={() => void add()}>
          <Ico d={I.plus} s={14} w={2.4} />
          {t('tk_typeAdd')}
        </button>
      </div>
    </div>
  );
}

/** The gear of the Tickets screen: the type list in a dialog. */
export function TicketSettingsDialog({
  open,
  onClose,
  onTypes,
}: {
  open: boolean;
  onClose: () => void;
  onTypes: (types: TicketType[]) => void;
}) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('tk_types')}
      subtitle={t('tk_typesDesc')}
      size="sm"
      closeLabel={t('i_close')}
    >
      {open && <TicketTypesEditor onChange={onTypes} />}
    </Modal>
  );
}

/** Definições › SAP: the same list as a card. */
export function TicketTypesCard() {
  const { t } = useI18n();
  return (
    <div className="kh-set__card">
      <div className="kh-set__head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="kh-set__title">{t('tk_types')}</div>
          <div className="kh-set__desc">{t('tk_typesDesc')}</div>
        </div>
      </div>
      <TicketTypesEditor />
    </div>
  );
}
