'use client';

import { generateJSON } from '@tiptap/core';
import { isApiFailure } from '@/lib/client/api';
import { notesApi } from './notesApi';
import { docExtensions } from './NoteEditor';
import { shrinkImage } from './shrinkImage';

// Importing notes from other apps, all in the browser: each file becomes HTML
// (Markdown → marked, Word .docx → mammoth — also how OneNote pages come in —,
// Evernote .enex → its ENML, a Notion export .zip → its .md/.html pages with
// their images), then the same TipTap schema as the editor turns the HTML into
// a note document. Images are uploaded to the new note like a pasted image;
// what the schema doesn't know (scripts, styles, forms…) is simply dropped.

export const IMPORT_ACCEPT = '.md,.markdown,.txt,.html,.htm,.docx,.enex,.zip';
export const MAX_IMPORT_FILES = 200;
const MAX_FILE = 30 * 1024 * 1024;
const MAX_IMG = 5 * 1024 * 1024;
const MAX_DOC = 950_000;

export type ImportItem = {
  /** where it came from (file, or file › page) */
  source: string;
  title: string;
  html: string;
  /** images referenced by a relative path (zip exports) */
  assets?: Map<string, Blob>;
};

const IMG_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
};
const ext = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
const baseName = (name: string) =>
  name
    .split('/')
    .pop()!
    .replace(/\.[^.]+$/, '');
/** Notion adds the page id to every name: "Reunião 1a2b…(32 hex)" */
const cleanTitle = (s: string) =>
  s
    .replace(/\s+[0-9a-f]{32}$/i, '')
    .replace(/[_]+/g, ' ')
    .trim()
    .slice(0, 300);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function markdownHtml(md: string) {
  const { marked } = await import('marked');
  // GitHub task lists ("- [ ] x") become the editor's checklists below
  return marked.parse(md, { gfm: true, breaks: false, async: false }) as string;
}

