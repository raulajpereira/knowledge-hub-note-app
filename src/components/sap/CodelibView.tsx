'use client';

import { AiButton } from '@/components/ai/AiButton';
import { useExplain } from '@/components/ai/useExplain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import { tagTint } from '@/lib/tags';
import {
  CL_ADD,
  CL_FORMS,
  CL_GRIDS,
  CL_GROUPS,
  CL_TPL,
  CL_TYPE_IDS,
  CL_TYPES,
  clCodeLines,
  clFileName,
  clFindRefs,
  clFmHdr,
  clFullCode,
  clGen,
  clMeta,
  clPackage,
  clSearchText,
  type ClGroup,
  type ClNode,
  type ClTab,
  type ClType,
  type FieldKind,
  type Row,
  type Val,
} from '@/lib/codelib';
import { Popover, useConfirm, usePersistentState, useToast, TagInput } from '@/components/ui';
import { refreshCounts } from '@/components/shell/counts';
import { Connections } from '@/components/content/Connections';
import { useWhen } from '@/components/content/useWhen';
import { AbapEditor } from './AbapEditor';
import './codelib.css';

// Biblioteca de Código SAP — ZNotes.dc.html isCodelib: objects grouped by
// type (SE38/SE37/SE24/SE11/snippets), each a tree of nodes (code,
// configuration forms and grids, generated code) plus "Relações" (links and
// transport requests). Shared by the tenant; autosave with conflict warning.

type Obj = {
  id: string;
  type: ClType;
  name: string;
  description: string;
  tags: string[];
  nodes: ClNode[];
  createdAt: string;
  updatedAt: string;
};
type Patch = Partial<Pick<Obj, 'name' | 'description' | 'tags' | 'nodes'>>;
type Ref = { oid: string; nid: string | null; name: string; type: string };
type Hist = { a: string; n: string | null; k: string | null; label: string };

const FILTERS: Array<[string, ClType[] | null]> = [
  ['all', null],
  ['SE38', ['PROG']],
  ['SE37', ['FUGR']],
  ['SE24', ['CLAS', 'INTF']],
  ['SE11', ['TABL', 'STRU', 'DTEL', 'DOMA']],
  ['SNIP', ['SNIP']],
];
const LINKS = '__links';
const LIST = { def: 330, min: 240, max: 1000 };
const TREE = { def: 250, min: 190, max: 720 };
const tint = (c: string) => c.replace(')', ' / .22)');

