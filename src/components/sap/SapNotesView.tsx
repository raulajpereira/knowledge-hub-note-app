'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { JSONContent } from '@tiptap/react';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import { envColor, ENV_ORDER, type SapEnv } from '@/lib/sap';
import {
  COMMON_COMPONENTS,
  meSapUrl,
  NOTE_CATEGORIES,
  NOTE_IMPL,
  NOTE_PRIORITIES,
  NOTE_STATUS,
  parseNoteNumbers,
  priorityColor,
  statusColor,
  toCsv,
} from '@/lib/sapNotes';
import { tagStyle } from '@/lib/tags';
import {
  Modal,
  ResizableTable,
  TagInput,
  useConfirm,
  usePersistentState,
  useToast,
  type Column,
} from '@/components/ui';
import { ShellContext } from '@/components/shell/ShellContext';
import { Connections } from '@/components/content/Connections';
import { editableDoc } from '@/components/notes/NoteEditor';
import { useWhen } from '@/components/content/useWhen';
import { SidePanel } from './SidePanel';
import { SapNoteDoc } from './SapNoteDoc';
import './sap.css';
import './sapnotes.css';

// Notas SAP: the tenant's library of SAP (OSS) notes — a list with filters,
// the matrix "note × system" with the status of each note in each system of
// the landscape, import of a pasted list of numbers, CSV export and the
// detail panel (fields, status per system, transports, links, notes).

type NoteSystem = { status: string; implOn: string | null; transportId: string | null };
export type SapNote = {
  id: string;
  number: number;
  version: number;
  title: string;
  component: string;
  category: string;
  priority: string;
  releasedOn: string | null;
  validity: Array<{ swc: string; rel: string; sp: string }>;
  impl: string[];
  prereqs: number[];
  projectId: string | null;
  tags: string[];
  transportIds: string[];
  systems: Record<string, NoteSystem>;
  createdAt: string;
  updatedAt: string;
};
type Sys = { id: string; name: string; sid: string; env: SapEnv; clientId: string | null; mandt: string };
type Tr = {
  id: string;
  trkorr: string;
  description: string;
  systemId: string | null;
  releasedAt: string | null;
  qasAt: string | null;
  prdAt: string | null;
  junkAt: string | null;
};
type Proj = { id: string; code: string; name: string };
type Patch = Partial<Omit<SapNote, 'id' | 'systems' | 'createdAt' | 'updatedAt'>> & { body?: JSONContent };
type Lbl = { pt: string; en: string };