/** "# Title" at the top of a Markdown page is its title (and leaves the body). */
function splitMdTitle(md: string): { title: string | null; body: string } {
  const m = md.match(/^﻿?\s*#\s+(.+?)\s*#*\s*(\r?\n|$)/);
  return m ? { title: m[1]!.trim(), body: md.slice(m[0].length) } : { title: null, body: md };
}

function textHtml(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** <title> or the first heading of an HTML page */
function htmlTitle(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const t = doc.querySelector('title')?.textContent?.trim() || doc.querySelector('h1')?.textContent?.trim();
  return t || null;
}

function enexItems(xml: string, file: string): ImportItem[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const out: ImportItem[] = [];
  doc.querySelectorAll('note').forEach((n, i) => {
    const title = n.querySelector(':scope > title')?.textContent?.trim() || `${baseName(file)} ${i + 1}`;
    const enml = n.querySelector(':scope > content')?.textContent ?? '';
    // images, in the order they appear (each <en-media> points at a <resource> by its MD5)
    const res = [...n.querySelectorAll(':scope > resource')].map((r) => ({
      mime: r.querySelector('mime')?.textContent?.trim() ?? '',
      data: (r.querySelector('data')?.textContent ?? '').replace(/\s+/g, ''),
    }));
    const imgs = res.filter((r) => r.mime.startsWith('image/'));
    let k = 0;
    const body = new DOMParser().parseFromString(enml, 'text/html').querySelector('en-note');
    if (!body) return;
    body.querySelectorAll('en-media').forEach((m) => {
      const r = (m.getAttribute('type') ?? '').startsWith('image/') ? imgs[k++] : undefined;
      if (r?.data) {
        const img = body.ownerDocument.createElement('img');
        img.setAttribute('src', `data:${r.mime};base64,${r.data}`);
        m.replaceWith(img);
      } else m.remove();
    });
    // checkboxes (<en-todo/>Texto, the HTML parser puts the text inside it) → the editor's checklist
    const d = body.ownerDocument;
    body.querySelectorAll('en-todo').forEach((td) => {
      const checked = td.getAttribute('checked') === 'true';
      const block = td.closest('div,p');
      if (!block) {
        td.replaceWith(d.createTextNode(checked ? '☑ ' : '☐ '), ...td.childNodes);
        return;
      }
      const li = d.createElement('li');
      li.setAttribute('data-type', 'taskItem');
      li.setAttribute('data-checked', String(checked));
      const p = d.createElement('p');
      td.replaceWith(...td.childNodes);
      p.append(...block.childNodes);
      li.append(p);
      // next to the previous checklist line: the same list
      const prev = block.previousElementSibling;
      if (prev?.getAttribute('data-type') === 'taskList') {
        prev.append(li);
        block.remove();
      } else {
        const ul = d.createElement('ul');
        ul.setAttribute('data-type', 'taskList');
        ul.append(li);
        block.replaceWith(ul);
      }
    });
    out.push({ source: `${file} › ${title}`, title, html: body.innerHTML });
  });
  return out;
}

async function zipItems(file: File): Promise<ImportItem[]> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const assets = new Map<string, Blob>();
  for (const [path, data] of Object.entries(files)) {
    const type = IMG_TYPES[ext(path)];
    if (type && data.length <= MAX_IMG) assets.set(path, new Blob([data as BlobPart], { type }));
  }
  const out: ImportItem[] = [];
  for (const [path, data] of Object.entries(files)) {
    const e = ext(path);
    if (path.startsWith('__MACOSX/') || !['md', 'markdown', 'html', 'htm', 'txt'].includes(e)) continue;
    const text = strFromU8(data);
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    // image paths inside the page are relative to the page's folder
    const local = new Map<string, Blob>();
    for (const [p, b] of assets) if (p.startsWith(dir)) local.set(p.slice(dir.length), b);
    let title = cleanTitle(baseName(path));
    let html: string;
    if (e === 'md' || e === 'markdown') {
      const s = splitMdTitle(text);
      if (s.title) title = cleanTitle(s.title);
      html = await markdownHtml(s.body);
    } else if (e === 'txt') html = textHtml(text);
    else {
      html = text;
      title = cleanTitle(htmlTitle(text) ?? title);
    }
    out.push({ source: `${file.name} › ${path}`, title, html, assets: local });
  }
  return out;
}

/** The pages in the files chosen (a .enex or .zip can hold many). */
export async function readImportFiles(files: File[]): Promise<{ items: ImportItem[]; skipped: string[] }> {
  const items: ImportItem[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    const e = ext(f.name);
    try {
      if (f.size > MAX_FILE) throw new Error('too big');
      if (e === 'md' || e === 'markdown') {
        const s = splitMdTitle(await f.text());
        items.push({
          source: f.name,
          title: cleanTitle(s.title ?? baseName(f.name)),
          html: await markdownHtml(s.body),
        });
      } else if (e === 'txt') {
        items.push({ source: f.name, title: cleanTitle(baseName(f.name)), html: textHtml(await f.text()) });
      } else if (e === 'html' || e === 'htm') {
        const html = await f.text();
        items.push({ source: f.name, title: cleanTitle(htmlTitle(html) ?? baseName(f.name)), html });
      } else if (e === 'docx') {
        const mammoth = await import('mammoth');
        const r = await mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() });
        items.push({ source: f.name, title: cleanTitle(baseName(f.name)), html: r.value });
      } else if (e === 'enex') {
        items.push(...enexItems(await f.text(), f.name));
      } else if (e === 'zip') {
        items.push(...(await zipItems(f)));
      } else skipped.push(f.name);
    } catch {
      skipped.push(f.name);
    }
  }
  return { items: items.slice(0, MAX_IMPORT_FILES), skipped };
}

function dataBlob(src: string): Blob | null {
  const m = src.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!m) return null;
  const type = m[1] ?? 'application/octet-stream';
  if (!type.startsWith('image/')) return null;
  if (m[2]) {
    const bin = atob(m[3]!);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Blob([u], { type });
  }
  return new Blob([decodeURIComponent(m[3]!)], { type });
}

