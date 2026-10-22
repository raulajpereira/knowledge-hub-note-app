'use client';

import { notesApi } from './notesApi';
import { shrinkImage } from './shrinkImage';

// A note made in one go from captured content (D69): the phone's "+" › Foto
// and the share sheet (Web Share Target). The same calls as the editor:
// create, upload each image to the note, then save title + document.

/** the server's limit per note image (POST /notes/:id/attachments) */
const MAX_IMG = 5 * 1024 * 1024;
type Block = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Block[];
  text?: string;
  marks?: Block[];
};

const URL_RE = /(https?:\/\/[^\s<>"]+)/g;

/** one paragraph per line, web addresses as links */
function paragraphs(text: string): Block[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const content: Block[] = [];
      let at = 0;
      for (const m of line.matchAll(URL_RE)) {
        const href = m[0].replace(/[).,;:!?]+$/, '');
        const i = m.index ?? 0;
        if (i > at) content.push({ type: 'text', text: line.slice(at, i) });
        content.push({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] });
        at = i + href.length;
      }
      if (at < line.length) content.push({ type: 'text', text: line.slice(at) });
      return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
    });
}

/** "22/10 14:05" */
export const captureStamp = (d = new Date()) => {
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

/**
 * Creates a note with `title`, the text (and link) and the images; returns its
 * id and how many images could not be added (too big / not an image).
 */
export async function createCaptureNote(c: {
  title: string;
  text?: string;
  images?: File[];
}): Promise<{ id: string; failed: number }> {
  const { note } = await notesApi.create(null);
  const blocks: Block[] = [];
  let failed = 0;
  for (const f of c.images ?? []) {
    try {
      const blob = await shrinkImage(f);
      if (blob.size > MAX_IMG) throw new Error('too big');
      const { src } = await notesApi.uploadImage(note.id, blob);
      blocks.push({ type: 'image', attrs: { src } });
    } catch {
      failed++;
    }
  }
  const text = c.text?.trim() ?? '';
  if (text) blocks.push(...paragraphs(text));
  blocks.push({ type: 'paragraph' });
  await notesApi.update(note.id, {
    title: c.title.slice(0, 300),
    content: { type: 'doc', content: blocks },
  });
  return { id: note.id, failed };
}
