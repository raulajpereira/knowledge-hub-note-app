'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { JSONContent } from '@tiptap/react';
import { useI18n } from '@/i18n/client';
import { useConfirm, usePersistentState, useToast } from '@/components/ui';
import { isApiFailure } from '@/lib/client/api';
import { COL_DEFAULTS, COL_LIMITS } from '@/lib/prefs';
import { usePref } from '@/components/shell/PrefsProvider';
import { useShell } from '@/components/shell/ShellContext';
import { refreshCounts } from '@/components/shell/counts';
import { Connections } from '@/components/content/Connections';
import { useWhen } from '@/components/content/useWhen';
import { ColHandle } from '@/components/content/ColHandle';
import { ChecklistBar, EditorContent, EditorToolbar, InsertBar, useNoteEditor } from './NoteEditor';
import { notesApi, type Folder, type FolderList, type Note, type NoteItem } from './notesApi';
import './notes.css';

// ZNotes.dc.html `isNotes`: folders + list column · editor · inspector.

type Cols = { side?: number; list?: number; insp?: number };
const NO_FOLDER = { name: '', color: 'rgba(255,248,240,.35)' };

const P = {
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
};
function Svg({ d, size = 14, sw = 1.9 }: { d: string; size?: number; sw?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}

// ── Folders panel ──────────────────────────────────────────────────────────
function FoldersPanel({
  data,
  filter,
  setFilter,
  onCreated,
  onRename,
  onNewNote,
  onDuplicate,
  onDelete,
  onDropNote,
}: {
  data: FolderList | null;
  filter: string;
  setFilter: (f: string) => void;
  onCreated: (f: Folder) => void;
  onRename: (f: Folder, name: string) => void;
  onNewNote: (f: Folder) => void;
  onDuplicate: (f: Folder) => void;
  onDelete: (f: Folder) => void;
  onDropNote: (noteId: string, target: string) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [over, setOver] = useState<string | null>(null);

  const create = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      const { folder } = await notesApi.createFolder(n);
      setAdding(false);
      setName('');
      onCreated({ ...folder, sort: 0, count: 0 });
    } catch {
      toast({ message: t('ne_saveFail'), tone: 'error' });
    }
  };

  const rows: Array<{ id: string; name: string; color: string; count: number; top?: boolean; f?: Folder }> = [
    { id: 'all', name: t('all'), color: 'transparent', count: data?.total ?? 0, top: true },
    { id: 'fav', name: t('fav'), color: 'oklch(0.85 0.13 85)', count: data?.favorites ?? 0, top: true },
    ...(data?.folders ?? []).map((f) => ({ id: f.id, name: f.name, color: f.color, count: f.count, f })),
  ];

  return (
    <div className="kh-nt-folders kh-nt-glass">
      {rows.map((r) => {
        const on = filter === r.id;
        const dropOk = r.id !== 'all';
        return (
          <div
            key={r.id}
            className="kh-nt-folder"
            data-on={on || undefined}
            data-over={over === r.id || undefined}
            data-top={r.top || undefined}
            role="button"
            tabIndex={0}
            onClick={() => setFilter(r.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.target === e.currentTarget) setFilter(r.id);
            }}
            onDragOver={(e) => {
              if (!dropOk || !e.dataTransfer.types.includes('application/x-kh-note')) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setOver(r.id);
            }}
            onDragLeave={() => setOver((o) => (o === r.id ? null : o))}
            onDrop={(e) => {
              const id = e.dataTransfer.getData('application/x-kh-note');
              setOver(null);
              if (id && dropOk) {
                e.preventDefault();
                onDropNote(id, r.id);
              }
            }}
          >
            <Svg d={P.folder} size={17} sw={1.8} />
            <span className="kh-nt-folder__dot" style={{ background: r.color }} />
            {editing === r.id && r.f ? (
              <input
                className="kh-nt-folder__edit"
                autoFocus
                value={editName}
                aria-label={t('rename')}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => {
                  if (editName.trim() && editName.trim() !== r.name) onRename(r.f!, editName.trim());
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  else if (e.key === 'Escape') setEditing(null);
                }}
              />
            ) : (
              <span className="kh-nt-folder__name">{r.name}</span>
            )}
            {r.f && editing !== r.id && (
              <div className="kh-nt-folder__acts">
                <button
                  type="button"
                  title={t('rename')}
                  aria-label={t('rename')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditName(r.name);
                    setEditing(r.id);
                  }}
                >
                  <Svg d={P.pencil} />
                </button>
                <button
                  type="button"
                  title={t('newNote')}
                  aria-label={t('newNote')}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNewNote(r.f!);
                  }}
                >
                  <Svg d={P.plus} />
                </button>
                <button
                  type="button"
                  title={t('duplicate')}
                  aria-label={t('duplicate')}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate(r.f!);
                  }}
                >
                  <Svg d={P.dup} />
                </button>
                <button
                  type="button"
                  title={t('del')}
                  aria-label={t('del')}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(r.f!);
                  }}
                >
                  <Svg d={P.trash} />
                </button>
              </div>
            )}
            <span className="kh-nt-folder__n">{r.count}</span>
          </div>
        );
      })}
      {adding && (
        <div className="kh-nt-addrow">
          <input
            autoFocus
            value={name}
            placeholder={t('ne_folderPh')}
            aria-label={t('ne_folderPh')}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void create();
              } else if (e.key === 'Escape') setAdding(false);
            }}
          />
          <button type="button" className="kh-nt-addrow__ok" onClick={() => void create()}>
            OK
          </button>
          <button type="button" className="kh-nt-addrow__x" aria-label="×" onClick={() => setAdding(false)}>
            ×
          </button>
        </div>
      )}
      <button type="button" className="kh-nt-newfolder" onClick={() => setAdding(true)}>
        <Svg d={P.plus} size={15} sw={2.4} />
        {t('newFolder')}
      </button>
    </div>
  );
}

