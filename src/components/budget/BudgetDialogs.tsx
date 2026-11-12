'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { Modal, Select, Switch, useToast } from '@/components/ui';
import {
  BLOCKS,
  buildLines,
  colName,
  colNum,
  CELL_RE,
  MAP_COLS,
  placeLines,
  PROFILE_KEYS,
  totalCost,
  totalDays,
  type Block,
  type BudgetModule,
  type Line,
  type Mapping,
  type Matrix,
  type Scenario,
} from '@/lib/budget';

export type Settings = {
  matrix: Matrix;
  mapping: Mapping | null;
  template: { name: string; size: number; at: string } | null;
};
type Preview = {
  sheets: string[];
  sheet: string;
  rows: Array<{ r: number; cells: Record<string, { v: string; f?: true }> }>;
  maxCol: number;
};

export const eur = (n: number) => `${n.toLocaleString('pt-PT', { maximumFractionDigits: 2 })} €`;
const numIn = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const optNum = (v: string) => (v.trim() === '' ? null : numIn(v));
export const groupsOf = (mods: BudgetModule[]) => {
  const m = new Map<string, BudgetModule[]>();
  for (const x of mods) m.set(x.group || '—', [...(m.get(x.group || '—') ?? []), x]);
  return [...m];
};

// ------------------------------------------------------------ Novo orçamento

