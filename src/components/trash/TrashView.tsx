'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { useConfirm, useToast } from '@/components/ui';
import { NavIcon } from '@/components/shell/icons';
import { refreshCounts } from '@/components/shell/counts';
import './trash.css';

// ZNotes.dc.html `isTrash`: everything deleted in the app, kept 30 days.
// Today notes and notebooks; other kinds join as their modules arrive.

type Item = { id: string; kind: 'note' | 'folder'; title: string; deletedAt: string; daysLeft: number };
const KINDS: Record<Item['kind'], { label: string; icon: string }> = {
  note: { label: 'h_k_note', icon: 'notes' },
  folder: { label: 'p_folder', icon: 'notes' },
};

function Check({ on }: { on: boolean }) {
  return on ? (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ) : null;
}

export function TrashView() {
  const { t, lang } = useI18n();
  const confirm = useConfirm();
  const toast = useToast();
  const [items, setItems] = useState<Item[] | null>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | Item['kind']>('all');
  const [sel, setSel] = useState<string[]>([]);
  const key = (i: Item) => `${i.kind}:${i.id}`;

  const load = useCallback(
    () =>
      api<{ items: Item[] }>('/trash')
        .then((r) => setItems(r.items))
        .catch(() => setItems([])),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const all = useMemo(() => items ?? [], [items]);
  const kinds = (Object.keys(KINDS) as Item['kind'][]).filter((k) => all.some((i) => i.kind === k));
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter(
      (i) => (kind === 'all' || i.kind === kind) && (!s || i.title.toLowerCase().includes(s)),
    );
  }, [all, kind, q]);
  const ids = list.map(key);
  const allOn = ids.length > 0 && ids.every((id) => sel.includes(id));
  const refs = (keys: string[]) =>
    all.filter((i) => keys.includes(key(i))).map((i) => ({ kind: i.kind, id: i.id }));
  const titleOf = (i: Item | undefined) => i?.title || t('ne_untitled');
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const restore = async (keys: string[]) => {
    try {
      await api('/trash/restore', { items: refs(keys) });
      setSel((s) => s.filter((k) => !keys.includes(k)));
      await load();
      refreshCounts();
    } catch {
      toast({ message: t('ne_saveFail'), tone: 'error' });
    }
  };
  const purge = async (keys: string[] | 'all') => {
    try {
      await api('/trash/purge', keys === 'all' ? { all: true } : { items: refs(keys) });
      setSel((s) => (keys === 'all' ? [] : s.filter((k) => !keys.includes(k))));
      await load();
    } catch {
      toast({ message: t('ne_saveFail'), tone: 'error' });
    }
  };
  const purgeAsk = async (keys: string[]) => {
    const ok = await confirm({
      title: t('tr_purgeTitle'),
      body:
        keys.length === 1
          ? t('tr_purgeBody1').replace('{x}', titleOf(all.find((i) => key(i) === keys[0])))
          : t('tr_purgeBodyN').replace('{n}', String(keys.length)),
      confirmLabel: t('tr_purge'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (ok) await purge(keys);
  };

  const chip = (id: 'all' | Item['kind'], label: string, count: number) => (
    <button
      key={id}
      type="button"
      className="kh-tr-chip"
      data-on={kind === id || undefined}
      onClick={() => setKind(id)}
    >
      {label}
      <span>{count}</span>
    </button>
  );

  return (
    <section className="kh-tr">
      <div className="kh-tr__head">
        <div className="kh-tr__titles">
          <div className="kh-tr__title">{t('nav_trash')}</div>
          <div className="kh-tr__sub">{t('tr_sub')}</div>
        </div>
        <label className="kh-tr__search">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,248,240,.6)"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('tr_search')}
            aria-label={t('tr_search')}
          />
        </label>
        <button
          type="button"
          className="kh-tr__btn"
          style={{ opacity: all.length ? 1 : 0.45 }}
          onClick={async () => {
            if (!all.length) return;
            const ok = await confirm({
              title: t('tr_restoreAsk'),
              body: t('tr_restoreBody').replace('{n}', String(all.length)),
              confirmLabel: t('tr_restoreAll'),
              cancelLabel: t('tr_cancel'),
            });
            if (ok) await restore(all.map(key));
          }}
        >
          {t('tr_restoreAll')}
        </button>
        <button
          type="button"
          className="kh-tr__btn kh-tr__btn--danger"
          style={{ opacity: all.length ? 1 : 0.45 }}
          onClick={async () => {
            if (!all.length) return;
            const ok = await confirm({
              title: t('tr_emptyAsk'),
              body: t('tr_purgeBodyN').replace('{n}', String(all.length)),
              confirmLabel: t('tr_empty'),
              cancelLabel: t('tr_cancel'),
              danger: true,
            });
            if (ok) await purge('all');
          }}
        >
          {t('tr_empty')}
        </button>
      </div>
      <div className="kh-tr__chips">
        {chip('all', t('tr_all'), all.length)}
        {kinds.map((k) => chip(k, t(KINDS[k].label), all.filter((i) => i.kind === k).length))}
      </div>
      {sel.length > 0 && (
        <div className="kh-tr__sel">
          <span>
            {sel.length}
            {sel.length === 1 ? t('tr_sel1') : t('tr_selN')}
          </span>
          <button type="button" className="kh-tr__selRestore" onClick={() => void restore(sel)}>
            {t('tr_restore')}
          </button>
          <button type="button" className="kh-tr__selPurge" onClick={() => void purgeAsk(sel)}>
            {t('tr_purge')}
          </button>
          <button type="button" className="kh-tr__selCancel" onClick={() => setSel([])}>
            {t('tr_cancel')}
          </button>
        </div>
      )}
      <div className="kh-tr__scroll">
        <div className="kh-tr__table" role="table">
          <div className="kh-tr__th" role="row">
            <button
              type="button"
              className="kh-tr__ck"
              data-on={allOn || undefined}
              aria-label={t('tr_all')}
              aria-pressed={allOn}
              onClick={() =>
                setSel(allOn ? sel.filter((id) => !ids.includes(id)) : [...new Set([...sel, ...ids])])
              }
            >
              <Check on={allOn} />
            </button>
            <span>{t('tr_type')}</span>
            <span>{t('tr_item')}</span>
            <span>{t('tr_deleted')}</span>
            <span>{t('tr_left')}</span>
            <span />
          </div>
          {list.map((i) => {
            const k = key(i);
            const on = sel.includes(k);
            return (
              <div key={k} className="kh-tr__row" data-on={on || undefined} role="row">
                <button
                  type="button"
                  className="kh-tr__ck"
                  data-on={on || undefined}
                  aria-label={titleOf(i)}
                  aria-pressed={on}
                  onClick={() => setSel(on ? sel.filter((x) => x !== k) : [...sel, k])}
                >
                  <Check on={on} />
                </button>
                <span>
                  <span className="kh-tr__kind">
                    <span className="kh-tr__kic">
                      <NavIcon id={KINDS[i.kind].icon} />
                    </span>
                    {t(KINDS[i.kind].label)}
                  </span>
                </span>
                <span className="kh-tr__t">{titleOf(i)}</span>
                <span className="kh-tr__at">{fmt(i.deletedAt)}</span>
                <span
                  className="kh-tr__left"
                  style={{ color: i.daysLeft <= 3 ? 'oklch(0.8 0.14 35)' : 'rgba(255,248,240,.7)' }}
                >
                  {i.daysLeft}
                  {i.daysLeft === 1 ? t('tr_day') : t('tr_days')}
                </span>
                <span className="kh-tr__acts">
                  <button
                    type="button"
                    title={t('tr_restore')}
                    aria-label={t('tr_restore')}
                    onClick={() => void restore([k])}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" />
                      <path d="M4 4v4.5h4.5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="kh-tr__purge"
                    title={t('tr_purge')}
                    aria-label={t('tr_purge')}
                    onClick={() => void purgeAsk([k])}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <line x1="6" y1="6" x2="18" y2="18" />
                      <line x1="18" y1="6" x2="6" y2="18" />
                    </svg>
                  </button>
                </span>
              </div>
            );
          })}
          {items && list.length === 0 && (
            <div className="kh-tr__none">
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 7h16" />
                <path d="M9 7V4h6v3" />
                <path d="M6 7l1 13h10l1-13" />
              </svg>
              <span className="kh-tr__noneT">{t('tr_emptyTitle')}</span>
              <span>{t('tr_emptyBody')}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
