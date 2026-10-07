'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { DEV_LANGS, DEV_TYPES, highlight, langOf, type DevLang, type DevType } from '@/lib/devlib';
import { Modal, useConfirm, usePersistentState, useToast } from '@/components/ui';
import { refreshCounts } from '@/components/shell/counts';
import './devlib.css';

// Biblioteca de Código — DevLibrary.dc.html: snippets grouped by language,
// several files each with the prototype's highlighter, related snippets with
// "Voltar a …", favourites, type/language filters.

type File = { id: string; name: string; lang: string; code: string };
type Snippet = {
  id: string;
  title: string;
  type: DevType;
  tags: string[];
  fav: boolean;
  description: string;
  files: File[];
  related: string[];
  createdAt: string;
  updatedAt: string;
};
type Patch = Partial<Pick<Snippet, 'title' | 'type' | 'tags' | 'fav' | 'description' | 'files' | 'related'>>;

const COL = { def: 340, min: 240 };

export function DevLibView() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [colW, setColW] = usePersistentState<number>('devlib.colW', COL.def);
  const [liveCol, setLiveCol] = useState<number | null>(null);
  const [collapsed, setCollapsed] = usePersistentState<Record<string, boolean>>('devlib.col', {});
  const [items, setItems] = useState<Snippet[] | null>(null);
  const [q, setQ] = useState('');
  const [langF, setLangF] = useState('');
  const [typeF, setTypeF] = useState('');
  const [favF, setFavF] = useState(false);
  const [fileId, setFileId] = useState<string | null>(null);
  const [hist, setHist] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [tagsText, setTagsText] = useState<string | null>(null);
  const [nw, setNw] = useState<{ title: string; lang: string; type: DevType; err: string } | null>(null);
  const pending = useRef(new Map<string, { patch: Patch; tm: ReturnType<typeof setTimeout> }>());
  const sectionRef = useRef<HTMLElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutRef = useRef<HTMLPreElement>(null);
  const selId = sp.get('s');

  const lname = useCallback((l: DevLang) => (l.id === 'plain' ? t('dl_plain') : l.name), [t]);
  const tyName = (k: string) => t(`dl_t_${k}`);

  const open = useCallback(
    (id: string | null, push = false) => {
      setHist((h) => (push && selId ? [...h, selId] : push ? h : []));
      setFileId(null);
      setCopied(false);
      setTagsText(null);
      const next = new URLSearchParams(sp.toString());
      if (id) next.set('s', id);
      else next.delete('s');
      router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [path, router, sp, selId],
  );

  useEffect(() => {
    api<{ snippets: Snippet[] }>('/snippets')
      .then((r) => setItems(r.snippets))
      .catch(() => setItems([]));
  }, []);

  // ── Saving (debounced per snippet, fields merged) ─────────────────────────
  const flush = useCallback(
    async (id: string) => {
      const p = pending.current.get(id);
      if (!p) return;
      clearTimeout(p.tm);
      pending.current.delete(id);
      try {
        const { snippet } = await api<{ snippet: Snippet }>(`/snippets/${id}`, p.patch, 'PATCH');
        setItems(
          (cur) =>
            cur &&
            cur.map((x) => {
              if (x.id === id) return { ...x, updatedAt: snippet.updatedAt, related: snippet.related };
              // the server keeps "related" symmetric
              const has = snippet.related.includes(x.id);
              const had = x.related.includes(id);
              if (has && !had) return { ...x, related: [...x.related, id] };
              if (!has && had && p.patch.related) return { ...x, related: x.related.filter((r) => r !== id) };
              return x;
            }),
        );
      } catch {
        toast({ message: t('ne_saveFail'), tone: 'error' });
      }
    },
    [t, toast],
  );
  useEffect(() => {
    const map = pending.current;
    return () => {
      for (const id of [...map.keys()]) void flush(id);
    };
  }, [flush]);
  const upd = (id: string, p: Patch, delay = 500) => {
    setItems((cur) => cur && cur.map((x) => (x.id === id ? { ...x, ...p } : x)));
    const prev = pending.current.get(id);
    if (prev) clearTimeout(prev.tm);
    const merged = { ...(prev?.patch ?? {}), ...p };
    pending.current.set(id, { patch: merged, tm: setTimeout(() => void flush(id), delay) });
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const D = useMemo(() => items ?? [], [items]);
  const query = q.trim().toLowerCase();
  const mainLang = (s: Snippet) => s.files[0]?.lang ?? 'plain';
  const list = D.filter(
    (s) =>
      (!favF || s.fav) &&
      (!typeF || s.type === typeF) &&
      (!langF || s.files.some((f) => f.lang === langF)) &&
      (!query ||
        [s.title, s.description, s.tags.join(' '), ...s.files.map((f) => `${f.name} ${f.code}`)]
          .join(' ')
          .toLowerCase()
          .includes(query)),
  );
  const groups = useMemo(() => {
    const gm = new Map<string, Snippet[]>();
    for (const s of list) {
      const k = mainLang(s);
      gm.set(k, [...(gm.get(k) ?? []), s]);
    }
    return [...gm.entries()].sort((a, b) => lname(langOf(a[0])).localeCompare(lname(langOf(b[0]))));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- list is derived from D/filters
  }, [D, q, langF, typeF, favF, lname]);
  const usedLangs = new Set(D.flatMap((s) => s.files.map((f) => f.lang)));
  const sel = D.find((s) => s.id === selId) ?? null;
  const fa = sel ? (sel.files.find((f) => f.id === fileId) ?? sel.files[0]!) : null;
  const L = fa ? langOf(fa.lang) : null;
  const code = fa?.code ?? '';
  const lines = code.split('\n').length;
  const hl = useMemo(() => (fa && L ? `${highlight(code, L)}\n` : ''), [code, L, fa]);
  const prev = hist.length ? D.find((x) => x.id === hist[hist.length - 1]) : undefined;
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const updFile = (fn: (f: File) => File) => {
    if (!sel || !fa) return;
    upd(sel.id, { files: sel.files.map((f) => (f.id === fa.id ? fn(f) : f)) });
  };
  const create = async () => {
    if (!nw) return;
    const title = nw.title.trim();
    if (!title) return setNw({ ...nw, err: t('dl_nwErr') });
    try {
      const { snippet } = await api<{ snippet: Snippet }>('/snippets', {
        title,
        lang: nw.lang,
        type: nw.type,
      });
      setItems((cur) => [snippet, ...(cur ?? [])]);
      setNw(null);
      setQ('');
      setFavF(false);
      open(snippet.id);
      refreshCounts();
    } catch {
      toast({ message: t('ne_saveFail'), tone: 'error' });
    }
  };
  const remove = async () => {
    if (!sel) return;
    const ok = await confirm({
      title: t('dl_confirmDel'),
      body: t('tr_askBody').replace('{x}', sel.title),
      confirmLabel: t('tr_move'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    const tm = pending.current.get(sel.id);
    if (tm) clearTimeout(tm.tm);
    pending.current.delete(sel.id);
    await api(`/snippets/${sel.id}`, undefined, 'DELETE').catch(() => {});
    setItems(
      (cur) =>
        cur &&
        cur
          .filter((x) => x.id !== sel.id)
          .map((x) => ({ ...x, related: x.related.filter((r) => r !== sel.id) })),
    );
    open(null);
    refreshCounts();
  };
  const download = () => {
    if (!fa) return;
    const u = URL.createObjectURL(new Blob([fa.code], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = u;
    a.download = fa.name || 'snippet.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 3000);
  };
  const syncScroll = () => {
    const ta = taRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutRef.current) gutRef.current.scrollTop = ta.scrollTop;
  };
  useEffect(syncScroll, [hl]);

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

  return (
    <section ref={sectionRef} className="kh-dl" style={{ gridTemplateColumns: colTpl }}>
      <div
        className="kh-dl-handle"
        style={{ left: `calc(min(${cw}px, calc(100% - 420px)) - 7px)` }}
        title={t('dl_resize')}
        role="separator"
        aria-orientation="vertical"
        data-drag={liveCol !== null || undefined}
        onPointerDown={onColDown}
        onDoubleClick={() => setColW(COL.def)}
      >
        <div />
      </div>
      <div className="kh-dl-side">
        <div className="kh-dl-sidehead">
          <div className="kh-dl-titlerow">
            <div>
              <h1>{t('dl_title')}</h1>
              <span>
                {D.length}
                {t('dl_snips')}
              </span>
            </div>
            <button
              type="button"
              className="kh-dl-new"
              title={t('dl_newSnippet')}
              aria-label={t('dl_newSnippet')}
              onClick={() =>
                setNw({
                  title: '',
                  lang: langF || 'javascript',
                  type: (typeF as DevType) || 'snippet',
                  err: '',
                })
              }
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
          <label className="kh-dl-search">
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
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('dl_search')}
              aria-label={t('dl_search')}
            />
          </label>
          <div className="kh-dl-filters">
            <select
              className="kh-dl-sel"
              value={langF}
              aria-label={t('dl_allLangs')}
              onChange={(e) => setLangF(e.target.value)}
            >
              <option value="">{t('dl_allLangs')}</option>
              {DEV_LANGS.filter((l) => usedLangs.has(l.id)).map((l) => (
                <option key={l.id} value={l.id}>
                  {lname(l)}
                </option>
              ))}
            </select>
            <select
              className="kh-dl-sel"
              value={typeF}
              aria-label={t('dl_allTypes')}
              onChange={(e) => setTypeF(e.target.value)}
            >
              <option value="">{t('dl_allTypes')}</option>
              {DEV_TYPES.map((k) => (
                <option key={k} value={k}>
                  {tyName(k)}
                </option>
              ))}
            </select>
          </div>
          <div className="kh-dl-chips">
            {(
              [
                [false, t('dl_all'), D.length],
                [true, `★ ${t('dl_favs')}`, D.filter((s) => s.fav).length],
              ] as const
            ).map(([f, label, n]) => (
              <button
                key={String(f)}
                type="button"
                data-on={favF === f || undefined}
                onClick={() => setFavF(f)}
              >
                {label}
                <span>{n}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="kh-dl-groups">
          {groups.map(([k, its]) => {
            const lg = langOf(k);
            const isOpen = !collapsed[k] || !!query;
            return (
              <div key={k} className="kh-dl-group">
                <button
                  type="button"
                  className="kh-dl-ghead"
                  aria-expanded={isOpen}
                  onClick={() => setCollapsed({ ...collapsed, [k]: !collapsed[k] })}
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
                    style={{ transform: `rotate(${isOpen ? 0 : -90}deg)` }}
                    aria-hidden="true"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                  <span className="kh-dl-dot" style={{ background: lg.color }} />
                  <span>{lname(lg)}</span>
                  <span className="kh-dl-n">{its.length}</span>
                </button>
                {isOpen &&
                  its
                    .slice()
                    .sort((a, b) => a.title.localeCompare(b.title))
                    .map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="kh-dl-item"
                        data-on={s.id === selId || undefined}
                        onClick={() => open(s.id)}
                      >
                        <span className="kh-dl-item__t">
                          <span>{s.title}</span>
                          {s.fav && (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="oklch(0.86 0.13 85)"
                              aria-hidden="true"
                            >
                              <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z" />
                            </svg>
                          )}
                        </span>
                        <span className="kh-dl-item__m">
                          <span>{tyName(s.type)}</span>
                          <span>
                            · {s.files.length}
                            {s.files.length === 1 ? t('dl_file') : t('dl_filesN')}
                          </span>
                          {s.tags.length > 0 && <span className="kh-dl-ell">· {s.tags.join(', ')}</span>}
                        </span>
                      </button>
                    ))}
              </div>
            );
          })}
          {items && !list.length && <div className="kh-dl-empty">{t('dl_empty')}</div>}
        </div>
      </div>

      <div className="kh-dl-main">
        {sel && fa && L ? (
          <div className="kh-dl-body">
            <div className="kh-dl-top">
              {prev && (
                <button
                  type="button"
                  className="kh-dl-back"
                  title={`${t('dl_back')} ${prev.title}`}
                  onClick={() => {
                    setHist((h) => h.slice(0, -1));
                    setFileId(null);
                    setTagsText(null);
                    const next = new URLSearchParams(sp.toString());
                    next.set('s', prev.id);
                    router.replace(`${path}?${next}`, { scroll: false });
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M15 6l-6 6 6 6" />
                  </svg>
                  <span>{prev.title}</span>
                </button>
              )}
              <input
                className="kh-dl-title"
                value={sel.title}
                maxLength={300}
                aria-label={t('dl_nwTitle')}
                onChange={(e) => {
                  const v = e.target.value;
                  setItems((cur) => cur && cur.map((x) => (x.id === sel.id ? { ...x, title: v } : x)));
                  if (v.trim()) upd(sel.id, { title: v });
                }}
              />
              <button
                type="button"
                className="kh-dl-round"
                title={t('dl_fav')}
                aria-label={t('dl_fav')}
                aria-pressed={sel.fav}
                style={{ color: sel.fav ? 'oklch(0.86 0.13 85)' : undefined }}
                onClick={() => upd(sel.id, { fav: !sel.fav }, 0)}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill={sel.fav ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z" />
                </svg>
              </button>
              <button
                type="button"
                className="kh-dl-round kh-dl-round--del"
                title={t('dl_del')}
                aria-label={t('dl_del')}
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
            <div className="kh-dl-grid">
              <label className="kh-dl-field">
                <span>{t('dl_type')}</span>
                <select
                  className="kh-dl-sel kh-dl-sel--box"
                  value={sel.type}
                  onChange={(e) => upd(sel.id, { type: e.target.value as DevType }, 0)}
                >
                  {DEV_TYPES.map((k) => (
                    <option key={k} value={k}>
                      {tyName(k)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="kh-dl-field kh-dl-field--wide">
                <span>{t('dl_tags')}</span>
                <input
                  value={tagsText ?? sel.tags.join(', ')}
                  placeholder={t('dl_tagsPh')}
                  onChange={(e) => {
                    setTagsText(e.target.value);
                    const tags = [
                      ...new Set(
                        e.target.value
                          .split(',')
                          .map((x) => x.trim().slice(0, 40))
                          .filter(Boolean),
                      ),
                    ].slice(0, 30);
                    upd(sel.id, { tags });
                  }}
                  onBlur={() => setTagsText(null)}
                />
              </label>
            </div>
            <textarea
              className="kh-dl-desc"
              rows={2}
              value={sel.description}
              maxLength={20000}
              placeholder={t('dl_descPh')}
              aria-label={t('dl_descPh')}
              onChange={(e) => upd(sel.id, { description: e.target.value })}
            />
            <div className="kh-dl-editor">
              <div className="kh-dl-tabs" role="tablist">
                {sel.files.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={f.id === fa.id}
                    data-on={f.id === fa.id || undefined}
                    onClick={() => {
                      setFileId(f.id);
                      setCopied(false);
                    }}
                  >
                    <span className="kh-dl-dot" style={{ background: langOf(f.lang).color }} />
                    {f.name}
                  </button>
                ))}
                {sel.files.length < 20 && (
                  <button
                    type="button"
                    className="kh-dl-addfile"
                    title={t('dl_addFile')}
                    aria-label={t('dl_addFile')}
                    onClick={() => {
                      const id = `f${Date.now()}`;
                      upd(
                        sel.id,
                        {
                          files: [
                            ...sel.files,
                            {
                              id,
                              name: `file${sel.files.length + 1}.${langOf(fa.lang).ext}`,
                              lang: fa.lang,
                              code: '',
                            },
                          ],
                        },
                        0,
                      );
                      setFileId(id);
                    }}
                  >
                    +
                  </button>
                )}
              </div>
              <div className="kh-dl-filebar">
                <input
                  className="kh-dl-fname"
                  value={fa.name}
                  maxLength={200}
                  spellCheck={false}
                  aria-label={t('dl_fileName')}
                  onChange={(e) => updFile((f) => ({ ...f, name: e.target.value }))}
                />
                <select
                  className="kh-dl-sel kh-dl-sel--sm"
                  value={fa.lang}
                  aria-label={t('dl_nwLang')}
                  onChange={(e) => {
                    const v = e.target.value;
                    updFile((f) => {
                      const old = langOf(f.lang).ext;
                      const nx = langOf(v).ext;
                      return {
                        ...f,
                        lang: v,
                        name: old && f.name.endsWith(`.${old}`) ? f.name.slice(0, -old.length) + nx : f.name,
                      };
                    });
                  }}
                >
                  {DEV_LANGS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {lname(l)}
                    </option>
                  ))}
                </select>
                <span className="kh-dl-stats">
                  {lines}
                  {t('dl_lines')} · {code.length}
                  {t('dl_chars')}
                </span>
                <button
                  type="button"
                  className="kh-dl-copy"
                  data-on={copied || undefined}
                  onClick={() => {
                    void navigator.clipboard?.writeText(code).catch(() => {});
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1400);
                  }}
                >
                  {copied ? t('dl_copied') : t('dl_copy')}
                </button>
                <button
                  type="button"
                  className="kh-dl-mini"
                  title={t('dl_download')}
                  aria-label={t('dl_download')}
                  onClick={download}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 4v11" />
                    <path d="M7 10l5 5 5-5" />
                    <path d="M5 20h14" />
                  </svg>
                </button>
                {sel.files.length > 1 && (
                  <button
                    type="button"
                    className="kh-dl-mini kh-dl-mini--del"
                    title={t('dl_delFile')}
                    aria-label={t('dl_delFile')}
                    onClick={() => {
                      upd(sel.id, { files: sel.files.filter((f) => f.id !== fa.id) }, 0);
                      setFileId(null);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="kh-dl-code">
                <pre ref={gutRef} className="kh-dl-gutter" aria-hidden="true">
                  {Array.from({ length: lines }, (_, i) => i + 1).join('\n')}
                </pre>
                <div className="kh-dl-codewrap">
                  <pre
                    ref={preRef}
                    className="kh-dl-hl"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: hl }}
                  />
                  <textarea
                    ref={taRef}
                    className="kh-dl-ta"
                    value={code}
                    spellCheck={false}
                    wrap="off"
                    aria-label={fa.name}
                    maxLength={200_000}
                    onChange={(e) => updFile((f) => ({ ...f, code: e.target.value }))}
                    onScroll={syncScroll}
                    onKeyDown={(e) => {
                      if (e.key !== 'Tab') return;
                      e.preventDefault();
                      const ta = e.currentTarget;
                      const a = ta.selectionStart;
                      const b = ta.selectionEnd;
                      const nv = `${ta.value.slice(0, a)}  ${ta.value.slice(b)}`;
                      updFile((f) => ({ ...f, code: nv }));
                      requestAnimationFrame(() => {
                        if (taRef.current) taRef.current.selectionStart = taRef.current.selectionEnd = a + 2;
                      });
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="kh-dl-related">
              <span>{t('dl_related')}</span>
              <div>
                {sel.related
                  .map((id) => D.find((x) => x.id === id))
                  .filter((x): x is Snippet => !!x)
                  .map((r) => (
                    <span key={r.id} className="kh-dl-rel">
                      <button type="button" onClick={() => open(r.id, true)}>
                        <span className="kh-dl-dot" style={{ background: langOf(mainLang(r)).color }} />
                        {r.title}
                      </button>
                      <button
                        type="button"
                        aria-label={`${t('dl_unrel')}: ${r.title}`}
                        onClick={() => upd(sel.id, { related: sel.related.filter((x) => x !== r.id) }, 0)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                <select
                  className="kh-dl-addrel"
                  value=""
                  aria-label={t('dl_addRel')}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) upd(sel.id, { related: [...sel.related, v] }, 0);
                  }}
                >
                  <option value="">{t('dl_addRel')}</option>
                  {D.filter((x) => x.id !== sel.id && !sel.related.includes(x.id)).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title} · {lname(langOf(mainLang(x)))}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <span className="kh-dl-meta">
              {t('dl_created')} {fmt(sel.createdAt)} · {t('dl_updated')} {fmt(sel.updatedAt)}
            </span>
          </div>
        ) : (
          <div className="kh-dl-pick">{t('dl_pick')}</div>
        )}
      </div>

      {nw && (
        <Modal
          open
          onClose={() => setNw(null)}
          title={t('dl_newSnippet')}
          size="sm"
          closeLabel={t('ui_close')}
          footer={
            <div className="kh-dl-nwact">
              <button type="button" className="kh-dl-nwcancel" onClick={() => setNw(null)}>
                {t('dl_nwCancel')}
              </button>
              <button type="button" className="kh-dl-nwok" onClick={() => void create()}>
                {t('dl_nwOk')}
              </button>
            </div>
          }
        >
          <div className="kh-dl-nw">
            <label className="kh-dl-field">
              <span>{t('dl_nwTitle')}</span>
              <input
                data-autofocus
                value={nw.title}
                maxLength={300}
                placeholder={t('dl_nwPh')}
                onChange={(e) => setNw({ ...nw, title: e.target.value, err: '' })}
                onKeyDown={(e) => e.key === 'Enter' && void create()}
              />
            </label>
            <div className="kh-dl-nwgrid">
              <label className="kh-dl-field">
                <span>{t('dl_nwLang')}</span>
                <select
                  className="kh-dl-sel kh-dl-sel--box"
                  value={nw.lang}
                  onChange={(e) => setNw({ ...nw, lang: e.target.value })}
                >
                  {DEV_LANGS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {lname(l)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="kh-dl-field">
                <span>{t('dl_nwType')}</span>
                <select
                  className="kh-dl-sel kh-dl-sel--box"
                  value={nw.type}
                  onChange={(e) => setNw({ ...nw, type: e.target.value as DevType })}
                >
                  {DEV_TYPES.map((k) => (
                    <option key={k} value={k}>
                      {tyName(k)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {nw.err && <span className="kh-dl-err">{nw.err}</span>}
          </div>
        </Modal>
      )}
    </section>
  );
}
