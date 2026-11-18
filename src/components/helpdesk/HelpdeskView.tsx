'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { Modal, Select, usePersistentState, useToast } from '@/components/ui';
import { bodyZoom } from '@/components/ui/zoom';
import {
  HD_FIELDS,
  HD_INTERVALS,
  hdRank,
  hdStatusKind,
  type HdField,
  type HdMapping,
  type HdRow,
} from '@/lib/helpdesk';
import { fmtWhen, HD_EVENT, useChangeText, type HdChange } from './HelpdeskPopup';
import '@/components/sap/sap.css';
import './helpdesk.css';

// "Helpdesk" (SAP): the helpdesk's tickets as last read by the browser
// extension (with the person's own login there), what changed between reads,
// and the link: pair the extension, set up a list (columns → fields, interval,
// what to do when a ticket leaves the list), first import, pause.

type Source = {
  id: string;
  name: string;
  url: string;
  intervalMin: number;
  onMissing: 'notify' | 'nothing';
  mapping: HdMapping;
  active: boolean;
  paused: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  syncRequestedAt: string | null;
  headers: string[];
  sample: string[][];
  rowCount: number;
};
type Item = Omit<HdRow, 'cells'> & {
  id: string;
  sourceId: string;
  cells: Record<string, string>;
  inList: boolean;
  firstSeenAt: string;
  goneAt: string | null;
  ticketId: string | null;
};
type Overview = { sources: Source[]; items: Item[]; changes: HdChange[] };
type Preview = {
  fresh: HdRow[];
  changed: Array<{ row: HdRow; fields: Array<[string, string, string]>; comment: boolean }>;
  counts: { fresh: number; changed: number; same: number; gone: number };
  skipped: number;
};

/** default widths: Nº, Descrição (takes the rest), Estado, Prioridade, Tipo, Cliente, Atribuído a, Último comentário, Aberto em */
const COL_DEF = [96, 240, 150, 100, 100, 140, 140, 170, 90];
/** the status filter's "Prioritários" (Aberto, Reaberto, Em progresso) */
const HOT = '\u0000hot';
const DESC = 1;

/** "18/11 09:58" */
const short = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const hm = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** The extension on this page (content script): its answer to a ping, or null. */
function usePairing() {
  const [ext, setExt] = useState<{ version: string; paired: boolean } | null>(null);
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      const d = e.data as { type?: string; version?: string; paired?: boolean };
      if (d?.type === 'kh-ext-pong') setExt({ version: d.version ?? '', paired: !!d.paired });
      if (d?.type === 'kh-ext-paired') setExt({ version: d.version ?? '', paired: true });
    };
    window.addEventListener('message', on);
    window.postMessage({ type: 'kh-ext-ping' }, location.origin);
    return () => window.removeEventListener('message', on);
  }, []);
  return [ext, setExt] as const;
}

