'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { useMgOptions } from '@/components/mg/useMgOptions';
import { refreshCounts } from '@/components/shell/counts';
import { useListDetail } from '@/components/content/MobilePane';
import { SidePanel } from '@/components/sap/SidePanel';
import { FolderShareDialog } from '@/components/share/FolderShareDialog';
import { useSharedFolders, type SharedFolder } from '@/components/share/useSharedFolders';
import {
  Popover,
  ResizableTable,
  useConfirm,
  usePersistentState,
  useToast,
  type Column,
} from '@/components/ui';
import { isDone, PRIORITY_COLOR, PRIORITY_RANK, STATUS_COLOR, type TicketStatus } from '@/lib/tickets';
import { NewTicketDialog } from './NewTicketDialog';
import { TicketDetail } from './TicketDetail';
import { TicketSettingsDialog } from './TicketTypes';
import {
  Due,
  I,
  Ico,
  PRIORITIES,
  PrioChip,
  prioLabel,
  STATUSES,
  StatusChip,
  statusLabel,
  overdue,
  type Ticket,
  type TicketType,
} from './ticketUi';
import '../sap/sap.css';
import './tickets.css';

// Tickets (SAP › Tickets): the table (or a Kanban by status) on the left and
// the open ticket on the right, like Notes. Folders and shared folders as a
// strip above the table; filters by status, priority, type, client and
// responsible; search by number, description, client, responsible.

type FKey = 'status' | 'prio' | 'type' | 'client' | 'resp';
type Folder = { id: string; name: string; color: string };
const F_KEYS: FKey[] = ['status', 'prio', 'type', 'client', 'resp'];
const SO: Record<TicketStatus, number> = Object.fromEntries(STATUSES.map((s, i) => [s, i])) as Record<
  TicketStatus,
  number
>;

