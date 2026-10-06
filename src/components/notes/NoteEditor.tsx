'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TableKit } from '@tiptap/extension-table';
import type { Node as PMNode } from '@tiptap/pm/model';
import { useI18n } from '@/i18n/client';
import { useToast } from '@/components/ui';
import { Callout, LinkCard, NoteImage } from './extensions';
import { itemHref } from '@/components/content/Connections';
import { notesApi, type Candidate } from './notesApi';

// Prototype NoteEditor on TipTap: toolbar H1 B I • ☐ </> ↗ IMG (+ callout),
// checklist progress bar, paste HTML/images/links, drop images. Images are
// always stored with the note (upload, or imported by the server from a URL),
// so the document only ever references /api/v1/files/<id>.

export const FILE_SRC = /^\/api\/v1\/files\/[0-9a-f-]{36}$/;
const MAX_IMG = 5 * 1024 * 1024;
const isUrl = (s: string) => /^(https?:\/\/|mailto:)\S+$/i.test(s) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s);
const withScheme = (s: string) => (/^[a-z]+:/i.test(s) ? s : `https://${s}`);

/** Prototype neShrink: long side ≤ 1600 px, JPEG 0.85 when large (GIFs kept as they are). */
async function shrink(file: File): Promise<Blob> {
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 400_000) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.85));
  } catch {
    return file;
  }
}

/** Removes images that are not stored yet (still importing) before saving. */
function storable(doc: JSONContent): JSONContent {
  const walk = (n: JSONContent): JSONContent | null => {
    if (n.type === 'image' && !(typeof n.attrs?.src === 'string' && FILE_SRC.test(n.attrs.src))) return null;
    return n.content ? { ...n, content: n.content.map(walk).filter((x): x is JSONContent => !!x) } : n;
  };
  return walk(doc) ?? { type: 'doc', content: [] };
}

function checklist(doc: PMNode) {
  let done = 0;
  let total = 0;
  doc.descendants((n) => {
    if (n.type.name === 'taskItem') {
      total++;
      if (n.attrs.checked) done++;
    }
  });
  return { done, total };
}

/**
 * Inserts a block after the selection instead of replacing it: a selected
 * image or link card (atoms stay selected after insertion) is kept.
 */
export function insertBlock(editor: Editor, node: JSONContent, pos?: number) {
  const sel = editor.state.selection;
  const at = pos ?? ('node' in sel && sel.node ? sel.to : undefined);
  const c = editor.chain().focus();
  (at !== undefined ? c.insertContentAt(at, node) : c.insertContent(node)).run();
}

/** Re-renders on every editor transaction (also once the editor instance appears). */
function useEditorTick(editor: Editor | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const bump = () => setTick((n) => n + 1);
    bump();
    editor.on('transaction', bump);
    return () => {
      editor.off('transaction', bump);
    };
  }, [editor]);
}

export type ToolId = 'H1' | 'B' | 'I' | '•' | '☐' | '</>' | '!' | '↗' | 'IMG';
export const TOOLS: ToolId[] = ['H1', 'B', 'I', '•', '☐', '</>', '!', '↗', 'IMG'];