export function HelpdeskView() {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const tab = sp.get('tab') === 'changes' ? 'changes' : 'list';
  const setup = sp.get('setup');
  const [data, setData] = useState<Overview | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Item | null>(null);
  const [ext] = usePairing();
  const [pairing, setPairing] = useState(false);
  const text = useChangeText();

  const go = useCallback(
    (p: Record<string, string | null>) => {
      const u = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(p))
        if (v === null) u.delete(k);
        else u.set(k, v);
      const s = u.toString();
      router.replace(`${path}${s ? `?${s}` : ''}`, { scroll: false });
    },
    [path, router, sp],
  );
  const load = useCallback(
    () =>
      api<Overview>('/helpdesk')
        .then(setData)
        .catch(() => setData({ sources: [], items: [], changes: [] })),
    [],
  );
  useEffect(() => {
    void load();
    const on = () => void load();
    window.addEventListener(HD_EVENT, on);
    const i = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 60_000);
    return () => {
      window.removeEventListener(HD_EVENT, on);
      clearInterval(i);
    };
  }, [load]);

  const pair = useCallback(async () => {
    setPairing(true);
    try {
      const r = await api<{ token: string }>('/helpdesk/pair', {});
      const ok = await new Promise<boolean>((done) => {
        const on = (e: MessageEvent) => {
          if (e.source === window && (e.data as { type?: string })?.type === 'kh-ext-paired') {
            window.removeEventListener('message', on);
            done(true);
          }
        };
        window.addEventListener('message', on);
        window.postMessage({ type: 'kh-ext-pair', token: r.token }, location.origin);
        setTimeout(() => {
          window.removeEventListener('message', on);
          done(false);
        }, 3000);
      });
      toast(
        ok
          ? { message: t('hd_paired'), tone: 'success' }
          : { message: t('hd_noExt'), tone: 'error', duration: 9000 },
      );
    } catch {
      toast({ message: t('hd_fail'), tone: 'error' });
    } finally {
      setPairing(false);
    }
  }, [t, toast]);
  // from the extension's popup: "Ligar a extensão à minha conta"
  useEffect(() => {
    if (sp.get('pair') !== '1' || !ext) return;
    go({ pair: null });
    if (!ext.paired) void pair();
  }, [sp, ext, go, pair]);

  const srcOf = useMemo(() => new Map((data?.sources ?? []).map((s) => [s.id, s])), [data]);
  /** a change (or the popup, ?i=) opens its ticket */
  const openItem = useCallback(
    (id: string) => {
      const it = data?.items.find((x) => x.id === id);
      if (it) setOpen(it);
    },
    [data],
  );
  useEffect(() => {
    const id = sp.get('i');
    if (!id || !data) return;
    openItem(id);
    go({ i: null });
  }, [sp, data, openItem, go]);
  // filters (kept on this device): client, priority, status ("Prioritários" = Aberto, Reaberto, Em progresso)
  const [fClient, setFClient] = usePersistentState<string>('hd.fClient', '');
  const [fPrio, setFPrio] = usePersistentState<string>('hd.fPrio', '');
  const [fStatus, setFStatus] = usePersistentState<string>('hd.fStatus', '');
  const distinct = (pick: (i: Item) => string) =>
    [...new Set((data?.items ?? []).map(pick).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
  const clients = useMemo(() => distinct((i) => i.client), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const prios = useMemo(() => distinct((i) => i.priority), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const statuses = useMemo(() => distinct((i) => i.status), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(() => {
    const k = q.trim().toLowerCase();
    const hot = (st: string) => ['open', 'reopen', 'progress'].includes(hdStatusKind(st));
    return (
      (data?.items ?? [])
        .filter(
          (i) =>
            (!k ||
              [i.number, i.summary, i.client, i.assignee, i.status, i.type].some((v) =>
                v.toLowerCase().includes(k),
              )) &&
            (!fClient || i.client === fClient) &&
            (!fPrio || i.priority === fPrio) &&
            (!fStatus || (fStatus === HOT ? i.inList && hot(i.status) : i.status === fStatus)),
        )
        // Aberto / Reaberto / Em progresso first; the rest keep their order (newest first)
        .map((i, n) => [i, n] as const)
        .sort(([a, x], [b, y]) => hdRank(a.status, a.inList) - hdRank(b.status, b.inList) || x - y)
        .map(([i]) => i)
    );
  }, [data, q, fClient, fPrio, fStatus]);
  const filtered = !!(fClient || fPrio || fStatus);

  // the columns' widths: dragged in the header, kept on this device (the description takes the rest)
  const [colW, setColW] = usePersistentState<number[] | null>('hd.cols', null);
  const [live, setLive] = useState<number[] | null>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 761px)');
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const widths = live ?? (colW && colW.length === COL_DEF.length ? colW : COL_DEF);
  const cols: React.CSSProperties | undefined = wide
    ? {
        gridTemplateColumns: widths
          .map((w, i) => (i === DESC ? `minmax(${Math.round(w)}px,1fr)` : `${Math.round(w)}px`))
          .join(' '),
        minWidth: widths.reduce((a, w) => a + w, 0),
      }
    : undefined;
  const startResize = (i: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const z = bodyZoom();
    const x0 = e.clientX;
    const start = [...widths];
    let cur = start;
    const move = (ev: PointerEvent) => {
      const w = Math.min(900, Math.max(56, start[i]! + (ev.clientX - x0) / z));
      cur = start.map((x, j) => (j === i ? w : x));
      setLive(cur);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setColW(cur.map(Math.round));
      setLive(null);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const today = new Date().toDateString();
  const changesToday = (data?.changes ?? []).filter((c) => new Date(c.syncAt).toDateString() === today);
  const week = Date.now() - 7 * 86_400_000;

  const act = async (s: Source, what: 'now' | 'pause' | 'resume') => {
    try {
      if (what === 'now') {
        await api(`/helpdesk/sources/${s.id}/sync-now`, {});
        toast({ message: t('hd_nowAsked'), tone: 'info' });
      } else await api(`/helpdesk/sources/${s.id}`, { paused: what === 'pause' }, 'PATCH');
      void load();
    } catch {
      toast({ message: t('hd_fail'), tone: 'error' });
    }
  };

  const stat = (color: string, label: string, v: React.ReactNode) => (
    <button type="button" style={{ background: 'rgb(var(--w) / .05)' }} tabIndex={-1}>
      <span>
        <span style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        <span>{label}</span>
      </span>
      <span>{v}</span>
    </button>
  );

  // the changes, grouped by read
  const groups = useMemo(() => {
    const m = new Map<string, HdChange[]>();
    for (const c of data?.changes ?? []) m.set(c.syncAt, [...(m.get(c.syncAt) ?? []), c]);
    return [...m];
  }, [data]);

  return (
    <section className="kh-sap kh-hd">
      <div className="kh-sap-main">
        <div className="kh-sap-head">
          <div className="kh-sap-titles">
            <h1>{t('nav_helpdesk')}</h1>
            <div>{t('hd_sub')}</div>
          </div>
          <div className="kh-sap-seg" role="radiogroup" aria-label={t('nav_helpdesk')}>
            {(['list', 'changes'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={tab === v}
                data-on={tab === v || undefined}
                onClick={() => go({ tab: v === 'changes' ? 'changes' : null })}
              >
                {t(v === 'list' ? 'hd_tabList' : 'hd_tabChanges')}
              </button>
            ))}
          </div>
          <label className="kh-sap-search">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('hd_search')}
              aria-label={t('hd_search')}
            />
          </label>
          <button type="button" className="kh-sap-new" disabled={pairing} onClick={() => void pair()}>
            {ext?.paired ? `✓ ${t('hd_extOk')}` : t('hd_pair')}
          </button>
        </div>

        {data && !data.sources.some((x) => x.active) && (
          <div className="kh-hd-steps">
            <b>{t('hd_stepsT')}</b>
            <ol>
              <li>
                {t('hd_step1')}{' '}
                <a href="#" onClick={(e) => (e.preventDefault(), router.push('/app/settings?tab=ext'))}>
                  {t('hd_step1l')}
                </a>
              </li>
              <li>{t('hd_step2')}</li>
              <li>{t('hd_step3')}</li>
              <li>{t('hd_step4')}</li>
            </ol>
            <p>{t('hd_stepsP')}</p>
          </div>
        )}

        {(data?.sources ?? [])
          .filter((s) => s.active)
          .map((s) => {
            const warn = !!s.lastError;
            const next = s.lastSyncAt
              ? new Date(Date.parse(s.lastSyncAt) + s.intervalMin * 60_000).toISOString()
              : null;
            return (
              <div
                key={s.id}
                className="kh-hd-strip"
                data-warn={warn || undefined}
                data-off={s.paused || undefined}
              >
                <span className="kh-hd-dot" />
                <span>
                  <b>{s.name}</b> ·{' '}
                  {s.paused
                    ? t('hd_paused')
                    : warn
                      ? t(`hd_err_${s.lastError}`)
                      : t('hd_synced').replace('{a}', hm(s.lastSyncAt)).replace('{b}', hm(next))}
                </span>
                {warn && s.lastError === 'session' && (
                  <a
                    className="kh-btn kh-btn--sm kh-btn--glass"
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {t('hd_openHd')}
                  </a>
                )}
                {!s.paused && (
                  <button
                    type="button"
                    className="kh-btn kh-btn--sm kh-btn--ghost"
                    onClick={() => void act(s, 'now')}
                  >
                    {t('hd_now')}
                  </button>
                )}
                <button
                  type="button"
                  className="kh-btn kh-btn--sm kh-btn--ghost"
                  onClick={() => void act(s, s.paused ? 'resume' : 'pause')}
                >
                  {t(s.paused ? 'hd_resume' : 'hd_pause')}
                </button>
                <button
                  type="button"
                  className="kh-btn kh-btn--sm kh-btn--ghost"
                  onClick={() => go({ setup: s.id })}
                >
                  {t('hd_config')}
                </button>
              </div>
            );
          })}

        <div className="kh-ot-stats">
          {stat(
            'oklch(0.72 0.15 150)',
            t('hd_inList'),
            data ? data.items.filter((i) => i.inList).length : '…',
          )}
          {stat(
            'oklch(0.7 0.12 250)',
            t('hd_new7'),
            (data?.items ?? []).filter((i) => Date.parse(i.firstSeenAt) > week).length,
          )}
          {stat('oklch(0.75 0.13 80)', t('hd_changesToday'), changesToday.length)}
          {stat('oklch(0.7 0.14 30)', t('hd_gone'), (data?.items ?? []).filter((i) => !i.inList).length)}
        </div>

        {tab === 'list' && data && data.items.length > 0 && (
          <div className="kh-hd-filters">
            <div>
              <Select
                value={fStatus}
                options={[
                  { value: '', label: t('hd_allStatus') },
                  { value: HOT, label: t('hd_hot') },
                  ...statuses.map((v) => ({ value: v, label: v })),
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
                  ...prios.map((v) => ({ value: v, label: v })),
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
                  ...clients.map((v) => ({ value: v, label: v })),
                ]}
                onChange={setFClient}
                searchPlaceholder={t('hd_f_client')}
                aria-label={t('hd_f_client')}
              />
            </div>
            {filtered && (
              <button
                type="button"
                className="kh-btn kh-btn--sm kh-btn--ghost"
                onClick={() => {
                  setFStatus('');
                  setFPrio('');
                  setFClient('');
                }}
              >
                {t('hd_clearFilters')}
              </button>
            )}
            <span className="kh-hd-dim" style={{ fontSize: 12.5, marginLeft: 'auto' }}>
              {t('hd_showing').replace('{a}', String(items.length)).replace('{b}', String(data.items.length))}
            </span>
          </div>
        )}

        <div className="kh-sap-body" style={{ padding: '0 22px 22px' }}>
          {tab === 'list' ? (
            <div className="kh-well kh-table kh-hd-table" role="table" aria-label={t('nav_helpdesk')}>
              <div className="kh-table__head kh-hd-cols" role="row" style={cols}>
                {[
                  'hd_number',
                  'hd_f_summary',
                  'hd_f_status',
                  'hd_f_priority',
                  'hd_f_type',
                  'hd_f_client',
                  'hd_f_assignee',
                  'hd_lastComment',
                  'hd_reported',
                ].map((k, i) => (
                  <div
                    key={k}
                    role="columnheader"
                    style={{ position: 'relative', minWidth: 0, height: '100%' }}
                  >
                    <div className="kh-table__th">{t(k)}</div>
                    {/* drag the edge to resize, double-click to restore */}
                    {wide && (
                      <span
                        className="kh-table__grip"
                        title={t('resize')}
                        aria-hidden="true"
                        onPointerDown={(e) => startResize(i, e)}
                        onDoubleClick={() => setColW(null)}
                      />
                    )}
                  </div>
                ))}
              </div>
              {data && !items.length && (
                <div className="kh-table__empty">{data.items.length ? t('hd_noMatch') : t('hd_empty')}</div>
              )}
              {items.map((i) => (
                <div
                  key={i.id}
                  role="row"
                  tabIndex={0}
                  data-gone={!i.inList || undefined}
                  className="kh-table__row kh-table__row--click kh-hd-cols"
                  style={cols}
                  onClick={() => setOpen(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setOpen(i);
                  }}
                >
                  <div role="cell" className="kh-table__td kh-hd-mono">
                    #{i.number}
                  </div>
                  <div role="cell" className="kh-table__td" title={i.summary}>
                    {i.summary}{' '}
                    {!i.inList && (
                      <span className="kh-hd-tag" data-k="gone">
                        {t('hd_outTag')}
                      </span>
                    )}
                  </div>
                  <div role="cell" className="kh-table__td" title={i.status}>
                    {i.status ? (
                      <span className="kh-hd-st" data-k={hdStatusKind(i.status)}>
                        {i.status}
                      </span>
                    ) : (
                      '—'
                    )}
                  </div>
                  <div role="cell" className="kh-table__td">
                    {i.priority || '—'}
                  </div>
                  <div role="cell" className="kh-table__td">
                    {i.type || '—'}
                  </div>
                  <div role="cell" className="kh-table__td" title={i.client}>
                    {i.client || '—'}
                  </div>
                  <div role="cell" className="kh-table__td" title={i.assignee}>
                    {i.assignee || '—'}
                  </div>
                  <div role="cell" className="kh-table__td kh-hd-dim" title={i.commentBy}>
                    {i.commentBy ? `${i.commentBy} · ${fmtWhen(i.commentAt)}` : '—'}
                  </div>
                  <div role="cell" className="kh-table__td kh-hd-dim kh-hd-mono" title={i.reportedBy}>
                    {i.reportedAt ? fmtWhen(i.reportedAt).slice(0, 5) : '—'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="kh-well kh-table">
              {!groups.length && <div className="kh-table__empty">{t('hd_noChanges')}</div>}
              {groups.map(([at, cs]) => (
                <div key={at} role="rowgroup">
                  <div className="kh-hd-when">
                    {new Date(at).toLocaleString()} · {srcOf.get(cs[0]!.sourceId)?.name ?? ''}
                  </div>
                  {cs.map((c) => (
                    <div
                      key={c.id}
                      className="kh-hd-chg kh-hd-chg--click"
                      role="button"
                      tabIndex={0}
                      onClick={() => openItem(c.itemId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openItem(c.itemId);
                        }
                      }}
                    >
                      <span className="kh-hd-mono">#{c.number}</span>
                      <span>
                        {c.summary}
                        <em data-k={c.kind}>{text(c)}</em>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ItemDialog
        item={open}
        headers={(open && srcOf.get(open.sourceId)?.headers) || []}
        changes={(data?.changes ?? []).filter((c) => c.itemId === open?.id)}
        onClose={() => setOpen(null)}
        onTicket={() => void load()}
      />
      <SetupDialog
        id={setup}
        onClose={() => go({ setup: null })}
        onDone={() => {
          go({ setup: null });
          void load();
          window.dispatchEvent(new Event(HD_EVENT));
        }}
      />
    </section>
  );
}

// ---------------------------------------------------------------- one ticket

function ItemDialog({
  item,
  headers,
  changes,
  onClose,
  onTicket,
}: {
  item: Item | null;
  /** the helpdesk's column order (the cells are kept unordered) */
  headers: string[];
  changes: HdChange[];
  onClose: () => void;
  onTicket: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const text = useChangeText();
  const [busy, setBusy] = useState(false);
  const ticket = async () => {
    if (!item) return;
    setBusy(true);
    try {
      const r = await api<{ ticketId: string }>(`/helpdesk/items/${item.id}/ticket`, {});
      onTicket();
      router.push(`/app/tickets?k=${r.ticketId}`);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      toast({
        message: t(
          code === 'ticket_number_taken'
            ? 'hd_ticketTaken'
            : code === 'module_not_included'
              ? 'hd_noTickets'
              : 'hd_fail',
        ),
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title={item ? `#${item.number}` : ''}
      subtitle={item?.summary}
      closeLabel={t('ui_close')}
      className="kh-hd-modal"
      footer={
        <div className="kh-hd-foot">
          {item?.url && (
            <a className="kh-btn kh-btn--ghost" href={item.url} target="_blank" rel="noreferrer noopener">
              {t('hd_openHd')}
            </a>
          )}
          <span className="sp" />
          <button type="button" className="kh-btn kh-btn--ghost" onClick={onClose}>
            {t('hd_close')}
          </button>
          <button
            type="button"
            className="kh-btn kh-btn--primary"
            disabled={busy}
            onClick={() => void ticket()}
          >
            {item?.ticketId ? t('hd_seeTicket') : t('hd_makeTicket')}
          </button>
        </div>
      }
    >
      {item && (
        <>
          <div className="kh-hd-kv">
            {[
              ...headers.filter((h) => h in item.cells),
              ...Object.keys(item.cells).filter((h) => !headers.includes(h)),
            ]
              .map((k) => [k, item.cells[k]!] as const)
              .map(([k, v]) => (
                <Fragment key={k}>
                  <span>{k}</span>
                  <span>{v || '—'}</span>
                </Fragment>
              ))}
          </div>
          {!item.inList && (
            <p className="kh-hd-hint">
              {t('hd_outSince').replace('{d}', new Date(item.goneAt!).toLocaleString())}
            </p>
          )}
          <div className="kh-hd-when" style={{ padding: '6px 0' }}>
            {t('hd_history')}
          </div>
          {!changes.length && <p className="kh-hd-hint">{t('hd_noChanges')}</p>}
          {changes.map((c) => (
            <div key={c.id} className="kh-hd-chg" style={{ padding: '6px 0' }}>
              <span className="kh-hd-dim kh-hd-mono">{short(c.syncAt)}</span>
              <span>
                <em data-k={c.kind} style={{ marginTop: 0 }}>
                  {text(c)}
                </em>
              </span>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}

// -------------------------------------------------------- linking a list

function SetupDialog({
  id,
  onClose,
  onDone,
}: {
  id: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [src, setSrc] = useState<Source | null>(null);
  const [name, setName] = useState('');
  const [intervalMin, setIntervalMin] = useState(15);
  const [onMissing, setOnMissing] = useState<'notify' | 'nothing'>('notify');
  const [mapping, setMapping] = useState<HdMapping>({});
  const [prev, setPrev] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setSrc(null);
    setPrev(null);
    if (!id) return;
    api<{ source: Source }>(`/helpdesk/sources/${id}`)
      .then(({ source }) => {
        setSrc(source);
        setName(source.name);
        setIntervalMin(source.intervalMin);
        setOnMissing(source.onMissing);
        setMapping(source.mapping);
      })
      .catch(() => {
        toast({ message: t('hd_fail'), tone: 'error' });
        onClose();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const hasNumber = Object.values(mapping).some((f) => f === 'subject' || f === 'number');
  const preview = async () => {
    if (!src) return;
    setBusy(true);
    try {
      setPrev(await api<Preview>(`/helpdesk/sources/${src.id}/preview`, { mapping }));
    } catch {
      toast({ message: t('hd_fail'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!src) return;
    setBusy(true);
    try {
      const r = await api<{ created: number; updated: number }>(`/helpdesk/sources/${src.id}/import`, {
        name: name.trim() || src.name,
        intervalMin,
        onMissing,
        mapping,
      });
      toast({
        message: t('hd_imported').replace('{a}', String(r.created)).replace('{b}', String(r.updated)),
        tone: 'success',
      });
      onDone();
    } catch {
      toast({ message: t('hd_fail'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const fieldOpts = [
    { value: '', label: `— ${t('hd_ignore')}` },
    ...HD_FIELDS.map((f) => ({ value: f, label: t(`hd_f_${f}`) })),
  ];
  const setField = (h: string, f: string) =>
    setMapping((m) => {
      const n: HdMapping = {};
      // one column per field
      for (const [k, v] of Object.entries(m)) if (k !== h && v !== f) n[k] = v;
      if (f) n[h] = f as HdField;
      return n;
    });
  return (
    <Modal
      open={!!id && !!src}
      onClose={onClose}
      title={prev ? t('hd_prevT') : t('hd_setupT')}
      subtitle={
        prev ? t('hd_prevS') : src ? `${src.url} · ${t('hd_rows').replace('{n}', String(src.rowCount))}` : ''
      }
      closeLabel={t('ui_close')}
      className="kh-hd-modal"
      footer={
        <div className="kh-hd-foot">
          <button
            type="button"
            className="kh-btn kh-btn--ghost"
            onClick={prev ? () => setPrev(null) : onClose}
          >
            {prev ? t('hd_back') : t('hd_cancel')}
          </button>
          {prev ? (
            <button
              type="button"
              className="kh-btn kh-btn--primary"
              disabled={busy}
              onClick={() => void save()}
            >
              {t('hd_import')
                .replace('{a}', String(prev.counts.fresh))
                .replace('{b}', String(prev.counts.changed))}
            </button>
          ) : (
            <button
              type="button"
              className="kh-btn kh-btn--primary"
              disabled={busy || !hasNumber}
              onClick={() => void preview()}
            >
              {t('hd_preview')}
            </button>
          )}
        </div>
      }
    >
      {src && !prev && (
        <>
          <div className="kh-hd-grid">
            <label className="kh-field">
              <span className="kh-field__label">{t('hd_name')}</span>
              <input
                className="kh-input"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="kh-field">
              <span className="kh-field__label">{t('hd_interval')}</span>
              <Select
                value={String(intervalMin)}
                options={HD_INTERVALS.map((n) => ({
                  value: String(n),
                  label: t('hd_every').replace(/\{n\}/g, String(n)),
                }))}
                onChange={(v) => setIntervalMin(Number(v))}
                searchPlaceholder={t('hd_interval')}
                aria-label={t('hd_interval')}
              />
            </div>
            <div className="kh-field">
              <span className="kh-field__label">{t('hd_onMissing')}</span>
              <Select
                value={onMissing}
                options={[
                  { value: 'notify', label: t('hd_om_notify') },
                  { value: 'nothing', label: t('hd_om_nothing') },
                ]}
                onChange={(v) => setOnMissing(v as 'notify' | 'nothing')}
                searchPlaceholder={t('hd_onMissing')}
                aria-label={t('hd_onMissing')}
              />
            </div>
          </div>
          <div className="kh-hd-map h">
            <span>{t('hd_col')}</span>
            <span>{t('hd_sample')}</span>
            <span>{t('hd_field')}</span>
          </div>
          {src.headers.map((h, i) => (
            <div key={h} className="kh-hd-map">
              <b title={h}>{h}</b>
              <span title={src.sample[0]?.[i]}>{src.sample[0]?.[i] || '—'}</span>
              <Select
                value={mapping[h] ?? ''}
                options={fieldOpts}
                onChange={(v) => setField(h, v)}
                searchPlaceholder={t('hd_field')}
                aria-label={`${h} · ${t('hd_field')}`}
              />
            </div>
          ))}
          <p className="kh-hd-hint">{hasNumber ? t('hd_mapHint') : t('hd_needNumber')}</p>
        </>
      )}
      {prev && (
        <>
          <div className="kh-hd-sum">
            <span>
              <b>{prev.counts.fresh}</b>
              {t('hd_pNew')}
            </span>
            <span>
              <b>{prev.counts.changed}</b>
              {t('hd_pUpd')}
            </span>
            <span>
              <b>{prev.counts.same}</b>
              {t('hd_pSame')}
            </span>
            {prev.counts.gone > 0 && (
              <span>
                <b>{prev.counts.gone}</b>
                {t('hd_pGone')}
              </span>
            )}
          </div>
          <table className="kh-hd-tbl">
            <thead>
              <tr>
                <th />
                <th>{t('hd_number')}</th>
                <th>{t('hd_f_summary')}</th>
                <th>{t('hd_f_status')}</th>
                <th>{t('hd_f_priority')}</th>
                <th>{t('hd_f_client')}</th>
                <th>{t('hd_reported')}</th>
              </tr>
            </thead>
            <tbody>
              {[
                ...prev.changed.map((c) => ({ row: c.row, k: 'upd', fields: c.fields })),
                ...prev.fresh.map((row) => ({
                  row,
                  k: 'new',
                  fields: [] as Array<[string, string, string]>,
                })),
              ]
                .slice(0, 100)
                .map(({ row, k, fields }) => (
                  <tr key={row.number}>
                    <td>
                      <span className="kh-hd-tag" data-k={k}>
                        {t(k === 'new' ? 'hd_tNew' : 'hd_tUpd')}
                      </span>
                    </td>
                    <td className="kh-hd-mono">#{row.number}</td>
                    <td title={row.summary}>
                      {row.summary}
                      {fields.map(([f, a, b]) => (
                        <small key={f}>
                          {t(`hd_f_${f}`)}: {a || '—'} → {b || '—'}
                        </small>
                      ))}
                    </td>
                    <td>
                      {row.status ? (
                        <span className="kh-hd-st" data-k={hdStatusKind(row.status)}>
                          {row.status}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{row.priority || '—'}</td>
                    <td>{row.client || '—'}</td>
                    <td className="kh-hd-mono">{row.reportedAt ? fmtWhen(row.reportedAt) : '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {prev.skipped > 0 && (
            <p className="kh-hd-hint">{t('hd_skipped').replace('{n}', String(prev.skipped))}</p>
          )}
        </>
      )}
    </Modal>
  );
}
