// OCR (worker only): tesseract.js (Apache-2.0, WebAssembly — no native
// dependency) with Portuguese + English (the traineddata ships in the npm
// packages @tesseract.js-data/por|eng, so nothing is downloaded at run time;
// copied once into MODEL_CACHE_DIR/tessdata). PDFs: the text layer first
// (pdfjs-dist, Apache-2.0); only pages without text are rendered
// (@napi-rs/canvas) and recognised, at most OCR_MAX_PAGES of them.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Worker as TessWorker } from 'tesseract.js';
import { env } from '@/lib/env';

const LANGS = ['por', 'eng'] as const;
/** largest side of the image handed to tesseract (memory/CPU on the small VPS) */
const MAX_SIDE = 2400;
/** a page with less text than this in its text layer is treated as a scan */
const MIN_PAGE_TEXT = 25;
const IDLE_MS = 2 * 60_000;

let tw: Promise<TessWorker> | null = null;
let idle: NodeJS.Timeout | null = null;

async function tessdata(): Promise<string> {
  const dir = path.resolve(env().MODEL_CACHE_DIR, 'tessdata');
  await fs.mkdir(dir, { recursive: true });
  const req = createRequire(import.meta.url);
  for (const l of LANGS) {
    const to = path.join(dir, `${l}.traineddata.gz`);
    if (await fs.stat(to).catch(() => null)) continue;
    const pkg = path.dirname(req.resolve(`@tesseract.js-data/${l}/package.json`));
    await fs.copyFile(path.join(pkg, '4.0.0_best_int', `${l}.traineddata.gz`), to);
  }
  return dir;
}

function worker(): Promise<TessWorker> {
  tw ??= (async () => {
    const { createWorker, OEM } = await import('tesseract.js');
    const dir = await tessdata();
    let failed: unknown = null;
    const w = await createWorker([...LANGS], OEM.LSTM_ONLY, {
      langPath: dir,
      cachePath: dir,
      gzip: true,
      logger: () => {},
      // tesseract.js reports some load errors here instead of rejecting
      errorHandler: (e: unknown) => {
        failed = e;
      },
    });
    if (failed) throw failed instanceof Error ? failed : new Error(String(failed));
    return w;
  })().catch((e: unknown) => {
    tw = null;
    throw e;
  });
  return tw;
}

/** Frees tesseract's memory (~150 MB) when the queue has been idle a while. */
function scheduleIdle() {
  if (idle) clearTimeout(idle);
  idle = setTimeout(() => void stopOcr(), IDLE_MS);
  idle.unref();
}

export async function stopOcr() {
  const w = tw;
  tw = null;
  if (idle) clearTimeout(idle);
  idle = null;
  if (w) await (await w.catch(() => null))?.terminate().catch(() => {});
}

async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, rej) => {
        t = setTimeout(() => rej(new Error(`${what} timed out`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(t);
  }
}

/** Text of an image (PNG, JPEG, WebP, GIF, BMP, TIFF). */
export async function ocrImage(buf: Buffer, timeoutMs = 60_000): Promise<string> {
  const { default: sharp } = await import('sharp');
  // one normalised grayscale PNG, never bigger than MAX_SIDE (first frame of animations)
  const png = await sharp(buf, { limitInputPixels: 50_000_000, animated: false })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .grayscale()
    .png()
    .toBuffer();
  const w = await worker();
  try {
    const r = await withTimeout(w.recognize(png), timeoutMs, 'ocr');
    return r.data.text.replace(/[ \t]+\n/g, '\n').trim();
  } catch (e) {
    // a stuck recognition: throw the worker away (a new one is made next time)
    await stopOcr();
    throw e;
  } finally {
    scheduleIdle();
  }
}

/** Text of a PDF: its text layer, plus OCR of the pages that have none. */
export async function ocrPdf(
  buf: Buffer,
  maxPages = env().OCR_MAX_PAGES,
): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  const doc = await task.promise;
  try {
    const out: string[] = [];
    const n = Math.min(doc.numPages, maxPages);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const layer = tc.items
        .map((x) => ('str' in x ? x.str + (x.hasEOL ? '\n' : ' ') : ''))
        .join('')
        .trim();
      if (layer.length >= MIN_PAGE_TEXT) {
        out.push(layer);
      } else {
        // a scanned page: render at ~2000 px wide and recognise it
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(3, 2000 / Math.max(1, base.width));
        const vp = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
        await page.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: canvas.getContext('2d') as unknown as CanvasRenderingContext2D,
          viewport: vp,
        }).promise;
        const text = await ocrImage(await canvas.encode('png'));
        if (text || layer) out.push([layer, text].filter(Boolean).join('\n'));
      }
      page.cleanup();
    }
    return { text: out.join('\n\n').trim(), pages: n };
  } finally {
    await task.destroy();
  }
}

export const isPdf = (name: string, mime: string, head: Buffer) =>
  mime === 'application/pdf' || /\.pdf$/i.test(name) || head.subarray(0, 5).toString('latin1') === '%PDF-';
