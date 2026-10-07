'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { COL_DEFAULTS, COL_LIMITS } from '@/lib/prefs';
import { tagTint } from '@/lib/tags';
import { useConfirm, usePersistentState, useToast } from '@/components/ui';
import { usePref } from '@/components/shell/PrefsProvider';
import { useShell } from '@/components/shell/ShellContext';
import { refreshCounts } from '@/components/shell/counts';
import { ColHandle } from '@/components/content/ColHandle';
import { Connections } from '@/components/content/Connections';
import { useWhen } from '@/components/content/useWhen';
import '../emails/emails.css';
import './artifacts.css';

// Artefactos — ZNotes.dc.html `isArtifacts`: HTML pages with a version per
// save. The HTML runs only in a sandboxed frame without allow-same-origin
// (opaque origin: no access to the app's cookies, storage or API); "open in
// a new tab" uses the server's `CSP: sandbox` response for the same reason.
// The left column shares the Emails styles (same prototype markup).

type Summary = {
  id: string;
  folderId: string | null;
  title: string;
  description: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};
type Full = Summary & { html: string; versions: Array<{ id: string; createdAt: string; current: boolean }> };
type Folder = { id: string; name: string };
type Cols = { list?: number };

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const MAX_HTML = 2_000_000;

const Svg = ({ d, s = 15, fill = 'none' }: { d: string; s?: number; fill?: string }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: d }}
  />
);
const I = {
  search: '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line>',
  upload: '<path d="M12 16V4"></path><path d="M7 9l5-5 5 5"></path><path d="M4 20h16"></path>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
  x: '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>',
  pin: '<path d="M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z"></path>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"></rect><path d="M5 15V6a2 2 0 0 1 2-2h9"></path>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"></path>',
  open: '<path d="M14 4h6v6"></path><path d="M20 4l-9 9"></path><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path>',
  down: '<path d="M12 4v12"></path><path d="M7 11l5 5 5-5"></path><path d="M4 20h16"></path>',
  hist: '<path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v5h5"></path><path d="M12 8v4l3 2"></path>',
  trash: '<path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path>',
};

