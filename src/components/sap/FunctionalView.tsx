'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import {
  FN,
  FN_MODULES,
  FN_RBG,
  FN_RC,
  fnBlankRow,
  fnProgress,
  type FnField,
  type FnPage,
  type FnRow,
  type FnVal,
} from '@/lib/functional';
import { useConfirm, usePersistentState, useToast } from '@/components/ui';
import { refreshCounts } from '@/components/shell/counts';
import { useWhen } from '@/components/content/useWhen';
import { AiButton } from '@/components/ai/AiButton';
import { aiError, useAi } from '@/components/ai/useAi';
import { SaveTemplateButton, TemplateButton } from '@/components/templates/Templates';
import { fnToTpl, type FnTpl } from '@/lib/templates';
import './functional.css';

// Funcional SAP — SapFunctional.dc.html: Processos, Testes, Migração de
// Dados and Cutover share this screen; fn-schema.js (src/lib/functional.ts)
// says which fields, statuses and rows each page has. Shared by the tenant.

type Rec = {
  id: string;
  page: FnPage;
  title: string;
  code: string;
  st: string;
  f: Record<string, FnVal>;
  rows: FnRow[];
  createdAt: string;
  updatedAt: string;
};
type Opt = { id: string; name: string; code?: string };
type Patch = Partial<Pick<Rec, 'title' | 'code' | 'st' | 'f' | 'rows'>>;
const COL = { def: 340, min: 240 };

