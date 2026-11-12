'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { Select, useConfirm, useToast } from '@/components/ui';
import {
  BLOCKS,
  lineCost,
  PROFILE_KEYS,
  totalCost,
  totalDays,
  unmappedBlocks,
  type Block,
  type Line,
} from '@/lib/budget';
import {
  eur,
  ExcelDialog,
  FeedDialog,
  groupsOf,
  MapDialog,
  NewBudgetDialog,
  type Settings,
} from './BudgetDialogs';
import '@/components/sap/sap.css';
import './budget.css';

// "Orçamentos" (Management): the person's budgets (list / one budget) and the
// matrix (SF modules × profiles, days Greenfield / Brownfield) with the Excel
// model it fills. ?tab=matrix shows the matrix, ?id= one budget.

type Budget = {
  id: string;
  ref: string;
  client: string;
  scenario: 'gf' | 'bf';
  modules: string[];
  lines: Line[];
  createdAt: string;
  updatedAt: string;
};

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const PROFILE_SHORT: Record<string, string> = {
  CONS: 'bg_pCons',
  FI: 'FI',
  INT: 'bg_pInt',
  ABAP: 'ABAP',
  BASIS: 'Basis',
  LOC: 'bg_pLoc',
  GP: 'bg_pGp',
  DIR: 'bg_pDir',
  GAR: 'bg_pGar',
};

