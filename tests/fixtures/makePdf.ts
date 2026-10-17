// Builds tiny PDFs for the OCR tests: pages with a real text layer and pages
// that are only a JPEG (like a scan). Plain PDF 1.4, written by hand.
export type PdfPage = { text: string } | { jpeg: Buffer; width: number; height: number };

export function makePdf(pages: PdfPage[]): Buffer {
  // 1 catalog, 2 pages, 3 font, then per page: page, content, (image)
  const kids: number[] = [];
  let next = 4;
  const body: Array<{ n: number; data: Buffer }> = [];
  for (const p of pages) {
    const pageN = next++;
    const contN = next++;
    kids.push(pageN);
    if ('text' in p) {
      const esc = p.text.replace(/[\\()]/g, (c) => `\\${c}`);
      const stream = `BT /F1 24 Tf 50 700 Td (${esc}) Tj ET`;
      body.push({
        n: pageN,
        data: Buffer.from(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contN} 0 R >>`,
          'latin1',
        ),
      });
      body.push({
        n: contN,
        data: Buffer.from(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, 'latin1'),
      });
    } else {
      const imgN = next++;
      const stream = `q 612 0 0 ${Math.round((612 * p.height) / p.width)} 0 100 cm /Im1 Do Q`;
      body.push({
        n: pageN,
        data: Buffer.from(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 ${imgN} 0 R >> >> /Contents ${contN} 0 R >>`,
          'latin1',
        ),
      });
      body.push({
        n: contN,
        data: Buffer.from(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, 'latin1'),
      });
      body.push({
        n: imgN,
        data: Buffer.concat([
          Buffer.from(
            `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
            'latin1',
          ),
          p.jpeg,
          Buffer.from('\nendstream', 'latin1'),
        ]),
      });
    }
  }
  const all = [
    { n: 1, data: Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1') },
    {
      n: 2,
      data: Buffer.from(
        `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`,
        'latin1',
      ),
    },
    { n: 3, data: Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', 'latin1') },
    ...body,
  ].sort((a, b) => a.n - b.n);
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets: number[] = [];
  let pos = parts[0]!.length;
  for (const o of all) {
    offsets[o.n] = pos;
    const chunk = Buffer.concat([
      Buffer.from(`${o.n} 0 obj\n`, 'latin1'),
      o.data,
      Buffer.from('\nendobj\n', 'latin1'),
    ]);
    parts.push(chunk);
    pos += chunk.length;
  }
  const size = all.length + 1;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let i = 1; i < size; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  parts.push(
    Buffer.from(`${xref}trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'),
  );
  return Buffer.concat(parts);
}
