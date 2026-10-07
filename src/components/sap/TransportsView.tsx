'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { envColor } from '@/lib/sap';
import { ResizableTable, useConfirm, usePersistentState, useToast, type Column } from '@/components/ui';
import { useWhen } from '@/components/content/useWhen';
import { SidePanel } from './SidePanel';
import './sap.css';

// Ordens de Transporte — ZNotes.dc.html `isTransports`: stage tiles, multi-
// select filters (system, client, project, type), a list with resizable
// columns or the "pista" with the route DEV → QAS → PRD, and the detail panel
// where each step is ticked (released, imported in QAS / PRD, junk).

type Step = 'released' | 'qas' | 'prd' | 'junk';
export type Transport = {
  id: string;
  trkorr: string;
  description: string;
  clientId: string | null;
  projectId: string | null;
  systemId: string | null;
  type: 'W' | 'C';
  owner: string;
  notes: string;
  releasedAt: string | null;
  qasAt: string | null;
  prdAt: string | null;
  junkAt: string | null;
  createdAt: string;
};
type Sys = { id: string; name: string; sid: string; env: string; clientId: string | null };
type Client = { id: string; name: string };
type Stage = 'mod' | 'rel' | 'qas' | 'prd' | 'junk';
type FKey = 'sys' | 'client' | 'type';
type Patch = Partial<
  Pick<Transport, 'trkorr' | 'description' | 'clientId' | 'systemId' | 'type' | 'owner' | 'notes'>
>;

export const stageOf = (x: Pick<Transport, 'junkAt' | 'releasedAt' | 'prdAt' | 'qasAt'>): Stage =>
  x.junkAt ? 'junk' : !x.releasedAt ? 'mod' : x.prdAt ? 'prd' : x.qasAt ? 'qas' : 'rel';
export const STAGE_C: Record<Stage, string> = {
  junk: 'oklch(0.7 0.17 25)',
  mod: 'oklch(0.82 0.11 210)',
  rel: 'oklch(0.78 0.12 300)',
  qas: 'oklch(0.85 0.12 75)',
  prd: 'oklch(0.8 0.14 150)',
};
const STAGE_L: Record<Stage, string> = {
  junk: 'o_junk',
  mod: 'o_mod',
  rel: 'o_st_rel',
  qas: 'o_st_qas',
  prd: 'o_st_prd',
};
const GREEN = STAGE_C.prd;
const tint = (c: string) => c.replace(')', ' / .22)');
const SO: Record<Stage, number> = { mod: 0, rel: 1, qas: 2, prd: 3, junk: 4 };

