'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { DEFAULT_SAP_NEWS_SOURCES, SAP_NEWS_COLORS } from '@/lib/news';
import type { SapNewsSource } from '@/lib/prefs';
import { usePref } from '@/components/shell/PrefsProvider';
import { refreshCounts } from '@/components/shell/counts';
import { useToast } from '@/components/ui';
import './news.css';

// SAP News — SapNews.dc.html: cards from the user's SAP feeds (read on the
// server, article HTML sanitised there), reader, "Guardadas para mais tarde"
// and the sources dialog. Sources are a synced preference; saved items are
// private to the user.

type Item = {
  id: string;
  src: string;
  title: string;
  link: string;
  date: string;
  author: string;
  img: string;
  excerpt: string;
  html: string;
};

function Dialog({
  label,
  width,
  maxHeight,
  onClose,
  children,
  className,
}: {
  label: string;
  width: number;
  maxHeight?: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      prev?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className="kh-nw-dim" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`kh-nw-dlg ${className ?? ''}`}
        style={{ width: `min(${width}px, 100%)`, maxHeight }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

const Bookmark = ({ on, size = 12 }: { on: boolean; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={on ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 3h12v18l-6-4-6 4z" />
  </svg>
);
const X = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export function NewsView() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [srcPref, setSrcPref] = usePref<SapNewsSource[] | undefined>('sapNewsSources', undefined);
  const sources = srcPref ?? DEFAULT_SAP_NEWS_SOURCES;
  const [items, setItems] = useState<Item[]>([]);
  const [ts, setTs] = useState('');
  const [loading, setLoading] = useState(true);
  const [errs, setErrs] = useState<string[]>([]);
  const [errX, setErrX] = useState(false);
  const [saved, setSaved] = useState<Item[]>([]);
  const [f, setF] = useState('all');
  const [q, setQ] = useState('');
  const [reading, setReading] = useState<Item | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const [srcOpen, setSrcOpen] = useState(false);
  const [nName, setNName] = useState('');
  const [nUrl, setNUrl] = useState('');
  const [spin, setSpin] = useState(0);
  const srcKey = JSON.stringify(sources.filter((s) => s.on).map((s) => s.url));

  const load = useCallback(
    async (fresh = false) => {
      setSpin((s) => s + 360);
      setErrX(false);
      try {
        const r = await api<{ items: Item[]; failed: string[]; ts: string }>(
          `/news/sap${fresh ? '?refresh=1' : ''}`,
        );
        setItems((cur) => (r.items.length ? r.items : cur));
        setErrs(r.failed);
        if (r.items.length) setTs(r.ts);
      } catch {
        setErrs([t('nw_sources')]);
      } finally {
        setLoading(false);
      }
    },
    [t],
  );
  // reload when the enabled sources change (the pref save is debounced)
  useEffect(() => {
    const h = setTimeout(() => void load(), 700);
    return () => clearTimeout(h);
  }, [load, srcKey]);
  useEffect(() => {
    api<{ items: Item[] }>('/news/saved')
      .then((r) => setSaved(r.items))
      .catch(() => {});
  }, []);

  const SB = Object.fromEntries(sources.map((s) => [s.id, s]));
  const srcOf = (id: string) => SB[id] ?? { name: id, color: 'oklch(0.8 0 0)' };
  const fmt = (d: string) => {
    const tm = Date.parse(d);
    return tm
      ? new Date(tm).toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : '';
  };
  const ph = (src: string) =>
    `linear-gradient(135deg,${srcOf(src).color.replace(')', ' / .55)')},rgba(255,255,255,.06))`;
  const isSaved = (x: Item) => saved.some((y) => y.link === x.link);
  const toggleSave = async (x: Item) => {
    const was = isSaved(x);
    setSaved((s) => (was ? s.filter((y) => y.link !== x.link) : [x, ...s]));
    try {
      if (was) await api('/news/saved', { link: x.link }, 'DELETE');
      else {
        const { title, link, src, date, author, img, excerpt, html } = x;
        await api('/news/saved', {
          title,
          link,
          src,
          date,
          author,
          img,
          excerpt: excerpt.slice(0, 400),
          html,
        });
      }
      refreshCounts();
    } catch {
      setSaved((s) => (was ? [x, ...s] : s.filter((y) => y.link !== x.link)));
      toast({ message: t('ne_saveFail'), tone: 'error' });
    }
  };
  const setSources = (next: SapNewsSource[]) => setSrcPref(next);
  const addSource = () => {
    const u = nUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(u)) return;
    setSources([
      ...sources,
      {
        id: `s${Date.now()}`,
        name: (nName.trim() || u.replace(/^https?:\/\//i, '').split('/')[0]!).slice(0, 60),
        url: u.slice(0, 500),
        color: SAP_NEWS_COLORS[sources.length % SAP_NEWS_COLORS.length]!,
        on: true,
      },
    ]);
    setNName('');
    setNUrl('');
  };

  const active = new Set(sources.filter((s) => s.on).map((s) => s.id));
  const query = q.trim().toLowerCase();
  const list = items.filter(
    (x) =>
      active.has(x.src) &&
      (f === 'all' || x.src === f) &&
      (!query || `${x.title} ${x.excerpt}`.toLowerCase().includes(query)),
  );
  const time = ts
    ? new Date(ts).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'pt-PT', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
  const sub = `${active.size} ${t('nw_sources').toLowerCase()}${time ? ` · ${t('nw_updated')}${time}` : ''}`;
  const chips = [{ id: 'all', name: t('nw_all'), color: '' }, ...sources.filter((s) => s.on)];

  return (
    <section className="kh-nw">
      <div className="kh-nw-head">
        <div className="kh-nw-top">
          <div className="kh-nw-title">
            <h1>SAP News</h1>
            <span>{sub}</span>
          </div>
          <label className="kh-nw-search">
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
              placeholder={t('nw_search')}
              aria-label={t('nw_search')}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="kh-nw-round"
            title={t('nw_refresh')}
            aria-label={t('nw_refresh')}
            onClick={() => void load(true)}
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
              style={{ transform: `rotate(${spin}deg)`, transition: 'transform .6s' }}
              aria-hidden="true"
            >
              <path d="M20 11a8 8 0 1 0-2.3 5.7" />
              <path d="M20 4v7h-7" />
            </svg>
          </button>
          <button
            type="button"
            className="kh-nw-round"
            title={t('nw_sources')}
            aria-label={t('nw_sources')}
            onClick={() => setSrcOpen(true)}
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
              <path d="M4 11a9 9 0 0 1 9 9" />
              <path d="M4 4a16 16 0 0 1 16 16" />
              <circle cx="5" cy="19" r="1.2" />
            </svg>
          </button>
          <button type="button" className="kh-nw-savedbtn" onClick={() => setSavedOpen(true)}>
            <Bookmark on size={14} />
            {t('nw_saved')}
            <span>{saved.length}</span>
          </button>
        </div>
        <div className="kh-nw-chips" role="group" aria-label={t('nw_sources')}>
          {chips.map((s) => {
            const on = f === s.id;
            const n =
              s.id === 'all'
                ? items.filter((x) => active.has(x.src)).length
                : items.filter((x) => x.src === s.id).length;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                data-on={on || undefined}
                onClick={() => setF(s.id)}
              >
                {s.id !== 'all' && <span className="kh-nw-dot" style={{ background: s.color }} />}
                {s.name}
                <span className="kh-nw-n">{n}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="kh-nw-body">
        {loading && !items.length && <div className="kh-nw-msg">{t('nw_loading')}</div>}
        {errs.length > 0 && !errX && (
          <div className="kh-nw-err" role="status">
            <span>
              {t('nw_err')}
              {errs.join(', ')}
            </span>
            <button type="button" aria-label={t('nw_errX')} onClick={() => setErrX(true)}>
              ×
            </button>
          </div>
        )}
        <div className="kh-nw-grid">
          {list.map((x) => {
            const s = srcOf(x.src);
            const sv = isSaved(x);
            return (
              <article key={x.link} className="kh-nw-card">
                <div className="kh-nw-img" style={{ background: ph(x.src) }} onClick={() => setReading(x)}>
                  {x.img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={x.img} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="kh-nw-imgname">{s.name}</span>
                  )}
                  <span className="kh-nw-src">
                    <span className="kh-nw-dot" style={{ background: s.color, width: 7, height: 7 }} />
                    {s.name}
                  </span>
                </div>
                <div className="kh-nw-cbody">
                  <span className="kh-nw-date">{fmt(x.date)}</span>
                  <h2 className="kh-nw-ctitle">
                    <button type="button" onClick={() => setReading(x)}>
                      {x.title}
                    </button>
                  </h2>
                  <span className="kh-nw-excerpt">{x.excerpt}</span>
                  <div className="kh-nw-cacts">
                    <button type="button" className="kh-nw-read" onClick={() => setReading(x)}>
                      {t('nw_read')}
                    </button>
                    <button
                      type="button"
                      className="kh-nw-save"
                      data-on={sv || undefined}
                      aria-pressed={sv}
                      onClick={() => void toggleSave(x)}
                    >
                      <Bookmark on={sv} />
                      {sv ? t('nw_savedLbl') : t('nw_save')}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {!loading && !list.length && <div className="kh-nw-msg">{t('nw_empty')}</div>}
      </div>

      {reading && (
        <Dialog label={reading.title} width={820} maxHeight="100%" onClose={() => setReading(null)}>
          <div className="kh-nw-rhead">
            <span className="kh-nw-rsrc">
              <span
                className="kh-nw-dot"
                style={{ background: srcOf(reading.src).color, width: 7, height: 7 }}
              />
              {srcOf(reading.src).name}
            </span>
            <span className="kh-nw-rmeta">
              {[fmt(reading.date), reading.author ? t('nw_by') + reading.author : '']
                .filter(Boolean)
                .join(' · ')}
            </span>
            <button
              type="button"
              className="kh-nw-rbtn"
              data-on={isSaved(reading) || undefined}
              onClick={() => void toggleSave(reading)}
            >
              <Bookmark on={isSaved(reading)} />
              {isSaved(reading) ? t('nw_savedLbl') : t('nw_save')}
            </button>
            <a className="kh-nw-rbtn" href={reading.link} target="_blank" rel="noopener noreferrer">
              {t('nw_original')} ↗
            </a>
            <button
              type="button"
              className="kh-nw-x"
              title={t('nw_close')}
              aria-label={t('nw_close')}
              onClick={() => setReading(null)}
            >
              <X />
            </button>
          </div>
          <div className="kh-nw-rscroll">
            <div className="kh-nw-rbody">
              <h2>{reading.title}</h2>
              {/* sanitised on the server (src/server/news/article.ts) */}
              <div
                className="kh-nw-article"
                dangerouslySetInnerHTML={{
                  __html: reading.html || `<p>${reading.excerpt.replace(/</g, '&lt;')}</p>`,
                }}
              />
            </div>
          </div>
        </Dialog>
      )}

      {savedOpen && (
        <Dialog
          label={t('nw_savedTitle')}
          width={620}
          maxHeight="min(720px,100%)"
          onClose={() => setSavedOpen(false)}
        >
          <div className="kh-nw-shead">
            <span>{t('nw_savedTitle')}</span>
            <span className="kh-nw-scount">{saved.length}</span>
            <button
              type="button"
              className="kh-nw-x"
              title={t('nw_close')}
              aria-label={t('nw_close')}
              onClick={() => setSavedOpen(false)}
            >
              <X />
            </button>
          </div>
          <div className="kh-nw-slist">
            {saved.map((x) => {
              const s = srcOf(x.src);
              return (
                <div key={x.link} className="kh-nw-sitem">
                  <div
                    className="kh-nw-sthumb"
                    style={{ background: ph(x.src) }}
                    onClick={() => setReading(x)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {x.img && <img src={x.img} alt="" referrerPolicy="no-referrer" />}
                  </div>
                  <button type="button" className="kh-nw-stext" onClick={() => setReading(x)}>
                    <span>{x.title}</span>
                    <span>
                      <span className="kh-nw-dot" style={{ background: s.color, width: 6, height: 6 }} />
                      {s.name} · {fmt(x.date)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="kh-nw-done"
                    title={t('nw_markRead')}
                    onClick={() => void toggleSave(x)}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12l4.5 4.5L19 7" />
                    </svg>
                    {t('nw_markRead')}
                  </button>
                </div>
              );
            })}
            {!saved.length && <div className="kh-nw-msg kh-nw-msg--sm">{t('nw_noSaved')}</div>}
          </div>
        </Dialog>
      )}

      {srcOpen && (
        <Dialog
          label={t('nw_sources')}
          width={560}
          onClose={() => setSrcOpen(false)}
          className="kh-nw-srcdlg"
        >
          <span className="kh-nw-srctitle">{t('nw_sources')}</span>
          <div className="kh-nw-srcs">
            {sources.map((s) => (
              <div key={s.id} className="kh-nw-srow">
                <button
                  type="button"
                  role="switch"
                  aria-checked={s.on}
                  aria-label={`${t('nw_toggle')}: ${s.name}`}
                  className="kh-nw-tog"
                  data-on={s.on || undefined}
                  onClick={() => setSources(sources.map((x) => (x.id === s.id ? { ...x, on: !x.on } : x)))}
                >
                  <span />
                </button>
                <span className="kh-nw-dot" style={{ background: s.color }} />
                <span className="kh-nw-sinfo">
                  <span>{s.name}</span>
                  <span>{s.url}</span>
                </span>
                <button
                  type="button"
                  className="kh-nw-sdel"
                  title={t('nw_remove')}
                  aria-label={`${t('nw_remove')}: ${s.name}`}
                  onClick={() => setSources(sources.filter((x) => x.id !== s.id))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="kh-nw-sadd">
            <input
              value={nName}
              maxLength={60}
              placeholder={t('nw_srcName')}
              aria-label={t('nw_srcName')}
              onChange={(e) => setNName(e.target.value)}
            />
            <input
              value={nUrl}
              maxLength={500}
              placeholder="https://…/feed"
              aria-label="URL"
              spellCheck={false}
              onChange={(e) => setNUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSource()}
            />
            <button type="button" disabled={sources.length >= 20} onClick={addSource}>
              {t('nw_add')}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
