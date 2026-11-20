'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { useMgOptions } from '@/components/mg/useMgOptions';
import { refreshCounts } from '@/components/shell/counts';
import { useListDetail } from '@/components/content/MobilePane';
import { SidePanel } from '@/components/sap/SidePanel';
import { useSharedFolders } from '@/components/share/useSharedFolders';
import { Select, useConfirm, usePersistentState, useToast } from '@/components/ui';
import { isDone, type TicketStatus } from '@/lib/tickets';
import type { HdStatusKind } from '@/lib/helpdesk';
import { TicketTime, TicketTimeButton, useTicketTime, type TicketRef } from './TicketTime';
import { NewTicketDialog } from '@/components/tickets/NewTicketDialog';
import { TicketDetail } from '@/components/tickets/TicketDetail';
import {
  overdue,
  PRIORITIES,
  prioLabel,
  STATUSES,
  statusLabel,
  type Ticket,
  type TicketType,
} from '@/components/tickets/ticketUi';
import '@/components/tickets/tickets.css';

// Helpdesk › Manuais: the tickets created here by hand (the former Tickets
// page), shown like the synced ones: the same columns, status colours,
// filters and order. A ticket opens on the right with its notes, files and
// history. Nothing moves: they are the same tickets, folders and shares.

type Folder = { id: string; name: string };
const HOT = '\u0000hot';

/** a manual ticket's status in the helpdesk's colours */
export const tkKind = (s: TicketStatus): HdStatusKind =>
  s === 'open' ? 'open' : s === 'progress' ? 'progress' : isDone(s) ? 'done' : 'pending';
const RANK: Record<HdStatusKind, number> = { reopen: 0, open: 0, progress: 0, pending: 1, other: 1, done: 2 };