export function useNoteEditor({
  noteId,
  content,
  onChange,
}: {
  noteId: string;
  content: unknown;
  onChange: (doc: JSONContent) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const pending = useRef(new Set<string>());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const uploadFiles = useCallback(
    async (editor: Editor, files: File[], pos?: number) => {
      for (const f of files) {
        if (f.size > MAX_IMG * 4) {
          toast({ message: t('ne_imgBig'), tone: 'error' });
          continue;
        }
        try {
          const blob = await shrink(f);
          if (blob.size > MAX_IMG) throw { code: 'file_too_large' };
          const { src } = await notesApi.uploadImage(noteId, blob);
          insertBlock(editor, { type: 'image', attrs: { src } }, pos);
        } catch (e) {
          toast({
            message: t((e as { code?: string }).code === 'file_too_large' ? 'ne_imgBig' : 'ne_imgFail'),
            tone: 'error',
          });
        }
      }
    },
    [noteId, t, toast],
  );

  /** Images pasted from HTML or inserted by URL: the server fetches and stores them. */
  const importForeign = useCallback(
    (editor: Editor) => {
      editor.state.doc.descendants((n) => {
        const src = n.type.name === 'image' ? String(n.attrs.src ?? '') : '';
        if (!src || FILE_SRC.test(src) || pending.current.has(src)) return;
        pending.current.add(src);
        const job = src.startsWith('data:image/')
          ? fetch(src)
              .then((r) => r.blob())
              .then((b) => notesApi.uploadImage(noteId, b))
          : /^https?:\/\//i.test(src)
            ? notesApi.importImage(noteId, src)
            : Promise.reject(new Error('bad src'));
        job
          .then(
            (r) => r.src,
            () => null,
          )
          .then((stored) => {
            pending.current.delete(src);
            if (editor.isDestroyed) return;
            const tr = editor.state.tr;
            let failed = false;
            editor.state.doc.descendants((m, pos) => {
              if (m.type.name !== 'image' || m.attrs.src !== src) return;
              if (stored) tr.setNodeMarkup(pos, undefined, { ...m.attrs, src: stored });
              else {
                tr.delete(tr.mapping.map(pos), tr.mapping.map(pos + m.nodeSize));
                failed = true;
              }
            });
            if (tr.docChanged) editor.view.dispatch(tr);
            if (failed) toast({ message: t('ne_imgFail'), tone: 'error' });
          });
      });
    },
    [noteId, t, toast],
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4] },
          link: {
            openOnClick: false,
            autolink: true,
            linkOnPaste: true,
            defaultProtocol: 'https',
            protocols: ['http', 'https', 'mailto'],
            isAllowedUri: (url) => /^(https?:|mailto:)/i.test(url) || /^\/app(\/|$|\?)/.test(url),
            HTMLAttributes: { rel: 'noopener noreferrer', target: null },
          },
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        NoteImage,
        Callout,
        LinkCard,
        TableKit.configure({ table: { resizable: false } }),
        Placeholder.configure({ placeholder: t('ne_ph') }),
      ],
      content: (content as JSONContent) ?? '',
      editorProps: {
        attributes: { class: 'kh-ne', spellcheck: 'true', 'aria-label': t('nav_notes') },
        // Office/Chrome clipboard fragments; relative links become absolute when the source is known.
        transformPastedHTML: (html) => {
          const src = /SourceURL:(\S+)/.exec(html)?.[1];
          let out = html.replace(/^[\s\S]*<!--StartFragment-->|<!--EndFragment-->[\s\S]*$/g, '');
          if (src)
            out = out.replace(
              /\s(href|src)="(?!https?:|mailto:|data:|#)([^"]*)"/gi,
              (_m, a: string, u: string) => {
                try {
                  return ` ${a}="${new URL(u, src).href}"`;
                } catch {
                  return '';
                }
              },
            );
          return out;
        },
        handlePaste: (view, event) => {
          const ed = editorRef.current;
          if (!ed) return false;
          const cd = event.clipboardData;
          const files = [...(cd?.files ?? [])].filter((f) => f.type.startsWith('image/'));
          if (files.length && !cd?.getData('text/html')) {
            event.preventDefault();
            void uploadFiles(ed, files);
            return true;
          }
          const txt = cd?.getData('text/plain')?.trim() ?? '';
          if (!cd?.getData('text/html') && /^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i.test(txt)) {
            event.preventDefault();
            insertBlock(ed, { type: 'image', attrs: { src: txt } });
            return true;
          }
          return false;
        },
        handleDrop: (view, event, _slice, moved) => {
          const ed = editorRef.current;
          const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
          if (moved || !ed || !files.length) return false;
          event.preventDefault();
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          void uploadFiles(ed, files, pos);
          return true;
        },
        handleDOMEvents: {
          click: (_view, event) => {
            const a = (event.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
            if (!a || !(event.metaKey || event.ctrlKey)) return false;
            event.preventDefault();
            const href = a.getAttribute('href') ?? '';
            if (href.startsWith('/app')) router.push(href);
            else window.open(href, '_blank', 'noopener,noreferrer');
            return true;
          },
        },
      },
      onCreate: ({ editor }) => importForeign(editor),
      onUpdate: ({ editor }) => {
        importForeign(editor);
        onChangeRef.current(storable(editor.getJSON()));
      },
    },
    [noteId],
  );
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  return { editor, uploadFiles };
}

/** Prototype toolbar: pill group of mono glyph buttons. */
export function EditorToolbar({
  editor,
  onAsk,
}: {
  editor: Editor | null;
  onAsk: (ui: 'link' | 'img') => void;
}) {
  const { t } = useI18n();
  useEditorTick(editor);
  const e = editor;
  const active: Record<ToolId, boolean> | null = e
    ? {
        H1: e.isActive('heading'),
        B: e.isActive('bold'),
        I: e.isActive('italic'),
        '•': e.isActive('bulletList'),
        '☐': e.isActive('taskList'),
        '</>': e.isActive('codeBlock'),
        '!': e.isActive('callout'),
        '↗': e.isActive('link'),
        IMG: false,
      }
    : null;
  const label: Record<ToolId, string> = {
    H1: t('tH1'),
    B: t('tB'),
    I: t('tI'),
    '•': t('tList'),
    '☐': t('ne_check'),
    '</>': t('tCode'),
    '!': t('ne_callout'),
    '↗': t('tLink'),
    IMG: t('ne_img'),
  };
  const run = (g: ToolId) => {
    if (!editor) return;
    const c = editor.chain().focus();
    if (g === 'H1') c.toggleHeading({ level: 2 }).run();
    else if (g === 'B') c.toggleBold().run();
    else if (g === 'I') c.toggleItalic().run();
    else if (g === '•') c.toggleBulletList().run();
    else if (g === '☐') c.toggleTaskList().run();
    else if (g === '</>') c.toggleCodeBlock().run();
    else if (g === '!') c.toggleCallout().run();
    else if (g === '↗') {
      if (editor.isActive('link')) c.extendMarkRange('link').unsetLink().run();
      else onAsk('link');
    } else onAsk('img');
  };
  return (
    <div className="kh-ne-tools" role="toolbar" aria-label={t('nav_notes')}>
      {TOOLS.map((g) => (
        <button
          key={g}
          type="button"
          title={label[g]}
          aria-label={label[g]}
          aria-pressed={active?.[g] ?? false}
          disabled={!editor}
          onMouseDown={(e) => {
            e.preventDefault();
            run(g);
          }}
        >
          {g}
        </button>
      ))}
    </div>
  );
}

