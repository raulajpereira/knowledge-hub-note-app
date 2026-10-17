import { afterAll, describe, expect, it } from 'vitest';
import { makePdf } from '../fixtures/makePdf';

// OCR building blocks on real files: a PNG with known text, and a PDF with one
// page that has a text layer (read as is, no OCR) and one that is only a
// scanned image (rendered and recognised). Uses the traineddata shipped in
// @tesseract.js-data (no download).
const enabled = Boolean(process.env.TEST_DATABASE_URL); // the env the worker modules need

async function textImage(lines: string[], type: 'png' | 'jpeg' = 'png') {
  const { createCanvas } = await import('@napi-rs/canvas');
  const cv = createCanvas(900, 90 + lines.length * 60);
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#111';
  g.font = '40px sans-serif';
  lines.forEach((l, i) => g.fillText(l, 24, 80 + i * 60));
  return {
    buf: type === 'png' ? await cv.encode('png') : await cv.encode('jpeg', 92),
    w: cv.width,
    h: cv.height,
  };
}

describe.skipIf(!enabled)('OCR', () => {
  afterAll(async () => {
    const { stopOcr } = await import('@/worker/search/ocr');
    await stopOcr();
  });

  it('reads Portuguese and English text in a PNG', async () => {
    const { ocrImage } = await import('@/worker/search/ocr');
    const { buf } = await textImage(['Relatório de faturação 2026', 'Invoice number 4711']);
    const t0 = Date.now();
    const text = await ocrImage(buf);
    console.log(`[ocr test] png ${Date.now() - t0} ms (first call includes loading tesseract)`);
    expect(text).toMatch(/Relat[óo]rio de fatura[çc][ãa]o 2026/);
    expect(text).toMatch(/Invoice number 4711/);
  }, 60_000);

  it('PDF: text layer as is, scanned pages through OCR, page cap respected', async () => {
    const { ocrPdf, isPdf } = await import('@/worker/search/ocr');
    const scan = await textImage(['Contrato digitalizado 2026'], 'jpeg');
    const pdf = makePdf([
      { text: 'Pagina com texto selecionavel sobre transportes SAP' },
      { jpeg: scan.buf, width: scan.w, height: scan.h },
      { text: 'Terceira pagina que nao deve ser lida' },
    ]);
    expect(isPdf('x.bin', 'application/octet-stream', pdf)).toBe(true);
    const t0 = Date.now();
    const r = await ocrPdf(pdf, 2);
    console.log(`[ocr test] pdf (1 text + 1 scanned page) ${Date.now() - t0} ms`);
    expect(r.pages).toBe(2);
    expect(r.text).toMatch(/texto selecionavel sobre transportes SAP/);
    expect(r.text).toMatch(/Contrato digitalizado 2026/);
    expect(r.text).not.toMatch(/Terceira/);
  }, 60_000);
});