export function FunctionalView({ page }: { page: FnPage }) {
  const { t, lang } = useI18n();
  const when = useWhen();
  const toast = useToast();
  const { ready: aiReady } = useAi();
  const [aiBusy, setAiBusy] = useState(false);
  const confirm = useConfirm();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const P = FN[page];
  const tr = useCallback((o: { pt: string; en: string }) => (lang === 'en' ? o.en : o.pt), [lang]);
  const [items, setItems] = useState<Rec[] | null>(null);
  const [clients, setClients] = useState<Opt[]>([]);
  const [projects, setProjects] = useState<Opt[]>([]);
  const [people, setPeople] = useState<Opt[]>([]);
  const [q, setQ] = useState('');
  const [fMod, setFMod] = useState('');
  const [fCli, setFCli] = useState('');
  const [fProj, setFProj] = useState('');
  const [fSt, setFSt] = useState('');
  const [col, setCol] = usePersistentState<Record<string, boolean>>('fn.col', {});
  const [colW, setColW] = usePersistentState<number>('fn.colW', COL.def);
  const [liveCol, setLiveCol] = useState<number | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const pending = useRef(new Map<string, { patch: Patch; tm?: ReturnType<typeof setTimeout> }>());
  const base = useRef(new Map<string, string>());
  const conflictRef = useRef<string | null>(null);
  conflictRef.current = conflict;
  const sectionRef = useRef<HTMLElement>(null);
  const selId = sp.get('r');

  const load = useCallback(async () => {
    const r = await api<{ records: Rec[]; clients: Opt[]; projects: Opt[]; people: Opt[] }>(
      `/sap/functional?page=${page}`,
    );
    for (const x of r.records) base.current.set(x.id, x.updatedAt);
    setClients(r.clients);
    setProjects(r.projects);
    setPeople(r.people);
    return r.records;
  }, [page]);
  useEffect(() => {
    load()
      .then(setItems)
      .catch(() => setItems([]));
  }, [load]);

  const open = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (id) next.set('r', id);
      else next.delete('r');
      router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [path, router, sp],
  );

  // ── Saving (debounced per record, conflict by updatedAt) ───────────────────
  const send = useCallback(
    async (id: string, patch: Patch, force = false) => {
      try {
        const { record } = await api<{ record: Rec }>(
          `/sap/functional/${id}?page=${page}`,
          { ...patch, base: base.current.get(id), ...(force ? { force: true } : {}) },
          'PATCH',
        );
        base.current.set(id, record.updatedAt);
        setItems((cur) => cur && cur.map((x) => (x.id === id ? { ...x, updatedAt: record.updatedAt } : x)));
        if (force) setConflict(null);
      } catch (e) {
        if (isApiFailure(e) && e.code === 'conflict') {
          const prev = pending.current.get(id);
          pending.current.set(id, { patch: { ...patch, ...(prev?.patch ?? {}) }, tm: prev?.tm });
          setConflict(id);
        } else toast({ message: t('ne_saveFail'), tone: 'error' });
      }
    },
    [page, t, toast],
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
  const upd = (id: string, p: Patch, delay = 500) => {
    setItems((cur) => cur && cur.map((x) => (x.id === id ? { ...x, ...p } : x)));
    const prev = pending.current.get(id);
    if (prev) clearTimeout(prev.tm);
    pending.current.set(id, {
      patch: { ...(prev?.patch ?? {}), ...p },
      tm: setTimeout(() => void flush(id), delay),
    });
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
    if (fresh) setItems(fresh);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const all = useMemo(() => items ?? [], [items]);
  const query = q.trim().toLowerCase();
  const list = all.filter(
    (r) =>
      (!fMod || r.f.module === fMod) &&
      (!fCli || r.f.client === fCli) &&
      (!fProj || r.f.project === fProj) &&
      (!fSt || r.st === fSt) &&
      (!query || JSON.stringify([r.title, r.code, r.f, r.rows]).toLowerCase().includes(query)),
  );
  const sel = all.find((r) => r.id === selId) ?? list[0] ?? null;
  const stOf = (k: string) => P.st.find((x) => x[0] === k) ?? P.st[0]!;
  const cName = (id: FnVal | undefined) => clients.find((c) => c.id === id)?.name;
  const pCode = (id: FnVal | undefined) => projects.find((p) => p.id === id)?.code;
  const used = (k: string) => new Set(all.map((r) => r.f[k]).filter(Boolean));
  const groups = useMemo(() => {
    const gm = new Map<string, Rec[]>();
    for (const r of list) {
      const k =
        (r.f.module as string) || (page === 'fn_cut' ? (pCode(r.f.project) ?? '—') : t('fn_noModule'));
      gm.set(k, [...(gm.get(k) ?? []), r]);
    }
    return [...gm.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, page, projects, t]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const create = async (tpl?: FnTpl) => {
    const f: Record<string, FnVal> = { ...tpl?.f };
    if (fMod) f.module = fMod;
    if (fCli) f.client = fCli;
    if (fProj) f.project = fProj;
    try {
      const { record } = await api<{ record: Rec }>('/sap/functional', {
        page,
        title: tpl?.title.trim() || t('fn_newTitle'),
        f,
        ...(tpl && { code: tpl.code, rows: tpl.rows }),
      });
      base.current.set(record.id, record.updatedAt);
      setItems((cur) => [record, ...(cur ?? [])]);
      setQ('');
      setFSt('');
      open(record.id);
      refreshCounts();
    } catch {
      toast({ message: t('ne_saveFail'), tone: 'error' });
    }
  };
  const remove = async () => {
    if (!sel) return;
    const ok = await confirm({
      title: t('fn_confirm'),
      body: t('tr_askBody').replace('{x}', sel.title),
      confirmLabel: t('tr_move'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    const p = pending.current.get(sel.id);
    if (p) clearTimeout(p.tm);
    pending.current.delete(sel.id);
    try {
      await api(`/sap/functional/${sel.id}?page=${page}`, undefined, 'DELETE');
    } catch {
      return toast({ message: t('ne_saveFail'), tone: 'error' });
    }
    setItems((cur) => cur && cur.filter((x) => x.id !== sel.id));
    open(null);
    refreshCounts();
  };

  // ── Column resize (prototype colDown) ─────────────────────────────────────
  const cw = liveCol ?? colW;
  const colTpl = `min(${cw}px, calc(100% - 420px)) minmax(0,1fr)`;
  const onColDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const sec = sectionRef.current;
    if (!sec) return;
    const max = Math.max(300, sec.offsetWidth - 440);
    const x0 = e.clientX;
    const w0 = cw;
    let w = w0;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const mv = (ev: PointerEvent) => {
      w = Math.round(Math.max(COL.min, Math.min(max, w0 + ev.clientX - x0)));
      setLiveCol(w);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setLiveCol(null);
      setColW(w);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  const optsFor = (fd: FnField): Array<[string, string]> => {
    const none: [string, string] = ['', t('fn_none')];
    if (fd.type === 'mod') return [none, ...FN_MODULES.map((m): [string, string] => [m, m])];
    if (fd.type === 'client') return [none, ...clients.map((c): [string, string] => [c.id, c.name])];
    if (fd.type === 'project')
      return [none, ...projects.map((p): [string, string] => [p.id, `${p.code ?? ''} · ${p.name}`])];
    if (fd.type === 'person') return [none, ...people.map((p): [string, string] => [p.id, p.name])];
    return [none, ...(fd.opts ?? []).map(([v, l]): [string, string] => [v, tr(l)])];
  };
  const filters: Array<[string, string, (v: string) => void, string, Array<[string, string]>]> = [
    [
      t('fn_allMods'),
      fMod,
      setFMod,
      'module',
      FN_MODULES.filter((m) => used('module').has(m)).map((m) => [m, m]),
    ],
    [
      t('fn_allClients'),
      fCli,
      setFCli,
      'client',
      clients.filter((c) => used('client').has(c.id)).map((c) => [c.id, c.name]),
    ],
    [
      t('fn_allProj'),
      fProj,
      setFProj,
      'project',
      projects.filter((p) => used('project').has(p.id)).map((p) => [p.id, p.code ?? p.name]),
    ],
  ];

  if (!items) return <section className="kh-fn" aria-busy="true" />;
  const prog = sel ? fnProgress(page, sel.rows) : null;
  const R = P.rows;
  const gridTpl = `44px ${R.cols.map((c) => `minmax(120px,${c[3]}fr)`).join(' ')} 44px`;
  const updRow = (i: number, k: string, v: string) =>
    sel && upd(sel.id, { rows: sel.rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) });

  return (
    <section ref={sectionRef} className="kh-fn" style={{ gridTemplateColumns: colTpl }}>
      <div
        className="kh-fn-handle"
        style={{ left: `calc(min(${cw}px, calc(100% - 420px)) - 7px)` }}
        role="separator"
        aria-orientation="vertical"
        title={t('cl_resize')}
        data-drag={liveCol !== null || undefined}
        onPointerDown={onColDown}
        onDoubleClick={() => setColW(COL.def)}
      >
        <div />
      </div>
      <div className="kh-fn-side">
        <div className="kh-fn-head">
          <div className="kh-fn-titlerow">
            <div>
              <h1>{tr(P.title)}</h1>
              <span>{tr(P.sub)}</span>
            </div>
            <TemplateButton kind={page} compact onPick={(tpl) => void create(tpl.body as FnTpl)} />
            <button
              type="button"
              className="kh-fn-new"
              title={t('fn_new')}
              aria-label={t('fn_new')}
              onClick={() => void create()}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
          <label className="kh-fn-search">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,248,240,.6)"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <input
              value={q}
              placeholder={t('fn_search')}
              aria-label={t('fn_search')}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <div className="kh-fn-filters">
            {filters.map(([first, val, set, key, opts]) => (
              <select
                key={key}
                className="kh-fn-fsel"
                data-on={val || undefined}
                value={val}
                aria-label={first}
                onChange={(e) => set(e.target.value)}
              >
                <option value="">{first}</option>
                {opts.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            ))}
          </div>
          <div className="kh-fn-chips" role="group" aria-label={t('fn_filterSt')}>
            {[
              ['', t('fn_all'), ''] as [string, string, string],
              ...P.st.map((s): [string, string, string] => [s[0], tr(s[1]), s[2]]),
            ].map(([k, lb, c]) => {
              const on = fSt === k;
              return (
                <button
                  key={k || 'all'}
                  type="button"
                  aria-pressed={on}
                  style={{
                    background: on ? (k ? c : 'rgba(255,255,255,.18)') : 'rgba(255,255,255,.04)',
                    borderColor: on ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.12)',
                  }}
                  onClick={() => setFSt(k)}
                >
                  {lb}
                  <span>{k ? all.filter((r) => r.st === k).length : all.length}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="kh-fn-list">
          {groups.map(([k, rs]) => {
            const ck = `${page}:${k}`;
            const closed = !!col[ck] && !query;
            return (
              <div key={k} className="kh-fn-group">
                <button
                  type="button"
                  className="kh-fn-ghead"
                  aria-expanded={!closed}
                  onClick={() => setCol({ ...col, [ck]: !col[ck] })}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(255,248,240,.7)"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ transform: `rotate(${closed ? -90 : 0}deg)` }}
                    aria-hidden="true"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                  <span>{k}</span>
                  <span>{rs.length}</span>
                </button>
                {!closed &&
                  rs.map((r) => {
                    const s = stOf(r.st);
                    const p = fnProgress(page, r.rows);
                    const cl = cName(r.f.client);
                    return (
                      <div
                        key={r.id}
                        role="button"
                        tabIndex={0}
                        className="kh-fn-item"
                        data-on={r.id === sel?.id || undefined}
                        aria-current={r.id === sel?.id || undefined}
                        onClick={() => open(r.id)}
                        onKeyDown={(e) => e.key === 'Enter' && open(r.id)}
                      >
                        <div className="kh-fn-irow">
                          <span className="kh-fn-ititle">{r.title}</span>
                          <span className="kh-fn-pill" style={{ background: s[2] }}>
                            {tr(s[1])}
                          </span>
                        </div>
                        <div className="kh-fn-imeta">
                          <span>{r.code}</span>
                          {cl && <span>· {cl}</span>}
                        </div>
                        {p && (
                          <div className="kh-fn-ibar">
                            <div style={{ width: `${p.pct}%` }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          })}
          {!list.length && <div className="kh-fn-empty">{t('fn_empty')}</div>}
        </div>
      </div>
      <div className="kh-fn-main">
        {!sel && <div className="kh-fn-pick">{t('fn_pick')}</div>}
        {sel && (
          <div className="kh-fn-detail">
            <div className="kh-fn-dhead">
              <div className="kh-fn-names">
                <input
                  className="kh-fn-code"
                  value={sel.code}
                  maxLength={120}
                  placeholder={tr(P.codeLbl)}
                  aria-label={tr(P.codeLbl)}
                  spellCheck={false}
                  onChange={(e) => upd(sel.id, { code: e.target.value })}
                />
                <input
                  className="kh-fn-title"
                  value={sel.title}
                  maxLength={300}
                  aria-label={t('fn_title')}
                  onChange={(e) => upd(sel.id, { title: e.target.value })}
                />
              </div>
              <select
                className="kh-fn-st"
                value={sel.st}
                aria-label={t('fn_status')}
                style={{ backgroundColor: stOf(sel.st)[2] }}
                onChange={(e) => upd(sel.id, { st: e.target.value }, 0)}
              >
                {P.st.map((s) => (
                  <option key={s[0]} value={s[0]}>
                    {tr(s[1])}
                  </option>
                ))}
              </select>
              <SaveTemplateButton
                kind={page}
                compact
                defaultName={sel.title}
                body={() => fnToTpl(page, sel)}
              />
              <button
                type="button"
                className="kh-fn-del"
                title={t('del')}
                aria-label={t('del')}
                onClick={() => void remove()}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 7h16" />
                  <path d="M9 7V4h6v3" />
                  <path d="M6 7l1 13h10l1-13" />
                </svg>
              </button>
            </div>
            {conflict === sel.id && (
              <div className="kh-fn-conflict" role="alert">
                <span>{t('fn_conflict')}</span>
                <button type="button" onClick={() => void resolve(false)}>
                  {t('wb_reload')}
                </button>
                <button type="button" onClick={() => void resolve(true)}>
                  {t('wb_keep')}
                </button>
              </div>
            )}
            {prog && (
              <div className="kh-fn-prog">
                <div>
                  <b>
                    {prog.pct}% {t('fn_done')}
                  </b>
                  {prog.parts.map((p) => (
                    <span key={p.k}>
                      <i style={{ background: FN_RC[p.k] }} />
                      {tr(p.label)} <b>{p.n}</b>
                    </span>
                  ))}
                </div>
                <div className="kh-fn-pbar">
                  {prog.parts.map((p) => (
                    <div key={p.k} style={{ width: `${p.w}%`, background: FN_RC[p.k] }} />
                  ))}
                </div>
              </div>
            )}
            <div className="kh-fn-fields">
              {P.fields.map((fd) => {
                const v = sel.f[fd.k];
                const label = tr(fd.label);
                const set = (nv: FnVal) => upd(sel.id, { f: { ...sel.f, [fd.k]: nv } });
                const isSel = ['mod', 'client', 'project', 'person', 'sel'].includes(fd.type);
                return (
                  <label key={fd.k} className="kh-fn-field" data-full={fd.full || undefined}>
                    <span>{label}</span>
                    {isSel ? (
                      <select
                        className="kh-fn-in kh-fn-sel"
                        value={v == null ? '' : String(v)}
                        aria-label={label}
                        onChange={(e) => upd(sel.id, { f: { ...sel.f, [fd.k]: e.target.value } }, 0)}
                      >
                        {optsFor(fd).map(([ov, ol]) => (
                          <option key={ov} value={ov}>
                            {ol}
                          </option>
                        ))}
                        {v && !optsFor(fd).some(([ov]) => ov === v) ? (
                          <option value={String(v)}>—</option>
                        ) : null}
                      </select>
                    ) : fd.type === 'area' ? (
                      <textarea
                        className="kh-fn-in kh-fn-area"
                        data-mono={fd.mono || undefined}
                        rows={3}
                        maxLength={20000}
                        value={v == null ? '' : String(v)}
                        onChange={(e) => set(e.target.value)}
                      />
                    ) : (
                      <input
                        className="kh-fn-in"
                        data-mono={fd.mono || undefined}
                        type={fd.type === 'date' ? 'date' : fd.type === 'num' ? 'number' : 'text'}
                        min={fd.type === 'num' ? 0 : undefined}
                        maxLength={fd.type === 'text' ? 500 : undefined}
                        spellCheck={false}
                        value={v == null ? '' : String(v)}
                        onChange={(e) => {
                          const nv = e.target.value;
                          if (fd.type !== 'num') return set(nv.replace(/[\r\n]/g, ' '));
                          const n = Math.max(0, Math.floor(Number(nv)));
                          set(nv === '' || !Number.isFinite(n) ? '' : n);
                        }}
                      />
                    )}
                  </label>
                );
              })}
            </div>
            <div className="kh-fn-rows">
              <div className="kh-fn-rhead">
                <span>{tr(R.title)}</span>
                {aiReady && page === 'fn_test' && (
                  <AiButton
                    label={t('ai_testSteps')}
                    busy={aiBusy}
                    disabled={!sel.title.trim() || sel.rows.length >= 460}
                    onClick={async () => {
                      setAiBusy(true);
                      try {
                        const r = await api<{ steps: Array<{ step: string; expected: string }> }>(
                          '/ai/action',
                          {
                            kind: 'tests',
                            title: sel.title,
                            module: typeof sel.f.module === 'string' ? sel.f.module : undefined,
                            kind2: typeof sel.f.kind === 'string' ? sel.f.kind : undefined,
                            pre: typeof sel.f.pre === 'string' ? sel.f.pre.slice(0, 10_000) : undefined,
                            existing: sel.rows.map((x) => x.step ?? '').filter(Boolean),
                          },
                        );
                        upd(
                          sel.id,
                          {
                            rows: [
                              ...sel.rows,
                              ...r.steps.map((x) => ({
                                ...fnBlankRow(page),
                                step: x.step,
                                expected: x.expected,
                              })),
                            ],
                          },
                          0,
                        );
                        toast({
                          message: t('ai_stepsAdded').replace('{n}', String(r.steps.length)),
                          tone: 'success',
                        });
                      } catch (e) {
                        toast({ message: aiError(t, e), tone: 'error' });
                      } finally {
                        setAiBusy(false);
                      }
                    }}
                  />
                )}
                <button
                  type="button"
                  disabled={sel.rows.length >= 500}
                  onClick={() => upd(sel.id, { rows: [...sel.rows, fnBlankRow(page)] }, 0)}
                >
                  + {t('fn_addRow')}
                </button>
              </div>
              <div className="kh-fn-table">
                <div style={{ minWidth: 560 }}>
                  <div className="kh-fn-thead" style={{ gridTemplateColumns: gridTpl }}>
                    <span>#</span>
                    {R.cols.map((c) => (
                      <span key={c[0]}>{tr(c[1])}</span>
                    ))}
                    <span />
                  </div>
                  {sel.rows.map((row, i) => (
                    <div key={i} className="kh-fn-trow" style={{ gridTemplateColumns: gridTpl }}>
                      <span className="kh-fn-rn">{i + 1}</span>
                      {R.cols.map(([k, lb, kind, , mono]) => {
                        const v = row[k] || (kind === 'rst' ? 'todo' : '');
                        const label = `${tr(lb)} ${i + 1}`;
                        return (
                          <span key={k} className="kh-fn-cell">
                            {kind === 'rst' ? (
                              <select
                                className="kh-fn-rst"
                                value={v}
                                aria-label={label}
                                style={{ backgroundColor: FN_RBG[v] ?? 'rgba(255,255,255,.1)' }}
                                onChange={(e) => updRow(i, k, e.target.value)}
                              >
                                {R.status!.map(([sk, sl]) => (
                                  <option key={sk} value={sk}>
                                    {tr(sl)}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                className="kh-fn-cin"
                                data-mono={mono || undefined}
                                value={v}
                                maxLength={2000}
                                spellCheck={false}
                                aria-label={label}
                                onChange={(e) => updRow(i, k, e.target.value.replace(/[\r\n]/g, ' '))}
                              />
                            )}
                          </span>
                        );
                      })}
                      <button
                        type="button"
                        className="kh-fn-rdel"
                        title={t('fn_delRow')}
                        aria-label={`${t('fn_delRow')} ${i + 1}`}
                        onClick={() => upd(sel.id, { rows: sel.rows.filter((_, j) => j !== i) }, 0)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {!sel.rows.length && <div className="kh-fn-norows">{t('fn_noRows')}</div>}
                </div>
              </div>
            </div>
            <span className="kh-fn-meta">
              {t('fn_created')} {when(sel.createdAt)} · {t('fn_updated')} {when(sel.updatedAt)}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