export function BudgetView() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const tab = sp.get('tab') === 'matrix' ? 'matrix' : 'list';
  const openId = sp.get('id');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [list, setList] = useState<Budget[] | null>(null);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [feed, setFeed] = useState<{ start: string | null } | null>(null);
  const [mapping, setMapping] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const go = useCallback(
    (p: Record<string, string | null>) => {
      const u = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(p))
        if (v === null) u.delete(k);
        else u.set(k, v);
      const s = u.toString();
      router.push(`${path}${s ? `?${s}` : ''}`, { scroll: false });
    },
    [path, router, sp],
  );
  const loadList = useCallback(
    () =>
      api<{ budgets: Budget[] }>('/budgets')
        .then((r) => setList(r.budgets))
        .catch(() => setList([])),
    [],
  );
  useEffect(() => {
    void api<{ settings: Settings }>('/budgets/settings')
      .then((r) => setSettings(r.settings))
      .catch(() => toast({ message: t('bg_fail'), tone: 'error' }));
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upload = async (f: File) => {
    const fd = new FormData();
    fd.append('file', f);
    try {
      const res = await fetch(`${BASE}/api/v1/budgets/template`, {
        method: 'POST',
        body: fd,
        credentials: 'same-origin',
      });
      const j = (await res.json()) as { settings?: Settings; error?: { code?: string } };
      if (!res.ok || !j.settings) {
        const code = j.error?.code ?? '';
        toast({
          message: t(
            code === 'file_too_large' || code === 'template_file_too_large'
              ? 'bg_tooLarge'
              : code === 'template_macros'
                ? 'bg_macros'
                : 'bg_notXlsx',
          ),
          tone: 'error',
        });
        return;
      }
      setSettings(j.settings);
      toast({ message: t('bg_tplOk'), tone: 'success' });
      setMapping(true);
    } catch {
      toast({ message: t('bg_fail'), tone: 'error' });
    }
  };

  const matrix = settings?.matrix;
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT', { day: '2-digit', month: 'short' });
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (list ?? []).filter(
      (b) =>
        !k ||
        b.client.toLowerCase().includes(k) ||
        b.ref.toLowerCase().includes(k) ||
        b.modules.join(' ').toLowerCase().includes(k),
    );
  }, [list, q]);
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = (list ?? []).filter((b) => b.createdAt.slice(0, 7) === month);

  const stat = (color: string, label: string, v: React.ReactNode) => (
    <button type="button" style={{ background: 'rgb(var(--w) / .05)' }} tabIndex={-1}>
      <span>
        <span style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        <span>{label}</span>
      </span>
      <span>{v}</span>
    </button>
  );

  if (openId)
    return (
      <BudgetDetail
        key={openId}
        id={openId}
        settings={settings}
        onBack={() => {
          go({ id: null });
          void loadList();
        }}
        onOpen={(id) => go({ id })}
      />
    );

  const head = (
    <div className="kh-sap-head">
      <div className="kh-sap-titles">
        <h1>{t('nav_mg_budget')}</h1>
        <div>{t('bg_sub')}</div>
      </div>
      <div className="kh-sap-seg" role="radiogroup" aria-label={t('nav_mg_budget')}>
        {(['list', 'matrix'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={tab === v}
            data-on={tab === v || undefined}
            onClick={() => go({ tab: v === 'matrix' ? 'matrix' : null })}
          >
            {t(v === 'list' ? 'bg_tabList' : 'bg_tabMatrix')}
          </button>
        ))}
      </div>
      <label className="kh-sap-search">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t(tab === 'list' ? 'bg_searchList' : 'bg_searchMod')}
          aria-label={t(tab === 'list' ? 'bg_searchList' : 'bg_searchMod')}
        />
      </label>
      {tab === 'list' ? (
        <button type="button" className="kh-sap-new" disabled={!matrix} onClick={() => setCreating(true)}>
          + {t('bg_new')}
        </button>
      ) : (
        <button
          type="button"
          className="kh-sap-new"
          disabled={!matrix}
          onClick={() => setFeed({ start: null })}
        >
          ✎ {t('bg_feed')}
        </button>
      )}
    </div>
  );

  return (
    <section className="kh-sap kh-bg-page">
      <div className="kh-sap-main">
        {head}
        {tab === 'list' ? (
          <>
            <div className="kh-ot-stats">
              {stat('oklch(0.72 0.15 150)', t('bg_count'), list?.length ?? '…')}
              {stat('oklch(0.7 0.12 250)', t('bg_month'), thisMonth.length)}
              {stat(
                'oklch(0.75 0.13 80)',
                t('bg_monthDays'),
                `${thisMonth.reduce((s, b) => s + totalDays(b.lines), 0)} d`,
              )}
              {stat(
                'oklch(0.7 0.14 300)',
                t('bg_monthCost'),
                eur(thisMonth.reduce((s, b) => s + totalCost(b.lines), 0)),
              )}
            </div>
            <div className="kh-sap-body" style={{ padding: '0 22px 22px' }}>
              <div className="kh-well kh-table kh-bg-table" role="table" aria-label={t('nav_mg_budget')}>
                <div className="kh-table__head kh-bg-list" role="row">
                  {[
                    'bg_ref',
                    'bg_client',
                    'bg_scenario',
                    'bg_modules',
                    'bg_days',
                    'bg_lines',
                    'bg_cost',
                    'bg_created',
                  ].map((k, i) => (
                    <div
                      key={k}
                      role="columnheader"
                      className={`kh-table__th${i >= 4 && i <= 6 ? ' kh-bg-num' : ''}`}
                    >
                      {t(k)}
                    </div>
                  ))}
                </div>
                {list && !shown.length && (
                  <div className="kh-table__empty">{list.length ? t('bg_noMatch') : t('bg_empty')}</div>
                )}
                {shown.map((b) => (
                  <div
                    key={b.id}
                    role="row"
                    tabIndex={0}
                    className="kh-table__row kh-table__row--click kh-bg-list"
                    onClick={() => go({ id: b.id })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') go({ id: b.id });
                    }}
                  >
                    <div
                      role="cell"
                      className="kh-table__td kh-bg-dim"
                      style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12 }}
                    >
                      {b.ref}
                    </div>
                    <div role="cell" className="kh-table__td" style={{ fontWeight: 600 }}>
                      {b.client}
                    </div>
                    <div role="cell" className="kh-table__td">
                      <span className="kh-bg-tag" data-s={b.scenario}>
                        {t(`bg_${b.scenario}`)}
                      </span>
                    </div>
                    <div role="cell" className="kh-table__td kh-bg-dim" title={b.modules.join(' · ')}>
                      {b.modules.join(' · ')}
                    </div>
                    <div role="cell" className="kh-table__td kh-bg-num">
                      {totalDays(b.lines)}
                    </div>
                    <div role="cell" className="kh-table__td kh-bg-num">
                      {b.lines.length}
                    </div>
                    <div role="cell" className="kh-table__td kh-bg-num">
                      {eur(totalCost(b.lines))}
                    </div>
                    <div role="cell" className="kh-table__td kh-bg-dim">
                      {fmtDate(b.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          matrix && (
            <>
              <div className="kh-bg-strip" data-warn={!settings?.template || !settings.mapping || undefined}>
                📄{' '}
                <span>
                  {settings?.template ? (
                    <>
                      {t('bg_tpl')}: <b>{settings.template.name}</b>
                      {settings.mapping
                        ? ` · ${settings.mapping.sheet} · ${BLOCKS.filter((b) => settings.mapping!.blocks[b])
                            .map(
                              (b) =>
                                `${t(`bg_b_${b}`)} ${settings.mapping!.blocks[b]!.from}–${settings.mapping!.blocks[b]!.to}`,
                            )
                            .join(' · ')}`
                        : ''}
                    </>
                  ) : (
                    t('bg_noTpl')
                  )}
                </span>
                {settings?.template && (
                  <button
                    type="button"
                    className="kh-btn kh-btn--sm kh-btn--ghost"
                    onClick={() => setMapping(true)}
                  >
                    {t('bg_map')}
                  </button>
                )}
                <button
                  type="button"
                  className="kh-btn kh-btn--sm kh-btn--glass"
                  onClick={() => file.current?.click()}
                >
                  {t(settings?.template ? 'bg_tplReplace' : 'bg_tplUpload')}
                </button>
                <input
                  ref={file}
                  type="file"
                  hidden
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void upload(f);
                  }}
                />
              </div>
              <div className="kh-bg-prof">
                {matrix.profiles
                  .filter((p) => p.mode !== 'module')
                  .map((p) => (
                    <span key={p.key}>
                      {p.label.replace(/\{code\}|\{name\}/g, '‹…›')}
                      <b>{eur(p.rate)}</b>
                    </span>
                  ))}
                <span style={{ opacity: 0.75 }}>
                  {t('bg_days')}: <b style={{ marginLeft: 4 }}>{t('bg_gf')}</b>{' '}
                  <i style={{ fontStyle: 'normal', opacity: 0.55 }}>{t('bg_bf')}</i>
                </span>
              </div>
              <div className="kh-sap-body" style={{ padding: '0 22px 22px' }}>
                <div className="kh-well kh-table kh-bg-table" role="table" aria-label={t('bg_tabMatrix')}>
                  <div className="kh-table__head kh-bg-mx" role="row">
                    {[
                      t('bg_code'),
                      t('bg_module'),
                      t('bg_rateShort'),
                      ...PROFILE_KEYS.map((k) =>
                        PROFILE_SHORT[k]!.startsWith('bg_') ? t(PROFILE_SHORT[k]!) : PROFILE_SHORT[k]!,
                      ),
                    ].map((h, i) => (
                      <div
                        key={i}
                        role="columnheader"
                        className={`kh-table__th${i >= 2 ? ' kh-bg-num' : ''}`}
                      >
                        {h}
                      </div>
                    ))}
                  </div>
                  {groupsOf(
                    matrix.modules.filter((m) => {
                      const k = q.trim().toLowerCase();
                      return !k || m.code.toLowerCase().includes(k) || m.name.toLowerCase().includes(k);
                    }),
                  ).map(([g, mods]) => (
                    <div key={g} role="rowgroup">
                      <div className="kh-bg-grp">
                        <span>{g}</span>
                        <span>{t('bg_nModules').replace('{n}', String(mods.length))}</span>
                      </div>
                      {mods.map((m) => (
                        <div
                          key={m.code}
                          role="row"
                          tabIndex={0}
                          data-off={!m.active || undefined}
                          className="kh-table__row kh-table__row--click kh-bg-mx"
                          onClick={() => setFeed({ start: m.code })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') setFeed({ start: m.code });
                          }}
                        >
                          <div role="cell" className="kh-table__td">
                            <span className="kh-bg-code">{m.code}</span>
                          </div>
                          <div role="cell" className="kh-table__td" title={m.name}>
                            {m.name}
                          </div>
                          <div role="cell" className="kh-table__td kh-bg-num">
                            {m.rate}
                          </div>
                          {PROFILE_KEYS.map((k) => {
                            const c = m.days[k];
                            return (
                              <div key={k} role="cell" className="kh-table__td kh-bg-num">
                                {c && (c.gf || c.bf) ? (
                                  <span className="kh-bg-gb" title={c.n > 1 ? `× ${c.n}` : undefined}>
                                    <b>{c.gf ?? 0}</b>
                                    <i>{c.bf ?? 0}</i>
                                  </span>
                                ) : (
                                  <span className="kh-bg-dim">–</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )
        )}
      </div>
      {matrix && (
        <>
          <NewBudgetDialog
            open={creating}
            matrix={matrix}
            onClose={() => setCreating(false)}
            onCreated={(id) => {
              setCreating(false);
              go({ id, tab: null });
            }}
          />
          <FeedDialog
            open={!!feed}
            matrix={matrix}
            start={feed?.start ?? null}
            onClose={() => setFeed(null)}
            onSaved={(s) => {
              setSettings(s);
              setFeed(null);
            }}
          />
          <MapDialog
            open={mapping}
            mapping={settings?.mapping ?? null}
            onClose={() => setMapping(false)}
            onSaved={(s) => {
              setSettings(s);
              setMapping(false);
            }}
          />
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------- one budget

function BudgetDetail({
  id,
  settings,
  onBack,
  onOpen,
}: {
  id: string;
  settings: Settings | null;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [b, setB] = useState<Budget | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [client, setClient] = useState('');
  const [xl, setXl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addTo, setAddTo] = useState<Block>('services');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ lines?: Line[]; client?: string }>({});

  useEffect(() => {
    api<{ budget: Budget }>(`/budgets/${id}`)
      .then((r) => {
        setB(r.budget);
        setLines(r.budget.lines);
        setClient(r.budget.client);
      })
      .catch(() => {
        toast({ message: t('bg_notFound'), tone: 'error' });
        onBack();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = {};
    if (!p.lines && !p.client) return;
    try {
      const r = await api<{ budget: Budget }>(`/budgets/${id}`, p, 'PATCH');
      setB(r.budget);
    } catch {
      toast({ message: t('bg_fail'), tone: 'error' });
    }
  }, [id, t, toast]);
  useEffect(
    () => () => {
      void flush();
    },
    [flush],
  );
  const later = (p: { lines?: Line[]; client?: string }) => {
    pending.current = { ...pending.current, ...p };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 600);
  };
  const setLine = (i: number, patch: Partial<Line>) => {
    const next = lines.map((l, j) => (j === i ? { ...l, ...patch } : l));
    setLines(next);
    later({ lines: next });
  };
  const removeLine = (i: number) => {
    const next = lines.filter((_, j) => j !== i);
    setLines(next);
    later({ lines: next });
  };
  const addLine = () => {
    const p = settings?.matrix.profiles.find((x) => x.block === addTo && x.mode !== 'module');
    const l: Line = {
      block: addTo,
      desc: '',
      type: p?.type ?? 'Consultor',
      days: 0,
      count: 1,
      rate: p?.rate ?? 375,
      origin: [],
    };
    // after the last line of its block
    const at = lines.reduce((k, x, j) => (BLOCKS.indexOf(x.block) <= BLOCKS.indexOf(addTo) ? j + 1 : k), 0);
    const next = [...lines.slice(0, at), l, ...lines.slice(at)];
    setLines(next);
    later({ lines: next });
  };

  if (!b)
    return (
      <section className="kh-sap kh-bg-page">
        <div className="kh-sap-main">
          <p className="kh-bg-hint" style={{ padding: 22 }}>
            {t('bg_loading')}
          </p>
        </div>
      </section>
    );

  const other = b.scenario === 'gf' ? 'bf' : 'gf';
  const switchScenario = async () => {
    const ok = await confirm({
      title: t('bg_switchT').replace('{s}', t(`bg_${other}`)),
      body: t('bg_switchB'),
      confirmLabel: t('bg_switchOk'),
      cancelLabel: t('bg_cancel'),
    });
    if (!ok) return;
    await flush();
    try {
      const r = await api<{ budget: Budget }>(`/budgets/${id}`, { scenario: other, rebuild: true }, 'PATCH');
      setB(r.budget);
      setLines(r.budget.lines);
    } catch {
      toast({ message: t('bg_fail'), tone: 'error' });
    }
  };
  const duplicate = async () => {
    await flush();
    try {
      const r = await api<{ budget: Budget }>(`/budgets/${id}/duplicate`, {});
      toast({ message: t('bg_duplicated').replace('{r}', r.budget.ref), tone: 'success' });
      onOpen(r.budget.id);
    } catch {
      toast({ message: t('bg_fail'), tone: 'error' });
    }
  };
  const remove = async () => {
    const ok = await confirm({
      title: t('bg_delT'),
      body: t('bg_delB'),
      confirmLabel: t('bg_del'),
      cancelLabel: t('bg_cancel'),
      danger: true,
    });
    if (!ok) return;
    pending.current = {};
    try {
      await api(`/budgets/${id}`, undefined, 'DELETE');
      toast({
        message: (
          <span>
            {t('bg_deleted')}{' '}
            <button
              type="button"
              className="kh-btn kh-btn--sm kh-btn--ghost"
              onClick={() => void api(`/budgets/${id}/restore`, {}).then(() => onOpen(id))}
            >
              {t('bg_undo')}
            </button>
          </span>
        ),
        tone: 'info',
        duration: 8000,
      });
      onBack();
    } catch {
      toast({ message: t('bg_fail'), tone: 'error' });
    }
  };
  const map = settings?.mapping ?? null;
  const missing = unmappedBlocks(map, lines);
  const openExcel = async () => {
    if (!settings?.template || !map) {
      toast({ message: t('bg_needTpl'), tone: 'info' });
      return;
    }
    if (missing.length) {
      toast({
        message: t('bg_needBlock').replace('{b}', missing.map((x) => t(`bg_b_${x}`)).join(', ')),
        tone: 'error',
      });
      return;
    }
    await flush();
    setXl(true);
  };
  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/api/v1/budgets/${id}/xlsx`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') ?? '';
      const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? `${b.ref}.xlsx`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setXl(false);
    } catch {
      toast({ message: t('bg_fail'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const cap = (bl: Block) => {
    const x = map?.blocks[bl];
    return x ? x.to - x.from + 1 : null;
  };
  let idx = -1;
  return (
    <section className="kh-sap kh-bg-page">
      <div className="kh-sap-main">
        <div className="kh-sap-head">
          <div className="kh-sap-titles">
            <h1>{client || b.client}</h1>
            <div>
              {t('bg_refLine').replace('{r}', b.ref)} ·{' '}
              <span className="kh-bg-tag" data-s={b.scenario}>
                {t(`bg_${b.scenario}`)}
              </span>{' '}
              · {b.modules.join(' · ')}
            </div>
          </div>
          <button type="button" className="kh-sap-new" onClick={() => void openExcel()}>
            ⤓ {t('bg_excel')}
          </button>
        </div>
        <div className="kh-ot-stats">
          {[
            ['oklch(0.72 0.15 150)', t('bg_lines'), lines.length],
            ['oklch(0.7 0.12 250)', t('bg_days'), `${totalDays(lines)} d`],
            ['oklch(0.75 0.13 80)', t('bg_modules'), b.modules.length],
            ['oklch(0.7 0.14 300)', t('bg_cost'), eur(totalCost(lines))],
          ].map(([c, l, v]) => (
            <button key={String(l)} type="button" style={{ background: 'rgb(var(--w) / .05)' }} tabIndex={-1}>
              <span>
                <span style={{ background: String(c), boxShadow: `0 0 8px ${String(c)}` }} />
                <span>{l}</span>
              </span>
              <span>{v}</span>
            </button>
          ))}
        </div>
        <div className="kh-bg-tools">
          <button
            type="button"
            className="kh-btn kh-btn--sm kh-btn--ghost"
            onClick={() => void flush().then(onBack)}
          >
            ← {t('bg_back')}
          </button>
          <input
            className="kh-bg-in kh-bg-client"
            data-t
            value={client}
            maxLength={200}
            aria-label={t('bg_client')}
            onChange={(e) => {
              setClient(e.target.value);
              if (e.target.value.trim()) later({ client: e.target.value.trim() });
            }}
          />
          <span className="sp" />
          <div style={{ width: 150 }}>
            <Select
              value={addTo}
              options={BLOCKS.map((x) => ({ value: x, label: t(`bg_b_${x}`) }))}
              onChange={setAddTo}
              searchPlaceholder={t('bg_pBlock')}
              aria-label={t('bg_pBlock')}
            />
          </div>
          <button type="button" className="kh-btn kh-btn--sm kh-btn--ghost" onClick={addLine}>
            + {t('bg_addLine')}
          </button>
          <button
            type="button"
            className="kh-btn kh-btn--sm kh-btn--ghost"
            onClick={() => void switchScenario()}
          >
            {t('bg_switch').replace('{s}', t(`bg_${other}`))}
          </button>
          <button type="button" className="kh-btn kh-btn--sm kh-btn--ghost" onClick={() => void duplicate()}>
            {t('bg_duplicate')}
          </button>
          <button type="button" className="kh-btn kh-btn--sm kh-btn--ghost" onClick={() => void remove()}>
            {t('bg_del')}
          </button>
        </div>
        <div className="kh-sap-body" style={{ padding: '0 22px 22px' }}>
          <div className="kh-well kh-table kh-bg-table" role="table" aria-label={b.client}>
            <div className="kh-table__head kh-bg-lines" role="row">
              {['bg_desc', 'bg_origin', 'bg_days', 'bg_consult', 'bg_rate', 'bg_cost', ''].map((k, i) => (
                <div
                  key={i}
                  role="columnheader"
                  className={`kh-table__th${i >= 2 && i <= 5 ? ' kh-bg-num' : ''}`}
                >
                  {k ? t(k) : ''}
                </div>
              ))}
            </div>
            {!lines.length && <div className="kh-table__empty">{t('bg_noLines')}</div>}
            {BLOCKS.map((bl) => {
              const ls = lines.map((l, i) => [l, i] as const).filter(([l]) => l.block === bl);
              if (!ls.length) return null;
              const c = cap(bl);
              const extra = c !== null ? Math.max(0, ls.length - c) : 0;
              const x = map?.blocks[bl];
              return (
                <div key={bl} role="rowgroup">
                  <div className="kh-bg-grp">
                    <span>{t(`bg_b_${bl}`)}</span>
                    <span>
                      {x
                        ? t('bg_rowsModel').replace('{a}', String(x.from)).replace('{z}', String(x.to))
                        : t('bg_notMapped')}
                      {extra > 0 && <em> · {t('bg_willInsert').replace('{n}', String(extra))}</em>}
                    </span>
                  </div>
                  {ls.map(([l, i], k) => {
                    idx++;
                    return (
                      <div
                        key={`${bl}${i}`}
                        role="row"
                        className={`kh-table__row kh-bg-lines${c !== null && k >= c ? ' kh-bg-row--new' : ''}`}
                        data-i={idx}
                      >
                        <div role="cell" className="kh-table__td">
                          <input
                            className="kh-bg-in"
                            data-t
                            value={l.desc}
                            maxLength={200}
                            aria-label={t('bg_desc')}
                            onChange={(e) => setLine(i, { desc: e.target.value })}
                          />
                        </div>
                        <div
                          role="cell"
                          className="kh-table__td kh-bg-dim"
                          style={{ fontSize: 12 }}
                          title={l.origin.join(' · ')}
                        >
                          {l.origin.join(' · ') || t('bg_manual')}
                        </div>
                        {(['days', 'count', 'rate'] as const).map((f) => (
                          <div key={f} role="cell" className="kh-table__td kh-bg-num">
                            <input
                              className="kh-bg-in"
                              inputMode="decimal"
                              aria-label={t(
                                f === 'days' ? 'bg_days' : f === 'count' ? 'bg_consult' : 'bg_rate',
                              )}
                              value={String(l[f])}
                              onChange={(e) => {
                                const n = Number(e.target.value.replace(',', '.'));
                                if (!Number.isFinite(n) || n < 0) return;
                                setLine(i, { [f]: f === 'count' ? Math.max(1, Math.round(n)) : n });
                              }}
                            />
                          </div>
                        ))}
                        <div role="cell" className="kh-table__td kh-bg-num">
                          {eur(lineCost(l))}
                        </div>
                        <div role="cell" className="kh-table__td">
                          <button
                            type="button"
                            className="kh-bg-x"
                            aria-label={t('bg_removeLine')}
                            onClick={() => removeLine(i)}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <div className="kh-bg-tot">
              <span>
                {t('bg_days')}
                <b>{totalDays(lines)}</b>
              </span>
              <span>
                {t('bg_cost')}
                <b>{eur(totalCost(lines))}</b>
              </span>
              <span className="kh-bg-dim" style={{ maxWidth: 300 }}>
                {t('bg_excelCalc')}
              </span>
            </div>
          </div>
        </div>
      </div>
      {map && (
        <ExcelDialog
          open={xl}
          mapping={map}
          client={client || b.client}
          refName={b.ref}
          lines={lines}
          busy={busy}
          onClose={() => setXl(false)}
          onDownload={() => void download()}
        />
      )}
    </section>
  );
}