/** Turns the page's HTML into the editor's document, with its images on the note. */
async function toDoc(noteId: string, item: ImportItem) {
  const dom = new DOMParser().parseFromString(item.html, 'text/html');
  const body = dom.body;
  body
    .querySelectorAll('script,style,noscript,iframe,object,embed,form,svg,head,meta,link')
    .forEach((x) => x.remove());
  // links the editor would refuse (javascript:, file:…) keep only their text
  body.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    if (!/^(https?:|mailto:)/i.test(href)) a.replaceWith(...a.childNodes);
  });
  // GitHub-style task lists (marked) → the editor's checklists
  body.querySelectorAll('ul').forEach((ul) => {
    const lis = [...ul.children].filter((c) => c.tagName === 'LI');
    if (
      !lis.length ||
      !lis.every((li) => li.querySelector(':scope > input[type=checkbox], :scope > p > input[type=checkbox]'))
    )
      return;
    ul.setAttribute('data-type', 'taskList');
    lis.forEach((li) => {
      const box = li.querySelector('input[type=checkbox]') as HTMLInputElement | null;
      li.setAttribute('data-type', 'taskItem');
      li.setAttribute('data-checked', box?.hasAttribute('checked') ? 'true' : 'false');
      box?.remove();
    });
  });
  let failed = 0;
  for (const img of [...body.querySelectorAll('img')]) {
    const src = img.getAttribute('src') ?? '';
    try {
      let blob: Blob | null = null;
      if (src.startsWith('data:')) blob = dataBlob(src);
      else if (!/^[a-z]+:/i.test(src) && item.assets) {
        const key = decodeURIComponent(src.replace(/^\.\//, '').split(/[?#]/)[0]!);
        blob = item.assets.get(key) ?? null;
      }
      if (blob) {
        const small =
          blob.type === 'image/svg+xml'
            ? null
            : await shrinkImage(new File([blob], 'img', { type: blob.type }));
        if (!small || small.size > MAX_IMG) throw new Error('img');
        const { src: stored } = await notesApi.uploadImage(noteId, small);
        img.setAttribute('src', stored);
      } else if (/^https?:/i.test(src)) {
        const { src: stored } = await notesApi.importImage(noteId, src);
        img.setAttribute('src', stored);
      } else throw new Error('img');
      img.removeAttribute('srcset');
    } catch {
      failed++;
      img.remove();
    }
  }
  const json = generateJSON(body.innerHTML, docExtensions()) as { type: string; content?: unknown[] };
  if (!json.content?.length) json.content = [{ type: 'paragraph' }];
  return { doc: json, failedImages: failed };
}

export type ImportResult = {
  source: string;
  ok: boolean;
  noteId?: string;
  failedImages?: number;
  /** the plan's note limit was reached */
  limit?: boolean;
};

/** Creates one note per page, in `folderId`; `onStep` reports each one as it is done. */
export async function importNotes(
  items: ImportItem[],
  folderId: string | null,
  onStep: (r: ImportResult) => void,
): Promise<ImportResult[]> {
  const out: ImportResult[] = [];
  let limit = false;
  for (const item of items) {
    if (limit) {
      const r = { source: item.source, ok: false, limit: true };
      out.push(r);
      onStep(r);
      continue;
    }
    let id: string | undefined;
    try {
      const { note } = await notesApi.create(folderId);
      id = note.id;
      const { doc, failedImages } = await toDoc(note.id, item);
      if (JSON.stringify(doc).length > MAX_DOC) throw new Error('too big');
      await notesApi.update(note.id, { title: item.title || '—', content: doc });
      const r = { source: item.source, ok: true, noteId: note.id, failedImages };
      out.push(r);
      onStep(r);
    } catch (e) {
      // a note that could not be filled goes to the Lixo (nothing half-made in the list)
      if (id) await notesApi.trash(id).catch(() => undefined);
      limit = isApiFailure(e) && e.code === 'limit_reached';
      const r = { source: item.source, ok: false, limit };
      out.push(r);
      onStep(r);
    }
  }
  return out;
}