export function TicketsView() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const pathname = usePathname();
  const sp = useSearchParams();
  const activeId = sp.get('k');
  const md = useListDetail('k');
  const { people } = useMgOptions();
  const sh = useSharedFolders('tickets');
  const [items, setItems] = useState<Ticket[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [types, setTypes] = useState<TicketType[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [incoming, setIncoming] = useState<{ id: string; tickets: Ticket[]; types: TicketType[] } | null>(
    null,
  );
  const [view, setView] = usePersistentState<'table' | 'kanban'>('tickets.view', 'table');
  const [folder0, setFolder] = usePersistentState<string>('tickets.folder', 'all');
  const [filters, setFilters] = usePersistentState<Partial<Record<FKey, string[]>>>('tickets.f', {});
  const [sort, setSort] = usePersistentState<{ key: string; dir: 'asc' | 'desc' } | null>('tickets.sort', {
    key: 'opened',
    dir: 'desc',
  });
  const [q, setQ] = useState('');
  const [fOpen, setFOpen] = useState<FKey | null>(null);
  const fBtn = useRef<HTMLButtonElement>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [gear, setGear] = useState(false);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [fMenu, setFMenu] = useState(false);
  const fMenuBtn = useRef<HTMLButtonElement>(null);
  const [shareOf, setShareOf] = useState<{ folderId?: string; sharedId?: string; title: string } | null>(
    null,
  );
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<TicketStatus | null>(null);
  const [kanCol, setKanCol] = useState<TicketStatus>('open');
  const fail = useCallback(() => toast({ message: t('ne_saveFail'), tone: 'error' }), [toast, t]);

  useEffect(() => {
    api<{ tickets: Ticket[]; folders: Folder[]; types: TicketType[] }>('/tickets')
      .then((r) => {
        setItems(r.tickets);
        setFolders(r.folders);
        setTypes(r.types);
      })
      .catch(() => setItems([]));
    api<{ clients: Array<{ id: string; name: string }> }>('/sap/clients')
      .then((r) => setClients(r.clients))
      .catch(() => {});
  }, []);

  // ── folders ───────────────────────────────────────────────────────────────
  const shared = sh.folders;
  const linkedOf = (fid: string) => shared.find((x) => x.mine && x.folderId === fid);
  const standalone = shared.filter((x) => x.mine && !x.folderId);
  const incomingFolders = shared.filter((x) => !x.mine);
  const folder =
    folder0 === 'all' ||
    folders.some((f) => f.id === folder0) ||
    shared.some((x) => `sh:${x.id}` === folder0) ||
    !sh.loaded
      ? folder0
      : 'all';
  const curShared: SharedFolder | undefined = folder.startsWith('sh:')
    ? shared.find((x) => `sh:${x.id}` === folder)
    : undefined;
  const isIncoming = !!curShared && !curShared.mine;
  // someone else's shared folder: its own list (with the owner's types)
  useEffect(() => {
    if (!curShared || curShared.mine) return;
    let live = true;
    api<{ tickets: Ticket[]; types: TicketType[] }>(`/tickets?shared=${curShared.id}`)
      .then((r) => live && setIncoming({ id: curShared.id, tickets: r.tickets, types: r.types }))
      .catch(() => live && setIncoming({ id: curShared.id, tickets: [], types: [] }));
    return () => {
      live = false;
    };
  }, [curShared]);

  const own = useMemo(() => items ?? [], [items]);
  const inFolder = (x: Ticket) =>
    folder === 'all'
      ? true
      : curShared
        ? x.sharedFolderId === curShared.id || (!!curShared.folderId && x.folderId === curShared.folderId)
        : x.folderId === folder;
  const all = isIncoming ? (incoming?.id === curShared!.id ? incoming.tickets : []) : own.filter(inFolder);
  const typeList = isIncoming ? (incoming?.types ?? []) : types;
  const typeName = (id: string | null) => typeList.find((y) => y.id === id)?.name ?? '';

  const pickFolder = (v: string) => {
    setFolder(v);
    setFMenu(false);
  };
  const addFolder = async () => {
    const n = (newFolder ?? '').trim();
    setNewFolder(null);
    if (!n) return;
    try {
      const { folder: f } = await api<{ folder: Folder }>('/tickets/folders', { name: n.slice(0, 80) });
      setFolders((cur) => [...cur, f]);
      setFolder(f.id);
    } catch {
      fail();
    }
  };
  const renameFolder = async (f: Folder, n: string) => {
    const v = n.trim();
    if (!v || v === f.name) return;
    try {
      await api(`/tickets/folders/${f.id}`, { name: v.slice(0, 80) }, 'PATCH');
      setFolders((cur) => cur.map((x) => (x.id === f.id ? { ...x, name: v } : x)));
    } catch {
      fail();
    }
  };
  const removeFolder = async (f: Folder) => {
    setFMenu(false);
    const ok = await confirm({
      title: t('tk_folderDel'),
      body: t('tk_folderDelAsk').replace('{name}', f.name),
      confirmLabel: t('del'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/tickets/folders/${f.id}`, undefined, 'DELETE');
      setFolders((cur) => cur.filter((x) => x.id !== f.id));
      setItems((cur) => cur && cur.map((x) => (x.folderId === f.id ? { ...x, folderId: null } : x)));
      setFolder('all');
      sh.reload();
    } catch {
      fail();
    }
  };

  // ── filters, search, sort ─────────────────────────────────────────────────
  const fOn = (k: FKey) => (filters[k] ?? []).length > 0;
  const field = (x: Ticket, k: FKey) =>
    k === 'status'
      ? x.status
      : k === 'prio'
        ? x.priority
        : k === 'type'
          ? (x.typeId ?? '')
          : k === 'client'
            ? x.clientName
            : x.responsibleName;
  const passes = (x: Ticket, skip?: FKey) =>
    F_KEYS.every((k) => k === skip || !fOn(k) || filters[k]!.includes(field(x, k)));
  const query = q.trim().toLowerCase();
  const list = all.filter(
    (x) =>
      passes(x) &&
      (!query ||
        [x.number, x.summary, x.clientName, x.responsibleName, x.parentNumber, x.parentSummary].some((v) =>
          v.toLowerCase().includes(query),
        )),
  );
  const val = (x: Ticket, k: string): string | number =>
    k === 'number'
      ? x.number.toLowerCase()
      : k === 'summary'
        ? x.summary.toLowerCase()
        : k === 'client'
          ? x.clientName.toLowerCase() || '￿'
          : k === 'prio'
            ? PRIORITY_RANK[x.priority]
            : k === 'type'
              ? typeName(x.typeId).toLowerCase() || '￿'
              : k === 'status'
                ? SO[x.status]
                : k === 'resp'
                  ? x.responsibleName.toLowerCase() || '￿'
                  : k === 'due'
                    ? (x.dueOn ?? '9999')
                    : x.openedAt;
  const sorted = sort
    ? list.slice().sort((a, b) => {
        const A = val(a, sort.key);
        const B = val(b, sort.key);
        return (A < B ? -1 : A > B ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1);
      })
    : list;
  const uniq = (v: string[]) => [...new Set(v.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const fDefs: Array<[FKey, string, Array<{ v: string; l: string; dot?: string }>]> = [
    ['status', t('tk_status'), STATUSES.map((s) => ({ v: s, l: statusLabel(t, s), dot: STATUS_COLOR[s] }))],
    ['prio', t('tk_priority'), PRIORITIES.map((p) => ({ v: p, l: prioLabel(t, p), dot: PRIORITY_COLOR[p] }))],
    ['type', t('tk_type'), [...typeList.map((y) => ({ v: y.id, l: y.name })), { v: '', l: t('tk_noType') }]],
    [
      'client',
      t('tk_client'),
      [...uniq(all.map((x) => x.clientName)).map((c) => ({ v: c, l: c })), { v: '', l: t('tk_noClient') }],
    ],
    [
      'resp',
      t('tk_resp'),
      [...uniq(all.map((x) => x.responsibleName)).map((c) => ({ v: c, l: c })), { v: '', l: t('tk_noResp') }],
    ],
  ];
  const setF = (k: FKey, arr: string[]) => setFilters({ ...filters, [k]: arr });
  const nAct = F_KEYS.filter(fOn).length;
  // the open filter menu closes on Escape (the popover handles clicks outside)
  useEffect(() => {
    if (!fOpen) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setFOpen(null);
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [fOpen]);

  // ── open / save / remove ──────────────────────────────────────────────────
  const open = (id: string | null) => {
    if (!id && md.phone) return md.back();
    const p = new URLSearchParams(sp.toString());
    if (id) p.set('k', id);
    else p.delete('k');
    md.go(`${pathname}${p.size ? `?${p}` : ''}`, id);
  };
  const setOne = (id: string, patch: Partial<Ticket>) => {
    const f = (cur: Ticket[]) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x));
    setItems((cur) => cur && f(cur));
    setIncoming((cur) => cur && { ...cur, tickets: f(cur.tickets) });
  };
  const act = all.find((x) => x.id === activeId) ?? own.find((x) => x.id === activeId) ?? null;
  const moveStatus = async (x: Ticket, s: TicketStatus) => {
    if (x.status === s) return;
    const before = x.status;
    setOne(x.id, { status: s });
    try {
      const r = await api<{ ticket: Ticket }>(`/tickets/${x.id}`, { status: s }, 'PATCH');
      setOne(x.id, r.ticket);
      refreshCounts();
    } catch {
      setOne(x.id, { status: before });
      fail();
    }
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
      setItems((cur) => cur && cur.filter((y) => y.id !== x.id));
      refreshCounts();
      open(null);
    } catch {
      toast({ message: t('ui_delFail'), tone: 'error' });
    }
  };
  const created = (x: Ticket) => {
    setItems((cur) => [x, ...(cur ?? [])]);
    refreshCounts();
    setQ('');
    open(x.id);
  };

  const openN = own.filter((x) => !isDone(x.status)).length;
  const sharedName = (x: Ticket) =>
    x.mine ? null : (incomingFolders.find((f) => f.id === curShared?.id)?.owner?.name ?? '');

  const columns: Array<Column<Ticket>> = [
    {
      key: 'number',
      label: t('tk_numberShort'),
      width: 124,
      minWidth: 116,
      minTight: 104,
      sortable: true,
      render: (x) => <span className="kh-tkt-no">{x.number}</span>,
    },
    {
      key: 'summary',
      label: t('tk_summary'),
      width: 280,
      minWidth: 140,
      minTight: 110,
      sortable: true,
      render: (x) => <span className="kh-sap-strong">{x.summary}</span>,
    },
    {
      key: 'client',
      label: t('tk_client'),
      width: 140,
      minWidth: 104,
      hide: 3,
      sortable: true,
      render: (x) => x.clientName || <span className="kh-tkt-dim">—</span>,
    },
    {
      key: 'prio',
      label: t('tk_priority'),
      width: 150,
      minWidth: 132,
      minTight: 110,
      cellClassName: 'kh-tkt-wrap',
      sortable: true,
      render: (x) => <PrioChip p={x.priority} />,
    },
    {
      key: 'type',
      label: t('tk_type'),
      width: 130,
      minWidth: 104,
      hide: 1,
      sortable: true,
      render: (x) => typeName(x.typeId) || <span className="kh-tkt-dim">—</span>,
    },
    {
      key: 'status',
      label: t('tk_status'),
      width: 220,
      minWidth: 200,
      minTight: 140,
      cellClassName: 'kh-tkt-wrap',
      sortable: true,
      render: (x) => <StatusChip s={x.status} />,
    },
    {
      key: 'resp',
      label: t('tk_resp'),
      width: 140,
      minWidth: 128,
      hide: 2,
      sortable: true,
      render: (x) => x.responsibleName || <span className="kh-tkt-dim">—</span>,
    },
    {
      key: 'due',
      label: t('tk_due'),
      width: 116,
      minWidth: 128,
      hide: 4,
      sortable: true,
      render: (x) => <Due x={x} />,
    },
  ];
  const card = (x: Ticket, withStatus = true) => (
    <div className="kh-tcard__main">
      <div className="kh-tcard__t">
        <span className="kh-tkt-no">{x.number}</span>
        <PrioChip p={x.priority} />
      </div>
      <span className="kh-tcard__s">{x.summary}</span>
      <span className="kh-tcard__m">
        {withStatus && <StatusChip s={x.status} />}
        {[x.clientName, x.responsibleName].filter(Boolean).join(' · ')}
        {x.dueOn && <Due x={x} />}
      </span>
    </div>
  );
  const kanCard = (x: Ticket) => (
    <div
      key={x.id}
      className="kh-tkt-kcard"
      data-on={x.id === activeId || undefined}
      data-drag={drag === x.id || undefined}
      data-late={overdue(x) || undefined}
      draggable={!md.phone && (x.mine || curShared?.perm === 'edit')}
      role="button"
      tabIndex={0}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', x.id);
        setDrag(x.id);
      }}
      onDragEnd={() => {
        setDrag(null);
        setOver(null);
      }}
      onClick={() => open(x.id)}
      onKeyDown={(e) => e.key === 'Enter' && open(x.id)}
    >
      <div className="kh-tkt-kcard__top">
        <span className="kh-tkt-no">{x.number}</span>
        <PrioChip p={x.priority} />
      </div>
      <div className="kh-tkt-kcard__s">{x.summary}</div>
      <div className="kh-tkt-kcard__f">
        <span>{x.clientName || '—'}</span>
        {x.dueOn && <Due x={x} />}
      </div>
      {(x.responsibleName || typeName(x.typeId)) && (
        <div className="kh-tkt-kcard__f kh-tkt-kcard__f--dim">
          <span>{x.responsibleName}</span>
          <span>{typeName(x.typeId)}</span>
        </div>
      )}
    </div>
  );

  const fCur = folders.find((f) => f.id === folder);
  const canCreate = !isIncoming;
  const emptyLabel = items ? (all.length ? t('tk_noMatch') : t('tk_empty')) : '';

  return (
    <section className="kh-sap kh-tkt" data-pane={md.pane} data-view={view}>
      <div className="kh-sap-main">
        <div className="kh-sap-head">
          <div className="kh-sap-titles">
            <h1>{t('nav_tickets')}</h1>
            <div>{t('tk_sub').replace('{open}', String(openN)).replace('{all}', String(own.length))}</div>
          </div>
          <div className="kh-sap-seg" role="radiogroup" aria-label={t('tk_table')}>
            {(['table', 'kanban'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                data-on={view === v || undefined}
                onClick={() => setView(v)}
              >
                {t(v === 'table' ? 'tk_table' : 'tk_kanban')}
              </button>
            ))}
          </div>
          <label className="kh-sap-search">
            <Ico d={I.search} s={15} w={2} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('tk_search')}
              aria-label={t('tk_search')}
            />
          </label>
          <button
            type="button"
            className="kh-sap-ico kh-tkt-gear"
            title={t('tk_settings')}
            aria-label={t('tk_settings')}
            onClick={() => setGear(true)}
          >
            <Ico d={I.gear} s={17} w={1.8} />
          </button>
          <button
            type="button"
            className="kh-sap-new"
            disabled={!canCreate}
            title={canCreate ? undefined : t('tk_noCreateShared')}
            onClick={() => setNewOpen(true)}
          >
            <Ico d={I.plus} s={15} w={2} />
            {t('tk_new')}
          </button>
        </div>

        <div className="kh-tkt-folders" role="tablist" aria-label={t('mob_folders')}>
          <button
            type="button"
            role="tab"
            aria-selected={folder === 'all'}
            data-on={folder === 'all' || undefined}
            onClick={() => pickFolder('all')}
          >
            {t('tk_all')}
            <span className="kh-sap-n">{own.length}</span>
          </button>
          {folders.map((f) => {
            const on = folder === f.id;
            const linked = linkedOf(f.id);
            return (
              <span key={f.id} className="kh-tkt-fchip" data-on={on || undefined}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => pickFolder(f.id)}
                  onDragOver={(e) => drag && e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const x = own.find((y) => y.id === drag);
                    setDrag(null);
                    if (x && x.folderId !== f.id)
                      void api<{ ticket: Ticket }>(`/tickets/${x.id}`, { folderId: f.id }, 'PATCH')
                        .then((r) => setOne(x.id, r.ticket))
                        .catch(fail);
                  }}
                >
                  <span className="kh-tkt-fdot" style={{ background: f.color }} />
                  {f.name}
                  {linked && (
                    <span className="kh-tkt-fsh" title={t('sh_shared')}>
                      <Ico d={I.share} s={11} w={2} />
                    </span>
                  )}
                  <span className="kh-sap-n">{own.filter((x) => x.folderId === f.id).length}</span>
                </button>
                {on && (
                  <button
                    ref={fMenuBtn}
                    type="button"
                    className="kh-tkt-fmore"
                    aria-label={t('tk_folderActs')}
                    title={t('tk_folderActs')}
                    aria-expanded={fMenu}
                    onClick={() => setFMenu((o) => !o)}
                  >
                    <Ico d={I.more} s={15} w={2.4} />
                  </button>
                )}
              </span>
            );
          })}
          {[...standalone, ...incomingFolders].map((s) => {
            const on = folder === `sh:${s.id}`;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={on}
                data-on={on || undefined}
                className="kh-tkt-fshared"
                title={s.mine ? t('sh_shared') : t('sh_sharedBy').replace('{who}', s.owner?.name ?? '')}
                onClick={() => pickFolder(`sh:${s.id}`)}
              >
                <Ico d={I.share} s={12} w={2} />
                {s.name}
                {!s.mine && <span className="kh-tkt-fowner">{s.owner?.name}</span>}
              </button>
            );
          })}
          {newFolder === null ? (
            <button type="button" className="kh-tkt-fnew" onClick={() => setNewFolder('')}>
              <Ico d={I.plus} s={13} w={2.4} />
              {t('tk_folderNew')}
            </button>
          ) : (
            <input
              className="kh-tkt-fnewin"
              autoFocus
              value={newFolder}
              maxLength={80}
              placeholder={t('a_folderPh')}
              aria-label={t('a_folderPh')}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addFolder();
                if (e.key === 'Escape') setNewFolder(null);
              }}
              onBlur={() => void addFolder()}
            />
          )}
        </div>
        {fMenu && fCur && (
          <Popover
            anchor={fMenuBtn}
            align="left"
            onClose={() => setFMenu(false)}
            className="kh-ot-menu kh-tkt-fmenu"
            width={260}
            aria-label={t('tk_folderActs')}
          >
            <input
              className="kh-sap-input"
              defaultValue={fCur.name}
              maxLength={80}
              aria-label={t('tk_folderRename')}
              onBlur={(e) => void renameFolder(fCur, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            {sh.canShare && (
              <button
                type="button"
                onClick={() => {
                  setFMenu(false);
                  const l = linkedOf(fCur.id);
                  setShareOf(
                    l ? { sharedId: l.id, title: fCur.name } : { folderId: fCur.id, title: fCur.name },
                  );
                }}
              >
                <Ico d={I.share} s={14} />
                <span className="kh-ot-ol">{t('tk_folderShare')}</span>
              </button>
            )}
            <button type="button" className="kh-tkt-danger" onClick={() => void removeFolder(fCur)}>
              <Ico d={I.trash} s={14} />
              <span className="kh-ot-ol">{t('tk_folderDel')}</span>
            </button>
          </Popover>
        )}

        <div className="kh-ot-filters">
          {fDefs.map(([k, label, opts]) => {
            const sel = filters[k] ?? [];
            const isOpen = fOpen === k;
            const base = all.filter((x) => passes(x, k));
            const shown =
              sel.length === 1
                ? (opts.find((o) => o.v === sel[0])?.l ?? '')
                : sel.length
                  ? t('ot_selN').replace('{n}', String(sel.length))
                  : '';
            return (
              <div key={k} className="kh-ot-f">
                <button
                  ref={isOpen ? fBtn : undefined}
                  type="button"
                  data-on={sel.length > 0 || undefined}
                  aria-expanded={isOpen}
                  onClick={() => setFOpen(isOpen ? null : k)}
                >
                  <span className="kh-sap-strong">{label}</span>
                  {sel.length > 0 && (
                    <>
                      <span className="kh-ot-fval">· {shown}</span>
                      <span
                        className="kh-ot-fx"
                        role="button"
                        aria-label={`× ${label}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setF(k, []);
                        }}
                      >
                        ×
                      </span>
                    </>
                  )}
                  <Ico d={I.chev} s={11} w={2.8} />
                </button>
                {isOpen && (
                  <Popover
                    anchor={fBtn}
                    align="left"
                    onClose={() => setFOpen(null)}
                    className="kh-ot-menu"
                    maxHeight={360}
                    width={260}
                    role="listbox"
                    aria-multiselectable
                    aria-label={label}
                  >
                    {opts.map((o) => {
                      const on = sel.includes(o.v);
                      return (
                        <button
                          key={o.v || 'none'}
                          type="button"
                          role="option"
                          aria-selected={on}
                          onClick={() => setF(k, on ? sel.filter((z) => z !== o.v) : [...sel, o.v])}
                        >
                          <span className="kh-ot-ck" data-on={on || undefined}>
                            <Ico d={I.check} w={3.4} s={11} />
                          </span>
                          {o.dot && <span className="kh-sap-dot" style={{ background: o.dot }} />}
                          <span className="kh-ot-ol">{o.l}</span>
                          <span className="kh-sap-n">{base.filter((x) => field(x, k) === o.v).length}</span>
                        </button>
                      );
                    })}
                  </Popover>
                )}
              </div>
            );
          })}
          {nAct > 0 && (
            <button type="button" className="kh-ot-clear" onClick={() => setFilters({})}>
              {t('ot_clearF')}
            </button>
          )}
          <span className="kh-ot-count">
            {list.length} / {all.length}
          </span>
        </div>

        {view === 'table' ? (
          <div className="kh-sap-body">
            <ResizableTable
              id="tickets"
              columns={columns}
              rows={sorted}
              rowKey={(x) => x.id}
              onRowClick={(x) => open(x.id)}
              selectedKey={activeId}
              sort={sort}
              onSortChange={setSort}
              emptyLabel={emptyLabel}
              resizeLabel={t('resize')}
              fit
              className="kh-tkt-table"
              card={(x) => card(x)}
            />
          </div>
        ) : md.phone ? (
          <div className="kh-tkt-mkan">
            <div className="kh-tkt-mcols" role="tablist" aria-label={t('tk_kanban')}>
              {STATUSES.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={kanCol === k}
                  data-on={kanCol === k || undefined}
                  onClick={() => setKanCol(k)}
                >
                  <span className="kh-tkt-dot" style={{ background: STATUS_COLOR[k] }} />
                  {statusLabel(t, k)}
                  <span>{sorted.filter((x) => x.status === k).length}</span>
                </button>
              ))}
            </div>
            <div className="kh-tkt-mlist" role="tabpanel" aria-label={statusLabel(t, kanCol)}>
              {sorted.filter((x) => x.status === kanCol).map(kanCard)}
              {items && !sorted.some((x) => x.status === kanCol) && (
                <div className="kh-sap-empty">{emptyLabel || t('tk_noMatch')}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="kh-tkt-kanban">
            {STATUSES.map((k) => {
              const cards = sorted.filter((x) => x.status === k);
              return (
                <div
                  key={k}
                  className="kh-tkt-col"
                  data-over={(drag && over === k) || undefined}
                  data-done={isDone(k) || undefined}
                  aria-label={statusLabel(t, k)}
                  role="group"
                  onDragOver={(e) => {
                    if (!drag) return;
                    e.preventDefault();
                    if (over !== k) setOver(k);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const x = all.find((y) => y.id === drag);
                    setDrag(null);
                    setOver(null);
                    if (x) void moveStatus(x, k);
                  }}
                >
                  <div className="kh-tkt-col__head">
                    <span
                      className="kh-tkt-dot"
                      style={{ background: STATUS_COLOR[k], boxShadow: `0 0 10px ${STATUS_COLOR[k]}` }}
                    />
                    <span>{statusLabel(t, k)}</span>
                    <span className="kh-sap-n">{cards.length}</span>
                  </div>
                  <div className="kh-tkt-col__cards">{cards.map(kanCard)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {act && (
        <SidePanel
          id="tickets"
          def={500}
          min={400}
          resizeLabel={t('resize')}
          onBack={md.back}
          backTitle={act.number}
        >
          <TicketDetail
            key={act.id}
            item={act}
            clients={clients}
            people={people}
            folders={folders}
            ownShared={standalone.map((s) => ({ id: s.id, name: s.name }))}
            sharedBy={sharedName(act)}
            onLocal={(p) => setOne(act.id, p)}
            onSaved={(x) => {
              setOne(x.id, x);
              refreshCounts();
            }}
            onRemove={() => void remove(act)}
            onClose={() => open(null)}
          />
        </SidePanel>
      )}

      <NewTicketDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        types={types}
        clients={clients}
        people={people}
        folder={curShared ? { sharedFolderId: curShared.id } : folder !== 'all' ? { folderId: folder } : {}}
        onCreated={created}
      />
      <TicketSettingsDialog open={gear} onClose={() => setGear(false)} onTypes={setTypes} />
      {shareOf && (
        <FolderShareDialog
          kind="tickets"
          folderId={shareOf.folderId}
          sharedId={shareOf.sharedId}
          title={shareOf.title}
          onClose={() => setShareOf(null)}
        />
      )}
    </section>
  );
}
