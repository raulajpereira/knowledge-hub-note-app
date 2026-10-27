'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import { PRIORITY_COLOR, type TicketPriority } from '@/lib/tickets';
import { Modal, useToast } from '@/components/ui';
import { ChipSelect, PartyField, PRIORITIES, prioLabel, type Ticket, type TicketType } from './ticketUi';

type Party = { id: string | null; name: string };
const NONE: Party = { id: null, name: '' };

/**
 * "Novo ticket": the number the person types (unique for them, any case) and
 * the one-line description are required; type, priority, client, responsible
 * and due date can be set here or later in the detail.
 */
export function NewTicketDialog({
  open,
  onClose,
  types,
  clients,
  people,
  folder,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  types: TicketType[];
  clients: Array<{ id: string; name: string }>;
  people: Array<{ id: string; name: string }>;
  /** where it goes: a folder of the caller's, or one of their own shared folders */
  folder: { folderId?: string | null; sharedFolderId?: string | null };
  onCreated: (t: Ticket) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [num, setNum] = useState('');
  const [summary, setSummary] = useState('');
  const [typeId, setTypeId] = useState('');
  const [prio, setPrio] = useState<TicketPriority>('medium');
  const [client, setClient] = useState<Party>(NONE);
  const [resp, setResp] = useState<Party>(NONE);
  const [due, setDue] = useState('');
  const [err, setErr] = useState<'num' | 'taken' | 'sum' | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setNum('');
    setSummary('');
    setTypeId(types[0]?.id ?? '');
    setPrio('medium');
    setClient(NONE);
    setResp(NONE);
    setDue('');
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when it opens
  }, [open]);

  const go = async () => {
    if (!num.trim()) return setErr('num');
    if (!summary.trim()) return setErr('sum');
    setBusy(true);
    try {
      const { ticket } = await api<{ ticket: Ticket }>('/tickets', {
        number: num.trim(),
        summary: summary.trim(),
        typeId: typeId || null,
        priority: prio,
        ...(client.id ? { clientId: client.id } : { clientName: client.name }),
        ...(resp.id ? { responsibleId: resp.id } : { responsibleName: resp.name }),
        dueOn: due || null,
        ...folder,
      });
      onCreated(ticket);
      onClose();
    } catch (e) {
      if (isApiFailure(e) && (e.code === 'ticket_number_taken' || e.code === 'conflict')) setErr('taken');
      else toast({ message: t('ne_saveFail'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const msg = err === 'taken' ? t('tk_numberTaken') : err === 'num' ? t('tk_numberReq') : null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('tk_newTitle')}
      subtitle={t('tk_newSub')}
      size="md"
      closeLabel={t('i_close')}
      className="kh-tkt-new"
      footer={
        <>
          <button type="button" className="kh-sap-ghost" onClick={onClose}>
            {t('tr_cancel')}
          </button>
          <button type="button" className="kh-sap-new" disabled={busy} onClick={() => void go()}>
            {t('tk_create')}
          </button>
        </>
      }
    >
      <div className="kh-tkt-form">
        <div className="kh-tkt-form__row kh-tkt-form__row--top">
          <label className="kh-sap-fld kh-tkt-form__num">
            <span>{t('tk_number')} *</span>
            <input
              className="kh-sap-input"
              data-mono
              autoFocus
              value={num}
              maxLength={40}
              placeholder="INC0012345"
              spellCheck={false}
              aria-invalid={err === 'num' || err === 'taken' || undefined}
              aria-describedby={msg ? 'kh-tkt-numerr' : undefined}
              onChange={(e) => {
                setNum(e.target.value);
                if (err === 'num' || err === 'taken') setErr(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && void go()}
            />
            {msg && (
              <em id="kh-tkt-numerr" className="kh-tkt-err" role="alert">
                {msg}
              </em>
            )}
          </label>
          <label className="kh-sap-fld">
            <span>{t('tk_summary')} *</span>
            <input
              className="kh-sap-input"
              value={summary}
              maxLength={300}
              placeholder={t('tk_summaryPh')}
              aria-invalid={err === 'sum' || undefined}
              onChange={(e) => {
                setSummary(e.target.value);
                if (err === 'sum') setErr(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && void go()}
            />
            {err === 'sum' && (
              <em className="kh-tkt-err" role="alert">
                {t('tk_summaryReq')}
              </em>
            )}
          </label>
        </div>
        <div className="kh-tkt-form__row">
          <label className="kh-sap-fld">
            <span>{t('tk_type')}</span>
            <select
              className="kh-sap-select"
              value={typeId}
              aria-label={t('tk_type')}
              onChange={(e) => setTypeId(e.target.value)}
            >
              <option value="">{t('tk_noType')}</option>
              {types.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <div className="kh-sap-fld">
            <span>{t('tk_priority')}</span>
            <ChipSelect
              value={prio}
              options={PRIORITIES}
              label={t('tk_priority')}
              render={(p) => prioLabel(t, p)}
              colorOf={(p) => PRIORITY_COLOR[p]}
              onChange={setPrio}
            />
          </div>
        </div>
        <div className="kh-tkt-form__row">
          <div className="kh-sap-fld">
            <span>{t('tk_client')}</span>
            <PartyField
              label={t('tk_client')}
              value={client.name}
              linked={!!client.id}
              options={clients}
              onPick={(o) => setClient(o)}
              onName={(n) => setClient({ id: null, name: n })}
            />
          </div>
          <div className="kh-sap-fld">
            <span>{t('tk_resp')}</span>
            <PartyField
              label={t('tk_resp')}
              value={resp.name}
              linked={!!resp.id}
              options={people}
              onPick={(o) => setResp(o)}
              onName={(n) => setResp({ id: null, name: n })}
            />
          </div>
        </div>
        <div className="kh-tkt-form__row">
          <label className="kh-sap-fld">
            <span>{t('tk_due')}</span>
            <input
              className="kh-sap-input"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
          <div />
        </div>
      </div>
    </Modal>
  );
}