// ── Note list ──────────────────────────────────────────────────────────────
function NoteList({
  title,
  items,
  folders,
  activeId,
  loading,
  onOpen,
  onNew,
}: {
  title: string;
  items: NoteItem[];
  folders: Map<string, Folder>;
  activeId: string | null;
  loading: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const { t } = useI18n();
  const when = useWhen();
  const [dragId, setDragId] = useState<string | null>(null);
  return (
    <section className="kh-nt-list kh-nt-glass">
      <div className="kh-nt-list__head">
        <div className="kh-nt-list__title">
          <div>{title}</div>
          <div className="kh-nt-list__count">
            {items.length}
            {items.length === 1 ? t('note1') : t('noteN')}
          </div>
        </div>
        <button
          type="button"
          className="kh-nt-list__new"
          title={t('newNote')}
          aria-label={t('newNote')}
          onClick={onNew}
        >
          <Svg d={P.plus} size={15} sw={2.4} />
        </button>
      </div>
      <div className="kh-nt-list__items">
        {items.map((n) => {
          const f = (n.folderId && folders.get(n.folderId)) || NO_FOLDER;
          const on = n.id === activeId;
          return (
            <button
              key={n.id}
              type="button"
              className="kh-nt-card"
              data-on={on || undefined}
              data-drag={dragId === n.id || undefined}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-kh-note', n.id);
                e.dataTransfer.effectAllowed = 'move';
                setDragId(n.id);
              }}
              onDragEnd={() => setDragId(null)}
              onClick={() => onOpen(n.id)}
            >
              <div className="kh-nt-card__meta">
                <span className="kh-nt-card__dot" style={{ background: f.color }} />
                <span>{f.name || t('ne_noFolder')}</span>
                <span style={{ flex: 1 }} />
                {n.favorite && <span className="kh-nt-card__star">★</span>}
                <span>{when(n.updatedAt)}</span>
              </div>
              <div className="kh-nt-card__title">{n.title || t('ne_untitled')}</div>
              {n.summary && <div className="kh-nt-card__sum">{n.summary}</div>}
              {n.tags.length > 0 && (
                <div className="kh-nt-card__tags">
                  {n.tags.map((tg) => (
                    <span key={tg}>{tg}</span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
        {!loading && items.length === 0 && <div className="kh-nt-list__empty">{t('noResults')}</div>}
      </div>
    </section>
  );
}

// ── Tags row under the title ───────────────────────────────────────────────
function TagsRow({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [val, setVal] = useState('');
  const add = () => {
    const v = val.trim().slice(0, 40);
    setVal('');
    setAdding(false);
    if (v && !tags.includes(v)) onChange([...tags, v]);
  };
  return (
    <div className="kh-nt-tags">
      {tags.map((tg) => (
        <span key={tg} className="kh-nt-tag">
          <span>{tg}</span>
          <button
            type="button"
            aria-label={`${t('del')} ${tg}`}
            onClick={() => onChange(tags.filter((x) => x !== tg))}
          >
            <Svg d={P.x} size={10} sw={2.4} />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          className="kh-nt-tag kh-nt-tag--input"
          autoFocus
          value={val}
          placeholder={t('ne_tagPh')}
          aria-label={t('ne_tagPh')}
          maxLength={40}
          onChange={(e) => setVal(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            } else if (e.key === 'Escape') {
              setVal('');
              setAdding(false);
            }
          }}
        />
      ) : (
        tags.length < 30 && (
          <button type="button" className="kh-nt-tag kh-nt-tag--add" onClick={() => setAdding(true)}>
            {t('ne_tagAdd')}
          </button>
        )
      )}
    </div>
  );
}

// ── Editor card ────────────────────────────────────────────────────────────
function EditorCard({
  note,
  folder,
  onPatch,
  onDelete,
}: {
  note: Note;
  folder: { name: string; color: string };
  onPatch: (patch: Partial<Pick<Note, 'title' | 'content' | 'tags' | 'favorite'>>) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(note.title);
  const [ask, setAsk] = useState<'link' | 'img' | null>(null);
  const onChange = useCallback((doc: JSONContent) => onPatch({ content: doc }), [onPatch]);
  // The title wraps like the prototype's h1 (auto-height textarea).
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);
  const { editor, uploadFiles } = useNoteEditor({ noteId: note.id, content: note.content, onChange });

  return (
    <article className="kh-nt-editor">
      <div className="kh-nt-editor__bar">
        <div className="kh-nt-crumb">
          <span className="kh-nt-card__dot" style={{ background: folder.color }} />
          <span>{folder.name || t('ne_noFolder')}</span>
          <span>/</span>
          <span className="kh-nt-crumb__cur">{title || t('ne_untitled')}</span>
        </div>
        <div style={{ flex: 1 }} />
        <EditorToolbar editor={editor} onAsk={setAsk} />
        <button
          type="button"
          className="kh-nt-round"
          style={{ color: note.favorite ? 'oklch(0.85 0.13 85)' : 'rgba(255,248,240,.6)', fontSize: 17 }}
          title={note.favorite ? t('ne_unfav') : t('ne_addFav')}
          aria-label={note.favorite ? t('ne_unfav') : t('ne_addFav')}
          aria-pressed={note.favorite}
          onClick={() => onPatch({ favorite: !note.favorite })}
        >
          ★
        </button>
        <button
          type="button"
          className="kh-nt-round"
          style={{ color: '#ffc9b8' }}
          title={t('del')}
          aria-label={t('del')}
          onClick={onDelete}
        >
          <Svg d={P.trash} size={15} />
        </button>
      </div>
      <div className="kh-nt-editor__scroll">
        <div className="kh-nt-editor__body">
          <div className="kh-nt-editor__head">
            <textarea
              ref={titleRef}
              rows={1}
              className="kh-nt-title"
              value={title}
              placeholder={t('ne_untitled')}
              aria-label={t('ne_untitled')}
              maxLength={300}
              onChange={(e) => {
                const v = e.target.value.replace(/\n/g, ' ');
                setTitle(v);
                onPatch({ title: v });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  editor?.view.focus();
                  editor?.commands.setTextSelection(1);
                }
              }}
            />
            <TagsRow tags={note.tags} onChange={(tags) => onPatch({ tags })} />
          </div>
          <div className="kh-nt-doc">
            {ask && editor && (
              <InsertBar
                editor={editor}
                noteId={note.id}
                ui={ask}
                onClose={() => setAsk(null)}
                onUpload={(files) => void uploadFiles(editor, files)}
              />
            )}
            <ChecklistBar editor={editor} />
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </article>
  );
}

// ── Inspector: Ligações + Detalhes ─────────────────────────────────────────
function Inspector({ note, folderName, author }: { note: Note; folderName: string; author: string }) {
  const { t } = useI18n();
  const when = useWhen();
  return (
    <aside className="kh-nt-insp">
      <Connections type="note" id={note.id} transports />
      <div className="kh-nt-insp__card kh-nt-insp__card--details">
        <div className="kh-nt-insp__h">{t('details')}</div>
        {[
          [t('dNb'), folderName || t('ne_noFolder')],
          [t('dCreated'), when(note.createdAt, true)],
          [t('dUpdated'), when(note.updatedAt, true)],
          [t('dAuthor'), author],
        ].map(([k, v]) => (
          <div key={k} className="kh-nt-insp__row">
            <span>{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ── View ───────────────────────────────────────────────────────────────────
export function NotesView() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const { me, focus, query } = useShell();
  const [filter, setFilter] = usePersistentState<string>('notes.filter', 'all');
  const [cols, setCols] = usePref<Cols>('cols', {});
  const [liveList, setLiveList] = useState<number | null>(null);
  const [liveInsp, setLiveInsp] = useState<number | null>(null);

  const [folders, setFolders] = useState<FolderList | null>(null);
  const [items, setItems] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<Note | null>(null);
  const activeId = sp.get('n');

  const folderMap = useMemo(() => new Map((folders?.folders ?? []).map((f) => [f.id, f])), [folders]);
  const validFilter =
    filter === 'all' || filter === 'fav' || folderMap.has(filter) || !folders ? filter : 'all';

  const open = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (id) next.set('n', id);
      else next.delete('n');
      router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false });
    },
    [path, router, sp],
  );

  const loadFolders = useCallback(() => {
    refreshCounts();
    return notesApi
      .folders()
      .then(setFolders)
      .catch(() => {});
  }, []);
  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  // List for the current filter + header search.
  const listKey = `${validFilter}|${query.trim()}`;
  useEffect(() => {
    let live = true;
    setLoading(true);
    const h = setTimeout(
      () => {
        notesApi
          .list({
            folder: validFilter !== 'all' && validFilter !== 'fav' ? validFilter : undefined,
            fav: validFilter === 'fav',
            q: query.trim() || undefined,
          })
          .then((r) => {
            if (!live) return;
            setItems(r.notes);
            setLoading(false);
          })
          .catch(() => live && setLoading(false));
      },
      query ? 200 : 0,
    );
    return () => {
      live = false;
      clearTimeout(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listKey covers filter + query
  }, [listKey]);

  // Open the first note when none is selected (prototype: NOTES[0]).
  useEffect(() => {
    if (!activeId && !loading && items[0]) open(items[0].id);
  }, [activeId, loading, items, open]);

  // Load the open note.
  useEffect(() => {
    if (!activeId) {
      setNote(null);
      return;
    }
    if (note?.id === activeId) return;
    let live = true;
    notesApi
      .get(activeId)
      .then((r) => live && setNote(r.note))
      .catch(() => {
        if (!live) return;
        setNote(null);
        open(null);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the id changes
  }, [activeId]);

  // Debounced saves: one PATCH per note with the latest pending fields.
  const pending = useRef<{
    id: string;
    patch: Record<string, unknown>;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const flush = useCallback(async () => {
    const p = pending.current;
    if (!p || !Object.keys(p.patch).length) return;
    pending.current = null;
    if (p.timer) clearTimeout(p.timer);
    try {
      const { note: item } = await notesApi.update(p.id, p.patch);
      setItems((all) => {
        const rest = all.filter((x) => x.id !== item.id);
        // Leaves a filtered list when it no longer matches (unfavourited in Favoritos).
        if (validFilter === 'fav' && !item.favorite) return rest;
        return all.some((x) => x.id === item.id) ? all.map((x) => (x.id === item.id ? item : x)) : all;
      });
      if ('favorite' in p.patch) void loadFolders();
    } catch (e) {
      toast({
        message: t(isApiFailure(e) && e.code === 'doc_too_large' ? 'ne_imgBig' : 'ne_saveFail'),
        tone: 'error',
      });
    }
  }, [loadFolders, t, toast, validFilter]);

  const patch = useCallback(
    (fields: Partial<Pick<Note, 'title' | 'content' | 'tags' | 'favorite'>>) => {
      setNote((n) => (n ? { ...n, ...fields } : n));
      if (pending.current && pending.current.id !== note?.id) void flush();
      const id = note?.id;
      if (!id) return;
      const p = pending.current ?? { id, patch: {}, timer: null };
      Object.assign(p.patch, fields);
      if (p.timer) clearTimeout(p.timer);
      const now = 'favorite' in fields || 'tags' in fields;
      p.timer = setTimeout(() => void flush(), now ? 0 : 600);
      pending.current = p;
    },
    [flush, note?.id],
  );

  // Save before leaving the page / switching notes.
  useEffect(() => {
    const h = () => void flush();
    window.addEventListener('beforeunload', h);
    return () => {
      window.removeEventListener('beforeunload', h);
      void flush();
    };
  }, [flush]);
  useEffect(() => {
    void flush();
  }, [activeId, flush]);

  const failed = (e: unknown) =>
    toast({
      message: t(isApiFailure(e) && e.code === 'limit_reached' ? 'ne_limit' : 'ne_saveFail'),
      tone: 'error',
    });

  const newNote = async (folderId: string | null) => {
    try {
      const { note: item } = await notesApi.create(folderId);
      if (validFilter === 'fav' || (folderId && validFilter !== 'all' && validFilter !== folderId))
        setFilter(folderId ?? 'all');
      setItems((all) => [item, ...all]);
      setNote({ ...item, content: null });
      open(item.id);
      void loadFolders();
    } catch (e) {
      failed(e);
    }
  };

  const trashNote = async () => {
    if (!note) return;
    const ok = await confirm({
      title: t('tr_askTitle'),
      body: t('tr_askBody').replace('{x}', note.title || t('ne_untitled')),
      confirmLabel: t('tr_move'),
      cancelLabel: t('tr_cancel'),
      danger: true,
    });
    if (!ok) return;
    pending.current = null;
    await notesApi.trash(note.id).catch(() => {});
    const idx = items.findIndex((x) => x.id === note.id);
    const rest = items.filter((x) => x.id !== note.id);
    setItems(rest);
    setNote(null);
    open(rest[Math.min(idx, rest.length - 1)]?.id ?? null);
    void loadFolders();
  };

  const dropNote = async (id: string, target: string) => {
    try {
      if (target === 'fav') await notesApi.update(id, { favorite: true });
      else await notesApi.move(id, target);
      if (note?.id === id)
        setNote((n) => (n ? { ...n, ...(target === 'fav' ? { favorite: true } : { folderId: target }) } : n));
      const r = await notesApi.list({
        folder: validFilter !== 'all' && validFilter !== 'fav' ? validFilter : undefined,
        fav: validFilter === 'fav',
        q: query.trim() || undefined,
      });
      setItems(r.notes);
      void loadFolders();
    } catch (e) {
      failed(e);
    }
  };

  const listW = liveList ?? cols.list ?? COL_DEFAULTS.list;
  const inspW = liveInsp ?? cols.insp ?? COL_DEFAULTS.insp;
  const showInsp = !focus && !!note;
  const curFolder = (note?.folderId && folderMap.get(note.folderId)) || NO_FOLDER;
  const listTitle =
    validFilter === 'all'
      ? t('all')
      : validFilter === 'fav'
        ? t('fav')
        : (folderMap.get(validFilter)?.name ?? '');

  return (
    <div
      className="kh-nt"
      style={{ gridTemplateColumns: `${listW}px minmax(360px,1fr)${showInsp ? ` ${inspW}px` : ''}` }}
    >
      <ColHandle
        style={{ left: listW }}
        value={listW}
        limits={COL_LIMITS.list}
        dir={1}
        onLive={setLiveList}
        onDone={(w) => setCols({ ...cols, list: w })}
        onReset={() => setCols({ ...cols, list: COL_DEFAULTS.list })}
      />
      <div className="kh-nt-col">
        <FoldersPanel
          data={folders}
          filter={validFilter}
          setFilter={setFilter}
          onCreated={(f) => {
            setFolders((d) => (d ? { ...d, folders: [...d.folders, f] } : d));
            setFilter(f.id);
          }}
          onRename={async (f, name) => {
            setFolders(
              (d) => d && { ...d, folders: d.folders.map((x) => (x.id === f.id ? { ...x, name } : x)) },
            );
            await notesApi.renameFolder(f.id, name).catch(failed);
          }}
          onNewNote={(f) => {
            setFilter(f.id);
            void newNote(f.id);
          }}
          onDuplicate={async (f) => {
            try {
              const { folder } = await notesApi.duplicateFolder(f.id, t('ne_copy'));
              await loadFolders();
              setFilter(folder.id);
            } catch (e) {
              failed(e);
            }
          }}
          onDelete={async (f) => {
            const ok = await confirm({
              title: t('ne_delFolderT'),
              body: t('ne_delFolderB').replace('{x}', f.name).replace('{n}', String(f.count)),
              confirmLabel: t('tr_move'),
              cancelLabel: t('tr_cancel'),
              danger: true,
            });
            if (!ok) return;
            await notesApi.deleteFolder(f.id).catch(failed);
            if (validFilter === f.id) setFilter('all');
            if (note?.folderId === f.id) open(null);
            await loadFolders();
          }}
          onDropNote={(id, target) => void dropNote(id, target)}
        />
        <NoteList
          title={listTitle}
          items={items}
          folders={folderMap}
          activeId={activeId}
          loading={loading}
          onOpen={open}
          onNew={() => void newNote(validFilter !== 'all' && validFilter !== 'fav' ? validFilter : null)}
        />
      </div>
      {note ? (
        <EditorCard
          key={note.id}
          note={note}
          folder={curFolder}
          onPatch={patch}
          onDelete={() => void trashNote()}
        />
      ) : (
        <article className="kh-nt-editor kh-nt-editor--empty">
          <div>{loading ? '' : t('ne_empty')}</div>
        </article>
      )}
      {showInsp && note && (
        <>
          <ColHandle
            style={{ right: inspW }}
            value={inspW}
            limits={COL_LIMITS.insp}
            dir={-1}
            onLive={setLiveInsp}
            onDone={(w) => setCols({ ...cols, insp: w })}
            onReset={() => setCols({ ...cols, insp: COL_DEFAULTS.insp })}
          />
          <Inspector note={note} folderName={curFolder.name} author={me.user.name} />
        </>
      )}
    </div>
  );
}
