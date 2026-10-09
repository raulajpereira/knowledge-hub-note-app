'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ShareButton } from '@/components/share/ShareButton';
import { FolderShareDialog } from '@/components/share/FolderShareDialog';
import { sharedConfirm, useSharedFolders, type SharedFolder } from '@/components/share/useSharedFolders';
import { useI18n } from '@/i18n/client';
import { api, isApiFailure } from '@/lib/client/api';
import { COL_DEFAULTS, COL_LIMITS } from '@/lib/prefs';
import { DEV_LANGS } from '@/lib/devlib';
import { codeHtml } from '@/lib/codeHighlight';
import {
  FILES_MAX_MB,
  FILES_QUOTA_MB,
  TEXT_PREVIEW_MAX,
  extOf,
  fmtBytes,
  inlineType,
  previewKind,
  type PreviewKind,
} from '@/lib/drive';
import { useConfirm, usePersistentState, useToast } from '@/components/ui';
import { usePref } from '@/components/shell/PrefsProvider';
import { useShell } from '@/components/shell/ShellContext';
import { refreshCounts } from '@/components/shell/counts';
import { ColHandle } from '@/components/content/ColHandle';
import '../emails/emails.css';
import '../artifacts/artifacts.css';
import './files.css';

// Ficheiros: keep files and see enough of them to know what they hold. Uploads
// go in chunks (the server's limit per request is below the file sizes
// allowed); the preview is the lightest that works — the browser's own for
// PDF / images / video / audio, highlighted text, Word and Excel read in the
// browser. Editing is done after downloading.

type DFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
  folderId: string | null;
  sharedFolderId: string | null;
  mine: boolean;
  createdAt: string;
  updatedAt: string;
};
type Folder = { id: string; name: string; color: string };
type Limits = { used: number; quota: number; maxFile: number };
type Up = { key: string; name: string; size: number; sent: number; error?: string };
type Cols = { list?: number };

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const SH = 'sh:';
/** Word / Excel files are read in the browser only up to this size */
const OFFICE_PREVIEW_MAX = 25 * 1024 * 1024;
const XL_ROWS = 500;
const XL_COLS = 40;

const Svg = ({ d, s = 15 }: { d: string; s?: number }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
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
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
  x: '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>',
  open: '<path d="M14 4h6v6"></path><path d="M20 4l-9 9"></path><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path>',
  down: '<path d="M12 4v12"></path><path d="M7 11l5 5 5-5"></path><path d="M4 20h16"></path>',
  trash: '<path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path>',
  share:
    '<circle cx="18" cy="5" r="2.5"></circle><circle cx="6" cy="12" r="2.5"></circle><circle cx="18" cy="19" r="2.5"></circle><path d="M8.2 10.8l7.6-4.4"></path><path d="M8.2 13.2l7.6 4.4"></path>',
  file: '<path d="M7 3h7l5 5v13H7z"></path><path d="M14 3v5h5"></path>',
};

/** a colour per kind of file, for the badge in the list */
const KIND_TINT: Record<PreviewKind, string> = {
  pdf: 'oklch(0.62 0.17 25)',
  image: 'oklch(0.62 0.13 300)',
  video: 'oklch(0.6 0.13 340)',
  audio: 'oklch(0.62 0.12 200)',
  text: 'oklch(0.55 0.03 60)',
  docx: 'oklch(0.55 0.13 255)',
  xlsx: 'oklch(0.58 0.13 150)',
  none: 'oklch(0.5 0.02 60)',
};
const officeTint = (name: string) => {
  const e = extOf(name);
  if (['doc', 'docx', 'odt', 'rtf'].includes(e)) return KIND_TINT.docx;
  if (['xls', 'xlsx', 'xlsm', 'ods', 'csv'].includes(e)) return KIND_TINT.xlsx;
  if (['ppt', 'pptx', 'odp'].includes(e)) return 'oklch(0.62 0.15 45)';
  if (['zip', 'rar', '7z', 'gz', 'tar'].includes(e)) return 'oklch(0.6 0.1 80)';
  return null;
};
const tintOf = (name: string) => officeTint(name) ?? KIND_TINT[previewKind(name)];
const raw = (id: string, dl = false) => `${BASE}/api/v1/drive/${id}/raw${dl ? '?dl=1' : ''}`;
const langFor = (name: string) => {
  const e = extOf(name);
  if (e === 'abap') return 'abap';
  if (['txt', 'log', 'csv', 'tsv', 'env', 'gitignore', 'properties', 'ini', 'cfg', 'conf'].includes(e))
    return 'plain';
  return DEV_LANGS.find((l) => l.ext === e)?.id ?? null;
};

