'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { refreshCounts } from '@/components/shell/counts';
import { api } from '@/lib/client/api';
import { modColor, TX_TYPES, txModules, type TxType } from '@/lib/sap';
import { ResizableTable, useConfirm, usePersistentState, useToast, type Column } from '@/components/ui';
import { useWhen } from '@/components/content/useWhen';
import { useListDetail } from '@/components/content/MobilePane';
import { ModuleCombo } from './ModuleCombo';
import { SidePanel } from './SidePanel';
import './sap.css';

// SAP TCodes — ZNotes.dc.html `isTcodes`: the tenant's transaction library
// (seeded with the prototype catalogue), module chips, type filter, favourites
// per user, copy "/n" + code, and the detail panel.

export type Tcode = {
  id: string;
  code: string;
  description: string;
  module: string;
  program: string;
  type: TxType;
  params: string;
  notes: string;
  fav: boolean;
  uses: number;
  createdAt: string;
  updatedAt: string | null;
};
type Patch = Partial<
  Pick<Tcode, 'code' | 'description' | 'module' | 'program' | 'type' | 'params' | 'notes'>
>;

const STAR = '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"></path>';
const COPY =
  '<rect x="9" y="9" width="11" height="11" rx="2.5"></rect><path d="M5 15V6a2 2 0 0 1 2-2h9"></path>';