const day = (iso: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}${y && y !== String(new Date().getFullYear()) ? `/${y.slice(2)}` : ''}`;
};

export function useManualTickets(enabled: boolean) {
  const [items, setItems] = useState<Ticket[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [types, setTypes] = useState<TicketType[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const sh = useSharedFolders('tickets');
  const [fFolder, setFFolder] = usePersistentState<string>('hd.m.fFolder', '');
  const curShared = fFolder.startsWith('sh:') ? sh.folders.find((x) => `sh:${x.id}` === fFolder) : undefined;
  // someone else's shared folder: its own list
  const [other, setOther] = useState<{ id: string; tickets: Ticket[]; types: TicketType[] } | null>(null);
  useEffect(() => {
    if (!enabled || !curShared || curShared.mine) return;
    let live = true;
    api<{ tickets: Ticket[]; types: TicketType[] }>(`/tickets?shared=${curShared.id}`)
      .then((r) => live && setOther({ id: curShared.id, tickets: r.tickets, types: r.types }))
      .catch(() => live && setOther({ id: curShared.id, tickets: [], types: [] }));
    return () => {
      live = false;
    };
  }, [enabled, curShared]);
  const load = useCallback(() => {
    api<{ tickets: Ticket[]; folders: Folder[]; types: TicketType[] }>('/tickets')
      .then((r) => {
        setItems(r.tickets);
        setFolders(r.folders);
        setTypes(r.types);
      })
      .catch(() => setItems([]));
  }, []);
  useEffect(() => {
    if (!enabled) return;
    load();
    api<{ clients: Array<{ id: string; name: string }> }>('/sap/clients')
      .then((r) => setClients(r.clients))
      .catch(() => {});
  }, [enabled, load]);
  return {
    items,
    setItems,
    folders,
    types,
    clients,
    reload: load,
    sh,
    fFolder,
    setFFolder,
    curShared,
    other,
    setOther,
  };
}
export type Manual = ReturnType<typeof useManualTickets>;

export function ManualTable({
  m,
  q,
  head,
  cols,
}: {
  m: Manual;
  q: string;
  /** the table's header (the helpdesk's, with resizable columns) */
  head: (keys: string[]) => React.ReactNode;
  cols: React.CSSProperties | undefined;
}) {
  const { t } = useI18n();
  const md = useListDetail('k');
  const sp = useSearchParams();
  const pathname = usePathname();
  const activeId = sp.get('k');
  const { people } = useMgOptions();
  const { sh, fFolder, setFFolder, curShared, other } = m;
  const [newOpen, setNewOpen] = useState(false);
  const [fStatus, setFStatus] = usePersistentState<string>('hd.m.fStatus', '');
  const [fPrio, setFPrio] = usePersistentState<string>('hd.m.fPrio', '');
  const [fClient, setFClient] = usePersistentState<string>('hd.m.fClient', '');
  const incoming = sh.folders.filter((x) => !x.mine);
  const isIncoming = !!curShared && !curShared.mine;
  const own = useMemo(() => m.items ?? [], [m.items]);
  const base = useMemo(
    () =>
      isIncoming
        ? other?.id === curShared!.id
          ? other.tickets
          : []
        : own.filter((x) =>
            !fFolder
              ? true
              : curShared
                ? x.sharedFolderId === curShared.id ||
                  (!!curShared.folderId && x.folderId === curShared.folderId)
                : x.folderId === fFolder,
          ),
    [isIncoming, other, curShared, own, fFolder],
  );
  const typeList = isIncoming ? (other?.types ?? []) : m.types;
  const typeName = (id: string | null) => typeList.find((y) => y.id === id)?.name ?? '';
  const clientOpts = useMemo(
    () =>
      [...new Set(base.map((x) => x.clientName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt')),
    [base],
  );

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return base
      .filter(
        (x) =>
          (!k ||
            [x.number, x.summary, x.clientName, x.responsibleName, statusLabel(t, x.status)].some((v) =>
              v.toLowerCase().includes(k),
            )) &&
          (!fClient || x.clientName === fClient) &&
          (!fPrio || x.priority === fPrio) &&
          (!fStatus || (fStatus === HOT ? RANK[tkKind(x.status)] === 0 : x.status === fStatus)),
      )
      .sort(
        (a, b) =>
          RANK[tkKind(a.status)] - RANK[tkKind(b.status)] || Date.parse(b.openedAt) - Date.parse(a.openedAt),
      );
  }, [base, q, fClient, fPrio, fStatus, t]);
  const filtered = !!(fClient || fPrio || fStatus || fFolder);
  const open = (id: string) => {
    // the router's path (without the base path)
    const u = new URLSearchParams(sp.toString());
    u.set('k', id);
    md.go(`${pathname}?${u}`, id);
  };

  return (
    <>
      <div className="kh-hd-filters">
        <div>
          <Select
            value={fStatus}
            options={[
              { value: '', label: t('hd_allStatus') },
              { value: HOT, label: t('hd_hot') },
              ...STATUSES.map((s) => ({ value: s, label: statusLabel(t, s) })),
            ]}
            onChange={setFStatus}
            searchPlaceholder={t('hd_f_status')}
            aria-label={t('hd_f_status')}
          />
        </div>
        <div>
          <Select
            value={fPrio}
            options={[
              { value: '', label: t('hd_allPrio') },
              ...PRIORITIES.map((p) => ({ value: p, label: prioLabel(t, p) })),
            ]}
            onChange={setFPrio}
            searchPlaceholder={t('hd_f_priority')}
            aria-label={t('hd_f_priority')}
          />
        </div>
        <div>
          <Select
            value={fClient}
            options={[
              { value: '', label: t('hd_allClients') },
              ...clientOpts.map((v) => ({ value: v, label: v })),
            ]}
            onChange={setFClient}
            searchPlaceholder={t('hd_f_client')}
            aria-label={t('hd_f_client')}
          />
        </div>
        {(m.folders.length > 0 || sh.folders.length > 0) && (
          <div>
            <Select
              value={fFolder}
              options={[
                { value: '', label: t('hd_allFolders') },
                ...m.folders.map((f) => ({ value: f.id, label: f.name })),
                ...sh.folders
                  .filter((x) => x.mine && !x.folderId)
                  .map((x) => ({ value: `sh:${x.id}`, label: x.name })),
                ...incoming.map((x) => ({
                  value: `sh:${x.id}`,
                  label: `${x.name}${x.owner ? ` · ${x.owner.name}` : ''}`,
                })),
              ]}
              onChange={setFFolder}
              searchPlaceholder={t('hd_folder')}
              aria-label={t('hd_folder')}
            />
          </div>
        )}
        {filtered && (
          <button
            type="button"
            className="kh-btn kh-btn--sm kh-btn--ghost"
            onClick={() => {
              setFStatus('');
              setFPrio('');
              setFClient('');
              setFFolder('');
            }}
          >
            {t('hd_clearFilters')}
          </button>
        )}
        <span className="kh-hd-dim" style={{ fontSize: 12.5, marginLeft: 'auto' }}>
          {t('hd_showing').replace('{a}', String(list.length)).replace('{b}', String(base.length))}
        </span>
        <a className="kh-btn kh-btn--sm kh-btn--ghost" href="tickets?folders=1" title={t('hd_foldersT')}>
          {t('hd_folders')}
        </a>
        {!isIncoming && (
          <button
            type="button"
            className="kh-btn kh-btn--sm kh-btn--primary"
            onClick={() => setNewOpen(true)}
          >
            + {t('tk_new')}
          </button>
        )}
      </div>
      <div className="kh-sap-body" style={{ padding: '0 22px 22px' }}>
        <div className="kh-well kh-table kh-hd-table" role="table" aria-label={t('hd_tabManual')}>
          {head([
            'hd_number',
            'hd_f_summary',
            'hd_f_status',
            'hd_f_priority',
            'hd_f_type',
            'hd_f_client',
            'tk_resp',
            'tk_due',
            'hd_reported',
          ])}
          {m.items && !list.length && (
            <div className="kh-table__empty">{base.length ? t('hd_noMatch') : t('hd_mEmpty')}</div>
          )}
          {list.map((x) => (
            <div
              key={x.id}
              role="row"
              tabIndex={0}
              aria-selected={activeId === x.id || undefined}
              className="kh-table__row kh-table__row--click kh-hd-cols"
              data-on={activeId === x.id || undefined}
              style={cols}
              onClick={() => open(x.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') open(x.id);
              }}
            >
              <div role="cell" className="kh-table__td kh-hd-mono">
                {/^\d/.test(x.number) ? `#${x.number}` : x.number}
              </div>
              <div role="cell" className="kh-table__td" title={x.summary}>
                {x.summary}
              </div>
              <div role="cell" className="kh-table__td">
                <span className="kh-hd-st" data-k={tkKind(x.status)}>
                  {statusLabel(t, x.status)}
                </span>
              </div>
              <div role="cell" className="kh-table__td">
                {prioLabel(t, x.priority)}
              </div>
              <div role="cell" className="kh-table__td">
                {typeName(x.typeId) || '—'}
              </div>
              <div role="cell" className="kh-table__td" title={x.clientName}>
                {x.clientName || '—'}
              </div>
              <div role="cell" className="kh-table__td" title={x.responsibleName}>
                {x.responsibleName || '—'}
              </div>
              <div
                role="cell"
                className="kh-table__td kh-hd-mono"
                style={overdue(x) ? { color: 'oklch(0.75 0.17 25)', fontWeight: 600 } : undefined}
              >
                {day(x.dueOn)}
              </div>
              <div role="cell" className="kh-table__td kh-hd-dim kh-hd-mono">
                {day(x.openedAt)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <NewTicketDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        types={m.types}
        clients={m.clients}
        people={people}
        folder={curShared ? { sharedFolderId: curShared.id } : fFolder ? { folderId: fFolder } : {}}
        onCreated={(x) => {
          m.setItems((cur) => [x, ...(cur ?? [])]);
          refreshCounts();
          open(x.id);
        }}
      />
    </>
  );
}