export function DriveView() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const { focus } = useShell();
  const [cols, setCols] = usePref<Cols>('cols', {});
  const [liveList, setLiveList] = useState<number | null>(null);
  const [folder0, setFolder] = usePersistentState<string>('files.folder', 'all');
  const [items, setItems] = useState<DFile[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [q, setQ] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [ups, setUps] = useState<Up[]>([]);
  const [name, setName] = useState('');
  const activeId = sp.get('f');
  const sh = useSharedFolders('files');
  const [fs, setFs] = useState<{ folderId?: string; sharedId?: string; title?: string } | null>(null);
  const [shItems, setShItems] = useState<DFile[] | null>(null);
  const gone = folder0.startsWith(SH) && sh.loaded && !sh.folders.some((x) => SH + x.id === folder0);
  const folder = gone ? 'all' : folder0;
  const shId = folder.startsWith(SH) ? folder.slice(SH.length) : undefined;
  const curShared = shId ? sh.folders.find((x) => x.id === shId) : undefined;

  const open = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (id) next.set('f', id);
      else next.delete('f');
      router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [path, router, sp],
  );

  const load = useCallback(() => {
    api<{ files: DFile[]; folders: Folder[]; limits: Limits }>('/drive')
      .then((r) => {
        setItems(r.files);
        setFolders(r.folders);
        setLimits(r.limits);
      })
      .catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  const loadShared = useCallback(() => {
    if (!shId) return;
    api<{ files: DFile[] }>(`/drive?shared=${shId}`)
      .then((r) => setShItems(r.files))
      .catch(() => setShItems([]));
  }, [shId]);
  useEffect(() => {
    setShItems(null);
    loadShared();
  }, [loadShared]);

  const all = useMemo(() => items ?? [], [items]);
  const pool = useMemo(
    () => [...all, ...(shItems ?? []).filter((x) => !all.some((y) => y.id === x.id))],
    [all, shItems],
  );
  const active = pool.find((x) => x.id === activeId) ?? null;
  useEffect(() => setName(active?.name ?? ''), [active?.id, active?.name]);

  const fail = (e?: unknown) => {
    const code = isApiFailure(e) ? e.code : '';
    toast({
      message:
        code === 'file_too_large'
          ? t('fl_tooBig').replace('{max}', fmtBytes(limits?.maxFile ?? FILES_MAX_MB * 1024 * 1024, lang))
          : code === 'limit_reached'
            ? t('fl_quotaFull')
            : t('ne_saveFail'),
      tone: 'error',
    });
  };
  const sync = (f: DFile) => {
    setItems(
      (cur) => cur && (cur.some((x) => x.id === f.id) ? cur.map((x) => (x.id === f.id ? f : x)) : cur),
    );
    setShItems((cur) => cur && cur.map((x) => (x.id === f.id ? f : x)));
  };
  const patch = async (id: string, p: Partial<Pick<DFile, 'name' | 'folderId' | 'sharedFolderId'>>) => {
    try {
      const { file } = await api<{ file: DFile }>(`/drive/${id}`, p, 'PATCH');
      sync(file);
      return file;
    } catch (e) {
      fail(e);
      return null;
    }
  };

  // ── Upload (chunks, one file after the other) ──────────────────────────────
  const uploadOne = async (file: File, target: { folderId: string | null; sharedFolderId?: string }) => {
    const key = `${Date.now()}-${Math.random()}`;
    const setUp = (p: Partial<Up>) => setUps((cur) => cur.map((u) => (u.key === key ? { ...u, ...p } : u)));
    setUps((cur) => [...cur, { key, name: file.name, size: file.size, sent: 0 }]);
    let uploadId: string | null = null;
    try {
      const s = await api<{ uploadId: string; partSize: number; parts: number }>('/drive/uploads', {
        name: file.name,
        size: file.size,
        mime: file.type || undefined,
        ...target,
      });
      uploadId = s.uploadId;
      for (let n = 1; n <= s.parts; n++) {
        const chunk = file.slice((n - 1) * s.partSize, n * s.partSize);
        const res = await fetch(`${BASE}/api/v1/drive/uploads/${s.uploadId}/${n}`, {
          method: 'PUT',
          body: chunk,
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/octet-stream' },
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
          throw { code: d.error?.code ?? 'internal', status: res.status };
        }
        setUp({ sent: Math.min(file.size, n * s.partSize) });
      }
      const { file: f } = await api<{ file: DFile }>(`/drive/uploads/${s.uploadId}`, {});
      setItems((cur) => [f, ...(cur ?? [])]);
      if (target.sharedFolderId) setShItems((cur) => [f, ...(cur ?? [])]);
      setUps((cur) => cur.filter((u) => u.key !== key));
      return f;
    } catch (e) {
      if (uploadId) void api(`/drive/uploads/${uploadId}`, undefined, 'DELETE').catch(() => {});
      setUps((cur) => cur.filter((u) => u.key !== key));
      fail(e);
      return null;
    }
  };
  const upload = async (list: FileList | File[]) => {
    const files = [...list];
    if (!files.length) return;
    if (curShared && !(await confirm(sharedConfirm(t, curShared, false)))) return;
    if (curShared && !curShared.mine && curShared.perm !== 'edit') return;
    const target = curShared
      ? { folderId: null, sharedFolderId: curShared.id }
      : { folderId: folder !== 'all' && folders.some((f) => f.id === folder) ? folder : null };
    let last: DFile | null = null;
    for (const f of files) {
      const max = limits?.maxFile ?? FILES_MAX_MB * 1024 * 1024;
      if (f.size > max) {
        toast({
          message: `${f.name}: ${t('fl_tooBig').replace('{max}', fmtBytes(max, lang))}`,
          tone: 'error',
        });
        continue;
      }
      last = (await uploadOne(f, target)) ?? last;
    }
    if (last) open(last.id);
    load();
    refreshCounts();
  };

  // ── Folders ───────────────────────────────────────────────────────────────
  const addFolder = async () => {
    const n = newFolder.trim();
    if (!n) return;
    try {
      const { folder: f } = await api<{ folder: Folder }>('/drive/folders', { name: n.slice(0, 80) });
      setFolders((cur) => [...cur, f]);
      setNewFolder('');
      setFolder(f.id);
    } catch (e) {
      fail(e);
    }
  };
  const removeFolder = async (f: Folder) => {
    try {
      await api(`/drive/folders/${f.id}`, undefined, 'DELETE');
    } catch {
      toast({ message: t('ui_delFail'), tone: 'error' });
      return;
    }
    setFolders((cur) => cur.filter((x) => x.id !== f.id));
    setItems((cur) => cur && cur.map((x) => (x.folderId === f.id ? { ...x, folderId: null } : x)));
    if (folder === f.id) setFolder('all');
  };
  const dropOn = async (id: string, target: string) => {
    const a = pool.find((x) => x.id === id);
    if (!a || !a.mine) return;
    const toShared = target.startsWith(SH) ? sh.folders.find((x) => SH + x.id === target) : undefined;
    if (toShared) {
      if (a.sharedFolderId === toShared.id) return;
      if (!(await confirm(sharedConfirm(t, toShared, true)))) return;
      await patch(id, { sharedFolderId: toShared.id });
    } else
      await patch(id, {
        folderId: target === 'all' ? null : target,
        ...(a.sharedFolderId ? { sharedFolderId: null } : {}),
      });
    if (shId && target !== folder) setShItems((cur) => cur && cur.filter((x) => x.id !== id));
  };

  const remove = async () => {
    if (!active) return;
    const ok = await confirm({
      title: t('tr_askTitle'),
      body: t('tr_askBody').replace('{x}', active.name),
      confirmLabel: t('tr_move'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    const idx = list.findIndex((x) => x.id === active.id);
    const rest = list.filter((x) => x.id !== active.id);
    try {
      await api(`/drive/${active.id}`, undefined, 'DELETE');
    } catch {
      toast({ message: t('ui_delFail'), tone: 'error' });
      return;
    }
    setItems((cur) => cur && cur.filter((x) => x.id !== active.id));
    setShItems((cur) => cur && cur.filter((x) => x.id !== active.id));
    open(rest[Math.min(idx, rest.length - 1)]?.id ?? null);
    refreshCounts();
  };
  const rename = () => {
    if (!active) return;
    const n = name.trim();
    if (!n || n === active.name) return setName(active.name);
    // keep the extension unless one was typed
    const ext = extOf(active.name);
    const next = active.name.includes('.') && !n.includes('.') ? `${n}.${ext}` : n;
    void patch(active.id, { name: next });
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const query = q.trim().toLowerCase();
  const list = (shId ? (shItems ?? []) : all).filter(
    (a) =>
      (folder === 'all' || shId || a.folderId === folder) && (!query || a.name.toLowerCase().includes(query)),
  );
  const linkedOf = (folderId: string) => sh.folders.find((x) => x.mine && x.folderId === folderId);
  const isShared = (a: DFile) => {
    const l = a.folderId ? linkedOf(a.folderId) : undefined;
    return !!a.sharedFolderId || (!!l && l.members.length > 0 && !l.paused);
  };
  const activeShared =
    active && !active.mine
      ? (sh.folders.find((x) => x.id === active.sharedFolderId) ?? curShared)
      : undefined;
  const canUpload = !curShared || curShared.mine || curShared.perm === 'edit';
  const fmtStamp = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  const listW = liveList ?? cols.list ?? COL_DEFAULTS.list;
  const quota = limits?.quota ?? FILES_QUOTA_MB * 1024 * 1024;
  const used = limits?.used ?? 0;
  const pct = Math.min(100, (used / quota) * 100);
  const isDefault =
    !limits ||
    (limits.quota === FILES_QUOTA_MB * 1024 * 1024 && limits.maxFile === FILES_MAX_MB * 1024 * 1024);

  return (
    <div
      className="kh-em kh-fl"
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
                placeholder={t('fl_search')}
                aria-label={t('fl_search')}
              />
            </label>
            <label className="kh-ar-new kh-fl-up" title={t('fl_upload')} data-off={!canUpload || undefined}>
              <Svg d={I.upload} s={17} />
              <input
                type="file"
                multiple
                disabled={!canUpload}
                aria-label={t('fl_upload')}
                onChange={(e) => {
                  const f = e.target.files ? [...e.target.files] : [];
                  e.target.value = '';
                  void upload(f);
                }}
              />
            </label>
          </div>
          <div className="kh-fl-quota" data-full={pct >= 90 || undefined}>
            <div className="kh-fl-quota__row">
              <span>{t('fl_space')}</span>
              <b>
                {fmtBytes(used, lang)} / {fmtBytes(quota, lang)}
              </b>
            </div>
            <div
              className="kh-fl-quota__bar"
              role="meter"
              aria-label={t('fl_space')}
              aria-valuemin={0}
              aria-valuemax={quota}
              aria-valuenow={used}
            >
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className="kh-fl-quota__note">
              {(isDefault ? t('fl_limitsNote') : t('fl_limitsYours'))
                .replace('{quota}', fmtBytes(quota, lang))
                .replace('{max}', fmtBytes(limits?.maxFile ?? FILES_MAX_MB * 1024 * 1024, lang))}
            </div>
          </div>
          <div className="kh-em-folders kh-ar-folders">
            {(
              [
                { id: 'all', name: t('fl_all'), top: true },
                ...folders,
                ...sh.folders
                  .filter((x) => !x.folderId)
                  .map((x) => ({ id: SH + x.id, name: x.name, shared: x })),
              ] as Array<{ id: string; name: string; top?: true; shared?: SharedFolder }>
            ).map((f) => {
              const top = !!f.top;
              const shf = f.shared;
              const linked = !top && !shf ? linkedOf(f.id) : undefined;
              const marked = !!shf || (!!linked && linked.members.length > 0 && !linked.paused);
              const n = top
                ? all.length
                : shf
                  ? shId === shf.id && shItems
                    ? shItems.length
                    : all.filter((a) => a.sharedFolderId === shf.id).length
                  : all.filter((a) => a.folderId === f.id).length;
              const tip =
                shf && !shf.mine ? t('sh_sharedBy').replace('{who}', shf.owner?.name ?? '') : t('sh_shared');
              return (
                <div
                  key={f.id}
                  className="kh-em-folder"
                  data-on={folder === f.id || undefined}
                  data-top={top || undefined}
                  onClick={() => setFolder(f.id)}
                  onDragOver={(e) => dragId && e.preventDefault()}
                  onDrop={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (!shf || shf.mine || shf.perm === 'edit') void dropOn(dragId, f.id);
                    setDragId(null);
                  }}
                >
                  <Svg d={I.folder} s={17} />
                  {marked && (
                    <span className="kh-sh-mark" role="img" title={tip} aria-label={tip}>
                      <Svg d={I.share} s={13} />
                    </span>
                  )}
                  <button
                    type="button"
                    className="kh-rowbtn kh-em-folder__name"
                    aria-current={folder === f.id || undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFolder(f.id);
                    }}
                  >
                    {f.name}
                  </button>
                  {!top && sh.canShare && (!shf || shf.mine) && (
                    <button
                      type="button"
                      title={t('sh_fpTitle')}
                      aria-label={`${t('sh_fpTitle')} ${f.name}`}
                      style={marked || shf ? { color: 'oklch(0.86 0.13 150)' } : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFs(shf ? { sharedId: shf.id } : { folderId: f.id, title: f.name });
                      }}
                    >
                      <Svg d={I.share} s={14} />
                    </button>
                  )}
                  {!top && !shf && (
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
              {sh.canShare && (
                <button
                  type="button"
                  className="kh-ar-newshared"
                  title={t('sh_newSharedTip')}
                  aria-label={t('sh_newSharedTip')}
                  onClick={() => setFs({})}
                >
                  <Svg d={I.share} s={16} />
                </button>
              )}
            </div>
          </div>
          <section
            className="kh-em-list kh-fl-list"
            aria-label={t('nav_files')}
            data-drop={dropping || undefined}
            onDragOver={(e) => {
              if (dragId || !canUpload || !e.dataTransfer.types.includes('Files')) return;
              e.preventDefault();
              setDropping(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
            }}
            onDrop={(e) => {
              if (dragId || !e.dataTransfer.files.length) return;
              e.preventDefault();
              setDropping(false);
              void upload(e.dataTransfer.files);
            }}
          >
            {ups.map((u) => (
              <div key={u.key} className="kh-fl-item kh-fl-item--up" aria-busy="true">
                <span className="kh-fl-badge" style={{ background: tintOf(u.name) }}>
                  {extOf(u.name).slice(0, 4) || '·'}
                </span>
                <div>
                  <span>{u.name}</span>
                  <div className="kh-fl-prog">
                    <span style={{ width: `${u.size ? (u.sent / u.size) * 100 : 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
            {list.map((a) => (
              <div
                key={a.id}
                className="kh-fl-item"
                data-on={a.id === activeId || undefined}
                data-drag={dragId === a.id || undefined}
                role="button"
                tabIndex={0}
                draggable={a.mine}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', a.id);
                  setDragId(a.id);
                }}
                onDragEnd={() => setDragId(null)}
                onClick={() => open(a.id)}
                onKeyDown={(e) => e.key === 'Enter' && open(a.id)}
              >
                <span className="kh-fl-badge" style={{ background: tintOf(a.name) }}>
                  {extOf(a.name).slice(0, 4) || '·'}
                </span>
                <div>
                  <span title={a.name}>{a.name}</span>
                  <span>
                    {fmtBytes(a.size, lang)} · {fmtStamp(a.createdAt)}
                  </span>
                </div>
                {isShared(a) && (
                  <span className="kh-sh-mark" title={t('sh_shared')}>
                    <Svg d={I.share} s={12} />
                  </span>
                )}
              </div>
            ))}
            {items && !list.length && !ups.length && (
              <div className="kh-em-empty kh-fl-empty">
                <Svg d={I.upload} s={22} />
                {canUpload ? t('fl_empty') : t('fl_emptyRo')}
              </div>
            )}
          </section>
        </div>
      )}

      <section className="kh-em-read">
        {active ? (
          <div className="kh-ar-main kh-fl-main">
            <div className="kh-ar-head">
              <div className="kh-ar-titles kh-fl-titles">
                <input
                  className="kh-ar-title kh-fl-name"
                  value={name}
                  readOnly={!active.mine}
                  maxLength={255}
                  aria-label={t('fl_name')}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={rename}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
                <div className="kh-fl-meta">
                  <span>{fmtBytes(active.size, lang)}</span>
                  <span>{extOf(active.name).toUpperCase()}</span>
                  <span>
                    {t('createdAt')} {fmtStamp(active.createdAt)}
                  </span>
                  {!active.mine && (
                    <span>
                      {t('sh_sharedBy').replace('{who}', activeShared?.owner?.name ?? '')}
                      {activeShared?.perm === 'read' && ` · ${t('sh_readOnly')}`}
                    </span>
                  )}
                </div>
              </div>
              <div className="kh-fl-acts">
                {active.mine && (
                  <ShareButton
                    itemType="file"
                    itemId={active.id}
                    title={active.name}
                    variant="round"
                    className="kh-em-act"
                  />
                )}
                {inlineType(active.name) && (
                  <a
                    className="kh-em-act"
                    href={raw(active.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t('a_openTab')}
                    aria-label={t('a_openTab')}
                  >
                    <Svg d={I.open} />
                  </a>
                )}
                <a
                  className="kh-em-act"
                  href={raw(active.id, true)}
                  download={active.name}
                  title={t('fl_download')}
                  aria-label={t('fl_download')}
                >
                  <Svg d={I.down} />
                </a>
                {active.mine && (
                  <button
                    type="button"
                    className="kh-em-act"
                    title={t('del')}
                    aria-label={t('del')}
                    onClick={() => void remove()}
                  >
                    <Svg d={I.trash} />
                  </button>
                )}
              </div>
            </div>
            <Preview key={active.id} f={active} />
          </div>
        ) : (
          <div className="kh-em-none kh-fl-none">
            <Svg d={I.file} s={28} />
            <span>{t('fl_noActive')}</span>
          </div>
        )}
      </section>
      {fs && (
        <FolderShareDialog
          kind="files"
          folderId={fs.folderId}
          sharedId={fs.sharedId}
          title={fs.title}
          onClose={() => setFs(null)}
          onCreated={(id) => {
            if (!fs.folderId) setFolder(SH + id);
          }}
        />
      )}
    </div>
  );
}

// ── Preview ─────────────────────────────────────────────────────────────────

type Sheet = { names: string[]; at: number; rows: Array<Array<unknown>>; more: boolean };

function Preview({ f }: { f: DFile }) {
  const { t, lang } = useI18n();
  const kind = previewKind(f.name);
  const [text, setText] = useState<{ body: string; cut: boolean } | null>(null);
  const [doc, setDoc] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [err, setErr] = useState(false);
  const buf = useRef<ArrayBuffer | null>(null);
  const big = (kind === 'docx' || kind === 'xlsx') && f.size > OFFICE_PREVIEW_MAX;

  const readSheet = useCallback(async (at: number, names?: string[]) => {
    const { default: readXlsx, readSheetNames } = await import('read-excel-file');
    const b = buf.current!;
    const ns = names ?? (await readSheetNames(new Blob([b])));
    const rows = (await readXlsx(new Blob([b]), { sheet: ns[at] ?? 1 })) as unknown as Array<Array<unknown>>;
    setSheet({ names: ns, at, rows: rows.slice(0, XL_ROWS), more: rows.length > XL_ROWS });
  }, []);

  useEffect(() => {
    if (big) return;
    let live = true;
    const go = async () => {
      if (kind === 'text') {
        const res = await fetch(raw(f.id), {
          headers: { Range: `bytes=0-${TEXT_PREVIEW_MAX - 1}` },
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error('read');
        const body = new TextDecoder().decode(await res.arrayBuffer());
        if (live) setText({ body, cut: f.size > TEXT_PREVIEW_MAX });
      } else if (kind === 'docx' || kind === 'xlsx') {
        const res = await fetch(raw(f.id), { credentials: 'same-origin' });
        if (!res.ok) throw new Error('read');
        buf.current = await res.arrayBuffer();
        if (!live) return;
        if (kind === 'docx') {
          const mammoth = await import('mammoth');
          const r = await mammoth.convertToHtml({ arrayBuffer: buf.current });
          if (live) setDoc(r.value);
        } else await readSheet(0);
      }
    };
    go().catch(() => live && setErr(true));
    return () => {
      live = false;
    };
  }, [f.id, f.size, kind, big, readSheet]);

  const none = (msg: string) => (
    <div className="kh-fl-stage kh-fl-nopv">
      <span className="kh-fl-badge kh-fl-badge--lg" style={{ background: tintOf(f.name) }}>
        {extOf(f.name).slice(0, 4) || '·'}
      </span>
      <p>{msg}</p>
      <a className="kh-fl-dl" href={raw(f.id, true)} download={f.name}>
        <Svg d={I.down} /> {t('fl_download')} · {fmtBytes(f.size, lang)}
      </a>
    </div>
  );
  if (kind === 'none') return none(t('fl_noPreview'));
  if (big) return none(t('fl_tooBigPreview'));
  if (err) return none(t('fl_previewFail'));
  if (kind === 'pdf') return <iframe className="kh-fl-stage kh-fl-pdf" src={raw(f.id)} title={f.name} />;
  if (kind === 'image')
    return (
      <div className="kh-fl-stage kh-fl-media">
        {/* eslint-disable-next-line @next/next/no-img-element -- a user's file, served by the API */}
        <img src={raw(f.id)} alt={f.name} />
      </div>
    );
  if (kind === 'video')
    return (
      <div className="kh-fl-stage kh-fl-media">
        <video src={raw(f.id)} controls preload="metadata" />
      </div>
    );
  if (kind === 'audio')
    return (
      <div className="kh-fl-stage kh-fl-media kh-fl-audio">
        <audio src={raw(f.id)} controls preload="metadata" />
      </div>
    );
  if (kind === 'text')
    return text ? (
      <div className="kh-fl-stage kh-fl-text">
        <pre>
          <code dangerouslySetInnerHTML={{ __html: codeHtml(text.body, langFor(f.name)) }} />
        </pre>
        {text.cut && <div className="kh-fl-cut">{t('fl_textCut')}</div>}
      </div>
    ) : (
      <div className="kh-fl-stage kh-fl-loading">{t('ui_loading')}</div>
    );
  if (kind === 'docx')
    return doc !== null ? (
      // the converted document runs in a sandbox without scripts or same-origin access
      <iframe
        className="kh-fl-stage kh-fl-doc"
        sandbox=""
        title={f.name}
        srcDoc={`<!doctype html><meta charset="utf-8"><style>${DOC_CSS}<${'/'}style><body>${doc}</body>`}
      />
    ) : (
      <div className="kh-fl-stage kh-fl-loading">{t('ui_loading')}</div>
    );
  // xlsx
  return sheet ? (
    <div className="kh-fl-stage kh-fl-sheet">
      {sheet.names.length > 1 && (
        <div className="kh-em-seg kh-fl-tabs" role="tablist">
          {sheet.names.map((n, i) => (
            <button
              key={n}
              type="button"
              role="tab"
              aria-selected={i === sheet.at}
              data-on={i === sheet.at || undefined}
              onClick={() => void readSheet(i, sheet.names).catch(() => setErr(true))}
            >
              {n}
            </button>
          ))}
        </div>
      )}
      <div className="kh-fl-grid">
        <table>
          <tbody>
            {sheet.rows.map((r, i) => (
              <tr key={i}>
                <th>{i + 1}</th>
                {r.slice(0, XL_COLS).map((c, j) => (
                  <td key={j}>{cell(c, lang)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!sheet.rows.length && <div className="kh-fl-cut">{t('fl_sheetEmpty')}</div>}
      </div>
      {sheet.more && <div className="kh-fl-cut">{t('fl_sheetCut').replace('{n}', String(XL_ROWS))}</div>}
    </div>
  ) : (
    <div className="kh-fl-stage kh-fl-loading">{t('ui_loading')}</div>
  );
}

const cell = (c: unknown, lang: string) =>
  c === null || c === undefined
    ? ''
    : c instanceof Date
      ? c.toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-PT')
      : typeof c === 'number'
        ? c.toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT', { maximumFractionDigits: 6 })
        : String(c);

const DOC_CSS =
  'html{background:#fff}body{margin:0 auto;max-width:820px;padding:40px 48px;font:15px/1.6 Geist,system-ui,sans-serif;color:#1d1a17}' +
  'img{max-width:100%;height:auto}table{border-collapse:collapse;margin:12px 0}td,th{border:1px solid #d8d2cb;padding:5px 8px;vertical-align:top}' +
  'h1,h2,h3{line-height:1.25}p{margin:0 0 10px}';