const OK = '<path d="M5 12.5l4.5 4.5L19 7.5"></path>';
const Svg = ({ d, s = 14, fill = 'none', w = 1.9 }: { d: string; s?: number; fill?: string; w?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={w}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    dangerouslySetInnerHTML={{ __html: d }}
  />
);

export function copyTcode(code: string) {
  void navigator.clipboard?.writeText(`/n${code}`).catch(() => {});
}

export function TcodesView() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const when = useWhen();
  const pathname = usePathname();
  const sp = useSearchParams();
  const activeId = sp.get('x');
  // phones: list → transaction with ← Voltar; tablets: the panel floats over the list (D70)
  const md = useListDetail('x');
  const [items, setItems] = useState<Tcode[] | null>(null);
  const [mod, setMod] = usePersistentState<string>('tcodes.mod', 'all');
  const [type, setType] = usePersistentState<string>('tcodes.type', 'all');
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const timers = useRef(new Map<string, { tm: ReturnType<typeof setTimeout>; patch: Patch }>());
  const fail = useCallback(() => toast({ message: t('ne_saveFail'), tone: 'error' }), [toast, t]);

  useEffect(() => {
    void api<{ tcodes: Tcode[] }>('/sap/tcodes')
      .then((r) => setItems(r.tcodes))
      .catch(fail);
  }, [fail]);
  useEffect(() => {
    const m = timers.current;
    // leaving or reloading the page sends what is still waiting for the debounce
    const hide = () => {
      for (const [id, p] of m) {
        clearTimeout(p.tm);
        m.delete(id);
        void api(`/sap/tcodes/${id}`, p.patch, 'PATCH').catch(() => {});
      }
    };
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('pagehide', hide);
      hide();
    };
  }, []);

  const open = (id: string | null) => {
    if (!id && md.phone) return md.back();
    const p = new URLSearchParams(sp.toString());
    if (id) p.set('x', id);
    else p.delete('x');
    md.go(`${pathname}${p.size ? `?${p}` : ''}`, id);
  };
  const upd = (id: string, patch: Patch, delay = 500) => {
    setItems(
      (cur) =>
        cur && cur.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x)),
    );
    const prev = timers.current.get(id);
    if (prev) clearTimeout(prev.tm);
    const merged = { ...prev?.patch, ...patch };
    timers.current.set(id, {
      patch: merged,
      tm: setTimeout(() => {
        timers.current.delete(id);
        void api(`/sap/tcodes/${id}`, merged, 'PATCH').catch(fail);
      }, delay),
    });
  };
  const fav = (x: Tcode) => (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setItems((cur) => cur && cur.map((y) => (y.id === x.id ? { ...y, fav: !x.fav } : y)));
    void api(`/sap/tcodes/${x.id}/touch`, { fav: !x.fav }).catch(fail);
  };
  const copy = (x: Tcode) => {
    copyTcode(x.code);
    setCopied(x.id);
    setTimeout(() => setCopied((c) => (c === x.id ? null : c)), 1400);
  };
  const create = async () => {
    try {
      const { tcode } = await api<{ tcode: Tcode }>('/sap/tcodes', {
        module: fMod !== 'all' && fMod !== 'fav' ? fMod : 'BC',
      });
      refreshCounts();
      setItems((cur) => [tcode, ...(cur ?? [])]);
      setQ('');
      open(tcode.id);
    } catch {
      fail();
    }
  };
  const remove = async (x: Tcode) => {
    const ok = await confirm({
      title: t('tr_askTitle'),
      body: t('tr_askBody').replace('{x}', x.code || t('x_new')),
      confirmLabel: t('tr_move'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    timers.current.delete(x.id);
    try {
      await api(`/sap/tcodes/${x.id}`, undefined, 'DELETE');
      refreshCounts();
      setItems((cur) => cur && cur.filter((y) => y.id !== x.id));
      open(null);
    } catch {
      fail();
    }
  };

  const all = items ?? [];
  // built-in modules first, then the ones the tenant created; chips only for those in use
  const mods = txModules(all.map((x) => x.module));
  const modN = new Map<string, number>();
  for (const x of all) modN.set(x.module, (modN.get(x.module) ?? 0) + 1);
  const usedMods = mods.filter((m) => modN.has(m));
  // a remembered module filter whose transactions are all gone shows everything
  const fMod = mod === 'all' || mod === 'fav' || !items || modN.has(mod) ? mod : 'all';
  const query = q.trim().toLowerCase();
  const list = all
    .filter(
      (x) =>
        (fMod === 'all' || (fMod === 'fav' ? x.fav : x.module === fMod)) &&
        (type === 'all' || x.type === type) &&
        (!query ||
          [x.code, x.description, x.program, x.module, x.notes].join(' ').toLowerCase().includes(query)),
    )
    .sort((a, b) => Number(b.fav) - Number(a.fav) || a.code.localeCompare(b.code));
  const act = all.find((x) => x.id === activeId) ?? null;
  const typeLabel = (k: string) => t(`x_ty_${k}`);
  const starBtn = (x: Tcode, big = false) => (
    <button
      type="button"
      className={big ? 'kh-tx-fav kh-tx-fav--big' : 'kh-tx-fav'}
      title={t('x_fav')}
      aria-label={`${t('x_fav')} ${x.code}`}
      aria-pressed={x.fav}
      style={{
        color: x.fav
          ? 'oklch(calc(.86 * var(--lk)) .13 85)'
          : big
            ? 'var(--ink)'
            : 'rgb(var(--t) / calc(.45 * var(--t-k)))',
      }}
      onClick={fav(x)}
    >
      <Svg d={STAR} s={16} fill={x.fav ? 'currentColor' : 'none'} w={1.8} />
    </button>
  );
  const columns: Array<Column<Tcode>> = [
    { key: 'fav', label: '', width: 36, render: (x) => starBtn(x), cellClassName: 'kh-tx-cell0' },
    {
      key: 'code',
      label: t('x_code'),
      width: 120,
      render: (x) => <span className="kh-tx-code">{x.code || '—'}</span>,
    },
    { key: 'desc', label: t('x_desc'), width: 320, grow: true, render: (x) => x.description },
    {
      key: 'mod',
      label: t('x_mod'),
      width: 90,
      render: (x) => (
        <span
          className="kh-tx-mod"
          style={{
            background: modColor(x.module).replace(')', ' / .2)'),
            borderColor: modColor(x.module).replace(')', ' / .5)'),
          }}
        >
          {x.module}
        </span>
      ),
    },
    {
      key: 'prog',
      label: t('x_prog'),
      width: 160,
      render: (x) => <span className="kh-sap-mono kh-tx-dim">{x.program || '—'}</span>,
    },
    {
      key: 'type',
      label: t('x_type'),
      width: 110,
      render: (x) => <span className="kh-tx-dim">{typeLabel(x.type)}</span>,
    },
    {
      key: 'copy',
      label: '',
      width: 48,
      render: (x) => (
        <button
          type="button"
          className="kh-tx-copy"
          title={t('x_copy')}
          aria-label={`${t('x_copy')} ${x.code}`}
          onClick={(e) => {
            e.stopPropagation();
            copy(x);
          }}
        >
          <Svg d={copied === x.id ? OK : COPY} />
        </button>
      ),
    },
  ];
  const chip = (id: string, label: string, dot: string, n: number) => (
    <button
      key={id}
      type="button"
      data-on={fMod === id || undefined}
      aria-pressed={fMod === id}
      onClick={() => setMod(id)}
    >
      <span className="kh-sap-sq" style={{ background: dot }} />
      {label}
      <span className="kh-sap-n">{n}</span>
    </button>
  );

  return (
    <section className="kh-sap" data-pane={md.pane}>
      <div className="kh-sap-main">
        <div className="kh-sap-head">
          <div className="kh-sap-titles">
            <h1>{t('nav_tcodes')}</h1>
            <div>
              {t('x_sub')} · {all.length}
              {all.length === 1 ? t('x_count1') : t('x_countN')}
            </div>
          </div>
          <label className="kh-sap-search">
            <Svg
              d='<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line>'
              s={15}
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('x_search')}
              aria-label={t('x_search')}
            />
          </label>
          <button type="button" className="kh-sap-new" onClick={() => void create()}>
            <Svg
              d='<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>'
              s={15}
            />
            {t('x_new')}
          </button>
        </div>
        <div className="kh-sap-chips">
          {chip('all', t('x_all'), 'rgb(var(--t) / calc(.5 * var(--t-k)))', all.length)}
          {chip('fav', `★ ${t('x_favs')}`, 'oklch(0.86 0.13 85)', all.filter((x) => x.fav).length)}
          {usedMods.map((m) => chip(m, m, modColor(m), modN.get(m)!))}
          <div style={{ flex: 1 }} />
          <select
            className="kh-sap-select kh-tx-typef"
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label={t('x_allTypes')}
          >
            <option value="all">{t('x_allTypes')}</option>
            {TX_TYPES.map((k) => (
              <option key={k} value={k}>
                {typeLabel(k)}
              </option>
            ))}
          </select>
        </div>
        <div className="kh-sap-body">
          <ResizableTable
            id="tcodes"
            className="kh-tx-table"
            columns={columns}
            rows={list}
            rowKey={(x) => x.id}
            onRowClick={(x) => open(x.id)}
            selectedKey={activeId}
            emptyLabel={items ? t('x_empty') : ''}
            resizeLabel={t('resize')}
            minWidth={680}
            card={(x) => (
              <>
                {starBtn(x)}
                <div className="kh-tcard__main">
                  <div className="kh-tcard__t">
                    <span className="kh-tx-code">{x.code || '—'}</span>
                    <span
                      className="kh-tx-mod"
                      style={{
                        background: modColor(x.module).replace(')', ' / .2)'),
                        borderColor: modColor(x.module).replace(')', ' / .5)'),
                      }}
                    >
                      {x.module}
                    </span>
                  </div>
                  <span className="kh-tcard__s">{x.description || '—'}</span>
                  <span className="kh-tcard__m">
                    {x.program && <span className="kh-sap-mono">{x.program}</span>}
                    <span>{typeLabel(x.type)}</span>
                  </span>
                </div>
                <button
                  type="button"
                  className="kh-tcard__btn"
                  title={t('x_copy')}
                  aria-label={`${t('x_copy')} ${x.code}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    copy(x);
                  }}
                >
                  <Svg d={copied === x.id ? OK : COPY} s={17} />
                </button>
              </>
            )}
          />
        </div>
      </div>
      {act && (
        <SidePanel
          id="tcodes"
          def={440}
          min={300}
          resizeLabel={t('resize')}
          onBack={md.back}
          backTitle={act.code || t('x_new')}
        >
          <div className="kh-sap-pbody kh-tx-panel">
            <div className="kh-tx-phead">
              <span className="kh-tx-big">{act.code || t('x_new')}</span>
              {starBtn(act, true)}
              <button type="button" className="kh-tx-copyl" title={t('x_copy')} onClick={() => copy(act)}>
                <Svg d={COPY} />
                {copied === act.id ? t('x_copied') : `/n${act.code}`}
              </button>
              <button
                type="button"
                className="kh-sap-ico kh-sap-ico--x"
                title={t('ui_close')}
                aria-label={t('ui_close')}
                onClick={() => open(null)}
              >
                <Svg d='<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>' />
              </button>
            </div>
            <label className="kh-sap-fld kh-tx-fld">
              <span>{t('x_code')}</span>
              <input
                className="kh-sap-input kh-tx-codein"
                value={act.code}
                placeholder="SE38"
                maxLength={40}
                spellCheck={false}
                onChange={(e) => upd(act.id, { code: e.target.value.toUpperCase().replace(/\s/g, '') })}
              />
            </label>
            <label className="kh-sap-fld kh-tx-fld">
              <span>{t('x_desc')}</span>
              <input
                className="kh-sap-input"
                value={act.description}
                maxLength={300}
                onChange={(e) => upd(act.id, { description: e.target.value })}
              />
            </label>
            <div className="kh-sap-grid2">
              <label className="kh-sap-fld kh-tx-fld">
                <span>{t('x_mod')}</span>
                <ModuleCombo
                  key={act.id}
                  value={act.module}
                  options={mods}
                  onChange={(m) => upd(act.id, { module: m }, 0)}
                />
              </label>
              <label className="kh-sap-fld kh-tx-fld">
                <span>{t('x_type')}</span>
                <select
                  className="kh-sap-select"
                  aria-label={t('x_type')}
                  value={act.type}
                  onChange={(e) => upd(act.id, { type: e.target.value as TxType }, 0)}
                >
                  {TX_TYPES.map((k) => (
                    <option key={k} value={k}>
                      {typeLabel(k)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="kh-sap-fld kh-tx-fld">
              <span>{t('x_prog')}</span>
              <input
                className="kh-sap-input"
                data-mono
                value={act.program}
                placeholder="SAPMV45A"
                maxLength={60}
                spellCheck={false}
                onChange={(e) => upd(act.id, { program: e.target.value.toUpperCase() })}
              />
            </label>
            {(act.type === 'param' || act.type === 'variant') && (
              <label className="kh-sap-fld kh-tx-fld">
                <span>{t('x_params')}</span>
                <input
                  className="kh-sap-input"
                  data-mono
                  value={act.params}
                  placeholder="VIEWNAME=ZV_TABLE; UPDATE=X"
                  maxLength={1000}
                  spellCheck={false}
                  onChange={(e) => upd(act.id, { params: e.target.value })}
                />
              </label>
            )}
            <label className="kh-sap-fld kh-tx-fld">
              <span>{t('x_notes')}</span>
              <textarea
                className="kh-sap-input kh-sap-text kh-tx-notes"
                value={act.notes}
                placeholder={t('x_notesPh')}
                onChange={(e) => upd(act.id, { notes: e.target.value })}
              />
            </label>
            <div className="kh-tx-dates">
              <span>
                <span>{t('dCreated')}</span>
                <span>{when(act.createdAt)}</span>
              </span>
              <span>
                <span>{t('dUpdated')}</span>
                <span>{act.updatedAt ? when(act.updatedAt) : '—'}</span>
              </span>
            </div>
            <button type="button" className="kh-tx-del" onClick={() => void remove(act)}>
              {t('x_delete')}
            </button>
          </div>
        </SidePanel>
      )}
    </section>
  );
}
