'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { refreshCounts } from '@/components/shell/counts';
import { api } from '@/lib/client/api';
import { connectionText, envColor, sapShortcut, SAP_ENVS, type SapEnv } from '@/lib/sap';
import { ResizableTable, useConfirm, usePersistentState, useToast, type Column } from '@/components/ui';
import { useWhen } from '@/components/content/useWhen';
import { downloadShortcut, SidePanel } from './SidePanel';
import './sap.css';

// SAP Systems — ZNotes.dc.html `isSystems`: the landscape per client, as a
// sortable list or as cards grouped by client (DEV → QAS → PRD), the detail
// panel, and the SAP GUI shortcut (.sap) download.

export type SapSystem = {
  id: string;
  clientId: string | null;
  name: string;
  sid: string;
  env: SapEnv;
  type: string;
  host: string;
  inst: string;
  mandt: string;
  router: string;
  lang: string;
  sapUser: string;
  fiori: string;
  notes: string;
  fav: boolean;
  createdAt: string;
};
type Client = { id: string; name: string };
type Patch = Partial<Omit<SapSystem, 'id' | 'fav' | 'createdAt'>>;
const EO: Record<SapEnv, number> = { DEV: 0, QAS: 1, PRD: 2 };

const Svg = ({ d, s = 14, fill = 'none' }: { d: string; s?: number; fill?: string }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    dangerouslySetInnerHTML={{ __html: d }}
  />
);
const I = {
  list: '<line x1="8" y1="6" x2="20" y2="6"></line><line x1="8" y1="12" x2="20" y2="12"></line><line x1="8" y1="18" x2="20" y2="18"></line><circle cx="4" cy="6" r="1"></circle><circle cx="4" cy="12" r="1"></circle><circle cx="4" cy="18" r="1"></circle>',
  cards:
    '<rect x="3" y="3" width="8" height="8" rx="2"></rect><rect x="13" y="3" width="8" height="8" rx="2"></rect><rect x="3" y="13" width="8" height="8" rx="2"></rect><rect x="13" y="13" width="8" height="8" rx="2"></rect>',
  search: '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
  gui: '<rect x="3" y="4" width="18" height="16" rx="3"></rect><path d="M7 10l3 2.5L7 15"></path><line x1="12.5" y1="15" x2="17" y2="15"></line>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"></path>',
  server:
    '<rect x="4" y="4" width="16" height="6" rx="2"></rect><rect x="4" y="14" width="16" height="6" rx="2"></rect><line x1="8" y1="7" x2="8.01" y2="7"></line><line x1="8" y1="17" x2="8.01" y2="17"></line>',
  trash: '<path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path>',
  x: '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>',
};