function Svg({ d, size = 15, sw = 1.9 }: { d: string; size?: number; sw?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}
const IC = {
  code: '<path d="M8 7l-5 5 5 5"></path><path d="M16 7l5 5-5 5"></path>',
  fm: '<path d="M4 17V7"></path><path d="M8 12h12"></path><path d="M15 7l5 5-5 5"></path>',
  inc: '<path d="M7 3h7l5 5v13H7z"></path><path d="M14 3v5h5"></path>',
  meth: '<circle cx="12" cy="12" r="3.2"></circle><path d="M12 3v5.5"></path><path d="M12 15.5V21"></path>',
  cfg: '<line x1="4" y1="7" x2="20" y2="7"></line><line x1="4" y1="17" x2="20" y2="17"></line><circle cx="9" cy="7" r="2.2"></circle><circle cx="15" cy="17" r="2.2"></circle>',
  gen: '<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"></path>',
  rel: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"></path><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path>',
};
const TICON: Record<ClType, string> = {
  PROG: '<path d="M4 5h16v14H4z"></path><path d="M8 10l2 2-2 2"></path><line x1="12" y1="15" x2="16" y2="15"></line>',
  FUGR: IC.fm,
  CLAS: '<rect x="4" y="4" width="16" height="16" rx="3"></rect><line x1="4" y1="10" x2="20" y2="10"></line><line x1="4" y1="15" x2="20" y2="15"></line>',
  INTF: '<circle cx="12" cy="12" r="7"></circle><circle cx="12" cy="12" r="2.5"></circle>',
  TABL: '<rect x="3.5" y="5" width="17" height="14" rx="2"></rect><line x1="3.5" y1="10" x2="20.5" y2="10"></line><line x1="10" y1="5" x2="10" y2="19"></line>',
  STRU: '<path d="M8 4H6a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h2"></path><path d="M16 4h2a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-2"></path>',
  DTEL: '<path d="M4 7h16"></path><path d="M9 7v12"></path><path d="M15 7v12"></path>',
  DOMA: '<path d="M4 6h16"></path><path d="M4 12h10"></path><path d="M4 18h6"></path>',
  SNIP: IC.code,
};
const COPY =
  '<rect x="9" y="9" width="11" height="11" rx="2.5"></rect><path d="M5 15V6a2 2 0 0 1 2-2h9"></path>';
const OK = '<path d="M5 12.5l4.5 4.5L19 7.5"></path>';
const X = '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>';
const TRASH = '<path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path>';
const CHEV = '<path d="M9 6l6 6-6 6"></path>';
const PLUS = '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>';

/** Pointer-drag of a column width, persisted on release; double click resets. */
function useDragWidth(key: string, lim: { def: number; min: number; max: number }) {
  const [w, setW] = usePersistentState<number>(key, lim.def);
  const [live, setLive] = useState<number | null>(null);
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = live ?? w;
    let v = w0;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const mv = (ev: PointerEvent) => {
      v = Math.round(Math.max(lim.min, Math.min(lim.max, w0 + ev.clientX - x0)));
      setLive(v);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setLive(null);
      setW(v);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  return { width: live ?? w, dragging: live !== null, down, reset: () => setW(lim.def) };
}

export function CodelibView() {
  const { t } = useI18n();
  const when = useWhen();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [items, setItems] = useState<Obj[] | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [col, setCol] = usePersistentState<Record<string, boolean>>('codelib.col', {});
  const [gridMode, setGridMode] = usePersistentState<'cards' | 'table'>('codelib.gridMode', 'cards');
  const [sel, setSel] = useState<{ oid: string; nid: string | null; k: string | null } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [hist, setHist] = useState<Hist[]>([]);
  const [histAt, setHistAt] = useState<{ a: string; n: string | null } | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const listW = useDragWidth('codelib.listW', LIST);
  const treeW = useDragWidth('codelib.treeW', TREE);
  const pending = useRef(new Map<string, { patch: Patch; tm?: ReturnType<typeof setTimeout> }>());
  const base = useRef(new Map<string, string>());
  const conflictRef = useRef<string | null>(null);
  conflictRef.current = conflict;
  const newRef = useRef<HTMLButtonElement>(null);
  const copyTm = useRef<ReturnType<typeof setTimeout>>(undefined);
  const activeId = sp.get('o');

  const load = useCallback(async () => {
    const r = await api<{ objects: Obj[] }>('/sap/objects');
    for (const o of r.objects) base.current.set(o.id, o.updatedAt);
    return r.objects;
  }, []);
  useEffect(() => {
    load()
      .then(setItems)
      .catch(() => setItems([]));
  }, [load]);

  const open = useCallback(
    (id: string | null, nid: string | null = null, k: string | null = null) => {
      setSel(id ? { oid: id, nid, k } : null);
      const next = new URLSearchParams(sp.toString());
      if (id) next.set('o', id);
      else next.delete('o');
      router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [path, router, sp],
  );

  // ── Saving (debounced per object, `base` = updatedAt it was edited from) ──
  const send = useCallback(
    async (id: string, patch: Patch, force = false) => {
      try {
        const { object } = await api<{ object: Obj }>(
          `/sap/objects/${id}`,
          { ...patch, base: base.current.get(id), ...(force ? { force: true } : {}) },
          'PATCH',
        );
        base.current.set(id, object.updatedAt);
        setItems((cur) => cur && cur.map((x) => (x.id === id ? { ...x, updatedAt: object.updatedAt } : x)));
        if (force) setConflict(null);
      } catch (e) {
        if (isApiFailure(e) && e.code === 'conflict') {
          // keep the edits queued until the user decides
          const prev = pending.current.get(id);
          pending.current.set(id, { patch: { ...patch, ...(prev?.patch ?? {}) }, tm: prev?.tm });
          setConflict(id);
        } else toast({ message: t('ne_saveFail'), tone: 'error' });
      }
    },
    [t, toast],
  );
  // one save at a time per record: the next one waits and carries the updatedAt
  // the previous one returned (two in flight would conflict with each other)
  const inflight = useRef(new Map<string, Promise<void>>());
  const flush = useCallback(
    (id: string) => {
      const run = (inflight.current.get(id) ?? Promise.resolve()).then(async () => {
        const p = pending.current.get(id);
        if (!p || conflictRef.current === id) return;
        clearTimeout(p.tm);
        pending.current.delete(id);
        await send(id, p.patch);
      });
      inflight.current.set(id, run);
      void run.finally(() => {
        if (inflight.current.get(id) === run) inflight.current.delete(id);
      });
      return run;
    },
    [send],
  );
  useEffect(() => {
    const map = pending.current;
    // leaving or reloading the page sends what is still waiting for the debounce
    const hide = () => {
      for (const id of [...map.keys()]) void flush(id);
    };
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('pagehide', hide);
      hide();
    };
  }, [flush]);
  const upd = (id: string, p: Patch, delay = 600) => {
    setItems((cur) => cur && cur.map((x) => (x.id === id ? { ...x, ...p } : x)));
    const prev = pending.current.get(id);
    if (prev) clearTimeout(prev.tm);
    const merged = { ...(prev?.patch ?? {}), ...p };
    pending.current.set(id, { patch: merged, tm: setTimeout(() => void flush(id), delay) });
  };
  const resolve = async (keep: boolean) => {
    const id = conflict;
    if (!id) return;
    const p = pending.current.get(id);
    if (p) clearTimeout(p.tm);
    pending.current.delete(id);
    if (keep) return void send(id, p?.patch ?? {}, true);
    const fresh = await load().catch(() => null);
    setConflict(null);
    if (!fresh) return;
    const o = fresh.find((x) => x.id === id);
    setItems((cur) => cur && (o ? cur.map((x) => (x.id === id ? o : x)) : cur.filter((x) => x.id !== id)));
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const D = useMemo(() => items ?? [], [items]);
  const query = q.trim().toLowerCase();
  const L = useMemo(() => (query ? D.filter((o) => clSearchText(o).includes(query)) : D), [D, query]);
  const inF = (o: Obj, f: string) => {
    const types = FILTERS.find((x) => x[0] === f)?.[1];
    return !types || types.includes(o.type);
  };
  const groups = CL_TYPE_IDS.map((ty) => ({
    ty,
    items: L.filter((x) => x.type === ty && inF(x, filter)),
  })).filter((g) => g.items.length);
  const o = D.find((x) => x.id === activeId) ?? null;
  const s = sel && o && sel.oid === o.id ? sel : null;
  const isLinks = s?.nid === LINKS;
  const node = o && !isLinks ? (o.nodes.find((n) => n.id === s?.nid) ?? o.nodes[0] ?? null) : null;
  const tab = node ? (node.tabs.find((x) => x.k === s?.k) ?? node.tabs[0] ?? null) : null;
  const M = CL_TYPES[o?.type ?? 'PROG'];
  const nLabel = (n: ClNode) => (n.label.startsWith('cl_n_') ? t(n.label) : n.label);
  const isAbap = (n: ClNode) => !n.label.startsWith('cl_n_');
  const isCol = (k: string) => !!col[k];
  const togCol = (k: string) => setCol({ ...col, [k]: !col[k] });
  const setNode = (nid: string) => o && setSel({ oid: o.id, nid, k: null });

  // index of names that link to another object or node (prototype RIX)
  const rix = useMemo(() => {
    const m = new Map<string, Ref>();
    if (!o || !node) return m;
    for (const ob of D) {
      const U = ob.name.toUpperCase();
      if (ob.name && ob.id !== o.id && !m.has(U))
        m.set(U, { oid: ob.id, nid: null, name: ob.name, type: ob.type });
      for (const n of ob.nodes) {
        if (n.id === node.id || !/^[A-Za-z_/][A-Za-z0-9_/]*$/.test(n.label) || !isAbap(n)) continue;
        const N = n.label.toUpperCase();
        if (!m.has(N) && N !== U)
          m.set(N, { oid: ob.id, nid: n.id, name: n.label, type: ob.id === o.id ? 'INCL' : ob.type });
      }
    }
    return m;
  }, [D, o, node]);
  const goRef = (U: string) => {
    const r = rix.get(U);
    if (!r || !o || !node) return;
    const onPath = histAt && histAt.a === o.id && histAt.n === (s?.nid ?? null);
    setHist((h) =>
      [
        ...(onPath ? h : []),
        { a: o.id, n: s?.nid ?? null, k: s?.k ?? null, label: node.label || o.name },
      ].slice(-20),
    );
    setHistAt({ a: r.oid, n: r.nid });
    open(r.oid, r.nid);
  };
  const last = hist[hist.length - 1];
  const canBack = !!last && !!histAt && !!o && histAt.a === o.id && histAt.n === (s?.nid ?? null);
  const back = () => {
    const p = hist[hist.length - 1];
    if (!p) return;
    setHist((h) => h.slice(0, -1));
    setHistAt({ a: p.a, n: p.n });
    open(p.a, p.n, p.k);
  };

  const copy = (key: string, txt: string) => {
    void navigator.clipboard?.writeText(txt).catch(() => {});
    setCopied(key);
    clearTimeout(copyTm.current);
    copyTm.current = setTimeout(() => setCopied(null), 1400);
  };

  // ── Actions ───────────────────────────────────────────────────────────────
  const create = async (type: ClType) => {
    setNewOpen(false);
    try {
      const { object } = await api<{ object: Obj }>('/sap/objects', {
        type,
        ...(type === 'SNIP' ? { name: t('cl_newSnip') } : {}),
      });
      base.current.set(object.id, object.updatedAt);
      setItems((cur) => [object, ...(cur ?? [])]);
      setFilter('all');
      setQ('');
      open(object.id);
      refreshCounts();
    } catch {
      toast({ message: t('ne_saveFail'), tone: 'error' });
    }
  };
  const duplicate = async () => {
    if (!o) return;
    await flush(o.id);
    try {
      const { object } = await api<{ object: Obj }>(`/sap/objects/${o.id}/duplicate`, {});
      base.current.set(object.id, object.updatedAt);
      setItems((cur) => {
        const n = (cur ?? []).slice();
        n.splice(n.findIndex((x) => x.id === o.id) + 1, 0, object);
        return n;
      });
      open(object.id);
      refreshCounts();
    } catch {
      toast({ message: t('ne_saveFail'), tone: 'error' });
    }
  };
  const remove = async () => {
    if (!o) return;
    const ok = await confirm({
      title: t('tr_askTitle'),
      body: t('tr_askBody').replace('{x}', o.name),
      confirmLabel: t('tr_move'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    const p = pending.current.get(o.id);
    if (p) clearTimeout(p.tm);
    pending.current.delete(o.id);
    try {
      await api(`/sap/objects/${o.id}`, undefined, 'DELETE');
    } catch {
      return toast({ message: t('ne_saveFail'), tone: 'error' });
    }
    const rest = D.filter((x) => x.id !== o.id);
    setItems(rest);
    open(rest[0]?.id ?? null);
    refreshCounts();
  };
  const setNodes = (fn: (nodes: ClNode[]) => ClNode[]) => o && upd(o.id, { nodes: fn(o.nodes) });
  const updTab = (fn: (tb: ClTab) => ClTab) =>
    node &&
    tab &&
    setNodes((ns) =>
      ns.map((n) => (n.id === node.id ? { ...n, tabs: n.tabs.map((x) => (x.k === tab.k ? fn(x) : x)) } : n)),
    );
  const addNode = (g: ClGroup) => {
    if (!o) return;
    const tpl = CL_ADD[o.type]?.[g];
    if (!tpl) return;
    const n = CL_TPL[tpl](o, o.nodes.filter((x) => x.g === g).length + 1);
    setNodes((ns) => {
      const idx = ns.map((x) => x.g).lastIndexOf(g);
      const c = ns.slice();
      c.splice(idx < 0 ? c.length : idx + 1, 0, n);
      return c;
    });
    setSel({ oid: o.id, nid: n.id, k: null });
  };
  const delNode = async () => {
    if (!o || !node) return;
    const ok = await confirm({
      title: t('cl_delNodeT'),
      body: t('cl_delNodeB').replace('{x}', node.label),
      confirmLabel: t('del'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    const nid = node.id;
    setNodes((ns) => ns.filter((x) => x.id !== nid));
    setSel({ oid: o.id, nid: null, k: null });
  };
  const renameNode = (v0: string) => {
    if (!node) return;
    const v = v0.toUpperCase().replace(/\s/g, '_').slice(0, 80);
    setNodes((ns) =>
      ns.map((n) =>
        n.id !== node.id
          ? n
          : {
              ...n,
              label: v,
              // prototype: a method's implementation follows its new name
              tabs:
                n.g === 'meth'
                  ? n.tabs.map((tb) =>
                      tb.view === 'code' && tb.k === 'code'
                        ? {
                            ...tb,
                            code: tb.code.replace(/METHOD\s+[\w~/]+\s*\./i, `METHOD ${v.toLowerCase()}.`),
                          }
                        : tb,
                    )
                  : n.tabs,
            },
      ),
    );
  };
  const download = () => {
    if (!o) return;
    const u = URL.createObjectURL(new Blob([clFullCode(o)], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = u;
    a.download = clFileName(o.name);
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 3000);
  };

  // ── Tree ──────────────────────────────────────────────────────────────────
  const cnt = (n: ClNode) => {
    const tb = n.tabs[0];
    return tb?.view === 'grid' ? tb.rows.length || '' : '';
  };
  const nSub = (n: ClNode) => {
    const A = n.tabs[0]?.view === 'form' ? n.tabs[0].vals : {};
    const rows = (k: string) => {
      const tb = n.tabs.find((x) => x.k === k);
      return tb?.view === 'grid' ? tb.rows.length : 0;
    };
    if (n.g === 'fm')
      return [
        A.proc === 'Remote-Enabled Module' ? 'RFC' : A.proc === 'Update Module' ? 'Update' : 'Normal',
        `${rows('imp')}↓ ${rows('exp')}↑`,
        rows('exc') ? `${rows('exc')} exc` : '',
      ]
        .filter(Boolean)
        .join(' · ');
    if (n.g === 'meth')
      return [A.vis || 'Public', A.level === 'Static' ? 'Static' : '', `${rows('par')} par`]
        .filter(Boolean)
        .join(' · ');
    const tb0 = n.tabs[0];
    if (tb0?.view === 'code' && n.tabs.length === 1)
      return [n.sub, `${clCodeLines(tb0.code)} ${t('cl_lines')}`].filter(Boolean).join(' · ');
    if (tb0?.view === 'gen') return t('cl_genShort');
    return n.sub ?? '';
  };
  const nIcon = (n: ClNode) =>
    n.g === 'code' || n.g === 'inc' ? (n.sub === 'INCLUDE' || n.g === 'inc' ? IC.inc : IC.code) : IC[n.g];
  const TABL: Record<string, string> = {
    attr: t('cl_tb_attr'),
    imp: t('cl_tb_imp'),
    exp: t('cl_tb_exp'),
    chg: t('cl_tb_chg'),
    tab: t('cl_tb_tab'),
    exc: t('cl_tb_exc'),
    src: t('cl_tb_src'),
    par: t('cl_tb_par'),
    code: t('cl_tb_code'),
  };

  if (!items) return <section className="kh-cl" aria-busy="true" />;

  return (
    <section className="kh-cl">
      {/* ── list ── */}
      <div className="kh-cl-list" style={{ width: listW.width }}>
        <div className="kh-cl-lhead">
          <div className="kh-cl-titlerow">
            <h1>{t('nav_codelib')}</h1>
            <div className="kh-cl-newwrap">
              <button
                ref={newRef}
                type="button"
                className="kh-cl-new"
                title={t('cl_new')}
                aria-label={t('cl_new')}
                aria-expanded={newOpen}
                onClick={() => setNewOpen((v) => !v)}
              >
                <Svg d={PLUS} size={16} sw={2} />
              </button>
              {newOpen && (
                <Popover
                  anchor={newRef}
                  onClose={() => setNewOpen(false)}
                  className="kh-cl-newmenu"
                  width={280}
                  role="menu"
                  aria-label={t('cl_new')}
                >
                  {CL_TYPE_IDS.map((ty) => (
                    <button key={ty} type="button" role="menuitem" onClick={() => void create(ty)}>
                      <span
                        className="kh-cl-code"
                        style={{ background: tint(CL_TYPES[ty][1]), borderColor: CL_TYPES[ty][1] }}
                      >
                        {ty}
                      </span>
                      <span className="kh-cl-grow">{t(CL_TYPES[ty][2])}</span>
                      <span className="kh-cl-tc">{CL_TYPES[ty][0]}</span>
                    </button>
                  ))}
                </Popover>
              )}
            </div>
          </div>
          <label className="kh-cl-search">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
            <input
              value={q}
              placeholder={t('cl_search')}
              aria-label={t('cl_search')}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <div className="kh-cl-filters" role="group" aria-label={t('cl_filter')}>
            {FILTERS.map(([id]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                data-on={filter === id || undefined}
                onClick={() => setFilter(id)}
              >
                {id === 'all' ? t('t_all') : id === 'SNIP' ? t('cl_f_snip') : id}
                <span>{L.filter((x) => inF(x, id)).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="kh-cl-groups">
          {groups.map((g) => {
            const TM = CL_TYPES[g.ty];
            const ck = `L:${g.ty}`;
            const opened = !isCol(ck) || !!query;
            return (
              <div key={g.ty} className="kh-cl-group">
                <button
                  type="button"
                  className="kh-cl-ghead"
                  aria-expanded={opened}
                  onClick={() => togCol(ck)}
                >
                  <span className="kh-cl-chev" style={{ transform: `rotate(${opened ? 90 : 0}deg)` }}>
                    <Svg d={CHEV} size={12} sw={2.4} />
                  </span>
                  <span className="kh-cl-gicon" style={{ background: tint(TM[1]), borderColor: TM[1] }}>
                    <Svg d={TICON[g.ty]} size={14} sw={1.8} />
                  </span>
                  <span className="kh-cl-glabel">{t(TM[2])}</span>
                  <span className="kh-cl-tc">{TM[0] === '—' ? '' : TM[0]}</span>
                  <span className="kh-cl-gcount">{g.items.length}</span>
                </button>
                {opened && (
                  <div className="kh-cl-items">
                    {g.items.map((x) => (
                      <div
                        key={x.id}
                        role="button"
                        tabIndex={0}
                        className="kh-cl-item"
                        data-on={x.id === o?.id || undefined}
                        aria-current={x.id === o?.id || undefined}
                        onClick={() => open(x.id)}
                        onKeyDown={(e) => e.key === 'Enter' && open(x.id)}
                      >
                        <span
                          className="kh-cl-dot"
                          style={{ background: TM[1], boxShadow: `0 0 8px ${TM[1]}` }}
                        />
                        <div className="kh-cl-grow">
                          <span className="kh-cl-iname" data-mono={x.type !== 'SNIP' || undefined}>
                            {x.name}
                          </span>
                          <span className="kh-cl-idesc">{x.description || '—'}</span>
                        </div>
                        <span className="kh-cl-meta">{clMeta(x)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {groups.length === 0 && <div className="kh-cl-empty">{t('cl_empty')}</div>}
        </div>
      </div>
      <div
        className="kh-cl-handle"
        role="separator"
        aria-orientation="vertical"
        title={t('cl_resize')}
        data-drag={listW.dragging || undefined}
        onPointerDown={listW.down}
        onDoubleClick={listW.reset}
      >
        <span />
      </div>

      {/* ── object ── */}
      {!o && <div className="kh-cl-none">{t('cl_noActive')}</div>}
      {o && (
        <div className="kh-cl-main">
          <div className="kh-cl-ohead">
            <span className="kh-cl-otype" style={{ background: tint(M[1]), borderColor: M[1] }}>
              {o.type}
            </span>
            <div className="kh-cl-onames">
              <input
                className="kh-cl-oname"
                data-mono={o.type !== 'SNIP' || undefined}
                value={o.name}
                spellCheck={false}
                maxLength={120}
                aria-label={t('cl_k')}
                onChange={(e) =>
                  upd(o.id, {
                    name:
                      o.type === 'SNIP' ? e.target.value : e.target.value.toUpperCase().replace(/\s/g, '_'),
                  })
                }
              />
              <input
                className="kh-cl-odesc"
                value={o.description}
                maxLength={500}
                placeholder={t('cl_descPh')}
                aria-label={t('cl_descPh')}
                onChange={(e) => upd(o.id, { description: e.target.value.replace(/[\r\n]/g, ' ') })}
              />
            </div>
            <div className="kh-cl-oacts">
              <button
                type="button"
                title={t('cl_copyAll')}
                aria-label={t('cl_copyAll')}
                onClick={() => copy('all', clFullCode(o))}
              >
                <Svg d={copied === 'all' ? OK : COPY} />
              </button>
              <button type="button" title={t('cl_download')} aria-label={t('cl_download')} onClick={download}>
                <Svg d='<path d="M12 4v11"></path><path d="M7 10l5 5 5-5"></path><path d="M5 20h14"></path>' />
              </button>
              <button
                type="button"
                title={t('cl_dup')}
                aria-label={t('cl_dup')}
                onClick={() => void duplicate()}
              >
                <Svg d='<rect x="8" y="8" width="12" height="12" rx="2.5"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>' />
              </button>
              <button
                type="button"
                className="kh-cl-del"
                title={t('del')}
                aria-label={t('del')}
                onClick={() => void remove()}
              >
                <Svg d={TRASH} />
              </button>
            </div>
            <div className="kh-cl-ometa">
              <span>
                <b>{M[0] === '—' ? 'Snippet' : M[0]}</b>
                {M[0] === '—' ? '' : t(M[2])}
              </span>
              {clPackage(o) && (
                <span>
                  {t('cl_pkg')} <b>{clPackage(o)}</b>
                </span>
              )}
              <span>
                {t('createdAt')} {when(o.createdAt)}
              </span>
              <span>
                {t('dUpdated')} {when(o.updatedAt)}
              </span>
              <div className="kh-cl-tags">
                {o.tags.map((tg) => (
                  <span key={tg} className="kh-cl-tag" style={{ background: tagTint(tg) }}>
                    {tg}
                    <button
                      type="button"
                      title={t('cl_tagRemove')}
                      aria-label={`${t('cl_tagRemove')} ${tg}`}
                      onClick={() => upd(o.id, { tags: o.tags.filter((x) => x !== tg) }, 0)}
                    >
                      <Svg d={X} size={9} sw={2.6} />
                    </button>
                  </span>
                ))}
                <TagInput
                  key={o.id}
                  exclude={o.tags}
                  placeholder={`+ ${t('a_tag')}`}
                  aria-label={t('a_tag')}
                  onAdd={(v) => upd(o.id, { tags: [...new Set([...o.tags, v])].slice(0, 30) }, 0)}
                />
              </div>
            </div>
            {conflict === o.id && (
              <div className="kh-cl-conflict" role="alert">
                <span>{t('cl_conflict')}</span>
                <button type="button" onClick={() => void resolve(false)}>
                  {t('wb_reload')}
                </button>
                <button type="button" onClick={() => void resolve(true)}>
                  {t('wb_keep')}
                </button>
              </div>
            )}
          </div>
          <div className="kh-cl-split">
            <nav className="kh-cl-tree" style={{ width: treeW.width }} aria-label={o.name}>
              {[
                ...CL_GROUPS[o.type].map((g) => {
                  const add = CL_ADD[o.type]?.[g];
                  const ck = `T:${o.type}:${g}`;
                  const NS = o.nodes.filter((n) => n.g === g);
                  return { g, ck, add, label: t(`cl_g_${g}`), icon: IC[g], count: NS.length, nodes: NS };
                }),
                {
                  g: 'rel' as const,
                  ck: 'T:rel',
                  add: undefined,
                  label: t('cl_g_rel'),
                  icon: IC.rel,
                  count: '',
                  nodes: [],
                },
              ].map((G) => {
                const opened = !isCol(G.ck);
                return (
                  <div key={G.g} className="kh-cl-tg">
                    <div className="kh-cl-tghead">
                      <button type="button" aria-expanded={opened} onClick={() => togCol(G.ck)}>
                        <span className="kh-cl-chev" style={{ transform: `rotate(${opened ? 90 : 0}deg)` }}>
                          <Svg d={CHEV} size={12} sw={2.4} />
                        </span>
                        <Svg d={G.icon} size={13} />
                        <span className="kh-cl-tglabel">{G.label}</span>
                        <span className="kh-cl-meta">{G.count}</span>
                      </button>
                      {G.add && (
                        <button
                          type="button"
                          className="kh-cl-add"
                          title={t(`cl_add_${G.add}`)}
                          aria-label={t(`cl_add_${G.add}`)}
                          onClick={() => addNode(G.g as ClGroup)}
                        >
                          <Svg d={PLUS} size={11} sw={2.4} />
                        </button>
                      )}
                    </div>
                    {opened && (
                      <div className="kh-cl-tnodes">
                        {G.g === 'rel' ? (
                          <TreeNode
                            on={isLinks}
                            label={t('cx_title')}
                            sub={t('cl_relSub')}
                            icon={IC.rel}
                            color={M[1]}
                            onClick={() => setNode(LINKS)}
                          />
                        ) : (
                          G.nodes.map((n) => (
                            <TreeNode
                              key={n.id}
                              on={node?.id === n.id}
                              label={nLabel(n)}
                              mono={isAbap(n)}
                              sub={nSub(n)}
                              icon={nIcon(n)}
                              color={M[1]}
                              count={cnt(n)}
                              onClick={() => setNode(n.id)}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
            <div
              className="kh-cl-handle kh-cl-handle--tree"
              role="separator"
              aria-orientation="vertical"
              title={t('cl_resize')}
              data-drag={treeW.dragging || undefined}
              onPointerDown={treeW.down}
              onDoubleClick={treeW.reset}
            >
              <span />
            </div>
            <div className="kh-cl-node">
              <div className="kh-cl-nhead">
                <div className="kh-cl-nrow">
                  {canBack && (
                    <button
                      type="button"
                      className="kh-cl-back"
                      title={t('cl_back').replace('{x}', last!.label)}
                      aria-label={t('cl_back').replace('{x}', last!.label)}
                      onClick={back}
                    >
                      <Svg
                        d='<path d="M19 12H5"></path><path d="M11 6l-6 6 6 6"></path>'
                        size={14}
                        sw={2.4}
                      />
                    </button>
                  )}
                  {node?.user ? (
                    <>
                      <input
                        className="kh-cl-nlabel"
                        value={node.label}
                        spellCheck={false}
                        maxLength={80}
                        aria-label={t('cl_nodeName')}
                        onChange={(e) => renameNode(e.target.value)}
                      />
                      <button
                        type="button"
                        className="kh-cl-del kh-cl-round"
                        title={t('cl_delNode')}
                        aria-label={t('cl_delNode')}
                        onClick={() => void delNode()}
                      >
                        <Svg d={TRASH} size={14} />
                      </button>
                    </>
                  ) : (
                    <div className="kh-cl-ntitle">
                      <span data-mono={(node && isAbap(node)) || undefined}>
                        {isLinks ? t('cx_title') : node ? nLabel(node) : ''}
                      </span>
                      <span>{node?.sub ?? ''}</span>
                    </div>
                  )}
                </div>
                {node && node.tabs.length > 1 && (
                  <div className="kh-cl-tabs" role="tablist">
                    {node.tabs.map((tb) => {
                      const c = tb.view === 'grid' ? tb.rows.length : 0;
                      return (
                        <button
                          key={tb.k}
                          type="button"
                          role="tab"
                          aria-selected={tab?.k === tb.k}
                          data-on={tab?.k === tb.k || undefined}
                          onClick={() => setSel({ oid: o.id, nid: node.id, k: tb.k })}
                        >
                          {TABL[tb.k] ?? tb.k}
                          {c > 0 && <span>{c}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {isLinks && (
                <div className="kh-cl-links">
                  <Connections type="code" id={o.id} variant="box" transports />
                </div>
              )}
              {node && tab && (tab.view === 'code' || tab.view === 'gen') && (
                <CodePane
                  key={`${o.id}:${node.id}:${tab.k}`}
                  o={o}
                  node={node}
                  tab={tab}
                  rix={rix}
                  copied={copied === `${o.id}:${node.id}:${tab.k}`}
                  onCopy={(txt) => copy(`${o.id}:${node.id}:${tab.k}`, txt)}
                  onRef={goRef}
                  onChange={(v) => updTab((tb) => (tb.view === 'code' ? { ...tb, code: v } : tb))}
                />
              )}
              {node && tab?.view === 'form' && (
                <div className="kh-cl-scroll">
                  <div className="kh-cl-form">
                    {CL_FORMS[tab.s].map(([key, label, kind, opts]) => (
                      <div key={key} className="kh-cl-frow">
                        <span title={label}>{label}</span>
                        <div>
                          <Field
                            kind={kind}
                            label={label}
                            opts={opts}
                            value={tab.vals[key]}
                            onChange={(v) =>
                              updTab((tb) =>
                                tb.view === 'form' ? { ...tb, vals: { ...tb.vals, [key]: v } } : tb,
                              )
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {node && tab?.view === 'grid' && (
                <GridPane
                  key={`${node.id}:${tab.k}`}
                  tab={tab}
                  mode={tab.s === 'tb_fields' || tab.s === 'st_comp' ? gridMode : null}
                  setMode={setGridMode}
                  onRows={(fn) => updTab((tb) => (tb.view === 'grid' ? { ...tb, rows: fn(tb.rows) } : tb))}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TreeNode({
  on,
  label,
  sub,
  mono,
  icon,
  color,
  count,
  onClick,
}: {
  on: boolean;
  label: string;
  sub?: string;
  mono?: boolean;
  icon: string;
  color: string;
  count?: number | string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="kh-cl-tnode"
      title={label}
      data-on={on || undefined}
      aria-current={on || undefined}
      onClick={onClick}
    >
      <span className="kh-cl-nicon" style={on ? { background: tint(color), color: '#fbf8f5' } : undefined}>
        <Svg d={icon} size={13} />
      </span>
      <span className="kh-cl-grow">
        <span className="kh-cl-nname" data-mono={mono || undefined}>
          {label}
        </span>
        {sub && <span className="kh-cl-nsub">{sub}</span>}
      </span>
      {count !== undefined && count !== '' && <span className="kh-cl-ncount">{count}</span>}
    </button>
  );
}

function CodePane({
  o,
  node,
  tab,
  rix,
  copied,
  onCopy,
  onRef,
  onChange,
}: {
  o: Obj;
  node: ClNode;
  tab: ClTab;
  rix: Map<string, Ref>;
  copied: boolean;
  onCopy: (txt: string) => void;
  onRef: (U: string) => void;
  onChange: (v: string) => void;
}) {
  const { t } = useI18n();
  const gen = tab.view === 'gen';
  const val = tab.view === 'gen' ? clGen(o, tab.gen) : tab.view === 'code' ? tab.code : '';
  const pre = tab.view === 'code' && tab.hdr === 'fm' ? clFmHdr(node) : '';
  const refs = useMemo(() => new Set(clFindRefs((pre ? `${pre}\n` : '') + val, rix)), [pre, val, rix]);
  const lines = (pre ? clCodeLines(pre) : 0) + clCodeLines(val);
  const ex = useExplain();
  const exKey = `${o.id}:${node.id}:${tab.k}`;
  return (
    <>
      <div className="kh-cl-cbar">
        <span className="kh-cl-mono">
          {lines} {t('cl_lines')}
        </span>
        {gen && (
          <span className="kh-cl-gen">
            <Svg
              d='<path d="M12 3v3"></path><path d="M12 18v3"></path><path d="M3 12h3"></path><path d="M18 12h3"></path><circle cx="12" cy="12" r="4"></circle>'
              size={12}
              sw={2}
            />
            {t('cl_genNote')}
          </span>
        )}
        <span className="kh-cl-grow" />
        {ex.ready && val.trim() && (
          <AiButton
            label={t('ai_explain')}
            busy={ex.busy}
            onClick={() => void ex.run(exKey, (pre ? `${pre}\n` : '') + val, 'ABAP', `${o.type} ${o.name}`)}
          />
        )}
        <button type="button" className="kh-cl-copy" onClick={() => onCopy((pre ? `${pre}\n` : '') + val)}>
          <Svg d={copied ? OK : COPY} size={13} />
          {copied ? t('copied') : t('copy')}
        </button>
      </div>
      <AbapEditor
        value={val}
        pre={pre}
        preTip={t('cl_genNote')}
        refs={refs}
        refTip={t('cl_open')}
        onRef={onRef}
        readOnly={gen}
        label={node.label.startsWith('cl_n_') ? t(node.label) : node.label}
        onChange={onChange}
      />
      {ex.out(exKey)}
    </>
  );
}

function Field({
  kind,
  label,
  opts,
  value,
  onChange,
  compact,
}: {
  kind: FieldKind;
  label: string;
  opts?: string[];
  value: Val | undefined;
  onChange: (v: Val) => void;
  compact?: boolean;
}) {
  if (kind === 'check')
    return compact ? (
      <button
        type="button"
        role="checkbox"
        aria-checked={!!value}
        aria-label={label}
        className="kh-cl-cb"
        data-on={value ? '' : undefined}
        onClick={() => onChange(!value)}
      >
        {value && <Svg d={OK} size={12} sw={3} />}
      </button>
    ) : (
      <button
        type="button"
        role="switch"
        aria-checked={!!value}
        aria-label={label}
        className="kh-cl-sw"
        data-on={value ? '' : undefined}
        onClick={() => onChange(!value)}
      >
        <span />
      </button>
    );
  const v = typeof value === 'string' ? value : kind === 'sel' ? (opts?.[0] ?? '') : '';
  if (kind === 'sel')
    return (
      <select
        className={compact ? 'kh-cl-gsel' : 'kh-cl-sel'}
        value={v}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      >
        {(opts ?? []).map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
        {!(opts ?? []).includes(v) && <option value={v}>{v}</option>}
      </select>
    );
  return (
    <input
      className={compact ? 'kh-cl-gin' : 'kh-cl-in'}
      data-mono={kind === 'mono' || undefined}
      value={v}
      spellCheck={false}
      maxLength={2000}
      aria-label={label}
      onChange={(e) => onChange(kind === 'mono' ? e.target.value.toUpperCase() : e.target.value)}
    />
  );
}

function GridPane({
  tab,
  mode,
  setMode,
  onRows,
}: {
  tab: Extract<ClTab, { view: 'grid' }>;
  mode: 'cards' | 'table' | null;
  setMode: (m: 'cards' | 'table') => void;
  onRows: (fn: (rows: Row[]) => Row[]) => void;
}) {
  const { t } = useI18n();
  const C = CL_GRIDS[tab.s];
  const R = tab.rows;
  const table = mode === 'table';
  const setCell = (i: number, key: string, v: Val) =>
    onRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  const del = (i: number) => onRows((rs) => rs.filter((_, j) => j !== i));
  const addRow = () =>
    onRows((rs) => {
      const nr: Row = {};
      C.forEach(([key, , , kind, opts]) => {
        if (kind === 'sel' && opts) nr[key] = opts[0]!;
      });
      return [...rs, nr].slice(0, 1000);
    });
  const cols = `44px ${C.map((c) => (c[2] ? `${c[2]}px` : 'minmax(220px,1fr)')).join(' ')} 36px`;
  const tblW = 80 + C.reduce((a, c) => a + (c[2] || 220), 0);
  const hi = Math.max(
    0,
    C.findIndex((c) => c[3] === 'text' || c[3] === 'mono'),
  );
  const delLabel = t('cl_delRow');
  const addBtn = (
    <button type="button" className="kh-cl-addrow" onClick={addRow}>
      + {t('cl_addRow')}
    </button>
  );
  return (
    <div className="kh-cl-grid">
      {mode && (
        <div className="kh-cl-modes" role="group" aria-label={`${t('cl_modeList')} / ${t('cl_modeTable')}`}>
          <button
            type="button"
            aria-pressed={!table}
            data-on={!table || undefined}
            onClick={() => setMode('cards')}
          >
            <Svg
              d='<rect x="4" y="4" width="16" height="6" rx="2"></rect><rect x="4" y="14" width="16" height="6" rx="2"></rect>'
              size={13}
              sw={2}
            />
            {t('cl_modeList')}
          </button>
          <button
            type="button"
            aria-pressed={table}
            data-on={table || undefined}
            onClick={() => setMode('table')}
          >
            <Svg
              d='<rect x="3.5" y="4.5" width="17" height="15" rx="2"></rect><line x1="3.5" y1="9.5" x2="20.5" y2="9.5"></line><line x1="3.5" y1="14.5" x2="20.5" y2="14.5"></line><line x1="9.5" y1="9.5" x2="9.5" y2="19.5"></line>'
              size={13}
              sw={2}
            />
            {t('cl_modeTable')}
          </button>
        </div>
      )}
      {table ? (
        <>
          <div className="kh-cl-tbl">
            <div style={{ minWidth: tblW }}>
              <div className="kh-cl-thead" style={{ gridTemplateColumns: cols }}>
                <span />
                {C.map((c) => (
                  <span key={c[0]} title={c[1]} data-center={c[3] === 'check' || undefined}>
                    {c[1]}
                  </span>
                ))}
                <span />
              </div>
              {R.map((rw, i) => (
                <div key={i} className="kh-cl-trow" style={{ gridTemplateColumns: cols }}>
                  <span className="kh-cl-rn">{String(i + 1).padStart(2, '0')}</span>
                  {C.map(([key, label, , kind, opts]) => (
                    <div key={key} data-center={kind === 'check' || undefined}>
                      <Field
                        compact
                        kind={kind}
                        label={`${label} ${i + 1}`}
                        opts={opts}
                        value={rw[key]}
                        onChange={(v) => setCell(i, key, v)}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="kh-cl-rdel"
                    title={delLabel}
                    aria-label={delLabel}
                    onClick={() => del(i)}
                  >
                    <Svg d={X} size={11} sw={2.4} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          {addBtn}
        </>
      ) : (
        <div className="kh-cl-cards">
          {R.map((rw, i) => {
            const head = C[hi]!;
            const rest = C.filter((_, j) => j !== hi);
            return (
              <div key={i} className="kh-cl-card">
                <div className="kh-cl-chead">
                  <span className="kh-cl-cn">{String(i + 1).padStart(2, '0')}</span>
                  <input
                    className="kh-cl-chin"
                    data-mono={head[3] === 'mono' || undefined}
                    value={typeof rw[head[0]] === 'string' ? (rw[head[0]] as string) : ''}
                    placeholder={head[1]}
                    title={head[1]}
                    aria-label={`${head[1]} ${i + 1}`}
                    spellCheck={false}
                    maxLength={2000}
                    onChange={(e) =>
                      setCell(i, head[0], head[3] === 'mono' ? e.target.value.toUpperCase() : e.target.value)
                    }
                  />
                  <div className="kh-cl-flags">
                    {rest
                      .filter((c) => c[3] === 'check')
                      .map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          role="checkbox"
                          aria-checked={!!rw[key]}
                          data-on={rw[key] ? '' : undefined}
                          onClick={() => setCell(i, key, !rw[key])}
                        >
                          <span>{rw[key] && <Svg d={OK} size={12} sw={3} />}</span>
                          {label}
                        </button>
                      ))}
                  </div>
                  <button
                    type="button"
                    className="kh-cl-rdel"
                    title={delLabel}
                    aria-label={delLabel}
                    onClick={() => del(i)}
                  >
                    <Svg d={X} size={12} sw={2.4} />
                  </button>
                </div>
                {rest
                  .filter((c) => c[3] !== 'check')
                  .map(([key, label, , kind, opts]) => (
                    <div key={key} className="kh-cl-frow">
                      <span title={label}>{label}</span>
                      <div>
                        <Field
                          kind={kind}
                          label={`${label} ${i + 1}`}
                          opts={opts}
                          value={rw[key]}
                          onChange={(v) => setCell(i, key, v)}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            );
          })}
          {addBtn}
        </div>
      )}
    </div>
  );
}