const Ico = ({ d, w = 3, s = 12 }: { d: string; w?: number; s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={w}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    dangerouslySetInnerHTML={{ __html: d }}
  />
);
const CHECK = '<path d="M5 12.5l4.5 4.5L19 7.5"></path>';
const PEN = '<path d="M4 20h4L19 9l-4-4L4 16z"></path>';
const DOT = '<circle cx="12" cy="12" r="3"></circle>';

export function TransportsView() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const when = useWhen();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const activeId = sp.get('o');
  const [items, setItems] = useState<Transport[] | null>(null);
  const [systems, setSystems] = useState<Sys[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [view, setView] = usePersistentState<'list' | 'pipe'>('transports.view', 'list');
  const [stage, setStage] = usePersistentState<'all' | Stage>('transports.stage', 'all');
  const [filters, setFilters] = usePersistentState<Partial<Record<FKey, string[]>>>('transports.f', {});
  const [sort, setSort] = usePersistentState<{ key: string; dir: 'asc' | 'desc' } | null>('transports.sort', {
    key: 'created',
    dir: 'desc',
  });
  const [q, setQ] = useState('');
  const [fOpen, setFOpen] = useState<FKey | null>(null);
  const [copied, setCopied] = useState(false);
  const timers = useRef(new Map<string, { tm: ReturnType<typeof setTimeout>; patch: Patch }>());
  // the open filter menu closes on Escape or a click anywhere else
  useEffect(() => {
    if (!fOpen) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setFOpen(null);
    const down = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('.kh-ot-f')) setFOpen(null);
    };
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', down);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('pointerdown', down);
    };
  }, [fOpen]);
  const fail = useCallback(() => toast({ message: t('ne_saveFail'), tone: 'error' }), [toast, t]);
  const en = lang === 'en';

  useEffect(() => {
    void api<{ transports: Transport[]; systems: Sys[]; clients: Client[] }>('/sap/transports')
      .then((r) => {
        setItems(r.transports);
        setSystems(r.systems);
        setClients(r.clients);
      })
      .catch(fail);
  }, [fail]);
  useEffect(() => {
    const m = timers.current;
    return () => {
      for (const [id, p] of m) {
        clearTimeout(p.tm);
        void api(`/sap/transports/${id}`, p.patch, 'PATCH').catch(() => {});
      }
    };
  }, []);

  const open = (id: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (id) p.set('o', id);
    else p.delete('o');
    router.replace(`${pathname}${p.size ? `?${p}` : ''}`, { scroll: false });
  };
  const replace = (x: Transport) => setItems((cur) => cur && cur.map((y) => (y.id === x.id ? x : y)));
  const upd = (id: string, patch: Patch, delay = 500) => {
    setItems((cur) => cur && cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const prev = timers.current.get(id);
    if (prev) clearTimeout(prev.tm);
    const merged = { ...prev?.patch, ...patch };
    timers.current.set(id, {
      patch: merged,
      tm: setTimeout(() => {
        timers.current.delete(id);
        void api<{ transport: Transport }>(`/sap/transports/${id}`, merged, 'PATCH')
          .then((r) => delay === 0 && replace(r.transport))
          .catch(fail);
      }, delay),
    });
  };
  /** Tick/untick a step: the server stamps the moment. */
  const toggleStep = async (x: Transport, s: Step) => {
    const col = ({ released: 'releasedAt', qas: 'qasAt', prd: 'prdAt', junk: 'junkAt' } as const)[s];
    const on = !x[col];
    setItems(
      (cur) =>
        cur && cur.map((y) => (y.id === x.id ? { ...y, [col]: on ? new Date().toISOString() : null } : y)),
    );
    try {
      const r = await api<{ transport: Transport }>(
        `/sap/transports/${x.id}`,
        { steps: { [s]: on } },
        'PATCH',
      );
      replace(r.transport);
    } catch {
      fail();
    }
  };

  const all = items ?? [];
  const sysById = (id: string | null) => systems.find((s) => s.id === id);
  const cName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? '';
  /** Prototype landOf: DEV is the request's system, QAS/PRD the client's other systems. */
  const land = (x: Transport) => {
    const d = sysById(x.systemId);
    const L: Record<'DEV' | 'QAS' | 'PRD', string> = { DEV: d?.sid || '—', QAS: 'QAS', PRD: 'PRD' };
    const cid = d?.clientId ?? x.clientId;
    for (const s of systems)
      if (cid && s.clientId === cid && (s.env === 'QAS' || s.env === 'PRD')) L[s.env] = s.sid;
    return L;
  };
  const fOn = (k: FKey) => (filters[k] ?? []).length > 0;
  const field = (x: Transport, k: FKey) =>
    k === 'sys' ? (x.systemId ?? '') : k === 'client' ? (x.clientId ?? '') : x.type;
  const passes = (x: Transport, skip?: FKey) =>
    (['sys', 'client', 'type'] as FKey[]).every(
      (k) => k === skip || !fOn(k) || filters[k]!.includes(field(x, k)),
    );
  const byF = all.filter((x) => passes(x));
  const query = q.trim().toLowerCase();
  const list = byF.filter(
    (x) =>
      (stage === 'all' || stageOf(x) === stage) &&
      (!query ||
        [
          x.trkorr,
          x.description,
          x.owner,
          cName(x.clientId),
          sysById(x.systemId)?.name,
          sysById(x.systemId)?.sid,
          x.notes,
        ].some((v) => (v ?? '').toLowerCase().includes(query))),
  );
  const val = (x: Transport, k: string): string | number =>
    k === 'created'
      ? x.createdAt
      : k === 'status'
        ? SO[stageOf(x)]
        : k === 'client'
          ? cName(x.clientId).toLowerCase()
          : k === 'system'
            ? (sysById(x.systemId)?.sid ?? '')
            : k === 'desc'
              ? x.description.toLowerCase()
              : String(x[k as keyof Transport] ?? '').toLowerCase();
  const sorted = sort
    ? list.slice().sort((a, b) => {
        const A = val(a, sort.key),
          B = val(b, sort.key);
        return (A < B ? -1 : A > B ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1);
      })
    : list;
  const act = all.find((x) => x.id === activeId) ?? null;

  const create = async () => {
    const one = (k: FKey) => (fOn(k) && filters[k]!.length === 1 ? filters[k]![0]! : null);
    const client = one('client');
    const dev = systems.filter((s) => s.env === 'DEV');
    const sys = one('sys') ?? (dev.find((s) => client && s.clientId === client) ?? dev[0])?.id ?? null;
    try {
      const { transport } = await api<{ transport: Transport }>('/sap/transports', {
        systemId: sys,
        clientId: client,
        ...(one('type') ? { type: one('type') } : {}),
      });
      setItems((cur) => [transport, ...(cur ?? [])]);
      setStage('all');
      open(transport.id);
    } catch {
      fail();
    }
  };
  const remove = async (x: Transport) => {
    const ok = await confirm({
      title: t('tr_askTitle'),
      body: t('tr_askBody').replace('{x}', x.trkorr || t('o_newDesc')),
      confirmLabel: t('tr_move'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    timers.current.delete(x.id);
    try {
      await api(`/sap/transports/${x.id}`, undefined, 'DELETE');
      setItems((cur) => cur && cur.filter((y) => y.id !== x.id));
      open(null);
    } catch {
      fail();
    }
  };

  const stations = (x: Transport) => {
    const L = land(x);
    const st = (
      sid: string,
      done: boolean,
      first: boolean,
      next: boolean,
      color: string,
      tip: string,
      icon?: string,
    ) => ({
      sid,
      first,
      done,
      color,
      tip,
      icon: icon ?? (done ? CHECK : next ? DOT : null),
    });
    return [
      st(
        L.DEV,
        true,
        true,
        false,
        x.releasedAt ? GREEN : STAGE_C.mod,
        x.releasedAt ? `${t('o_rel')} · ${when(x.releasedAt)}` : t('o_mod'),
        x.releasedAt ? CHECK : PEN,
      ),
      st(
        L.QAS,
        !!x.qasAt,
        false,
        !!x.releasedAt && !x.qasAt,
        GREEN,
        x.qasAt ? `QAS · ${when(x.qasAt)}` : t('o_pending'),
      ),
      st(
        L.PRD,
        !!x.prdAt,
        false,
        !!x.qasAt && !x.prdAt,
        GREEN,
        x.prdAt ? `PRD · ${when(x.prdAt)}` : t('o_pending'),
      ),
    ];
  };
  const Stations = ({ x }: { x: Transport }) => (
    <div className="kh-ot-route">
      {stations(x).map((s, i) => (
        <div key={i} className="kh-ot-st" style={{ flex: s.first ? '0 0 auto' : '1 1 0' }}>
          {!s.first && (
            <div className="kh-ot-line" style={{ background: s.done ? s.color : 'rgba(255,255,255,.3)' }} />
          )}
          <span
            title={s.tip}
            className="kh-ot-pill"
            style={{
              background: s.done ? tint(s.color) : 'rgba(255,255,255,.04)',
              borderColor: s.done ? s.color : 'rgba(255,255,255,.22)',
              boxShadow: `0 0 16px ${s.done ? s.color.replace(')', ' / .35)') : 'transparent'}`,
            }}
          >
            {s.icon && <Ico d={s.icon} />}
            {s.sid}
          </span>
        </div>
      ))}
    </div>
  );
  const typeTag = (x: Transport) => (
    <span
      className="kh-ot-tag"
      style={{ background: x.type === 'C' ? 'oklch(0.8 0.12 75 / .35)' : 'oklch(0.72 0.12 240 / .38)' }}
    >
      {x.type === 'C' ? 'Customizing' : 'Workbench'}
    </span>
  );
  const junkTag = <span className="kh-ot-tag kh-ot-tag--junk">{t('o_junkShort')}</span>;

  const fDefs: Array<[FKey, string, Array<{ v: string; l: string; dot?: string }>]> = [
    [
      'sys',
      t('s_system'),
      systems.map((s) => ({ v: s.id, l: `${s.sid} · ${s.name}`, dot: envColor(s.env) })),
    ],
    [
      'client',
      t('s_customer'),
      [{ v: '', l: en ? 'No client' : 'Sem cliente' }, ...clients.map((c) => ({ v: c.id, l: c.name }))],
    ],
    [
      'type',
      t('s_type'),
      [
        { v: 'W', l: 'Workbench' },
        { v: 'C', l: 'Customizing' },
      ],
    ],
  ];
  const setF = (k: FKey, arr: string[]) => setFilters({ ...filters, [k]: arr });
  const nAct = (['sys', 'client', 'type'] as FKey[]).filter(fOn).length;

  const columns: Array<Column<Transport>> = [
    {
      key: 'trkorr',
      label: t('o_code'),
      width: 150,
      sortable: true,
      render: (x) => <span className="kh-ot-code">{x.trkorr || '—'}</span>,
    },
    {
      key: 'desc',
      label: t('i_desc'),
      width: 360,
      sortable: true,
      render: (x) => <span className="kh-sap-strong">{x.description || '—'}</span>,
    },
    {
      key: 'client',
      label: t('s_customer'),
      width: 140,
      sortable: true,
      render: (x) => cName(x.clientId) || '—',
    },
    {
      key: 'system',
      label: t('s_system'),
      width: 130,
      sortable: true,
      render: (x) => sysById(x.systemId)?.name || '—',
    },
    { key: 'type', label: t('s_type'), width: 130, sortable: true, render: typeTag },
    {
      key: 'owner',
      label: t('o_createdBy'),
      width: 120,
      sortable: true,
      render: (x) => <span className="kh-sap-mono">{x.owner || '—'}</span>,
    },
    {
      key: 'status',
      label: t('i_status'),
      width: 240,
      sortable: true,
      render: (x) => (
        <span className="kh-ot-steps">
          {x.junkAt && junkTag}
          {(
            [
              [t('o_rel'), x.releasedAt],
              ['QAS', x.qasAt],
              ['PRD', x.prdAt],
            ] as const
          ).map(([label, at]) => (
            <span
              key={label}
              title={at ? when(at) : t('o_pending')}
              className="kh-ot-tag"
              style={
                at
                  ? { background: 'oklch(0.8 0.14 150 / .28)', borderColor: 'oklch(0.8 0.14 150 / .6)' }
                  : {
                      background: 'rgba(255,255,255,.05)',
                      borderColor: 'rgba(255,255,255,.14)',
                      color: 'rgba(255,248,240,.55)',
                    }
              }
            >
              {label}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: 'created',
      label: t('c_created'),
      width: 150,
      sortable: true,
      grow: true,
      render: (x) => when(x.createdAt),
    },
  ];

  return (
    <section className="kh-sap">
      <div className="kh-sap-main">
        <div className="kh-sap-head">
          <div className="kh-sap-titles">
            <h1>{t('nav_transports')}</h1>
            <div>{t('o_sub2')}</div>
          </div>
          <div className="kh-sap-seg" role="radiogroup" aria-label={t('o_list')}>
            {(['list', 'pipe'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                data-on={view === v || undefined}
                onClick={() => setView(v)}
              >
                {t(v === 'list' ? 'o_list' : 'o_pipe')}
              </button>
            ))}
          </div>
          <label className="kh-sap-search">
            <Ico
              d='<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line>'
              w={2}
              s={15}
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('o_search2')}
              aria-label={t('o_search2')}
            />
          </label>
          <button type="button" className="kh-sap-new" onClick={() => void create()}>
            <Ico
              d='<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>'
              w={2}
              s={15}
            />
            {t('o_new')}
          </button>
        </div>
        <div className="kh-ot-stats">
          {(['mod', 'rel', 'qas', 'prd', 'junk'] as Stage[]).map((k) => {
            const on = stage === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                style={{
                  background: on ? tint(STAGE_C[k]) : 'rgba(255,255,255,.05)',
                  borderColor: on ? STAGE_C[k] : 'rgba(255,255,255,.12)',
                }}
                onClick={() => setStage(on ? 'all' : k)}
              >
                <span>
                  <span style={{ background: STAGE_C[k], boxShadow: `0 0 8px ${STAGE_C[k]}` }} />
                  <span>{t(STAGE_L[k])}</span>
                </span>
                <span>{byF.filter((x) => stageOf(x) === k).length}</span>
              </button>
            );
          })}
        </div>
        <div className="kh-ot-filters">
          {fDefs.map(([k, label, opts]) => {
            const sel = filters[k] ?? [];
            const isOpen = fOpen === k;
            const base = all.filter((x) => passes(x, k));
            const shown =
              sel.length === 1
                ? (opts.find((o) => o.v === sel[0])?.l ?? '')
                : sel.length
                  ? `${sel.length}${en ? ' selected' : ' selecionados'}`
                  : '';
            return (
              <div key={k} className="kh-ot-f">
                <button
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
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      transform: isOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform .15s',
                      opacity: 0.7,
                    }}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="kh-ot-menu" role="listbox" aria-multiselectable="true" aria-label={label}>
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
                            <Ico d={CHECK} w={3.4} s={11} />
                          </span>
                          {o.dot && <span className="kh-sap-dot" style={{ background: o.dot }} />}
                          <span className="kh-ot-ol">{o.l}</span>
                          <span className="kh-sap-n">{base.filter((x) => field(x, k) === o.v).length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {nAct > 0 && (
            <button type="button" className="kh-ot-clear" onClick={() => setFilters({})}>
              {en ? 'Clear filters' : 'Limpar filtros'}
            </button>
          )}
          <span className="kh-ot-count">
            {list.length} / {all.length}
          </span>
        </div>
        {view === 'pipe' ? (
          <div className="kh-ot-pipe">
            {sorted.map((x) => (
              <div
                key={x.id}
                className="kh-ot-prow"
                data-on={x.id === activeId || undefined}
                style={{ opacity: x.junkAt ? 0.6 : 1 }}
                onClick={() => open(x.id)}
              >
                <div className="kh-ot-pinfo">
                  <div>
                    <span
                      className="kh-ot-pcode"
                      style={{ textDecoration: x.junkAt ? 'line-through' : 'none' }}
                    >
                      {x.trkorr || '—'}
                    </span>
                    {x.junkAt && junkTag}
                    {typeTag(x)}
                  </div>
                  <div className="kh-ot-pdesc">{x.description || '—'}</div>
                  <div className="kh-ot-pmeta">
                    {cName(x.clientId) || '—'} · {sysById(x.systemId)?.name || '—'} ·{' '}
                    <span className="kh-sap-mono">{x.owner || '—'}</span> · {when(x.createdAt)}
                  </div>
                </div>
                <Stations x={x} />
              </div>
            ))}
            {items && !sorted.length && <div className="kh-sap-empty">{t('o_empty')}</div>}
          </div>
        ) : (
          <div className="kh-sap-body">
            <ResizableTable
              id="transports"
              columns={columns}
              rows={sorted}
              rowKey={(x) => x.id}
              onRowClick={(x) => open(x.id)}
              selectedKey={activeId}
              sort={sort}
              onSortChange={setSort}
              emptyLabel={items ? t('o_empty') : ''}
              resizeLabel={t('resize')}
              minWidth={1300}
            />
          </div>
        )}
      </div>
      {act && (
        <SidePanel id="transports" def={540} min={380} resizeLabel={t('resize')}>
          <div className="kh-sap-ptop">
            <span>
              {t('createdAt')} {when(act.createdAt)}
            </span>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="kh-sap-ghost kh-ot-copy"
              title={t('o_copy')}
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(`${act.trkorr} ${act.description}`.trim())
                  .catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? t('copied') : t('o_copy')}
            </button>
            <button
              type="button"
              className="kh-sap-ico kh-sap-ico--del"
              title={t('del')}
              aria-label={t('del')}
              onClick={() => void remove(act)}
            >
              <Ico
                d='<path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path>'
                w={1.9}
                s={16}
              />
            </button>
            <button
              type="button"
              className="kh-sap-ico kh-sap-ico--x"
              title={t('i_close')}
              aria-label={t('i_close')}
              onClick={() => open(null)}
            >
              <Ico
                d='<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>'
                w={2}
                s={14}
              />
            </button>
          </div>
          <div className="kh-sap-pbody">
            <input
              className="kh-ot-title"
              value={act.trkorr}
              aria-label={t('o_code')}
              maxLength={20}
              spellCheck={false}
              onChange={(e) =>
                upd(act.id, { trkorr: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })
              }
            />
            <textarea
              className="kh-ot-desc"
              rows={2}
              value={act.description}
              placeholder={t('i_desc')}
              aria-label={t('i_desc')}
              maxLength={500}
              onChange={(e) => upd(act.id, { description: e.target.value })}
            />
            <div className="kh-ot-pstations">
              <Stations x={act} />
            </div>
            <div className="kh-ot-stepedit">
              <div className="kh-sap-fld">
                <span>{t('i_status')}</span>
              </div>
              {(
                [
                  ['released', t('o_released'), act.releasedAt],
                  ['qas', t('o_inQas'), act.qasAt],
                  ['prd', t('o_inPrd'), act.prdAt],
                ] as const
              ).map(([k, label, at]) => (
                <button
                  key={k}
                  type="button"
                  role="checkbox"
                  aria-checked={!!at}
                  className="kh-ot-step"
                  style={
                    at
                      ? { background: 'oklch(0.8 0.14 150 / .14)', borderColor: 'oklch(0.8 0.14 150 / .45)' }
                      : undefined
                  }
                  onClick={() => void toggleStep(act, k)}
                >
                  <span className="kh-ot-ck kh-ot-ck--big" data-on={!!at || undefined}>
                    <Ico d={CHECK} w={3.4} s={13} />
                  </span>
                  <span className="kh-ot-steplbl">{label}</span>
                  <span className="kh-ot-at">{at ? when(at) : t('o_pending')}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              role="checkbox"
              aria-checked={!!act.junkAt}
              className="kh-ot-step kh-ot-junk"
              style={
                act.junkAt
                  ? { background: 'oklch(0.65 0.18 25 / .18)', borderColor: 'oklch(0.72 0.17 25 / .6)' }
                  : undefined
              }
              onClick={() => void toggleStep(act, 'junk')}
            >
              <span className="kh-ot-ck kh-ot-ck--big" data-on={!!act.junkAt || undefined}>
                <Ico d={CHECK} w={3.4} s={13} />
              </span>
              <span className="kh-ot-steplbl">
                <span>{t('o_junk')}</span>
                <span>{t('o_junkHint')}</span>
              </span>
              <span className="kh-ot-at">{act.junkAt ? when(act.junkAt) : ''}</span>
            </button>
            <div className="kh-sap-grid2">
              <label className="kh-sap-fld">
                <span>{t('s_customer')}</span>
                <select
                  className="kh-sap-select"
                  aria-label={t('s_customer')}
                  value={act.clientId ?? ''}
                  onChange={(e) => upd(act.id, { clientId: e.target.value || null }, 0)}
                >
                  <option value="">—</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="kh-sap-fld">
                <span>{t('c_project')}</span>
                <select className="kh-sap-select" aria-label={t('c_project')} value="" disabled>
                  <option value="">—</option>
                </select>
              </label>
              <label className="kh-sap-fld">
                <span>{t('s_system')}</span>
                <select
                  className="kh-sap-select"
                  aria-label={t('s_system')}
                  value={act.systemId ?? ''}
                  onChange={(e) => upd(act.id, { systemId: e.target.value || null }, 0)}
                >
                  <option value="">—</option>
                  {systems.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.sid})
                    </option>
                  ))}
                </select>
              </label>
              <label className="kh-sap-fld">
                <span>{t('s_type')}</span>
                <select
                  className="kh-sap-select"
                  aria-label={t('s_type')}
                  value={act.type}
                  onChange={(e) => upd(act.id, { type: e.target.value as 'W' | 'C' }, 0)}
                >
                  <option value="W">Workbench</option>
                  <option value="C">Customizing</option>
                </select>
              </label>
              <label className="kh-sap-fld">
                <span>{t('o_createdBy')}</span>
                <input
                  className="kh-sap-input"
                  data-mono
                  value={act.owner}
                  maxLength={40}
                  spellCheck={false}
                  onChange={(e) => upd(act.id, { owner: e.target.value.toUpperCase() })}
                />
              </label>
            </div>
            <label className="kh-sap-fld">
              <span>{t('v_notes')}</span>
              <textarea
                className="kh-sap-input kh-sap-text"
                value={act.notes}
                placeholder={t('o_notesPh')}
                onChange={(e) => upd(act.id, { notes: e.target.value })}
              />
            </label>
          </div>
        </SidePanel>
      )}
    </section>
  );
}