export function SystemsView() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const when = useWhen();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const activeId = sp.get('s');
  const [items, setItems] = useState<SapSystem[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [view, setView] = usePersistentState<'list' | 'cards'>('systems.view', 'cards');
  const [envF, setEnvF] = usePersistentState<'all' | SapEnv>('systems.env', 'all');
  const [clientF, setClientF] = usePersistentState<string>('systems.client', 'all');
  const [sort, setSort] = usePersistentState<{ key: string; dir: 'asc' | 'desc' } | null>(
    'systems.sort',
    null,
  );
  const [sapLang] = usePersistentState<string>('sap.lang', '');
  const [sapTx] = usePersistentState<string>('sap.tx', '');
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const timers = useRef(new Map<string, { tm: ReturnType<typeof setTimeout>; patch: Patch }>());

  const fail = useCallback(() => toast({ message: t('ne_saveFail'), tone: 'error' }), [toast, t]);
  useEffect(() => {
    void Promise.all([
      api<{ systems: SapSystem[] }>('/sap/systems'),
      api<{ clients: Client[] }>('/sap/clients').catch(() => ({ clients: [] })),
    ])
      .then(([s, c]) => {
        setItems(s.systems);
        setClients(c.clients);
      })
      .catch(fail);
  }, [fail]);

  const open = (id: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (id) p.set('s', id);
    else p.delete('s');
    router.replace(`${pathname}${p.size ? `?${p}` : ''}`, { scroll: false });
  };
  const flush = (id: string) => {
    const p = timers.current.get(id);
    if (!p) return;
    clearTimeout(p.tm);
    timers.current.delete(id);
    void api(`/sap/systems/${id}`, p.patch, 'PATCH').catch(fail);
  };
  const upd = (id: string, patch: Patch, delay = 500) => {
    setItems((cur) => cur && cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const prev = timers.current.get(id);
    if (prev) clearTimeout(prev.tm);
    const merged = { ...prev?.patch, ...patch };
    timers.current.set(id, { patch: merged, tm: setTimeout(() => flush(id), delay) });
  };
  useEffect(() => {
    const m = timers.current;
    return () => {
      for (const [id, p] of m) {
        clearTimeout(p.tm);
        void api(`/sap/systems/${id}`, p.patch, 'PATCH').catch(() => {});
      }
    };
  }, []);

  const cName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? '';
  const create = async () => {
    try {
      const { system } = await api<{ system: SapSystem }>('/sap/systems', {
        name: t('s_newName'),
        clientId: clientF !== 'all' && clients.some((c) => c.id === clientF) ? clientF : null,
      });
      refreshCounts();
      setItems((cur) => [system, ...(cur ?? [])]);
      open(system.id);
    } catch {
      fail();
    }
  };
  const fav = (x: SapSystem) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setItems((cur) => cur && cur.map((y) => (y.id === x.id ? { ...y, fav: !x.fav } : y)));
    void api(`/sap/systems/${x.id}/fav`, { fav: !x.fav }, 'PUT').catch(fail);
  };
  const gui = (x: SapSystem) => {
    const f = sapShortcut(x, { lang: sapLang, tx: sapTx });
    downloadShortcut(f.file, f.body);
  };
  const copy = (x: SapSystem) => {
    void navigator.clipboard
      ?.writeText(connectionText(x, { host: t('s_host'), inst: t('s_inst'), mandt: t('s_mandt') }))
      .catch(() => {});
    setCopied(x.id);
    setTimeout(() => setCopied(null), 1500);
  };
  const remove = async (x: SapSystem) => {
    const ok = await confirm({
      title: t('tr_askTitle'),
      body: t('tr_askBody').replace('{x}', x.name),
      confirmLabel: t('tr_move'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    timers.current.delete(x.id);
    try {
      await api(`/sap/systems/${x.id}`, undefined, 'DELETE');
      refreshCounts();
      setItems((cur) => cur && cur.filter((y) => y.id !== x.id));
      open(null);
    } catch {
      fail();
    }
  };

  const all = items ?? [];
  const query = q.trim().toLowerCase();
  const base = all.filter(
    (x) =>
      (clientF === 'all' || x.clientId === clientF) &&
      (!query ||
        [x.name, x.sid, cName(x.clientId), x.host, x.type].some((v) => v.toLowerCase().includes(query))),
  );
  const list = base.filter((x) => envF === 'all' || x.env === envF);
  const sorted = useMemo(() => {
    if (!sort) return list;
    const val = (x: SapSystem) =>
      sort.key === 'env'
        ? EO[x.env]
        : sort.key === 'customer'
          ? cName(x.clientId).toLowerCase()
          : String(x[sort.key as keyof SapSystem] ?? '').toLowerCase();
    return list.slice().sort((a, b) => {
      const A = val(a),
        B = val(b);
      return (A < B ? -1 : A > B ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, sort, clients]);
  const usedClients = clients.filter((c) => all.some((x) => x.clientId === c.id));
  const act = all.find((x) => x.id === activeId) ?? null;
  const envBadge = (e: SapEnv) => (
    <span
      className="kh-sap-env"
      style={{
        background: envColor(e).replace(')', ' / .26)'),
        boxShadow: `0 0 12px ${envColor(e).replace(')', ' / .25)')}`,
      }}
    >
      <span style={{ background: envColor(e) }} />
      {e}
    </span>
  );
  const favBtn = (x: SapSystem) => (
    <button
      type="button"
      className="kh-sap-ico"
      title={t('s_fav')}
      aria-label={`${t('s_fav')} ${x.name}`}
      aria-pressed={x.fav}
      style={{ color: x.fav ? 'oklch(0.86 0.13 85)' : 'rgba(255,248,240,.75)' }}
      onClick={fav(x)}
    >
      <Svg d={I.star} fill={x.fav ? 'currentColor' : 'none'} />
    </button>
  );
  const columns: Array<Column<SapSystem>> = [
    {
      key: 'name',
      label: t('s_system'),
      width: 200,
      sortable: true,
      render: (x) => <span className="kh-sap-strong">{x.name}</span>,
    },
    {
      key: 'customer',
      label: t('s_customer'),
      width: 160,
      sortable: true,
      render: (x) => cName(x.clientId) || '—',
    },
    {
      key: 'sid',
      label: 'SID',
      width: 100,
      sortable: true,
      render: (x) => <span className="kh-sap-mono kh-sap-strong">{x.sid || '—'}</span>,
    },
    { key: 'env', label: t('s_env'), width: 130, sortable: true, render: (x) => envBadge(x.env) },
    { key: 'type', label: t('s_type'), width: 210, sortable: true, render: (x) => x.type || '—' },
    {
      key: 'host',
      label: t('s_host'),
      width: 160,
      sortable: true,
      render: (x) => <span className="kh-sap-mono">{x.host || '—'}</span>,
    },
    {
      key: 'inst',
      label: t('s_inst'),
      width: 110,
      sortable: true,
      render: (x) => <span className="kh-sap-mono">{x.inst || '—'}</span>,
    },
    {
      key: 'mandt',
      label: t('s_mandt'),
      width: 110,
      sortable: true,
      render: (x) => <span className="kh-sap-mono">{x.mandt || '—'}</span>,
    },
    {
      key: 'acts',
      label: '',
      width: 90,
      grow: true,
      render: (x) => (
        <span className="kh-sap-acts">
          <button
            type="button"
            className="kh-sap-ico"
            title={t('s_gui')}
            aria-label={`${t('s_gui')} ${x.name}`}
            onClick={(e) => {
              e.stopPropagation();
              gui(x);
            }}
          >
            <Svg d={I.gui} />
          </button>
          {favBtn(x)}
        </span>
      ),
    },
  ];
  const groups = [...new Set(sorted.map((x) => x.clientId ?? ''))].map((c) => ({
    id: c,
    name: cName(c) || '—',
    items: sorted.filter((x) => (x.clientId ?? '') === c).sort((a, b) => EO[a.env] - EO[b.env]),
  }));
  const chip = (on: boolean) => ({ 'data-on': on || undefined, 'aria-pressed': on });

  return (
    <section className="kh-sap">
      <div className="kh-sap-main">
        <div className="kh-sap-head">
          <div className="kh-sap-titles">
            <h1>{t('nav_systems')}</h1>
            <div>{t('s_sub')}</div>
          </div>
          <div className="kh-sap-seg" role="radiogroup" aria-label={t('s_list')}>
            {(['list', 'cards'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                data-on={view === v || undefined}
                onClick={() => setView(v)}
              >
                <Svg d={I[v]} />
                {t(v === 'list' ? 's_list' : 's_cards')}
              </button>
            ))}
          </div>
          <label className="kh-sap-search">
            <Svg d={I.search} s={15} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('s_search')}
              aria-label={t('s_search')}
            />
          </label>
          <button type="button" className="kh-sap-new" onClick={() => void create()}>
            <Svg d={I.plus} s={15} />
            {t('s_new')}
          </button>
        </div>
        <div className="kh-sap-chips">
          {(['all', ...SAP_ENVS] as const).map((e) => (
            <button key={e} type="button" {...chip(envF === e)} onClick={() => setEnvF(e)}>
              {e !== 'all' && <span className="kh-sap-dot" style={{ background: envColor(e) }} />}
              {e === 'all' ? t('s_all') : e}
              <span className="kh-sap-n">
                {e === 'all' ? base.length : base.filter((x) => x.env === e).length}
              </span>
            </button>
          ))}
          <span className="kh-sap-vsep" />
          {[{ id: 'all', name: t('s_allClients') }, ...usedClients].map((c) => (
            <button key={c.id} type="button" {...chip(clientF === c.id)} onClick={() => setClientF(c.id)}>
              {c.name}
              <span className="kh-sap-n">
                {c.id === 'all' ? all.length : all.filter((x) => x.clientId === c.id).length}
              </span>
            </button>
          ))}
        </div>
        {view === 'list' ? (
          <div className="kh-sap-body">
            <ResizableTable
              id="systems"
              columns={columns}
              rows={sorted}
              rowKey={(x) => x.id}
              onRowClick={(x) => open(x.id)}
              selectedKey={activeId}
              sort={sort}
              onSortChange={setSort}
              emptyLabel={items ? t('s_empty') : ''}
              resizeLabel={t('resize')}
              minWidth={1100}
            />
          </div>
        ) : (
          <div className="kh-sap-body kh-sap-groups">
            {groups.map((g) => (
              <div key={g.id} className="kh-sap-group">
                <div className="kh-sap-ghead">
                  <span className="kh-sap-gico">
                    <Svg d={I.server} s={13} />
                  </span>
                  <span className="kh-sap-gname">{g.name}</span>
                  <span className="kh-sap-n">
                    {g.items.length}
                    {g.items.length === 1 ? t('s_sys1') : t('s_sysN')}
                  </span>
                  <span className="kh-sap-gline" />
                  <span className="kh-sap-route">{t('s_route')}</span>
                </div>
                <div className="kh-sap-cards">
                  {g.items.map((x) => (
                    <div
                      key={x.id}
                      className="kh-sap-card"
                      data-on={x.id === activeId || undefined}
                      onClick={() => open(x.id)}
                      style={{
                        background: `linear-gradient(160deg,${envColor(x.env).replace(')', ' / .16)')},rgba(255,255,255,.04))`,
                      }}
                    >
                      <div className="kh-sap-card__bar" style={{ background: envColor(x.env) }} />
                      <div className="kh-sap-card__top">
                        <div className="kh-sap-card__ico" style={{ color: envColor(x.env) }}>
                          <Svg d={I.server} s={18} />
                        </div>
                        <div className="kh-sap-card__id">
                          <div>
                            <span className="kh-sap-mono kh-sap-card__sid">{x.sid || '—'}</span>
                            {envBadge(x.env)}
                          </div>
                          <span>
                            {x.name} · {x.type || '—'}
                          </span>
                        </div>
                        {favBtn(x)}
                      </div>
                      <div className="kh-sap-card__kv">
                        <div>
                          <span>{t('s_host')}</span>
                          <span className="kh-sap-mono">{x.host || '—'}</span>
                        </div>
                        <div>
                          <span>{t('s_inst')}</span>
                          <span className="kh-sap-mono">{x.inst || '—'}</span>
                        </div>
                        <div>
                          <span>{t('s_mandt')}</span>
                          <span className="kh-sap-mono">{x.mandt || '—'}</span>
                        </div>
                      </div>
                      <div className="kh-sap-card__acts">
                        <button
                          type="button"
                          className="kh-sap-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            gui(x);
                          }}
                        >
                          <Svg d={I.gui} />
                          SAP GUI
                        </button>
                        <button
                          type="button"
                          className="kh-sap-ghost"
                          title={t('s_copy')}
                          onClick={(e) => {
                            e.stopPropagation();
                            copy(x);
                          }}
                        >
                          {copied === x.id ? t('copied') : t('s_copyShort')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {items && !sorted.length && <div className="kh-sap-empty">{t('s_empty')}</div>}
          </div>
        )}
      </div>
      {act && (
        <SidePanel id="systems" def={460} resizeLabel={t('resize')}>
          <div className="kh-sap-ptop">
            <span>
              {t('createdAt')} {when(act.createdAt)}
            </span>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="kh-sap-ico kh-sap-ico--del"
              title={t('del')}
              aria-label={t('del')}
              onClick={() => void remove(act)}
            >
              <Svg d={I.trash} s={16} />
            </button>
            <button
              type="button"
              className="kh-sap-ico kh-sap-ico--x"
              title={t('i_close')}
              aria-label={t('i_close')}
              onClick={() => open(null)}
            >
              <Svg d={I.x} s={14} />
            </button>
          </div>
          <div className="kh-sap-pbody">
            <input
              className="kh-sap-ptitle"
              value={act.name}
              aria-label={t('s_system')}
              maxLength={200}
              onChange={(e) => upd(act.id, { name: e.target.value })}
            />
            <div className="kh-sap-fld">
              <span>{t('s_env')}</span>
              <div className="kh-sap-envpick">
                {SAP_ENVS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-pressed={act.env === e}
                    style={
                      act.env === e
                        ? { background: envColor(e).replace(')', ' / .3)'), borderColor: envColor(e) }
                        : undefined
                    }
                    onClick={() => upd(act.id, { env: e }, 0)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
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
              {(
                [
                  ['type', t('s_type'), 120, false],
                  ['sid', 'SID', 8, true],
                  ['mandt', t('s_mandt'), 4, true],
                  ['host', t('s_host'), 255, true],
                  ['inst', t('s_inst'), 4, true],
                  ['router', 'SAProuter', 500, true],
                  ['lang', t('s_lang'), 2, true],
                ] as const
              ).map(([k, label, max, mono]) => (
                <label key={k} className="kh-sap-fld">
                  <span>{label}</span>
                  <input
                    className="kh-sap-input"
                    data-mono={mono || undefined}
                    value={act[k]}
                    maxLength={max}
                    spellCheck={false}
                    onChange={(e) => {
                      let v = e.target.value;
                      if (k === 'sid' || k === 'lang') v = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
                      if (k === 'mandt' || k === 'inst') v = v.replace(/\D/g, '');
                      upd(act.id, { [k]: v });
                    }}
                  />
                </label>
              ))}
            </div>
            <label className="kh-sap-fld">
              <span>{t('s_user')}</span>
              <input
                className="kh-sap-input"
                data-mono
                value={act.sapUser}
                maxLength={40}
                spellCheck={false}
                onChange={(e) => upd(act.id, { sapUser: e.target.value })}
              />
            </label>
            <label className="kh-sap-fld">
              <span>Fiori Launchpad</span>
              <input
                className="kh-sap-input"
                data-mono
                value={act.fiori}
                maxLength={2000}
                spellCheck={false}
                placeholder="https://"
                onChange={(e) => {
                  const v = e.target.value;
                  setItems((cur) => cur && cur.map((x) => (x.id === act.id ? { ...x, fiori: v } : x)));
                  // only valid addresses are saved (the server accepts http(s) URLs)
                  if (!v || /^https?:\/\/\S+$/.test(v)) upd(act.id, { fiori: v });
                }}
              />
            </label>
            <label className="kh-sap-fld">
              <span>{t('v_notes')}</span>
              <textarea
                className="kh-sap-input kh-sap-text"
                value={act.notes}
                onChange={(e) => upd(act.id, { notes: e.target.value })}
              />
            </label>
            <div className="kh-sap-pacts">
              <button type="button" className="kh-sap-primary" onClick={() => gui(act)}>
                <Svg d={I.gui} />
                {t('s_gui')}
              </button>
              {/^https?:\/\//.test(act.fiori) && (
                <a className="kh-sap-ghost" href={act.fiori} target="_blank" rel="noopener noreferrer">
                  Fiori ↗
                </a>
              )}
            </div>
          </div>
        </SidePanel>
      )}
    </section>
  );
}
