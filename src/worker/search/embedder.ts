// The embedding model, in the worker only (the web image never loads it).
// transformers.js (Apache-2.0) + onnxruntime-node, multilingual-e5-small (MIT)
// quantized to 8 bits: ~118 MB of weights, 384-dimension vectors, PT + EN.
// Loaded on first use; the files are downloaded once from the Hugging Face
// CDN into MODEL_CACHE_DIR (a Docker volume) and freed after EMBED_IDLE_MIN
// idle minutes, so a quiet worker gives the memory back.
import path from 'node:path';
import type { FeatureExtractionPipeline } from '@huggingface/transformers';
import { env } from '@/lib/env';

let pipe: Promise<FeatureExtractionPipeline> | null = null;
let loaded = false;
let lastUse = 0;
let idleTimer: NodeJS.Timeout | null = null;

export const modelId = () => env().EMBED_MODEL;
/** e5 models expect "query: " / "passage: " in front of the text. */
const prefix = (kind: 'query' | 'passage') => (/e5/i.test(modelId()) ? `${kind}: ` : '');

function load(): Promise<FeatureExtractionPipeline> {
  pipe ??= (async () => {
    const t0 = Date.now();
    const tf = await import('@huggingface/transformers');
    const dir = path.resolve(env().MODEL_CACHE_DIR);
    tf.env.cacheDir = path.join(dir, 'hf');
    // a model placed by hand under <dir>/local/<org>/<name> wins (offline installs, tests)
    tf.env.localModelPath = path.join(dir, 'local');
    tf.env.allowLocalModels = true;
    const p = (await tf.pipeline('feature-extraction', modelId(), {
      dtype: 'q8',
      // one vCPU on the VPS: one thread, no inter-op parallelism
      session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 },
    })) as FeatureExtractionPipeline;
    loaded = true;
    console.log(`[search] model ${modelId()} loaded in ${Date.now() - t0} ms`);
    return p;
  })().catch((e: unknown) => {
    pipe = null;
    throw e;
  });
  return pipe;
}

function touch() {
  lastUse = Date.now();
  const mins = env().EMBED_IDLE_MIN;
  if (!mins || idleTimer) return;
  idleTimer = setInterval(() => {
    if (!loaded || Date.now() - lastUse < mins * 60_000) return;
    void unloadModel();
  }, 60_000);
  idleTimer.unref();
}

export async function unloadModel() {
  const p = pipe;
  pipe = null;
  loaded = false;
  if (idleTimer) clearInterval(idleTimer);
  idleTimer = null;
  if (p) await (await p.catch(() => null))?.dispose();
}

export const modelLoaded = () => loaded;
/** Starts loading without waiting (the first query must not wait for the download). */
export const warmModel = () =>
  void load().catch((e: unknown) => console.error('[search] model load failed:', e));

/** Unit vectors (mean pooling, normalised) of the texts. */
export async function embed(texts: string[], kind: 'query' | 'passage'): Promise<number[][]> {
  if (!texts.length) return [];
  touch();
  const p = await load();
  const out = await p(
    texts.map((t) => prefix(kind) + t),
    { pooling: 'mean', normalize: true },
  );
  touch();
  return out.tolist() as number[][];
}
