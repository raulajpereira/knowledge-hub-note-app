'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { useI18n } from '@/i18n/client';
import { api } from '@/lib/client/api';
import { TICKET_FILE_SRC } from '@/lib/tickets';
import {
  ChecklistBar,
  EditorContent,
  EditorToolbar,
  InsertBar,
  editableDoc,
  useNoteEditor,
  type ImageStore,
} from '@/components/notes/NoteEditor';
import type { Candidate } from '@/components/notes/notesApi';
import '../notes/notes.css';
import '../meetings/meetings.css';

// "Notas" of a ticket: the Notes editor (toolbar, paste / drop / upload of
// images, links, checklists), with the images stored with the ticket
// (/api/v1/tickets/files/<id>, counted in the uploader's space).

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

async function upload(ticketId: string, file: Blob): Promise<{ src: string }> {
  const res = await fetch(`${BASE}/api/v1/tickets/${ticketId}/images`, {
    method: 'POST',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { code: data?.error?.code ?? 'internal', status: res.status };
  return data;
}

export function TicketNotes({
  ticketId,
  doc,
  editable,
  onChange,
}: {
  ticketId: string;
  doc: JSONContent | null;
  editable: boolean;
  onChange: (doc: JSONContent) => void;
}) {
  const { t } = useI18n();
  const [ask, setAsk] = useState<'link' | 'img' | null>(null);
  const images = useMemo<ImageStore>(
    () => ({
      stored: TICKET_FILE_SRC,
      upload: (b) => upload(ticketId, b),
      importUrl: (url) => api<{ src: string }>(`/tickets/${ticketId}/images`, { url }),
    }),
    [ticketId],
  );
  const search = useCallback(
    (q: string) =>
      api<{ items: Candidate[] }>(`/links/candidates?type=ticket&id=${ticketId}&q=${encodeURIComponent(q)}`),
    [ticketId],
  );
  const { editor, uploadFiles } = useNoteEditor({
    noteId: ticketId,
    content: editableDoc(doc),
    images,
    label: t('tk_notes'),
    placeholder: t('tk_notesPh'),
    onChange,
  });
  // a 'read' member of a shared folder only reads (as in Notes)
  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable, false);
  }, [editor, editable]);

  return (
    <div className="kh-mt-doc kh-tkt-doc">
      {editable && <EditorToolbar editor={editor} onAsk={setAsk} label={t('tk_notesTools')} />}
      {ask && editor && (
        <InsertBar
          editor={editor}
          noteId={ticketId}
          ui={ask}
          search={search}
          onClose={() => setAsk(null)}
          onUpload={(files) => void uploadFiles(editor, files)}
        />
      )}
      <ChecklistBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