export function ArtifactsView() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const { focus } = useShell();
  const when = useWhen();
  const [cols, setCols] = usePref<Cols>('cols', {});
  const [liveList, setLiveList] = useState<number | null>(null);
  const [folder, setFolder] = usePersistentState<string>('artifacts.folder', 'all');
  const [mode, setMode] = usePersistentState<'preview' | 'code'>('artifacts.mode', 'preview');
  const [items, setItems] = useState<Summary[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [full, setFull] = useState<Full | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [newTag, setNewTag] = useState('');
  const [histOpen, setHistOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const activeId = sp.get('a');

  const open = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (id) next.set('a', id);
      else next.delete('a');
      router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [path, router, sp],
  );

  useEffect(() => {
    api<{ artifacts: Summary[]; folders: Folder[] }>('/artifacts')
      .then((r) => {
        setItems(r.artifacts);
        setFolders(r.folders);
      })
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    setDraft(null);
    setHistOpen(false);
    setNewTag('');
    if (!activeId) return setFull(null);
    let live = true;
    api<{ artifact: Full }>(`/artifacts/${activeId}`)
      .then((r) => live && setFull(r.artifact))
      .catch(() => live && setFull(null));
    return () => {
      live = false;
    };
  }, [activeId]);

  const fail = () => toast({ message: t('ne_saveFail'), tone: 'error' });
  const syncSummary = (s: Partial<Summary> & { id: string }) => {
    setItems((cur) => cur && cur.map((x) => (x.id === s.id ? { ...x, ...s } : x)));
    setFull((cur) => (cur && cur.id === s.id ? { ...cur, ...s } : cur));
  };
  const patch = async (
    id: string,
    p: Partial<Pick<Summary, 'title' | 'description' | 'tags' | 'pinned' | 'folderId'>>,
  ) => {
    syncSummary({ id, ...p });
    try {
      const { artifact } = await api<{ artifact: Summary }>(`/artifacts/${id}`, p, 'PATCH');
      syncSummary(artifact);
    } catch {
      fail();
    }
  };
  // Title / description save after a short pause.
  const [pending, setPending] = useState<{ id: string; p: Partial<Summary> } | null>(null);
  useEffect(() => {
    if (!pending) return;
    const tm = setTimeout(
      () => void patch(pending.id, pending.p as Partial<Pick<Summary, 'title' | 'description'>>),
      600,
    );
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- patch is stable enough for a debounce
  }, [pending]);
  const typed = (p: Partial<Pick<Summary, 'title' | 'description'>>) => {
    if (!full) return;
    setFull({ ...full, ...p });
    if (p.title !== undefined && !p.title.trim()) return;
    setPending({ id: full.id, p: { ...(pending?.id === full.id ? pending.p : {}), ...p } });
  };

  const create = async (title: string, html?: string) => {
    try {
      const { artifact } = await api<{ artifact: Full }>('/artifacts', {
        title: title.slice(0, 300) || t('a_newTitle'),
        html,
        folderId: folder !== 'all' && folders.some((f) => f.id === folder) ? folder : null,
      });
      setItems((cur) => [artifact, ...(cur ?? [])]);
      setMode('preview');
      open(artifact.id);
      refreshCounts();
    } catch {
      fail();
    }
  };
  const importFile = async (f: File) => {
    if (f.size > MAX_HTML) return toast({ message: t('a_tooBig'), tone: 'error' });
    await create(f.name.replace(/\.html?$/i, ''), await f.text());
  };
  const saveVersion = async () => {
    if (!full || draft === null) return;
    setSaving(true);
    try {
      const { artifact } = await api<{ artifact: Full }>(
        `/artifacts/${full.id}/html`,
        { html: draft },
        'PUT',
      );
      setFull(artifact);
      syncSummary({ id: artifact.id, updatedAt: artifact.updatedAt });
      setDraft(null);
    } catch {
      fail();
    } finally {
      setSaving(false);
    }
  };
  const restore = async (vid: string) => {
    if (!full) return;
    try {
      const { artifact } = await api<{ artifact: Full }>(`/artifacts/${full.id}/versions/${vid}/restore`, {});
      setFull(artifact);
      syncSummary({ id: artifact.id, updatedAt: artifact.updatedAt });
      setDraft(null);
      setHistOpen(false);
    } catch {
      fail();
    }
  };
  const remove = async () => {
    if (!full) return;
    const ok = await confirm({
      title: t('tr_askTitle'),
      body: t('tr_askBody').replace('{x}', full.title),
      confirmLabel: t('tr_move'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    await api(`/artifacts/${full.id}`, undefined, 'DELETE').catch(() => {});
    const idx = list.findIndex((x) => x.id === full.id);
    const rest = list.filter((x) => x.id !== full.id);
    setItems((cur) => cur && cur.filter((x) => x.id !== full.id));
    open(rest[Math.min(idx, rest.length - 1)]?.id ?? null);
    refreshCounts();
  };
  const addFolder = async () => {
    const n = newFolder.trim();
    if (!n) return;
    try {
      const { folder: f } = await api<{ folder: Folder }>('/artifacts/folders', { name: n.slice(0, 80) });
      setFolders((cur) => [...cur, f]);
      setNewFolder('');
      setFolder(f.id);
    } catch {
      fail();
    }
  };
  const removeFolder = async (f: Folder) => {
    await api(`/artifacts/folders/${f.id}`, undefined, 'DELETE').catch(() => {});
    setFolders((cur) => cur.filter((x) => x.id !== f.id));
    setItems((cur) => cur && cur.map((x) => (x.folderId === f.id ? { ...x, folderId: null } : x)));
    if (folder === f.id) setFolder('all');
  };
  const download = () => {
    if (!full) return;
    // A download never runs the HTML, so a blob link is safe here.
    const u = URL.createObjectURL(new Blob([full.html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = u;
    a.download = `${full.title.replace(/[^\w\- ]+/g, '_')}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const all = useMemo(() => items ?? [], [items]);
  const query = q.trim().toLowerCase();
  const list = all.filter(
    (a) =>
      (folder === 'all' || a.folderId === folder) &&
      (!query || [a.title, a.description, ...a.tags].some((v) => v.toLowerCase().includes(query))),
  );
  const fmtStamp = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  const code = full ? (draft ?? full.html) : '';
  const dirty = !!full && draft !== null && draft !== full.html;
  const listW = liveList ?? cols.list ?? COL_DEFAULTS.list;

  return (
    <div
      className="kh-em"
      style={{ gridTemplateColumns: focus ? 'minmax(0,1fr)' : `${listW}px minmax(0,1fr)` }}
    >
      {!focus && (
        <ColHandle
          style={{ left: listW }}
          value={listW}
          limits={COL_LIMITS.list}
          dir={1}
          onLive={setLiveList}
          onDone={(w) => setCols({ ...cols, list: w })}
          onReset={() => setCols({ ...cols, list: COL_DEFAULTS.list })}
        />
      )}
      {!focus && (
        <div className="kh-em-side">
          <div className="kh-em-top">
            <label className="kh-em-search">
              <Svg d={I.search} s={16} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('a_search')}
                aria-label={t('a_search')}
              />
            </label>
            <label className="kh-ar-import" title={t('a_import')}>
              <Svg d={I.upload} s={16} />
              <input
                type="file"
                accept=".html,.htm,text/html"
                aria-label={t('a_import')}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void importFile(f);
                }}
              />
            </label>
            <button
              type="button"
              className="kh-ar-new"
              title={t('a_new')}
              aria-label={t('a_new')}
              onClick={() => void create(t('a_newTitle'))}
            >
              <Svg d={I.plus} s={16} />
            </button>
          </div>
          <div className="kh-em-folders kh-ar-folders">
            {[{ id: 'all', name: t('a_all'), top: true }, ...folders].map((f) => {
              const top = 'top' in f;
              const n = top ? all.length : all.filter((a) => a.folderId === f.id).length;
              return (
                <div
                  key={f.id}
                  className="kh-em-folder"
                  data-on={folder === f.id || undefined}
                  data-top={top || undefined}
                  role="button"
                  tabIndex={0}
                  onClick={() => setFolder(f.id)}
                  onKeyDown={(e) => e.key === 'Enter' && setFolder(f.id)}
                  onDragOver={(e) => dragId && e.preventDefault()}
                  onDrop={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    void patch(dragId, { folderId: top ? null : f.id });
                    setDragId(null);
                  }}
                >
                  <Svg d={I.folder} s={17} />
                  <span>{f.name}</span>
                  {!top && (
                    <button
                      type="button"
                      title={t('del')}
                      aria-label={`${t('del')} ${f.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeFolder(f as Folder);
                      }}
                    >
                      <Svg d={I.x} s={14} />
                    </button>
                  )}
                  <span className="kh-em-count">{n}</span>
                </div>
              );
            })}
            <div className="kh-em-newfolder">
              <input
                value={newFolder}
                maxLength={80}
                placeholder={t('a_folderPh')}
                aria-label={t('a_folderPh')}
                onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void addFolder()}
              />
              <button type="button" onClick={() => void addFolder()}>
                + {t('newFolder')}
              </button>
            </div>
          </div>
          <section className="kh-em-list kh-ar-list" aria-label={t('nav_artifacts')}>
            {list.map((a) => (
              <div
                key={a.id}
                className="kh-ar-item"
                data-on={a.id === activeId || undefined}
                data-drag={dragId === a.id || undefined}
                role="button"
                tabIndex={0}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', a.id);
                  setDragId(a.id);
                }}
                onDragEnd={() => setDragId(null)}
                onClick={() => open(a.id)}
                onKeyDown={(e) => e.key === 'Enter' && open(a.id)}
              >
                <div className="kh-ar-item__top">
                  {a.pinned && <Svg d={I.pin} s={12} fill="#fbf8f5" />}
                  <span>{a.title}</span>
                </div>
                <div className="kh-ar-item__desc">{a.description || '—'}</div>
                {a.tags.length > 0 && (
                  <div className="kh-ar-tags">
                    {a.tags.map((x) => (
                      <span key={x} style={{ background: tagTint(x) }}>
                        {x}
                      </span>
                    ))}
                  </div>
                )}
                <div className="kh-ar-item__date">
                  {t('createdAt')} {fmtStamp(a.createdAt)}
                </div>
              </div>
            ))}
            {items && !list.length && <div className="kh-em-empty">{t('a_empty')}</div>}
          </section>
        </div>
      )}

      <section className="kh-em-read">
        {full ? (
          <div className="kh-ar-main">
            <div className="kh-ar-head">
              <div className="kh-ar-titles">
                <input
                  className="kh-ar-title"
                  value={full.title}
                  maxLength={300}
                  aria-label={t('c_title')}
                  onChange={(e) => typed({ title: e.target.value })}
                />
                <input
                  className="kh-ar-desc"
                  value={full.description}
                  maxLength={2000}
                  placeholder={t('a_descPh')}
                  aria-label={t('c_desc')}
                  onChange={(e) => typed({ description: e.target.value })}
                />
              </div>
              <div className="kh-em-seg kh-ar-seg" role="radiogroup">
                {(
                  [
                    ['preview', 'a_preview'],
                    ['code', 'a_code'],
                  ] as const
                ).map(([id, k]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={mode === id}
                    data-on={mode === id || undefined}
                    onClick={() => setMode(id)}
                  >
                    {t(k)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="kh-em-act"
                title={copied ? t('copied') : t('a_copyHtml')}
                aria-label={t('a_copyHtml')}
                onClick={() => {
                  void navigator.clipboard?.writeText(full.html).catch(() => {});
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                <Svg d={copied ? I.ok : I.copy} />
              </button>
              <a
                className="kh-em-act"
                href={`${BASE}/api/v1/artifacts/${full.id}/view`}
                target="_blank"
                rel="noopener noreferrer"
                title={t('a_openTab')}
                aria-label={t('a_openTab')}
              >
                <Svg d={I.open} />
              </a>
              <button
                type="button"
                className="kh-em-act"
                title={t('v_download')}
                aria-label={t('v_download')}
                onClick={download}
              >
                <Svg d={I.down} />
              </button>
              <button
                type="button"
                className="kh-em-act"
                title={full.pinned ? t('v_unpin') : t('v_pin')}
                aria-label={full.pinned ? t('v_unpin') : t('v_pin')}
                aria-pressed={full.pinned}
                data-on={full.pinned || undefined}
                onClick={() => void patch(full.id, { pinned: !full.pinned })}
              >
                <Svg d={I.pin} fill={full.pinned ? 'currentColor' : 'none'} />
              </button>
              <div className="kh-ar-histwrap">
                <button
                  type="button"
                  className="kh-em-act"
                  title={t('a_history')}
                  aria-label={t('a_history')}
                  aria-expanded={histOpen}
                  data-on={histOpen || undefined}
                  onClick={() => setHistOpen(!histOpen)}
                >
                  <Svg d={I.hist} />
                </button>
                {histOpen && (
                  <div className="kh-ar-hist" role="dialog" aria-label={t('a_history')}>
                    <div className="kh-ar-hist__t">{t('a_history')}</div>
                    {full.versions
                      .map((v, i) => ({ ...v, n: i + 1 }))
                      .reverse()
                      .map((v) => (
                        <div key={v.id} className="kh-ar-hist__row" data-current={v.current || undefined}>
                          <span>v{v.n}</span>
                          <span>{fmtStamp(v.createdAt)}</span>
                          {v.current ? (
                            <span className="kh-ar-hist__cur">{t('a_current')}</span>
                          ) : (
                            <button type="button" onClick={() => void restore(v.id)}>
                              {t('a_restore')}
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="kh-em-act kh-em-act--del"
                title={t('del')}
                aria-label={t('del')}
                onClick={() => void remove()}
              >
                <Svg d={I.trash} />
              </button>
            </div>

            <div className="kh-ar-meta">
              {full.tags.map((x) => (
                <span key={x} className="kh-ar-tag" style={{ background: tagTint(x) }}>
                  {x}
                  <button
                    type="button"
                    aria-label={`${t('del')} ${x}`}
                    onClick={() => void patch(full.id, { tags: full.tags.filter((y) => y !== x) })}
                  >
                    <Svg d={I.x} s={10} />
                  </button>
                </span>
              ))}
              <input
                className="kh-ar-newtag"
                value={newTag}
                maxLength={40}
                placeholder={`+ ${t('a_tag')}`}
                aria-label={t('a_tag')}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const v = newTag.trim();
                  setNewTag('');
                  if (v && !full.tags.includes(v) && full.tags.length < 30)
                    void patch(full.id, { tags: [...full.tags, v] });
                }}
              />
              <div style={{ flex: 1 }} />
              <span className="kh-ar-stamp">
                {t('createdAt')} {fmtStamp(full.createdAt)} · {t('dUpdated')} {when(full.updatedAt)}
              </span>
            </div>

            <div className="kh-ar-cx">
              <Connections type="artifact" id={full.id} variant="section" />
            </div>

            <div className="kh-ar-stage">
              {mode === 'preview' ? (
                <iframe
                  key={full.versions.length}
                  className="kh-ar-frame"
                  srcDoc={full.html}
                  sandbox="allow-scripts allow-popups allow-modals"
                  referrerPolicy="no-referrer"
                  title={full.title}
                />
              ) : (
                <>
                  <div className="kh-ar-codebar">
                    <span>
                      index.html · {code.split('\n').length}
                      {t('a_lines')}
                    </span>
                    <div style={{ flex: 1 }} />
                    {dirty && (
                      <>
                        <button type="button" className="kh-ar-discard" onClick={() => setDraft(null)}>
                          {t('a_discard')}
                        </button>
                        <button
                          type="button"
                          className="kh-ar-save"
                          disabled={saving}
                          onClick={() => void saveVersion()}
                        >
                          {t('a_saveVersion')}
                        </button>
                      </>
                    )}
                  </div>
                  <textarea
                    className="kh-ar-code"
                    value={code}
                    spellCheck={false}
                    aria-label={t('a_code')}
                    maxLength={MAX_HTML}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                        e.preventDefault();
                        if (dirty) void saveVersion();
                      }
                    }}
                  />
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="kh-em-none">{t('a_noActive')}</div>
        )}
      </section>
    </div>
  );
}