/** the open ticket, on the right (or full screen on phones) */
export function ManualPanel({ m, timeOn }: { m: Manual; timeOn: boolean }) {
  const { other, setOther, sh } = m;
  const curSharedName = m.curShared?.owner?.name ?? '';
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const md = useListDetail('k');
  const activeId = useSearchParams().get('k');
  const { people } = useMgOptions();
  const act =
    (m.items ?? []).find((x) => x.id === activeId) ?? other?.tickets.find((x) => x.id === activeId) ?? null;
  const setOne = (id: string, p: Partial<Ticket>) => {
    const f = (cur: Ticket[]) => cur.map((x) => (x.id === id ? { ...x, ...p } : x));
    m.setItems((cur) => cur && f(cur));
    setOther((cur) => cur && { ...cur, tickets: f(cur.tickets) });
  };
  const remove = async (x: Ticket) => {
    const ok = await confirm({
      title: t('tr_askTitle'),
      body: t('tr_askBody').replace('{x}', `${x.number} · ${x.summary}`),
      confirmLabel: t('tr_move'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/tickets/${x.id}`, undefined, 'DELETE');
      m.setItems((cur) => cur && cur.filter((y) => y.id !== x.id));
      setOther((cur) => cur && { ...cur, tickets: cur.tickets.filter((y) => y.id !== x.id) });
      md.back();
      refreshCounts();
    } catch {
      toast({ message: t('ne_saveFail'), tone: 'error' });
    }
  };
  const [view, setView] = useState<'detail' | 'time'>('detail');
  const actId = act?.id;
  useEffect(() => setView('detail'), [actId]);
  const ref: TicketRef | null =
    act && timeOn
      ? { number: act.number, summary: act.summary, client: act.clientName, ticketId: act.id }
      : null;
  const time = useTicketTime(ref);
  if (!act) return null;
  return (
    <SidePanel
      id="tickets"
      def={500}
      min={400}
      resizeLabel={t('resize')}
      onBack={md.back}
      backTitle={act.number}
    >
      {view === 'time' && ref ? (
        <div className="kh-hd-ttpanel">
          <h2>
            {act.number} <span>· {t('tl_title')}</span>
          </h2>
          <p>{[act.summary, act.clientName].filter(Boolean).join(' · ')}</p>
          <TicketTime r={ref} entries={time.entries} onBack={() => setView('detail')} />
        </div>
      ) : (
        <>
          <TicketDetail
            key={act.id}
            item={act}
            clients={m.clients}
            people={people}
            folders={m.folders}
            ownShared={sh.folders
              .filter((s) => s.mine && !s.folderId)
              .map((s) => ({ id: s.id, name: s.name }))}
            sharedBy={act.mine ? null : curSharedName}
            onLocal={(p) => setOne(act.id, p)}
            onSaved={(x) => {
              setOne(x.id, x);
              refreshCounts();
            }}
            onRemove={() => void remove(act)}
            onClose={md.back}
          />
          {ref && (
            <div className="kh-hd-ttfoot">
              <TicketTimeButton total={time.total} onClick={() => setView('time')} />
            </div>
          )}
        </>
      )}
    </SidePanel>
  );
}