const Svg = ({ d, s = 14 }: { d: string; s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
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
  matrix:
    '<rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line>',
  search: '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
  trash: '<path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path>',
  x: '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>',
  ext: '<path d="M14 4h6v6"></path><path d="M20 4l-9 9"></path><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path>',
  paste:
    '<rect x="8" y="3" width="8" height="4" rx="1"></rect><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path>',
  csv: '<path d="M12 3v12"></path><path d="M7 10l5 5 5-5"></path><path d="M5 21h14"></path>',
};

export function SapNotesView() {
  const { t, lang } = useI18n();
  const tr = useCallback((o: Lbl) => (lang === 'en' ? o.en : o.pt), [lang]);
  const toast = useToast();
  const confirm = useConfirm();
  const when = useWhen();
  const shell = useContext(ShellContext);
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const activeId = sp.get('n');
  const [items, setItems] = useState<SapNote[] | null>(null);
  const [systems, setSystems] = useState<Sys[]>([]);
  const [transports, setTransports] = useState<Tr[]>([]);
  const [projects, setProjects] = useState<Proj[]>([]);
  const [components, setComponents] = useState<string[]>([]);
  const [view, setView] = usePersistentState<'list' | 'matrix'>('sapnotes.view', 'list');
  const [sort, setSort] = usePersistentState<{ key: string; dir: 'asc' | 'desc' } | null>(
    'sapnotes.sort',
    null,
  );
  const [q, setQ] = useState('');
  const [fComp, setFComp] = useState('');
  const [fCat, setFCat] = useState('');
  const [fPrio, setFPrio] = useState('');
  const [fSys, setFSys] = useState('');
  const [fSt, setFSt] = useState('');
  const [fProj, setFProj] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const timers = useRef(new Map<string, { tm: ReturnType<typeof setTimeout>; patch: Patch }>());

  const fail = useCallback(
    (e?: unknown) => {
      const code = isApiFailure(e) ? e.code : '';
      toast({
        message: t(
          code === 'note_exists'
            ? 'sn_exists'
            : code === 'note_in_trash'
              ? 'sn_inTrash'
              : code === 'transport_not_found'
                ? 'sn_trGone'
                : 'ne_saveFail',
        ),
        tone: 'error',
      });
    },
    [toast, t],
  );
  const load = useCallback(async () => {
    const r = await api<{
      notes: SapNote[];
      systems: Sys[];
      transports: Tr[];
      projects: Proj[];
      components: string[];
    }>('/sap/notes');
    setItems(r.notes);
    setSystems(
      r.systems.slice().sort((a, b) => ENV_ORDER[a.env] - ENV_ORDER[b.env] || a.sid.localeCompare(b.sid)),
    );
    setTransports(r.transports);
    setProjects(r.projects);
    setComponents(r.components);
  }, []);
  useEffect(() => {
    load().catch(fail);
  }, [load, fail]);

  const open = (id: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (id) p.set('n', id);
    else p.delete('n');
    router.replace(`${pathname}${p.size ? `?${p}` : ''}`, { scroll: false });
  };
  const flush = useCallback(
    (id: string) => {
      const p = timers.current.get(id);
      if (!p) return;
      clearTimeout(p.tm);
      timers.current.delete(id);
      void api<{ note: SapNote }>(`/sap/notes/${id}`, p.patch, 'PATCH')
        .then(({ note }) =>
          setItems((cur) => cur && cur.map((x) => (x.id === id ? { ...x, updatedAt: note.updatedAt } : x))),
        )
        .catch((e) => {
          fail(e);
          // the server refused (e.g. a number in use): show what is stored
          void load().catch(() => {});
        });
    },
    [fail, load],
  );
  const upd = (id: string, patch: Patch, delay = 500) => {
    const { body: _b, ...shown } = patch;
    setItems((cur) => cur && cur.map((x) => (x.id === id ? { ...x, ...shown } : x)));
    const prev = timers.current.get(id);
    if (prev) clearTimeout(prev.tm);
    timers.current.set(id, { patch: { ...prev?.patch, ...patch }, tm: setTimeout(() => flush(id), delay) });
  };
  useEffect(() => {
    const m = timers.current;
    const hide = () => {
      for (const id of [...m.keys()]) flush(id);
    };
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('pagehide', hide);
      hide();
    };
  }, [flush]);

  const setStatus = async (n: SapNote, sysId: string, v: Partial<NoteSystem> & { status?: string }) => {
    const cur = n.systems[sysId] ?? { status: 'new', implOn: null, transportId: null };
    const next = { ...cur, ...v };
    setItems(
      (c) => c && c.map((x) => (x.id === n.id ? { ...x, systems: { ...x.systems, [sysId]: next } } : x)),
    );
    try {
      const { system } = await api<{ system: NoteSystem }>(
        `/sap/notes/${n.id}/systems/${sysId}`,
        {
          status: next.status,
          ...(v.implOn !== undefined && { implOn: v.implOn }),
          ...(v.transportId !== undefined && { transportId: v.transportId }),
        },
        'PUT',
      );
      setItems(
        (c) => c && c.map((x) => (x.id === n.id ? { ...x, systems: { ...x.systems, [sysId]: system } } : x)),
      );
    } catch (e) {
      fail(e);
    }
  };

  const create = async (number: number, title = '') => {
    try {
      const { note } = await api<{ note: SapNote }>('/sap/notes', { number, ...(title && { title }) });
      setItems((cur) => [...(cur ?? []), note]);
      open(note.id);
      return true;
    } catch (e) {
      const have = items?.find((x) => x.number === number);
      if (isApiFailure(e) && e.code === 'note_exists' && have) {
        open(have.id);
        toast({ message: t('sn_exists'), tone: 'info' });
        return true;
      }
      fail(e);
      return false;
    }
  };
  const remove = async (x: SapNote) => {
    const ok = await confirm({
      title: t('tr_askTitle'),
      body: t('tr_askBody').replace('{x}', `${x.number} ${x.title}`.trim()),
      confirmLabel: t('tr_move'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    timers.current.delete(x.id);
    try {
      await api(`/sap/notes/${x.id}`, undefined, 'DELETE');
      setItems((cur) => cur && cur.filter((y) => y.id !== x.id));
      open(null);
    } catch (e) {
      fail(e);
    }
  };

  // ── Derived ─────────────────────────────────────────────────────────────
  const all = useMemo(() => items ?? [], [items]);
  const sysLabel = (s: Sys) => `${s.sid || s.name}${s.mandt ? `/${s.mandt}` : ''}`;
  const catL = (k: string) => {
    const c = NOTE_CATEGORIES.find((x) => x[0] === k);
    return c ? tr(c[1]) : '';
  };
  const prioL = (k: string) => {
    const c = NOTE_PRIORITIES.find((x) => x[0] === k);
    return c ? tr(c[1]) : '';
  };
  const stL = (k: string) => tr((NOTE_STATUS.find((x) => x[0] === k) ?? NOTE_STATUS[0]!)[1]);
  const stOf = (n: SapNote, s: string) => n.systems[s]?.status ?? 'new';
  const query = q.trim().toLowerCase();
  const list = all.filter(
    (n) =>
      (!fComp || n.component === fComp || n.component.startsWith(`${fComp}-`)) &&
      (!fCat || n.category === fCat) &&
      (!fPrio || n.priority === fPrio) &&
      (!fProj || n.projectId === fProj) &&
      (!fSt || (fSys ? stOf(n, fSys) === fSt : systems.some((s) => stOf(n, s.id) === fSt))) &&
      (!query ||
        String(n.number).includes(query.replace(/^0+/, '')) ||
        [n.title, n.component, ...n.tags].some((v) => v.toLowerCase().includes(query))),
  );
  const PO = Object.fromEntries(NOTE_PRIORITIES.map((p, i) => [p[0], i]));
  const sorted = useMemo(() => {
    if (!sort) return list;
    const val = (x: SapNote): string | number =>
      sort.key === 'number' || sort.key === 'version'
        ? x[sort.key]
        : sort.key === 'priority'
          ? (PO[x.priority] ?? 99)
          : sort.key === 'category'
            ? catL(x.category)
            : String(x[sort.key as keyof SapNote] ?? '').toLowerCase();
    return list.slice().sort((a, b) => {
      const A = val(a),
        B = val(b);
      return (A < B ? -1 : A > B ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, sort, lang]);
  const act = all.find((x) => x.id === activeId) ?? null;
  const compOpts = [...new Set([...components, ...all.map((n) => n.component).filter(Boolean)])].sort();
  const compSuggest = [...new Set([...compOpts, ...COMMON_COMPONENTS])].sort();
  // top-level component areas for the filter (FI, BC-UPG…)
  const compFilter = [
    ...new Set(compOpts.flatMap((c) => c.split('-').map((_, i, a) => a.slice(0, i + 1).join('-')))),
  ].sort();

  const prioPill = (k: string) =>
    k ? (
      <span className="kh-sn-prio" style={{ borderColor: priorityColor(k), color: priorityColor(k) }}>
        <i style={{ background: priorityColor(k) }} />
        {prioL(k)}
      </span>
    ) : (
      '—'
    );
  const columns: Array<Column<SapNote>> = [
    {
      key: 'number',
      label: t('sn_number'),
      width: 110,
      sortable: true,
      render: (x) => <span className="kh-sap-mono kh-sap-strong">{x.number}</span>,
    },
    {
      key: 'version',
      label: t('sn_version'),
      width: 70,
      sortable: true,
      render: (x) => <span className="kh-sap-mono">{x.version}</span>,
    },
    {
      key: 'title',
      label: t('sn_title'),
      width: 320,
      sortable: true,
      render: (x) => <span className="kh-sap-strong">{x.title || '—'}</span>,
    },
    {
      key: 'component',
      label: t('sn_component'),
      width: 130,
      sortable: true,
      render: (x) => <span className="kh-sap-mono">{x.component || '—'}</span>,
    },
    {
      key: 'category',
      label: t('sn_category'),
      width: 170,
      sortable: true,
      render: (x) => catL(x.category) || '—',
    },
    {
      key: 'priority',
      label: t('sn_priority'),
      width: 210,
      sortable: true,
      render: (x) => prioPill(x.priority),
    },
    {
      key: 'releasedOn',
      label: t('sn_released'),
      width: 110,
      sortable: true,
      render: (x) => <span className="kh-sap-mono">{x.releasedOn ?? '—'}</span>,
    },
    {
      key: 'sys',
      label: t('sn_systems'),
      width: 200,
      grow: true,
      render: (x) => (
        <span className="kh-sn-dots">
          {systems.map((s) => (
            <i
              key={s.id}
              title={`${sysLabel(s)} · ${stL(stOf(x, s.id))}`}
              style={{ background: statusColor(stOf(x, s.id)) }}
            />
          ))}
        </span>
      ),
    },
  ];

  const exportCsv = () => {
    const proj = (id: string | null) => projects.find((p) => p.id === id)?.code ?? '';
    const head = [
      t('sn_number'),
      t('sn_version'),
      t('sn_title'),
      t('sn_component'),
      t('sn_category'),
      t('sn_priority'),
      t('sn_released'),
      t('sn_impl'),
      t('sn_prereqs'),
      t('sn_validity'),
      t('sn_project'),
      t('sn_tags'),
      ...systems.map((s) => sysLabel(s)),
    ];
    const rows = sorted.map((n) => [
      n.number,
      n.version,
      n.title,
      n.component,
      catL(n.category),
      prioL(n.priority),
      n.releasedOn ?? '',
      n.impl.map((k) => tr(NOTE_IMPL.find((x) => x[0] === k)![1])).join(', '),
      n.prereqs.join(', '),
      n.validity.map((v) => [v.swc, v.rel, v.sp].filter(Boolean).join(' ')).join(' | '),
      proj(n.projectId),
      n.tags.join(', '),
      ...systems.map((s) => {
        const st = n.systems[s.id];
        return `${stL(st?.status ?? 'new')}${st?.implOn ? ` (${st.implOn})` : ''}`;
      }),
    ]);
    const u = URL.createObjectURL(new Blob([toCsv([head, ...rows])], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = u;
    a.download = `sap-notes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  };

  const sel = (
    label: string,
    val: string,
    set: (v: string) => void,
    opts: Array<[string, string]>,
    all0: string,
  ) => (
    <select
      className="kh-sn-fsel"
      data-on={val || undefined}
      value={val}
      aria-label={label}
      onChange={(e) => set(e.target.value)}
    >
      <option value="">{all0}</option>
      {opts.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
  const nFilters = [fComp, fCat, fPrio, fSt, fProj].filter(Boolean).length;

  return (
    <section className="kh-sap kh-sn">
      <div className="kh-sap-main">
        <div className="kh-sap-head">
          <div className="kh-sap-titles">
            <h1>{t('nav_sapnotes')}</h1>
            <div>{t('sn_sub')}</div>
          </div>
          <div className="kh-sap-seg" role="radiogroup" aria-label={t('sn_view')}>
            {(['list', 'matrix'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                data-on={view === v || undefined}
                onClick={() => setView(v)}
              >
                <Svg d={I[v]} />
                {t(v === 'list' ? 's_list' : 'sn_matrix')}
              </button>
            ))}
          </div>
          <label className="kh-sap-search">
            <Svg d={I.search} s={15} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('sn_search')}
              aria-label={t('sn_search')}
            />
          </label>
          <button type="button" className="kh-sap-ghost" onClick={() => setImportOpen(true)}>
            <Svg d={I.paste} />
            {t('sn_import')}
          </button>
          <button type="button" className="kh-sap-ghost" onClick={exportCsv} disabled={!sorted.length}>
            <Svg d={I.csv} />
            CSV
          </button>
          <button type="button" className="kh-sap-new" onClick={() => setNewOpen(true)}>
            <Svg d={I.plus} s={15} />
            {t('sn_new')}
          </button>
        </div>
        <div className="kh-sap-chips kh-sn-filters">
          {sel(
            t('sn_component'),
            fComp,
            setFComp,
            compFilter.map((c) => [c, c]),
            t('sn_allComp'),
          )}
          {sel(
            t('sn_category'),
            fCat,
            setFCat,
            NOTE_CATEGORIES.map(([k, l]) => [k, tr(l)]),
            t('sn_allCat'),
          )}
          {sel(
            t('sn_priority'),
            fPrio,
            setFPrio,
            NOTE_PRIORITIES.map(([k, l]) => [k, tr(l)]),
            t('sn_allPrio'),
          )}
          <span className="kh-sap-vsep" />
          {sel(
            t('sn_status'),
            fSt,
            setFSt,
            NOTE_STATUS.map(([k, l]) => [k, tr(l)]),
            t('sn_allSt'),
          )}
          {sel(
            t('sn_inSystem'),
            fSys,
            setFSys,
            systems.map((s) => [s.id, `${sysLabel(s)} · ${s.name}`]),
            t('sn_anySystem'),
          )}
          {projects.length > 0 &&
            sel(
              t('sn_project'),
              fProj,
              setFProj,
              projects.map((p) => [p.id, `${p.code} · ${p.name}`]),
              t('fn_allProj'),
            )}
          {nFilters > 0 && (
            <button
              type="button"
              className="kh-sn-clear"
              onClick={() => {
                setFComp('');
                setFCat('');
                setFPrio('');
                setFSt('');
                setFSys('');
                setFProj('');
              }}
            >
              {t('ot_clearF')}
            </button>
          )}
          <span className="kh-sap-n kh-sn-count">
            {sorted.length} / {all.length}
          </span>
        </div>
        {view === 'list' ? (
          <div className="kh-sap-body">
            <ResizableTable
              id="sapnotes"
              columns={columns}
              rows={sorted}
              rowKey={(x) => x.id}
              onRowClick={(x) => open(x.id)}
              selectedKey={activeId}
              sort={sort}
              onSortChange={setSort}
              emptyLabel={items ? t('sn_empty') : ''}
              resizeLabel={t('resize')}
              minWidth={1200}
            />
          </div>
        ) : (
          <div className="kh-sap-body kh-sn-mwrap">
            {!systems.length ? (
              <div className="kh-sap-empty">{t('sn_noSystems')}</div>
            ) : (
              <table className="kh-sn-matrix" aria-label={t('sn_matrix')}>
                <thead>
                  <tr>
                    <th scope="col" className="kh-sn-mnote">
                      {t('sn_note')}
                    </th>
                    {systems.map((s) => (
                      <th key={s.id} scope="col" title={s.name}>
                        <span className="kh-sn-msys">
                          <i style={{ background: envColor(s.env) }} />
                          {sysLabel(s)}
                        </span>
                        <span className="kh-sn-menv">{s.env}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((n) => (
                    <tr key={n.id} data-on={n.id === activeId || undefined}>
                      <th scope="row" className="kh-sn-mnote">
                        <button type="button" onClick={() => open(n.id)}>
                          <span className="kh-sap-mono kh-sap-strong">{n.number}</span>
                          <span>{n.title || '—'}</span>
                        </button>
                      </th>
                      {systems.map((s) => {
                        const st = stOf(n, s.id);
                        return (
                          <td key={s.id}>
                            <select
                              className="kh-sn-mcell"
                              value={st}
                              aria-label={`${n.number} · ${sysLabel(s)}`}
                              title={`${stL(st)}${n.systems[s.id]?.implOn ? ` · ${n.systems[s.id]!.implOn}` : ''}`}
                              style={{ backgroundColor: statusColor(st) }}
                              data-st={st}
                              onChange={(e) => void setStatus(n, s.id, { status: e.target.value })}
                            >
                              {NOTE_STATUS.map(([k, l]) => (
                                <option key={k} value={k}>
                                  {tr(l)}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="kh-sn-legend">
              {NOTE_STATUS.map(([k, l, c]) => (
                <span key={k}>
                  <i style={{ background: c }} />
                  {tr(l)}
                  <b>{sorted.reduce((a, n) => a + systems.filter((s) => stOf(n, s.id) === k).length, 0)}</b>
                </span>
              ))}
            </div>
            {items && !sorted.length && <div className="kh-sap-empty">{t('sn_empty')}</div>}
          </div>
        )}
      </div>
      {act && (
        <SidePanel id="sapnotes" def={520} resizeLabel={t('resize')}>
          <NotePanel
            key={act.id}
            note={act}
            all={all}
            systems={systems}
            transports={transports}
            projects={projects}
            compSuggest={compSuggest}
            hasTransports={!!shell?.modules.has('transports')}
            sysLabel={sysLabel}
            tr={tr}
            when={when}
            upd={(p, d) => upd(act.id, p, d)}
            setStatus={(s, v) => void setStatus(act, s, v)}
            onOpen={open}
            onCreate={(n) => void create(n)}
            onRemove={() => void remove(act)}
          />
        </SidePanel>
      )}
      <NewNote open={newOpen} onClose={() => setNewOpen(false)} onCreate={create} />
      <ImportNotes
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={(r) => {
          void load().catch(() => {});
          toast({
            message: t('sn_imported').replace('{n}', String(r.created)).replace('{m}', String(r.skipped)),
            tone: 'success',
          });
        }}
      />
    </section>
  );
}

function NotePanel({
  note: n,
  all,
  systems,
  transports,
  projects,
  compSuggest,
  hasTransports,
  sysLabel,
  tr,
  when,
  upd,
  setStatus,
  onOpen,
  onCreate,
  onRemove,
}: {
  note: SapNote;
  all: SapNote[];
  systems: Sys[];
  transports: Tr[];
  projects: Proj[];
  compSuggest: string[];
  hasTransports: boolean;
  sysLabel: (s: Sys) => string;
  tr: (o: Lbl) => string;
  when: (iso: string) => string;
  upd: (p: Patch, delay?: number) => void;
  setStatus: (sysId: string, v: Partial<NoteSystem>) => void;
  onOpen: (id: string | null) => void;
  onCreate: (n: number) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const [num, setNum] = useState(String(n.number));
  const [doc, setDoc] = useState<JSONContent | null>(null);
  const [pre, setPre] = useState('');
  useEffect(() => setNum(String(n.number)), [n.number]);
  useEffect(() => {
    let live = true;
    api<{ note: { body: unknown } }>(`/sap/notes/${n.id}`)
      .then((r) => live && setDoc(editableDoc(r.note.body)))
      .catch(() => live && setDoc(editableDoc(null)));
    return () => {
      live = false;
    };
  }, [n.id]);
  const trOf = (id: string | null) => transports.find((x) => x.id === id);
  const trLabel = (x: Tr) => `${x.trkorr}${x.description ? ` · ${x.description}` : ''}`;
  const byNumber = (k: number) => all.find((x) => x.number === k);
  const commitNum = () => {
    const v = Number(num);
    if (Number.isInteger(v) && v >= 1 && v <= 99_999_999 && v !== n.number) upd({ number: v }, 0);
    else setNum(String(n.number));
  };
  const addPre = () => {
    const ks = parseNoteNumbers(pre).filter((k) => k !== n.number && !n.prereqs.includes(k));
    if (ks.length) upd({ prereqs: [...n.prereqs, ...ks].slice(0, 50) }, 0);
    setPre('');
  };
  const vRows = n.validity;
  const setV = (i: number, k: 'swc' | 'rel' | 'sp', v: string) =>
    upd({ validity: vRows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) });

  return (
    <>
      <div className="kh-sap-ptop">
        <span>
          {t('createdAt')} {when(n.createdAt)}
        </span>
        <div style={{ flex: 1 }} />
        <a
          className="kh-sap-ghost kh-sn-me"
          href={meSapUrl(n.number)}
          target="_blank"
          rel="noopener noreferrer"
          title={t('sn_openMe')}
        >
          <Svg d={I.ext} s={13} />
          me.sap.com
        </a>
        <button
          type="button"
          className="kh-sap-ico kh-sap-ico--del"
          title={t('del')}
          aria-label={t('del')}
          onClick={onRemove}
        >
          <Svg d={I.trash} s={16} />
        </button>
        <button
          type="button"
          className="kh-sap-ico kh-sap-ico--x"
          title={t('i_close')}
          aria-label={t('i_close')}
          onClick={() => onOpen(null)}
        >
          <Svg d={I.x} s={14} />
        </button>
      </div>
      <div className="kh-sap-pbody">
        <div className="kh-sn-numrow">
          <label className="kh-sap-fld">
            <span>{t('sn_number')}</span>
            <input
              className="kh-sap-input"
              data-mono
              inputMode="numeric"
              value={num}
              maxLength={8}
              onChange={(e) => setNum(e.target.value.replace(/\D/g, ''))}
              onBlur={commitNum}
              onKeyDown={(e) => e.key === 'Enter' && commitNum()}
            />
          </label>
          <label className="kh-sap-fld">
            <span>{t('sn_version')}</span>
            <input
              className="kh-sap-input"
              data-mono
              type="number"
              min={1}
              max={9999}
              value={n.version}
              onChange={(e) => {
                const v = Math.max(1, Math.min(9999, Math.floor(Number(e.target.value) || 1)));
                upd({ version: v });
              }}
            />
          </label>
          <label className="kh-sap-fld">
            <span>{t('sn_released')}</span>
            <input
              className="kh-sap-input"
              type="date"
              value={n.releasedOn ?? ''}
              onChange={(e) => upd({ releasedOn: e.target.value || null }, 0)}
            />
          </label>
        </div>
        <textarea
          className="kh-sap-ptitle kh-sn-title"
          value={n.title}
          rows={2}
          aria-label={t('sn_title')}
          placeholder={t('sn_titlePh')}
          maxLength={300}
          onChange={(e) => upd({ title: e.target.value.replace(/[\r\n]+/g, ' ') })}
        />
        <div className="kh-sap-grid2">
          <label className="kh-sap-fld">
            <span>{t('sn_component')}</span>
            <input
              className="kh-sap-input"
              data-mono
              list="kh-sn-comps"
              value={n.component}
              maxLength={40}
              placeholder="FI-GL"
              spellCheck={false}
              onChange={(e) => {
                const v = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
                upd({ component: v });
              }}
            />
            <datalist id="kh-sn-comps">
              {compSuggest.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="kh-sap-fld">
            <span>{t('sn_category')}</span>
            <select
              className="kh-sap-select"
              value={n.category}
              onChange={(e) => upd({ category: e.target.value }, 0)}
            >
              <option value="">—</option>
              {NOTE_CATEGORIES.map(([k, l]) => (
                <option key={k} value={k}>
                  {tr(l)}
                </option>
              ))}
            </select>
          </label>
          <label className="kh-sap-fld kh-sn-full">
            <span>{t('sn_priority')}</span>
            <select
              className="kh-sap-select"
              value={n.priority}
              style={n.priority ? { borderColor: priorityColor(n.priority) } : undefined}
              onChange={(e) => upd({ priority: e.target.value }, 0)}
            >
              <option value="">—</option>
              {NOTE_PRIORITIES.map(([k, l]) => (
                <option key={k} value={k}>
                  {tr(l)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="kh-sap-fld">
          <span>{t('sn_impl')}</span>
          <div className="kh-sap-envpick">
            {NOTE_IMPL.map(([k, l]) => {
              const on = n.impl.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  data-on={on || undefined}
                  className="kh-sn-toggle"
                  onClick={() => upd({ impl: on ? n.impl.filter((x) => x !== k) : [...n.impl, k] }, 0)}
                >
                  {tr(l)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="kh-sn-sec">
          <div className="kh-sn-sechead">
            <span>{t('sn_statusSys')}</span>
          </div>
          {!systems.length && <div className="kh-sn-muted">{t('sn_noSystems')}</div>}
          {systems.map((s) => {
            const v = n.systems[s.id] ?? { status: 'new', implOn: null, transportId: null };
            const own = transports.filter((x) => !x.junkAt);
            return (
              <div key={s.id} className="kh-sn-sysrow" data-st={v.status}>
                <span className="kh-sn-sysname" title={s.name}>
                  <i style={{ background: envColor(s.env) }} />
                  <b className="kh-sap-mono">{sysLabel(s)}</b>
                  <small>{s.env}</small>
                </span>
                <select
                  className="kh-sn-stsel"
                  value={v.status}
                  aria-label={`${t('sn_status')} ${sysLabel(s)}`}
                  style={{ backgroundColor: statusColor(v.status) }}
                  onChange={(e) => setStatus(s.id, { status: e.target.value })}
                >
                  {NOTE_STATUS.map(([k, l]) => (
                    <option key={k} value={k}>
                      {tr(l)}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  className="kh-sap-input kh-sn-date"
                  value={v.implOn ?? ''}
                  aria-label={`${t('sn_implOn')} ${sysLabel(s)}`}
                  title={t('sn_implOn')}
                  onChange={(e) => setStatus(s.id, { implOn: e.target.value || null })}
                />
                {hasTransports && (
                  <select
                    className="kh-sap-select kh-sn-trsel"
                    value={v.transportId ?? ''}
                    aria-label={`${t('sn_trUsed')} ${sysLabel(s)}`}
                    title={t('sn_trUsed')}
                    onChange={(e) => setStatus(s.id, { transportId: e.target.value || null })}
                  >
                    <option value="">{t('sn_noTr')}</option>
                    {own.map((x) => (
                      <option key={x.id} value={x.id}>
                        {trLabel(x)}
                      </option>
                    ))}
                    {v.transportId && !own.some((x) => x.id === v.transportId) && (
                      <option value={v.transportId}>{trOf(v.transportId)?.trkorr ?? '—'}</option>
                    )}
                  </select>
                )}
              </div>
            );
          })}
        </div>

        <div className="kh-sn-sec">
          <div className="kh-sn-sechead">
            <span>{t('sn_validity')}</span>
            <button
              type="button"
              disabled={vRows.length >= 50}
              onClick={() => upd({ validity: [...vRows, { swc: '', rel: '', sp: '' }] }, 0)}
            >
              + {t('fn_addRow')}
            </button>
          </div>
          {vRows.length > 0 && (
            <div className="kh-sn-vt">
              <span>{t('sn_swc')}</span>
              <span>{t('sn_rel')}</span>
              <span>{t('sn_sp')}</span>
              <span />
              {vRows.map((r, i) => (
                <ValidityRow
                  key={i}
                  r={r}
                  i={i}
                  onSet={setV}
                  onDel={() => upd({ validity: vRows.filter((_, j) => j !== i) }, 0)}
                />
              ))}
            </div>
          )}
          {!vRows.length && <div className="kh-sn-muted">{t('sn_validityPh')}</div>}
        </div>

        <div className="kh-sn-sec">
          <div className="kh-sn-sechead">
            <span>{t('sn_prereqs')}</span>
          </div>
          <div className="kh-sn-chips">
            {n.prereqs.map((k) => {
              const f = byNumber(k);
              return (
                <span key={k} className="kh-sn-chip" data-in={!!f || undefined}>
                  <button
                    type="button"
                    title={f ? f.title || String(k) : t('sn_addLib')}
                    onClick={() => (f ? onOpen(f.id) : onCreate(k))}
                  >
                    <b className="kh-sap-mono">{k}</b>
                    {f ? <span>{f.title}</span> : <span>+ {t('sn_addLib')}</span>}
                  </button>
                  <button
                    type="button"
                    aria-label={`× ${k}`}
                    onClick={() => upd({ prereqs: n.prereqs.filter((x) => x !== k) }, 0)}
                  >
                    ×
                  </button>
                </span>
              );
            })}
            <input
              className="kh-sn-chipin"
              value={pre}
              inputMode="numeric"
              placeholder={t('sn_prereqPh')}
              aria-label={t('sn_prereqs')}
              onChange={(e) => setPre(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPre()}
              onBlur={addPre}
            />
          </div>
        </div>

        {hasTransports && (
          <div className="kh-sn-sec">
            <div className="kh-sn-sechead">
              <span>{t('sn_transports')}</span>
            </div>
            <div className="kh-sn-chips">
              {n.transportIds.map((id) => {
                const x = trOf(id);
                return (
                  <span key={id} className="kh-sn-chip" data-in>
                    <a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/app/transports?o=${id}`}>
                      <b className="kh-sap-mono">{x?.trkorr ?? '—'}</b>
                      <span>{x?.description}</span>
                    </a>
                    <button
                      type="button"
                      aria-label={`× ${x?.trkorr ?? ''}`}
                      onClick={() => upd({ transportIds: n.transportIds.filter((y) => y !== id) }, 0)}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
              <select
                className="kh-sap-select kh-sn-addtr"
                value=""
                aria-label={t('sn_addTr')}
                onChange={(e) =>
                  e.target.value && upd({ transportIds: [...n.transportIds, e.target.value] }, 0)
                }
              >
                <option value="">+ {t('sn_addTr')}</option>
                {transports
                  .filter((x) => !n.transportIds.includes(x.id) && !x.junkAt)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {trLabel(x)}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        )}

        <div className="kh-sap-grid2">
          <label className="kh-sap-fld kh-sn-full">
            <span>{t('sn_project')}</span>
            <select
              className="kh-sap-select"
              value={n.projectId ?? ''}
              onChange={(e) => upd({ projectId: e.target.value || null }, 0)}
            >
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="kh-sap-fld">
          <span>{t('sn_tags')}</span>
          <div className="kh-sn-chips">
            {n.tags.map((tg) => (
              <span key={tg} className="kh-sn-tag kh-tagc" style={tagStyle(tg)}>
                {tg}
                <button
                  type="button"
                  aria-label={`× ${tg}`}
                  onClick={() => upd({ tags: n.tags.filter((x) => x !== tg) }, 0)}
                >
                  ×
                </button>
              </span>
            ))}
            <TagInput
              exclude={n.tags}
              className="kh-sn-chipin"
              placeholder={t('sn_tagPh')}
              aria-label={t('sn_tags')}
              onAdd={(tg) => n.tags.length < 30 && upd({ tags: [...n.tags, tg] }, 0)}
            />
          </div>
        </div>
        <div className="kh-sap-fld">
          <span>{t('sn_body')}</span>
          {doc && <SapNoteDoc noteId={n.id} doc={doc} onChange={(d) => upd({ body: d }, 800)} />}
        </div>
        <Connections type="sapnote" id={n.id} variant="box" />
      </div>
    </>
  );
}

function ValidityRow({
  r,
  i,
  onSet,
  onDel,
}: {
  r: { swc: string; rel: string; sp: string };
  i: number;
  onSet: (i: number, k: 'swc' | 'rel' | 'sp', v: string) => void;
  onDel: () => void;
}) {
  const { t } = useI18n();
  const cell = (k: 'swc' | 'rel' | 'sp', ph: string, max: number) => (
    <input
      className="kh-sap-input"
      data-mono
      value={r[k]}
      maxLength={max}
      placeholder={ph}
      aria-label={`${t(`sn_${k}`)} ${i + 1}`}
      spellCheck={false}
      onChange={(e) => onSet(i, k, e.target.value.replace(/[\r\n]/g, ' '))}
    />
  );
  return (
    <>
      {cell('swc', 'S4CORE', 40)}
      {cell('rel', '106 – 108', 40)}
      {cell('sp', 'SP0000 – SP0002', 80)}
      <button type="button" className="kh-sn-vdel" aria-label={`${t('fn_delRow')} ${i + 1}`} onClick={onDel}>
        ×
      </button>
    </>
  );
}

function NewNote({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (n: number, title?: string) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [num, setNum] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const v = Number(num);
  const ok = Number.isInteger(v) && v >= 1 && v <= 99_999_999;
  const go = async () => {
    if (!ok) return;
    setBusy(true);
    const done = await onCreate(v, title.trim());
    setBusy(false);
    if (done) {
      setNum('');
      setTitle('');
      onClose();
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('sn_new')}
      size="sm"
      closeLabel={t('i_close')}
      footer={
        <>
          <button type="button" className="kh-sap-ghost" onClick={onClose}>
            {t('tr_cancel')}
          </button>
          <button type="button" className="kh-sap-new" disabled={!ok || busy} onClick={() => void go()}>
            {t('sn_create')}
          </button>
        </>
      }
    >
      <div className="kh-sn-form">
        <label className="kh-sap-fld">
          <span>{t('sn_number')}</span>
          <input
            className="kh-sap-input"
            data-mono
            autoFocus
            inputMode="numeric"
            value={num}
            maxLength={8}
            placeholder="3089413"
            onChange={(e) => setNum(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && void go()}
          />
        </label>
        <label className="kh-sap-fld">
          <span>{t('sn_title')}</span>
          <input
            className="kh-sap-input"
            value={title}
            maxLength={300}
            placeholder={t('sn_titlePh')}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void go()}
          />
        </label>
      </div>
    </Modal>
  );
}

function ImportNotes({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (r: { created: number; skipped: number }) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const found = parseNoteNumbers(text);
  const go = async () => {
    setBusy(true);
    try {
      const r = await api<{ created: unknown[]; skipped: number[] }>('/sap/notes/import', { text });
      onDone({ created: r.created.length, skipped: r.skipped.length });
      setText('');
      onClose();
    } catch {
      toast({ message: t('ne_saveFail'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('sn_import')}
      subtitle={t('sn_importSub')}
      closeLabel={t('i_close')}
      footer={
        <>
          <span className="kh-sn-muted">{t('sn_found').replace('{n}', String(found.length))}</span>
          <button type="button" className="kh-sap-ghost" onClick={onClose}>
            {t('tr_cancel')}
          </button>
          <button
            type="button"
            className="kh-sap-new"
            disabled={!found.length || busy}
            onClick={() => void go()}
          >
            {t('sn_importGo')}
          </button>
        </>
      }
    >
      <textarea
        className="kh-sap-input kh-sap-text kh-sn-paste"
        value={text}
        autoFocus
        rows={8}
        maxLength={50_000}
        aria-label={t('sn_import')}
        placeholder={'3089413\n2998510, 3131059\nSAP Note 2943844 …'}
        onChange={(e) => setText(e.target.value)}
      />
    </Modal>
  );
}
