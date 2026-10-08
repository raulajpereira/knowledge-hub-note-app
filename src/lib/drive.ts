// Ficheiros: rules shared by the server and the browser — the default limits,
// how big an upload chunk is, and what can be previewed (and how a file may
// be served inline). The preview type always comes from the file name, never
// from the type the browser declared at upload.

export const FILES_QUOTA_MB = 1024;
export const FILES_MAX_MB = 50;
/** hard ceilings for what the console may set per user */
export const FILES_QUOTA_MB_CAP = 102_400;
export const FILES_MAX_MB_CAP = 2048;
/** uploads go in chunks (below the proxy's 50 MB request limit) */
export const UPLOAD_PART = 8 * 1024 * 1024;
/** text previews are read up to this size */
export const TEXT_PREVIEW_MAX = 1024 * 1024;

export type PreviewKind = 'pdf' | 'image' | 'video' | 'audio' | 'text' | 'docx' | 'xlsx' | 'none';

const INLINE: Record<string, [PreviewKind, string]> = {
  pdf: ['pdf', 'application/pdf'],
  png: ['image', 'image/png'],
  jpg: ['image', 'image/jpeg'],
  jpeg: ['image', 'image/jpeg'],
  gif: ['image', 'image/gif'],
  webp: ['image', 'image/webp'],
  avif: ['image', 'image/avif'],
  bmp: ['image', 'image/bmp'],
  mp4: ['video', 'video/mp4'],
  m4v: ['video', 'video/mp4'],
  webm: ['video', 'video/webm'],
  mov: ['video', 'video/quicktime'],
  mp3: ['audio', 'audio/mpeg'],
  m4a: ['audio', 'audio/mp4'],
  aac: ['audio', 'audio/aac'],
  wav: ['audio', 'audio/wav'],
  ogg: ['audio', 'audio/ogg'],
  oga: ['audio', 'audio/ogg'],
  flac: ['audio', 'audio/flac'],
};
// shown as plain text (served text/plain — markup is never rendered)
const TEXT = new Set(
  'txt md markdown csv tsv log json xml yaml yml ini cfg conf toml sql abap js mjs cjs ts tsx jsx py java cs c h cpp go rs rb php sh bat ps1 html htm css scss vue svelte kt swift env properties gitignore dockerfile'.split(
    ' ',
  ),
);

export const extOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : name.toLowerCase();
};

export function previewKind(name: string): PreviewKind {
  const e = extOf(name);
  if (INLINE[e]) return INLINE[e]![0];
  if (TEXT.has(e)) return 'text';
  if (e === 'docx') return 'docx';
  if (e === 'xlsx' || e === 'xlsm') return 'xlsx';
  return 'none';
}

/** The type a file may be served inline with, or null (download only). */
export function inlineType(name: string): string | null {
  const e = extOf(name);
  if (INLINE[e]) return INLINE[e]![1];
  if (TEXT.has(e)) return 'text/plain; charset=utf-8';
  return null;
}

/** Office/other files read in the browser for preview are fetched as bytes. */
export const fetchedForPreview = (k: PreviewKind) => k === 'docx' || k === 'xlsx' || k === 'text';

export function fmtBytes(n: number, lang = 'pt'): string {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  const s =
    i === 0 ? String(v) : v.toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT', { maximumFractionDigits: 1 });
  return `${s} ${u[i]}`;
}

/** A safe file name: no paths or control characters, at most 255 characters. */
export function cleanName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? '';
  const s = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (s || 'ficheiro').slice(0, 255);
}
