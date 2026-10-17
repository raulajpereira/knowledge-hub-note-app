'use client';

import { useEffect, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Modal, useConfirm, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { docExtensions, editableDoc } from './NoteEditor';
import type { Note } from './notesApi';

// "Histórico" of a note: the versions the server kept (at most one per 10
// minutes of editing, and before every restore), a read-only preview of each
// and "Restaurar esta versão" for those who may edit the note.

type Version = {
  id: string;
  createdAt: string;
  reason: 'auto' | 'restore';
  title: string;
  chars: number;
  delta: number | null;
  author: string | null;
  excerpt: string;
};

function Preview({ content }: { content: unknown }) {
  const { t } = useI18n();
  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: false,
      extensions: docExtensions(),
      content: editableDoc(content),
      editorProps: { attributes: { class: 'kh-ne', 'aria-label': t('hist_preview') } },
    },
    [content],
  );
  return <EditorContent editor={editor} />;
}

export function NoteHistory({
  note,
  canEdit,
  onClose,
  onRestored,
}: {
  note: Note;
  canEdit: boolean;
  onClose: () => void;
  onRestored: (note: Note) => void;
}) {
  const { t, lang } = useI18n();
  const confirm = useConfirm();
  const toast = useToast();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [doc, setDoc] = useState<{ id: string; title: string; content: unknown } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api<{ versions: Version[] }>(`/notes/${note.id}/versions`)
      .then((r) => {
        if (!live) return;
        setVersions(r.versions);
        setSel(r.versions[0]?.id ?? null);
      })
      .catch(() => live && setVersions([]));
    return () => {
      live = false;
    };
  }, [note.id]);

  useEffect(() => {
    if (!sel) return setDoc(null);
    let live = true;
    api<{ version: { id: string; title: string; content: unknown } }>(`/notes/${note.id}/versions/${sel}`)
      .then((r) => live && setDoc(r.version))
      .catch(() => live && setDoc(null));
    return () => {
      live = false;
    };
  }, [note.id, sel]);

  const when = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT', {
      day: 'numeric',
      month: 'short',
      year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  const num = (n: number) => n.toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT');
  const cur = versions?.find((v) => v.id === sel);

  const restore = async () => {
    if (!cur) return;
    const ok = await confirm({
      title: t('hist_restoreT'),
      body: t('hist_restoreB').replace('{d}', when(cur.createdAt)),
      confirmLabel: t('hist_restore'),
      cancelLabel: t('tr_cancel'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api<{ note: Note }>(`/notes/${note.id}/versions/${cur.id}/restore`, {});
      toast({ message: t('hist_restored'), tone: 'info' });
      onRestored(r.note);
    } catch {
      toast({ message: t('hist_restoreFail'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('hist_title')}
      subtitle={note.title || t('ne_untitled')}
      size="lg"
      closeLabel={t('i_close')}
      className="kh-hist"
    >
      {versions && versions.length === 0 ? (
        <div className="kh-hist__empty">{t('hist_empty')}</div>
      ) : (
        <div className="kh-hist__grid">
          <div className="kh-hist__list" role="listbox" aria-label={t('hist_title')}>
            {(versions ?? []).map((v) => (
              <button
                key={v.id}
                type="button"
                role="option"
                aria-selected={v.id === sel}
                className="kh-hist__item"
                data-on={v.id === sel || undefined}
                onClick={() => setSel(v.id)}
              >
                <span className="kh-hist__when">{when(v.createdAt)}</span>
                <span className="kh-hist__meta">
                  {[
                    v.author,
                    `${num(v.chars)} ${t('hist_chars')}`,
                    v.delta ? `${v.delta > 0 ? '+' : '−'}${num(Math.abs(v.delta))}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {v.reason === 'restore' && <span className="kh-hist__badge">{t('hist_beforeRestore')}</span>}
                {v.excerpt && <span className="kh-hist__ex">{v.excerpt}</span>}
              </button>
            ))}
          </div>
          <div className="kh-hist__pane">
            <div className="kh-hist__bar">
              <span className="kh-hist__ro">{t('hist_readOnly')}</span>
              <span style={{ flex: 1 }} />
              {canEdit && cur && (
                <button
                  type="button"
                  className="kh-btn-solid"
                  style={{ height: 36, padding: '0 14px' }}
                  onClick={() => void restore()}
                  disabled={busy}
                >
                  {t('hist_restore')}
                </button>
              )}
            </div>
            <div className="kh-hist__doc">
              {doc && doc.id === sel ? (
                <>
                  <h2 className="kh-hist__title">{doc.title || t('ne_untitled')}</h2>
                  <div className="kh-nt-doc">
                    <Preview content={doc.content} />
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