export function NewBudgetDialog({
  open,
  matrix,
  onClose,
  onCreated,
}: {
  open: boolean;
  matrix: Matrix;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [client, setClient] = useState('');
  const [scenario, setScenario] = useState<Scenario>('gf');
  const [pick, setPick] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setClient('');
      setScenario('gf');
      setPick([]);
    }
  }, [open]);
  const mods = matrix.modules.filter((m) => m.active);
  const lines = useMemo(() => buildLines(matrix, pick, scenario), [matrix, pick, scenario]);
  const toggle = (c: string) => setPick((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  const create = async () => {
    setBusy(true);
    try {
      const r = await api<{ budget: { id: string } }>('/budgets', {
        client: client.trim(),
        scenario,
        modules: pick,
      });
      onCreated(r.budget.id);
    } catch {
      toast({ message: t('bg_fail'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const d = (m: BudgetModule) => {
    const c = m.days.CONS;
    return (scenario === 'gf' ? c?.gf : c?.bf) ?? 0;
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('bg_newT')}
      subtitle={t('bg_newS')}
      closeLabel={t('ui_close')}
      className="kh-bg-modal"
      footer={
        <div className="kh-bg-foot">
          <button type="button" className="kh-btn kh-btn--ghost" onClick={onClose}>
            {t('bg_cancel')}
          </button>
          <button
            type="button"
            className="kh-btn kh-btn--primary"
            disabled={busy || !client.trim() || !pick.length}
            onClick={() => void create()}
          >
            {t('bg_create')}
          </button>
        </div>
      }
    >
      <div className="kh-bg-new-head">
        <label className="kh-field">
          <span className="kh-field__label">{t('bg_client')}</span>
          <input
            className="kh-input"
            value={client}
            maxLength={200}
            placeholder={t('bg_clientPh')}
            onChange={(e) => setClient(e.target.value)}
            autoFocus
          />
        </label>
        <div className="kh-field">
          <span className="kh-field__label">{t('bg_scenario')}</span>
          <div
            className="kh-sap-seg"
            role="radiogroup"
            aria-label={t('bg_scenario')}
            style={{ alignSelf: 'start' }}
          >
            {(['gf', 'bf'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={scenario === s}
                data-on={scenario === s || undefined}
                onClick={() => setScenario(s)}
              >
                {t(`bg_${s}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
      {!mods.length && <p className="kh-bg-hint">{t('bg_noModules')}</p>}
      {groupsOf(mods).map(([g, list]) => (
        <div key={g}>
          <div className="kh-bg-gl">{g}</div>
          <div className="kh-bg-mods">
            {list.map((m) => (
              <button
                key={m.code}
                type="button"
                className="kh-bg-mod"
                aria-pressed={pick.includes(m.code)}
                onClick={() => toggle(m.code)}
              >
                <span className="bx" aria-hidden>
                  {pick.includes(m.code) ? '✓' : ''}
                </span>
                <span className="kh-bg-code">{m.code}</span>
                <span>{m.name}</span>
                <span className="d">{d(m)} d</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="kh-bg-sum" aria-live="polite">
        <span>
          {t('bg_modules')}
          <b>{pick.length}</b>
        </span>
        <span>
          {t('bg_lines')}
          <b>{lines.length}</b>
        </span>
        <span>
          {t('bg_days')}
          <b>{totalDays(lines)}</b>
        </span>
        <span>
          {t('bg_costEst')}
          <b>{eur(totalCost(lines))}</b>
        </span>
      </div>
      {pick.length > 0 && !lines.length && <p className="kh-bg-hint">{t('bg_noDays')}</p>}
    </Modal>
  );
}

// ---------------------------------------------------------- Alimentar valores

const blank = (): BudgetModule => ({
  code: '',
  name: '',
  group: '',
  label: '',
  rate: 375,
  active: true,
  days: {},
});

export function FeedDialog({
  open,
  matrix,
  start,
  onClose,
  onSaved,
}: {
  open: boolean;
  matrix: Matrix;
  start: string | null;
  onClose: () => void;
  onSaved: (s: Settings) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [draft, setDraft] = useState<Matrix>(matrix);
  const [sel, setSel] = useState(0);
  const [pane, setPane] = useState<'mod' | 'prof'>('mod');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setDraft(structuredClone(matrix));
    setSel(
      Math.max(
        0,
        matrix.modules.findIndex((m) => m.code === start),
      ),
    );
    setPane('mod');
  }, [open, matrix, start]);
  const mod = draft.modules[sel];
  const setMod = (f: (m: BudgetModule) => BudgetModule) =>
    setDraft((d) => ({ ...d, modules: d.modules.map((m, i) => (i === sel ? f(m) : m)) }));
  const setCell = (key: string, k: 'gf' | 'bf' | 'n', v: string) =>
    setMod((m) => {
      const c = m.days[key] ?? { gf: null, bf: null, n: 1 };
      const next = { ...c, [k]: k === 'n' ? Math.max(1, Math.round(numIn(v)) || 1) : optNum(v) };
      const days = { ...m.days, [key]: next };
      if (next.gf === null && next.bf === null && next.n === 1) delete days[key];
      return { ...m, days };
    });
  const codes = draft.modules.map((m) => m.code.trim().toUpperCase());
  const bad =
    draft.modules.some((m) => !/^[A-Za-z0-9_-]{1,12}$/.test(m.code.trim()) || !m.name.trim()) ||
    new Set(codes).size !== codes.length;
  const save = async () => {
    setBusy(true);
    try {
      const matrixOut: Matrix = {
        ...draft,
        modules: draft.modules.map((m) => ({ ...m, code: m.code.trim().toUpperCase(), name: m.name.trim() })),
      };
      const r = await api<{ settings: Settings }>('/budgets/settings', { matrix: matrixOut }, 'PUT');
      onSaved(r.settings);
      toast({ message: t('bg_saved'), tone: 'success' });
    } catch {
      toast({ message: t('bg_fail'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const fill = (label: string, m: BudgetModule) =>
    label.replace(/\{code\}/g, m.code || '…').replace(/\{name\}/g, m.name || '…');
  const blockLabel = (b: Block) => t(`bg_b_${b}`);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('bg_feedT')}
      subtitle={t('bg_feedS')}
      closeLabel={t('ui_close')}
      className="kh-bg-modal"
      footer={
        <div className="kh-bg-foot">
          <button
            type="button"
            className="kh-btn kh-btn--ghost"
            onClick={() => setPane((p) => (p === 'mod' ? 'prof' : 'mod'))}
          >
            {pane === 'mod' ? t('bg_profiles') : t('bg_backModules')}
          </button>
          <span className="sp" />
          <button type="button" className="kh-btn kh-btn--ghost" onClick={onClose}>
            {t('bg_cancel')}
          </button>
          <button
            type="button"
            className="kh-btn kh-btn--primary"
            disabled={busy || bad}
            onClick={() => void save()}
          >
            {t('bg_saveMatrix')}
          </button>
        </div>
      }
    >
      {pane === 'prof' ? (
        <div>
          <div className="kh-bg-pp kh-bg-pr h">
            <span>{t('bg_pLabel')}</span>
            <span>{t('bg_pType')}</span>
            <span>{t('bg_pBlock')}</span>
            <span style={{ textAlign: 'right' }}>{t('bg_rate')}</span>
          </div>
          {draft.profiles.map((p, i) => (
            <div key={p.key} className="kh-bg-pp">
              <input
                className="kh-bg-in"
                data-t
                value={p.label}
                maxLength={200}
                aria-label={t('bg_pLabel')}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    profiles: d.profiles.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                  }))
                }
              />
              <input
                className="kh-bg-in"
                data-t
                value={p.type}
                maxLength={60}
                aria-label={t('bg_pType')}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    profiles: d.profiles.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)),
                  }))
                }
              />
              <span className="kh-bg-blk">{blockLabel(p.block)}</span>
              {p.mode === 'module' ? (
                <span className="kh-bg-dim" style={{ fontSize: 12, textAlign: 'right' }}>
                  {t('bg_perModuleRate')}
                </span>
              ) : (
                <input
                  className="kh-bg-in"
                  inputMode="decimal"
                  value={String(p.rate)}
                  aria-label={t('bg_rate')}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      profiles: d.profiles.map((x, j) =>
                        j === i ? { ...x, rate: numIn(e.target.value) } : x,
                      ),
                    }))
                  }
                />
              )}
            </div>
          ))}
          <p className="kh-bg-hint">{t('bg_profilesHint')}</p>
        </div>
      ) : (
        <div className="kh-bg-feed">
          <div className="kh-bg-ml" role="list">
            {draft.modules.map((m, i) => (
              <button
                key={i}
                type="button"
                role="listitem"
                aria-current={i === sel}
                data-off={!m.active || undefined}
                onClick={() => setSel(i)}
              >
                <span className="kh-bg-code">{m.code || '…'}</span>
                {m.name || t('bg_newModule')}
              </button>
            ))}
            <button
              type="button"
              className="kh-bg-dim"
              onClick={() => {
                setDraft((d) => ({ ...d, modules: [...d.modules, { ...blank(), group: mod?.group ?? '' }] }));
                setSel(draft.modules.length);
              }}
            >
              + {t('bg_addModule')}
            </button>
          </div>
          {mod ? (
            <div>
              <div className="kh-bg-fm">
                <label className="kh-field">
                  <span className="kh-field__label">{t('bg_code')}</span>
                  <input
                    className="kh-input"
                    value={mod.code}
                    maxLength={12}
                    onChange={(e) => setMod((m) => ({ ...m, code: e.target.value.toUpperCase() }))}
                  />
                </label>
                <label className="kh-field">
                  <span className="kh-field__label">{t('bg_module')}</span>
                  <input
                    className="kh-input"
                    value={mod.name}
                    maxLength={120}
                    onChange={(e) => setMod((m) => ({ ...m, name: e.target.value }))}
                  />
                </label>
                <label className="kh-field">
                  <span className="kh-field__label">{t('bg_group')}</span>
                  <input
                    className="kh-input"
                    value={mod.group}
                    maxLength={80}
                    onChange={(e) => setMod((m) => ({ ...m, group: e.target.value }))}
                  />
                </label>
              </div>
              <div className="kh-bg-fm2">
                <label className="kh-field">
                  <span className="kh-field__label">{t('bg_label')}</span>
                  <input
                    className="kh-input"
                    value={mod.label}
                    maxLength={200}
                    placeholder={fill(draft.profiles[0]?.label ?? '', mod)}
                    onChange={(e) => setMod((m) => ({ ...m, label: e.target.value }))}
                  />
                </label>
                <label className="kh-field">
                  <span className="kh-field__label">{t('bg_rate')}</span>
                  <input
                    className="kh-input"
                    inputMode="decimal"
                    style={{ textAlign: 'right' }}
                    value={String(mod.rate)}
                    onChange={(e) => setMod((m) => ({ ...m, rate: numIn(e.target.value) }))}
                  />
                </label>
                <div className="kh-field" style={{ alignItems: 'center' }}>
                  <span className="kh-field__label">{t('bg_active')}</span>
                  <Switch
                    checked={mod.active}
                    label={t('bg_active')}
                    onChange={(v) => setMod((m) => ({ ...m, active: v }))}
                  />
                </div>
              </div>
              <div className="kh-bg-pr h">
                <span>{t('bg_profile')}</span>
                <span>{t('bg_pBlock')}</span>
                <span>{t('bg_gf')}</span>
                <span>{t('bg_bf')}</span>
                <span>{t('bg_consult')}</span>
              </div>
              {draft.profiles.map((p) => {
                const c = mod.days[p.key];
                const name = p.mode === 'module' ? mod.label || fill(p.label, mod) : fill(p.label, mod);
                return (
                  <div key={p.key} className="kh-bg-pr">
                    <span style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {name}
                    </span>
                    <span className="kh-bg-blk">{blockLabel(p.block)}</span>
                    {(['gf', 'bf'] as const).map((k) => (
                      <input
                        key={k}
                        className="kh-bg-in"
                        inputMode="decimal"
                        placeholder="0"
                        aria-label={`${name} · ${t(`bg_${k}`)}`}
                        value={c?.[k] ?? ''}
                        onChange={(e) => setCell(p.key, k, e.target.value)}
                      />
                    ))}
                    <input
                      className="kh-bg-in"
                      inputMode="numeric"
                      aria-label={`${name} · ${t('bg_consult')}`}
                      value={String(c?.n ?? 1)}
                      onChange={(e) => setCell(p.key, 'n', e.target.value)}
                    />
                  </div>
                );
              })}
              <p className="kh-bg-hint">{t('bg_feedHint')}</p>
              <button
                type="button"
                className="kh-btn kh-btn--sm kh-btn--ghost"
                style={{ marginTop: 10 }}
                onClick={() => {
                  setDraft((d) => ({ ...d, modules: d.modules.filter((_, i) => i !== sel) }));
                  setSel((s) => Math.max(0, s - 1));
                }}
              >
                {t('bg_removeModule')}
              </button>
            </div>
          ) : (
            <p className="kh-bg-hint">{t('bg_noModules')}</p>
          )}
        </div>
      )}
      {bad && (
        <p className="kh-bg-hint" style={{ color: 'oklch(0.8 0.15 30)' }}>
          {t('bg_badModules')}
        </p>
      )}
    </Modal>
  );
}

// -------------------------------------------------------------- Mapear modelo

type Role =
  | { k: 'field'; f: 'client' | 'ref' }
  | { k: 'col'; c: (typeof MAP_COLS)[number] }
  | { k: 'from' | 'to'; b: Block };

export function MapDialog({
  open,
  mapping,
  onClose,
  onSaved,
}: {
  open: boolean;
  mapping: Mapping | null;
  onClose: () => void;
  onSaved: (s: Settings) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [prev, setPrev] = useState<Preview | null>(null);
  const [draft, setDraft] = useState<Mapping | null>(mapping);
  const [pop, setPop] = useState<{ r: number; c: string; x: number; y: number; up: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const load = (sheet?: string) =>
    api<{ preview: Preview }>(
      `/budgets/template/preview${sheet ? `?sheet=${encodeURIComponent(sheet)}` : ''}`,
    )
      .then((r) => setPrev(r.preview))
      .catch(() => toast({ message: t('bg_fail'), tone: 'error' }));
  useEffect(() => {
    if (!open) return;
    setDraft(mapping ? structuredClone(mapping) : null);
    setPop(null);
    void load(mapping?.sheet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (prev && (!draft || draft.sheet !== prev.sheet))
      setDraft((d) =>
        d && d.sheet === prev.sheet ? d : { sheet: prev.sheet, fields: {}, cols: {}, blocks: {} },
      );
  }, [prev, draft]);
  const kind = (r: number, c: string): string | undefined => {
    if (!draft) return undefined;
    if (draft.fields.client === `${c}${r}` || draft.fields.ref === `${c}${r}`) return 'hd';
    for (const b of BLOCKS) {
      const x = draft.blocks[b];
      if (x && r >= x.from && r <= x.to) return b;
    }
    return undefined;
  };
  const mappedCols = new Set(Object.values(draft?.cols ?? {}));
  const apply = (role: Role) => {
    if (!pop || !draft) return;
    const d: Mapping = structuredClone(draft);
    if (role.k === 'field') d.fields[role.f] = `${pop.c}${pop.r}`;
    else if (role.k === 'col') d.cols[role.c] = pop.c;
    else {
      const cur = d.blocks[role.b] ?? { from: pop.r, to: pop.r };
      const nb =
        role.k === 'from'
          ? { from: pop.r, to: Math.max(pop.r, cur.to) }
          : { from: Math.min(cur.from, pop.r), to: pop.r };
      d.blocks[role.b] = nb;
    }
    setDraft(d);
    setPop(null);
  };
  const clearAt = () => {
    if (!pop || !draft) return;
    const d: Mapping = structuredClone(draft);
    for (const f of ['client', 'ref'] as const) if (d.fields[f] === `${pop.c}${pop.r}`) delete d.fields[f];
    for (const b of BLOCKS) {
      const x = d.blocks[b];
      if (x && pop.r >= x.from && pop.r <= x.to) delete d.blocks[b];
    }
    setDraft(d);
    setPop(null);
  };
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const r = await api<{ settings: Settings }>('/budgets/settings', { mapping: draft }, 'PUT');
      onSaved(r.settings);
      toast({ message: t('bg_saved'), tone: 'success' });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      toast({ message: t(code === 'blocks_overlap' ? 'bg_overlap' : 'bg_fail'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const cols = prev ? Array.from({ length: Math.max(prev.maxCol, 6) }, (_, i) => colName(i + 1)) : [];
  const colsLbl = (c: string) =>
    MAP_COLS.filter((k) => draft?.cols[k] === c)
      .map((k) => t(`bg_c_${k}`))
      .join(' · ');
  const missing = (draft ? MAP_COLS.filter((k) => !draft.cols[k]) : []).map((k) => t(`bg_c_${k}`));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('bg_mapT')}
      subtitle={t('bg_mapS')}
      closeLabel={t('ui_close')}
      className="kh-bg-modal"
      footer={
        <div className="kh-bg-foot">
          <button type="button" className="kh-btn kh-btn--ghost" onClick={onClose}>
            {t('bg_cancel')}
          </button>
          <button
            type="button"
            className="kh-btn kh-btn--primary"
            disabled={busy || !draft}
            onClick={() => void save()}
          >
            {t('bg_saveMap')}
          </button>
        </div>
      }
    >
      {prev && prev.sheets.length > 1 && (
        <div style={{ width: 260, marginBottom: 12 }}>
          <Select
            value={prev.sheet}
            options={prev.sheets.map((s) => ({ value: s, label: s }))}
            onChange={(s) => void load(s)}
            searchPlaceholder={t('bg_sheet')}
            aria-label={t('bg_sheet')}
          />
        </div>
      )}
      <div className="kh-bg-map">
        <div className="kh-bg-sheet" ref={box} onScroll={() => setPop(null)}>
          {prev ? (
            <table className="kh-bg-xl">
              <thead>
                <tr>
                  <th className="rn" />
                  {cols.map((c) => (
                    <th key={c} data-col={mappedCols.has(c) || undefined} title={colsLbl(c) || undefined}>
                      {c}
                      {colsLbl(c) ? ` · ${colsLbl(c)}` : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {prev.rows.map((row) => (
                  <tr key={row.r}>
                    <td className="rn">{row.r}</td>
                    {cols.map((c) => {
                      const cell = row.cells[c];
                      const k = kind(row.r, c);
                      return (
                        <td
                          key={c}
                          className={`click${cell?.f ? ' f' : ''}${pop?.r === row.r && pop.c === c ? ' sel' : ''}`}
                          data-k={k === 'hd' ? 'hd' : k && mappedCols.has(c) ? k : undefined}
                          title={cell?.v}
                          onClick={(e) => {
                            const el = box.current!;
                            const host = el.getBoundingClientRect();
                            const td = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            const x = Math.min(td.left - host.left + el.scrollLeft, el.scrollWidth - 240);
                            // near the bottom of the sheet: the menu opens above the cell
                            const up = td.bottom - host.top > el.clientHeight - 330;
                            setPop({
                              r: row.r,
                              c,
                              x: Math.max(0, x),
                              y: (up ? td.top : td.bottom) - host.top + el.scrollTop + (up ? -2 : 2),
                              up,
                            });
                          }}
                        >
                          {cell?.v ?? ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="kh-bg-hint">{t('bg_loading')}</p>
          )}
          {pop && (
            <div
              className="kh-bg-pop"
              style={{ left: pop.x, top: pop.y, transform: pop.up ? 'translateY(-100%)' : undefined }}
              role="menu"
            >
              <b>
                {pop.c}
                {pop.r}
              </b>
              {(['client', 'ref'] as const).map((f) => (
                <button key={f} type="button" role="menuitem" onClick={() => apply({ k: 'field', f })}>
                  {t('bg_cellIs')} {t(`bg_f_${f}`)}
                </button>
              ))}
              <b>{t('bg_colIs').replace('{c}', pop.c)}</b>
              {MAP_COLS.map((c) => (
                <button key={c} type="button" role="menuitem" onClick={() => apply({ k: 'col', c })}>
                  {t(`bg_c_${c}`)}
                </button>
              ))}
              <b>{t('bg_rowIs').replace('{r}', String(pop.r))}</b>
              {BLOCKS.flatMap((b) =>
                (['from', 'to'] as const).map((k) => (
                  <button key={b + k} type="button" role="menuitem" onClick={() => apply({ k, b })}>
                    {t(`bg_${k}`).replace('{b}', t(`bg_b_${b}`))}
                  </button>
                )),
              )}
              <button type="button" role="menuitem" onClick={clearAt}>
                {t('bg_clear')}
              </button>
              <button type="button" role="menuitem" onClick={() => setPop(null)}>
                {t('bg_cancel')}
              </button>
            </div>
          )}
        </div>
        <div className="kh-bg-side">
          <div className="kh-bg-card" data-miss={!draft?.fields.client || undefined}>
            <b>
              <i style={{ background: '#ede9fe' }} />
              {t('bg_header')}
            </b>
            <span>
              {t('bg_f_client')} → {draft?.fields.client ?? '—'} · {t('bg_f_ref')} →{' '}
              {draft?.fields.ref ?? '—'}
            </span>
          </div>
          <div className="kh-bg-card" data-miss={missing.length ? true : undefined}>
            <b>{t('bg_cols')}</b>
            <span>{MAP_COLS.map((k) => `${draft?.cols[k] ?? '—'} ${t(`bg_c_${k}`)}`).join(' · ')}</span>
          </div>
          {BLOCKS.map((b) => {
            const x = draft?.blocks[b];
            return (
              <div key={b} className="kh-bg-card" data-miss={!x || undefined}>
                <b>
                  <i
                    style={{
                      background: b === 'services' ? '#dbeafe' : b === 'mgmt' ? '#dcfce7' : '#fce7f3',
                    }}
                  />
                  {t(`bg_b_${b}`)}
                </b>
                <span>
                  {x
                    ? t('bg_rows').replace('{a}', String(x.from)).replace('{z}', String(x.to))
                    : t('bg_notMapped')}
                </span>
              </div>
            );
          })}
          <p className="kh-bg-hint" style={{ margin: 0 }}>
            {t('bg_mapHint')}
          </p>
        </div>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------- the Excel preview

export function ExcelDialog({
  open,
  mapping,
  client,
  refName,
  lines,
  onClose,
  onDownload,
  busy,
}: {
  open: boolean;
  mapping: Mapping;
  client: string;
  refName: string;
  lines: Line[];
  onClose: () => void;
  onDownload: () => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  const places = placeLines(mapping, lines).sort((a, z) => a.from - z.from);
  const c = mapping.cols;
  const field = (f: 'client' | 'ref') => {
    const m = mapping.fields[f] ? CELL_RE.exec(mapping.fields[f]) : null;
    return m ? `${m[1]}${m[2]}` : null;
  };
  let offset = 0;
  const shown = [c.days, c.desc, c.type, c.count, c.rate]
    .filter(Boolean)
    .sort((a, z) => colNum(a!) - colNum(z!));
  const val = (l: Line | undefined, col: string) =>
    !l
      ? ''
      : col === c.days
        ? l.days
        : col === c.desc
          ? l.desc
          : col === c.type
            ? l.type
            : col === c.count
              ? l.count
              : col === c.rate
                ? l.rate.toLocaleString('pt-PT')
                : '';
  const inserted = places.reduce((s, p) => s + p.extra, 0);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('bg_xlT')}
      subtitle={t('bg_xlS')}
      closeLabel={t('ui_close')}
      className="kh-bg-modal"
      footer={
        <div className="kh-bg-foot">
          <button type="button" className="kh-btn kh-btn--ghost" onClick={onClose}>
            {t('bg_close')}
          </button>
          <button type="button" className="kh-btn kh-btn--primary" disabled={busy} onClick={onDownload}>
            ⤓ {t('bg_download')}
          </button>
        </div>
      }
    >
      <div className="kh-bg-sheet" style={{ maxHeight: 460 }}>
        <table className="kh-bg-xl">
          <thead>
            <tr>
              <th className="rn" />
              {shown.map((col) => (
                <th key={col}>
                  {col} ·{' '}
                  {MAP_COLS.filter((k) => c[k] === col)
                    .map((k) => t(`bg_c_${k}`))
                    .join(' · ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(['client', 'ref'] as const).map((f) =>
              field(f) ? (
                <tr key={f}>
                  <td className="rn">{field(f)!.replace(/^[A-Z]+/, '')}</td>
                  <td className="in" colSpan={shown.length}>
                    {field(f)} · {f === 'client' ? client : refName}
                  </td>
                </tr>
              ) : null,
            )}
            {places.map((p) => {
              const rows = p.to - p.from + 1 + p.extra;
              const start = p.from + offset;
              offset += p.extra;
              return [
                <tr key={p.block}>
                  <td className="rn" />
                  <td colSpan={shown.length}>
                    <b>{t(`bg_b_${p.block}`)}</b>
                  </td>
                </tr>,
                ...Array.from({ length: rows }, (_, i) => {
                  const l = p.lines[i];
                  const isNew = i > p.to - p.from;
                  return (
                    <tr key={`${p.block}${i}`}>
                      <td className="rn">{start + i}</td>
                      {shown.map((col) => (
                        <td
                          key={col}
                          className={`${l ? 'in' : ''}${isNew ? ' new' : ''}${col === c.desc || col === c.type ? '' : ' n'}`}
                        >
                          {val(l, col!)}
                        </td>
                      ))}
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
      <p className="kh-bg-hint">
        {t('bg_xlHint')}
        {inserted > 0 ? ` ${t('bg_xlInserted').replace('{n}', String(inserted))}` : ''}
      </p>
    </Modal>
  );
}

export const PROFILE_COLS = PROFILE_KEYS;
