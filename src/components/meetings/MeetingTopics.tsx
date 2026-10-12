'use client';

import { useCallback, useImperativeHandle, useMemo, useState, type Ref } from 'react';
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

// "Temas discutidos" of a meeting record: the Notes editor (toolbar, paste /
// drop / upload of images, links, checklists), with the images stored with the
// meeting record (/api/v1/meetings/files/<id>).

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const MEETING_FILE = /^\/api\/v1\/meetings\/files\/[0-9a-f-]{36}$/;

/** Records written before the editor only have text: one paragraph per line. */
export function textToDoc(text: string): JSONContent {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const content = lines.map((l) =>
    l ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph' },
  );
  return { type: 'doc', content: text.trim() ? content : [{ type: 'paragraph' }] };
}

/** Plain text of the document, as the server keeps it in `topics` (search, AI). */
export function plainText(doc: JSONContent): string {
  const out: string[] = [];
  const walk = (n: JSONContent) => {
    if (n.type === 'text' && n.text) out.push(n.text);
    if (n.type === 'hardBreak') out.push('\n');
    n.content?.forEach(walk);
    if (n.type !== 'doc' && n.type !== 'text' && n.content) out.push('\n');
  };
  walk(doc);
  return out
    .join('')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

async function upload(meetingId: string, file: Blob): Promise<{ src: string }> {
  const res = await fetch(`${BASE}/api/v1/meetings/${meetingId}/attachments`, {
    method: 'POST',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { code: data?.error?.code ?? 'internal', status: res.status };
  return data;
}

export type TopicsHandle = {
  /** "Organizar com IA" → Aplicar: the summary on top, the original topics below a marker. */
  prepend: (summary: string, marker: string) => void;
};

export function MeetingTopics({
  meetingId,
  doc,
  onChange,
  handle,
}: {
  meetingId: string;
  doc: JSONContent;
  /** the document as stored and its plain text (search, AI) */
  onChange: (doc: JSONContent, text: string) => void;
  handle?: Ref<TopicsHandle>;
}) {
  const { t } = useI18n();
  const [ask, setAsk] = useState<'link' | 'img' | null>(null);
  const images = useMemo<ImageStore>(
    () => ({
      stored: MEETING_FILE,
      upload: (b) => upload(meetingId, b),
      importUrl: (url) => api<{ src: string }>(`/meetings/${meetingId}/attachments`, { url }),
    }),
    [meetingId],
  );
  const search = useCallback(
    (q: string) =>
      api<{ items: Candidate[] }>(
        `/links/candidates?type=meeting&id=${meetingId}&q=${encodeURIComponent(q)}`,
      ),
    [meetingId],
  );
  const { editor, uploadFiles } = useNoteEditor({
    noteId: meetingId,
    content: doc,
    images,
    label: t('mt_topics'),
    placeholder: t('mt_topicsPh'),
    onChange: (d) => onChange(d, plainText(d)),
  });

  useImperativeHandle(
    handle,
    () => ({
      prepend: (summary, marker) => {
        if (!editor) return;
        const paras = summary
          .trim()
          .split(/\n+/)
          .filter((l) => l.trim())
          .map((l) => ({ type: 'paragraph', content: [{ type: 'text', text: l }] }));
        if (!paras.length) return;
        editor
          .chain()
          .insertContentAt(0, [...paras, { type: 'paragraph', content: [{ type: 'text', text: marker }] }])
          .run();
      },
    }),
    [editor],
  );

  return (
    <div className="kh-mt-doc">
      <EditorToolbar editor={editor} onAsk={setAsk} label={t('mt_topicsTools')} />
      {ask && editor && (
        <InsertBar
          editor={editor}
          noteId={meetingId}
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