/** Checklist % bar above the document (prototype NoteEditor). */
export function ChecklistBar({ editor }: { editor: Editor | null }) {
  const { t } = useI18n();
  useEditorTick(editor);
  const s = editor ? checklist(editor.state.doc) : { done: 0, total: 0 };
  if (!s.total) return null;
  const pct = Math.round((s.done / s.total) * 100);
  return (
    <div className="kh-ne-progress" data-full={pct === 100 || undefined}>
      <span className="kh-ne-progress__pct">{pct}%</span>
      <div className="kh-ne-progress__bar">
        <div style={{ width: `${pct}%` }} />
      </div>
      <span className="kh-ne-progress__n">
        {s.done} / {s.total}
        {t('ne_done')}
      </span>
    </div>
  );
}

/** Sticky URL bar for ↗ and IMG (prototype `S.ui`), plus note search for internal links and upload. */
export function InsertBar({
  editor,
  noteId,
  ui,
  onClose,
  onUpload,
}: {
  editor: Editor;
  noteId: string;
  ui: 'link' | 'img';
  onClose: () => void;
  onUpload: (files: File[]) => void;
}) {
  const { t } = useI18n();
  const [val, setVal] = useState(ui === 'img' ? 'https://' : '');
  const [card, setCard] = useState(false);
  const [found, setFound] = useState<Candidate[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ui !== 'link') return;
    const q = val.trim();
    if (!q || isUrl(q)) {
      setFound([]);
      return;
    }
    const h = setTimeout(() => {
      notesApi
        .candidates(noteId, q)
        .then((r) => setFound(r.items.slice(0, 6)))
        .catch(() => setFound([]));
    }, 200);
    return () => clearTimeout(h);
  }, [ui, val, noteId]);

  const insertLink = (href: string, text: string) => {
    const { empty } = editor.state.selection;
    const c = editor.chain().focus();
    if (card)
      insertBlock(editor, { type: 'linkCard', attrs: { href, title: text === href ? '' : text, sub: '' } });
    else if (empty)
      c.insertContent([
        { type: 'text', text, marks: [{ type: 'link', attrs: { href } }] },
        { type: 'text', text: ' ' },
      ]).run();
    else {
      // Link the selection, then leave the cursor after it outside the link.
      const to = editor.state.selection.to;
      c.extendMarkRange('link').setLink({ href }).setTextSelection(to).unsetMark('link').run();
    }
    editor.view.focus(); // TipTap's focus() waits a frame; keep typing in the note right away
    onClose();
  };

  const apply = () => {
    const u = val.trim();
    if (!u || u === 'https://') return onClose();
    if (ui === 'img') {
      insertBlock(editor, { type: 'image', attrs: { src: withScheme(u) } });
      editor.view.focus();
      return onClose();
    }
    if (isUrl(u)) insertLink(withScheme(u), withScheme(u));
    else if (found[0]) insertLink(itemHref(found[0].type, found[0].id), found[0].title || t('ne_untitled'));
  };

  return (
    <div className="kh-ne-ask">
      <div className="kh-ne-ask__row">
        <span className="kh-ne-ask__lbl">{ui === 'img' ? t('ne_imgUrl') : t('ne_linkUrl')}</span>
        <input
          autoFocus
          value={val}
          spellCheck={false}
          aria-label={ui === 'img' ? t('ne_imgUrl') : t('ne_linkUrl')}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              apply();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
              editor.commands.focus();
            }
          }}
        />
        {ui === 'link' && (
          <label className="kh-ne-ask__card">
            <input type="checkbox" checked={card} onChange={(e) => setCard(e.target.checked)} />
            {t('ne_asCard')}
          </label>
        )}
        {ui === 'img' && (
          <>
            <button
              type="button"
              className="kh-ne-ask__ghost"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
            >
              {t('ne_upload')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                onClose();
                onUpload(files);
              }}
            />
          </>
        )}
        <button
          type="button"
          className="kh-ne-ask__ok"
          onMouseDown={(e) => e.preventDefault()}
          onClick={apply}
        >
          {t('ne_insert')}
        </button>
        <button
          type="button"
          className="kh-ne-ask__x"
          aria-label="×"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {found.length > 0 && (
        <div className="kh-ne-ask__found">
          {found.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertLink(itemHref(c.type, c.id), c.title || t('ne_untitled'))}
            >
              <span className="kh-ne-ask__k">{t(c.type === 'task' ? 'k_task' : 'k_note')}</span>
              <span className="kh-ne-ask__t">{c.title || t('ne_untitled')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { EditorContent };
