import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { chunkText } from '@/lib/search/text';

// Smoke test of the REAL embedding model through the worker's embedder
// (transformers.js + onnxruntime-node). Skipped unless the model files are
// already in MODEL_CACHE_DIR (downloaded by a worker, or placed by hand under
// local/<org>/<name>): tests never download 120 MB. Logs the timings.
const model = process.env.EMBED_MODEL || 'Xenova/multilingual-e5-small';
const dir = path.resolve(process.env.MODEL_CACHE_DIR || '.cache/models');
const present = ['hf', 'local'].some((d) =>
  fs.existsSync(path.join(dir, d, model, 'onnx', 'model_quantized.onnx')),
);
const real = model === 'Xenova/multilingual-e5-small';

const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);

describe.skipIf(!process.env.TEST_DATABASE_URL || !present)(`embedding model ${model}`, () => {
  it('gives 384-dimension unit vectors, fast enough for queries', async () => {
    const { embed, unloadModel } = await import('@/worker/search/embedder');
    let t = Date.now();
    const [q] = await embed(['faturas em atraso'], 'query');
    console.log(`[model] load + first query ${Date.now() - t} ms`);
    expect(q).toHaveLength(384);
    expect(Math.hypot(...q!)).toBeCloseTo(1, 3);

    t = Date.now();
    for (let i = 0; i < 20; i++) await embed([`pesquisa número ${i} sobre transportes`], 'query');
    const perQuery = (Date.now() - t) / 20;
    console.log(`[model] query ${perQuery.toFixed(1)} ms`);
    expect(perQuery).toBeLessThan(300);

    const chunk = chunkText(
      Array.from(
        { length: 60 },
        (_, i) => `Frase ${i}: o relatório trimestral de vendas mostra faturas por cliente.`,
      ).join(' '),
    )[0]!;
    t = Date.now();
    for (let i = 0; i < 5; i++) await embed([chunk], 'passage');
    console.log(`[model] full chunk (${chunk.length} chars) ${((Date.now() - t) / 5).toFixed(0)} ms`);

    if (real) {
      // meaning across languages: an invoice question is closer to the PT invoice note than to a meeting note
      const [inv, meet] = await embed(
        ['Lista de faturas em atraso dos clientes', 'Ata da reunião semanal da equipa'],
        'passage',
      );
      const [qq] = await embed(['overdue customer invoices'], 'query');
      expect(cos(qq!, inv!)).toBeGreaterThan(cos(qq!, meet!));
    }
    await unloadModel();
  }, 180_000);
});
