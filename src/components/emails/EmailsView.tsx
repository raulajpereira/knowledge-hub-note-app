'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import { COL_DEFAULTS, COL_LIMITS } from '@/lib/prefs';
import { useConfirm, usePersistentState, useToast } from '@/components/ui';
import { usePref } from '@/components/shell/PrefsProvider';
import { useShell } from '@/components/shell/ShellContext';
import { refreshCounts } from '@/components/shell/counts';
import { ColHandle } from '@/components/content/ColHandle';
import { useWhen } from '@/components/content/useWhen';
import './emails.css';

// Emails — ZNotes.dc.html `isMail`: import Outlook .msg / .eml files (parsed
// and sanitized on the server), folders, star / pin, notes, "create task".
// The body is shown in a sandboxed iframe whose CSP forbids any network
// access (no scripts, no remote images or tracking pixels).

type Summary = {
  id: string;
  folderId: string | null;
  subject: string;
  fromName: string;
  fromEmail: string;
  snippet: string;
  sentAt: string | null;
  createdAt: string;
  starred: boolean;
  pinned: boolean;
  attachments: number;
};
type Full = Summary & {
  to: string;
  cc: string;
  text: string;
  html: string;
  notes: string;
  fileName: string;
  files: Array<{ id: string; name: string; size: number }>;
};
type Folder = { id: string; name: string };
type Cols = { list?: number };

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmtBytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(0)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`;
const CSP =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">';
const APP_CSS =
  '<style>html,body{background:transparent;margin:0}body{padding:22px 24px 30px;color:#fbf8f5;font:15px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}a{color:#a9cbff;overflow-wrap:anywhere}img{max-width:100%;height:auto;border-radius:10px}pre{white-space:pre-wrap;font:inherit;margin:0}table{max-width:100%}</style>';
const THEME =
  '<style>*{color:#fbf8f5 !important;background-color:transparent !important;border-color:rgba(255,255,255,.18) !important}a,a *{color:#a9cbff !important}</style>';
const ORIG_HTML =
  '<style>body{margin:0;padding:22px 24px;font:15px/1.6 system-ui,sans-serif;color:#222}img{max-width:100%;height:auto}</style>';
const ORIG_TEXT =
  '<style>body{margin:0;padding:22px 24px;font:15px/1.6 system-ui,sans-serif;color:#222}pre{white-space:pre-wrap;font:inherit;margin:0}a{color:#0a58ca}</style>';

function bodyDoc(m: Full, orig: boolean) {
  const head = `<!doctype html><meta charset="utf-8">${CSP}<base target="_blank">`;
  if (m.html) return head + (orig ? ORIG_HTML : APP_CSS + THEME) + m.html;
  const text = esc(m.text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" rel="noopener noreferrer">$1</a>');
  return `${head}${orig ? ORIG_TEXT : APP_CSS}<pre>${text}</pre>`;
}

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
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
  x: '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"></path>',
  pin: '<path d="M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z"></path>',
  clip: '<path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"></path>',
  task: '<rect x="4" y="4" width="16" height="16" rx="3"></rect><path d="M12 8v8"></path><path d="M8 12h8"></path>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"></path>',
  down: '<path d="M12 4v12"></path><path d="M7 11l5 5 5-5"></path><path d="M4 20h16"></path>',
  trash: '<path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"></rect><path d="M4 7l8 6 8-6"></path>',
};

export function EmailsView() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const { focus, modules } = useShell();
  const when = useWhen();
  const [cols, setCols] = usePref<Cols>('cols', {});
  const [liveList, setLiveList] = useState<number | null>(null);
  const [filter, setFilter] = usePersistentState<'all' | 'star' | 'att'>('emails.filter', 'all');
  const [folder, setFolder] = usePersistentState<string>('emails.folder', 'all');
  const [view, setView] = usePersistentState<'app' | 'orig'>('emails.view', 'app');
  const [items, setItems] = useState<Summary[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [full, setFull] = useState<Full | null>(null);
  const [q, setQ] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [taskFlash, setTaskFlash] = useState(false);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeId = sp.get('m');

  const open = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (id) next.set('m', id);
      else next.delete('m');
      router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [path, router, sp],
  );

  const load = useCallback(
    () =>
      api<{ emails: Summary[]; folders: Folder[] }>('/emails').then((r) => {
        setItems(r.emails);
        setFolders(r.folders);
        return r;
      }),
    [],
  );
  useEffect(() => {
    void load().catch(() => setItems([]));
  }, [load]);

  useEffect(() => {
    if (!activeId) return setFull(null);
    let live = true;
    api<{ email: Full }>(`/emails/${activeId}`)
      .then((r) => live && setFull(r.email))
      .catch(() => live && setFull(null));
    return () => {
      live = false;
    };
  }, [activeId]);

  const flash = (text: string, err = false) => {
    setMsg({ text, err });
    setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 6000);
  };

  // ── Import ────────────────────────────────────────────────────────────────
  const importFiles = async (files: File[]) => {
    setDragging(false);
    if (!files.length || busy) return;
    setBusy(true);
    const ok: Summary[] = [];
    const bad: string[] = [];
    for (const f of files) {
      const fd = new FormData();
      fd.set('file', f);
      if (folder !== 'all' && folders.some((x) => x.id === folder)) fd.set('folderId', folder);
      try {
        const res = await fetch(`${BASE}/api/v1/emails/import`, {
          method: 'POST',
          body: fd,
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error(String(res.status));
        ok.push(((await res.json()) as { email: Summary }).email);
      } catch {
        bad.push(f.name);
      }
    }
    setBusy(false);
    if (ok.length) {
      setItems((cur) => [...ok, ...(cur ?? [])]);
      open(ok[0]!.id);
      refreshCounts();
    }
    flash(
      `${ok.length ? `${ok.length}${t('m_ok')}` : ''}${bad.length ? ` ${t('m_fail')}${bad.join(', ')}` : ''}`.trim(),
      !!bad.length && !ok.length,
    );
  };

  // ── Edits ─────────────────────────────────────────────────────────────────
  const patch = async (id: string, p: Partial<Pick<Full, 'folderId' | 'starred' | 'pinned' | 'notes'>>) => {
    setItems((cur) => cur && cur.map((x) => (x.id === id ? { ...x, ...p } : x)));
    setFull((cur) => (cur && cur.id === id ? { ...cur, ...p } : cur));
    try {
      await api(`/emails/${id}`, p, 'PATCH');
    } catch {
      toast({ message: t('ne_saveFail'), tone: 'error' });
    }
  };
  const onNotes = (v: string) => {
    if (!full) return;
    const id = full.id;
    setFull({ ...full, notes: v });
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => void patch(id, { notes: v }), 600);
  };
  const toTask = async () => {
    if (!full) return;
    try {
      await api(`/emails/${full.id}/to-task`, {});
      setTaskFlash(true);
      setTimeout(() => setTaskFlash(false), 3000);
      flash(t('m_taskCreated') + (full.subject || t('m_noSubject')));
      refreshCounts();
    } catch (e) {
      toast({
        message: isApiFailure(e) && e.code === 'limit_reached' ? t('tk_limit') : t('ne_saveFail'),
        tone: 'error',
      });
    }
  };
  const remove = async () => {
    if (!full) return;
    const ok = await confirm({
      title: t('tr_askTitle'),
      body: t('tr_askBody').replace('{x}', full.subject || t('m_noSubject')),
      confirmLabel: t('tr_move'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    await api(`/emails/${full.id}`, undefined, 'DELETE').catch(() => {});
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
      const { folder: f } = await api<{ folder: Folder }>('/emails/folders', { name: n.slice(0, 80) });
      setFolders((cur) => [...cur, f]);
      setNewFolder('');
      setFolder(f.id);
    } catch {
      toast({ message: t('ne_saveFail'), tone: 'error' });
    }
  };
  const removeFolder = async (f: Folder) => {
    await api(`/emails/folders/${f.id}`, undefined, 'DELETE').catch(() => {});
    setFolders((cur) => cur.filter((x) => x.id !== f.id));
    setItems((cur) => cur && cur.map((x) => (x.folderId === f.id ? { ...x, folderId: null } : x)));
    setFull((cur) => (cur && cur.folderId === f.id ? { ...cur, folderId: null } : cur));
    if (folder === f.id) setFolder('all');
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const all = useMemo(() => items ?? [], [items]);
  const query = q.trim().toLowerCase();
  const base = all.filter(
    (m) =>
      (folder === 'all' || m.folderId === folder) &&
      (!query ||
        [m.subject, m.fromName, m.fromEmail, m.snippet].some((v) => v.toLowerCase().includes(query))),
  );
  const list = base.filter((m) => filter === 'all' || (filter === 'star' ? m.starred : m.attachments > 0));
  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';
  const who = (n: string, e: string) => (n && e ? `${n} <${e}>` : n || e || '—');
  const doc = useMemo(() => (full ? bodyDoc(full, view === 'orig') : ''), [full, view]);
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
        <div
          className="kh-em-side"
          onDragOver={(e) => {
            if (!Array.from(e.dataTransfer.types).includes('Files')) return;
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setDragging(false);
          }}
          onDrop={(e) => {
            const fs = Array.from(e.dataTransfer.files);
            if (!fs.length) return;
            e.preventDefault();
            void importFiles(fs);
          }}
        >
          <div className="kh-em-top">
            <label className="kh-em-search">
              <Svg d={I.search} s={16} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('m_search')}
                aria-label={t('m_search')}
              />
            </label>
            <label className="kh-em-import" title={`${t('m_import')} .msg / .eml`} aria-busy={busy}>
              <Svg d={I.mail} s={16} />
              <input
                type="file"
                multiple
                accept=".msg,.eml,message/rfc822,application/vnd.ms-outlook"
                aria-label={`${t('m_import')} .msg / .eml`}
                onChange={(e) => {
                  const fs = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  void importFiles(fs);
                }}
              />
            </label>
          </div>
          {msg && (
            <div className="kh-em-msg" data-err={msg.err || undefined} role="status">
              {msg.text}
            </div>
          )}
          <div className="kh-em-folders">
            {[{ id: 'all', name: t('m_all'), top: true }, ...folders].map((f) => {
              const top = 'top' in f;
              const n = top ? all.length : all.filter((m) => m.folderId === f.id).length;
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
                    e.stopPropagation();
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
          <div className="kh-em-filters">
            {(
              [
                ['all', 'm_fAll', base.length],
                ['star', 'm_fStar', base.filter((m) => m.starred).length],
                ['att', 'm_fAtt', base.filter((m) => m.attachments > 0).length],
              ] as const
            ).map(([id, k, n]) => (
              <button
                key={id}
                type="button"
                data-on={filter === id || undefined}
                onClick={() => setFilter(id)}
              >
                {t(k)}
                <span>{n}</span>
              </button>
            ))}
          </div>
          <section className="kh-em-list" aria-label={t('nav_emails')}>
            {list.map((m) => (
              <div
                key={m.id}
                className="kh-em-item"
                data-on={m.id === activeId || undefined}
                role="button"
                tabIndex={0}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', m.id);
                  setDragId(m.id);
                }}
                onDragEnd={() => setDragId(null)}
                onClick={() => open(m.id)}
                onKeyDown={(e) => e.key === 'Enter' && open(m.id)}
              >
                <div className="kh-em-item__top">
                  {m.pinned && <Svg d={I.pin} s={12} fill="#fbf8f5" />}
                  <span className="kh-em-item__subj">{m.subject || t('m_noSubject')}</span>
                  {m.attachments > 0 && (
                    <span className="kh-em-ic">
                      <Svg d={I.clip} s={13} />
                    </span>
                  )}
                  {m.starred && (
                    <span className="kh-em-ic kh-em-ic--star">
                      <Svg d={I.star} s={14} fill="currentColor" />
                    </span>
                  )}
                </div>
                <span className="kh-em-item__from">{m.fromName || m.fromEmail || '—'}</span>
                <span className="kh-em-item__snip">{m.snippet}</span>
                <span className="kh-em-item__date">{fmtDate(m.sentAt ?? m.createdAt)}</span>
              </div>
            ))}
            {items && !list.length && <div className="kh-em-empty">{t('m_empty')}</div>}
          </section>
          {dragging && (
            <div className="kh-em-drop">
              <Svg d={I.mail} s={30} />
              <div>{t('m_drop')}</div>
            </div>
          )}
        </div>
      )}

      <section className="kh-em-read">
        {full ? (
          <div className="kh-em-read__in">
            <div className="kh-em-head">
              <div className="kh-em-head__row">
                <h2 className="kh-em-subject">{full.subject || t('m_noSubject')}</h2>
                <div className="kh-em-acts">
                  <button
                    type="button"
                    className="kh-em-act"
                    title={t('m_important')}
                    aria-label={t('m_important')}
                    aria-pressed={full.starred}
                    data-star={full.starred || undefined}
                    onClick={() => void patch(full.id, { starred: !full.starred })}
                  >
                    <Svg d={I.star} s={16} fill={full.starred ? 'currentColor' : 'none'} />
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
                    <Svg d={I.pin} s={15} fill={full.pinned ? 'currentColor' : 'none'} />
                  </button>
                  {modules.has('tasks') && (
                    <button
                      type="button"
                      className="kh-em-act"
                      title={t('m_toTask')}
                      aria-label={t('m_toTask')}
                      onClick={() => void toTask()}
                    >
                      <Svg d={taskFlash ? I.ok : I.task} />
                    </button>
                  )}
                  <a
                    className="kh-em-act"
                    href={`${BASE}/api/v1/emails/${full.id}/original`}
                    title={t('m_downloadOrig')}
                    aria-label={t('m_downloadOrig')}
                    download
                  >
                    <Svg d={I.down} />
                  </a>
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
              </div>
              <div className="kh-em-meta">
                <span>{t('m_from')}:</span>
                <span>{who(full.fromName, full.fromEmail)}</span>
                <span>{t('m_to')}:</span>
                <span>{full.to || '—'}</span>
                {full.cc && (
                  <>
                    <span>{t('m_cc')}:</span>
                    <span>{full.cc}</span>
                  </>
                )}
                <span>{t('m_date')}:</span>
                <span>{fmtDate(full.sentAt)}</span>
              </div>
              <div className="kh-em-bar">
                <select
                  className="kh-em-select"
                  value={full.folderId ?? ''}
                  aria-label={t('p_folder')}
                  onChange={(e) => void patch(full.id, { folderId: e.target.value || null })}
                >
                  <option value="">{t('p_noFolder')}</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                {full.files.map((a) => (
                  <a
                    key={a.id}
                    className="kh-em-att"
                    href={`${BASE}/api/v1/emails/${full.id}/attachments/${a.id}`}
                    title={t('v_download')}
                    download
                  >
                    <Svg d={I.clip} s={13} />
                    <span>{a.name}</span>
                    <span>{fmtBytes(a.size)}</span>
                  </a>
                ))}
                <div style={{ flex: 1 }} />
                <span className="kh-em-imported">
                  {t('m_imported')} {when(full.createdAt)}
                </span>
                <div className="kh-em-seg" role="radiogroup">
                  {(
                    [
                      ['app', 'm_viewApp'],
                      ['orig', 'm_viewOrig'],
                    ] as const
                  ).map(([id, k]) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={view === id}
                      data-on={view === id || undefined}
                      onClick={() => setView(id)}
                    >
                      {t(k)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <iframe
              className="kh-em-frame"
              data-orig={view === 'orig' || undefined}
              srcDoc={doc}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              title={full.subject || t('m_noSubject')}
            />
            <div className="kh-em-notes">
              <label htmlFor="kh-em-notes">{t('m_notes')}</label>
              <textarea
                id="kh-em-notes"
                value={full.notes}
                maxLength={20000}
                placeholder={t('m_notesPh')}
                onChange={(e) => onNotes(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="kh-em-none">
            <Svg d={I.mail} s={30} />
            {t('m_noActive')}
          </div>
        )}
      </section>
    </div>
  );
}
