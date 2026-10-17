'use client';

import { useMemo, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import {
  ChecklistBar,
  EditorContent,
  EditorToolbar,
  InsertBar,
  useNoteEditor,
  type ImageStore,
} from '@/components/notes/NoteEditor';
import type { Candidate } from '@/components/notes/notesApi';
import '../notes/notes.css';

// The team's notes on a SAP note: the Notes editor (headings, lists,
// checklists, code, links) without images — the document is shared by the
// tenant, so images would have to live with it; screenshots belong in a note
// linked under "Ligações".

const NO_IMAGES: ImageStore = {
  stored: /(?!)/,
  upload: () => Promise.reject({ code: 'unsupported_image' }),
  importUrl: () => Promise.reject({ code: 'unsupported_image' }),
};

export function SapNoteDoc({
  noteId,
  doc,
  onChange,
}: {
  noteId: string;
  doc: JSONContent;
  onChange: (doc: JSONContent) => void;
}) {
  const { t } = useI18n();
  const [ask, setAsk] = useState<'link' | 'img' | null>(null);
  const search = useMemo(
    () => (q: string) =>
      api<{ items: Candidate[] }>(`/links/candidates?type=sapnote&id=${noteId}&q=${encodeURIComponent(q)}`),
    [noteId],
  );
  const { editor } = useNoteEditor({
    noteId,
    content: doc,
    images: NO_IMAGES,
    label: t('sn_body'),
    placeholder: t('sn_bodyPh'),
    onChange,
  });
  return (
    <div className="kh-sn-doc">
      <EditorToolbar
        editor={editor}
        onAsk={(u) => setAsk(u === 'link' ? 'link' : null)}
        label={t('sn_body')}
      />
      {ask && editor && (
        <InsertBar
          editor={editor}
          noteId={noteId}
          ui={ask}
          search={search}
          onClose={() => setAsk(null)}
          onUpload={() => {}}
        />
      )}
      <ChecklistBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
