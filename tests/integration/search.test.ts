import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import type http from 'node:http';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';

// Semantic search + OCR through the real services and the real worker code
// (queue triggers → indexer → pgvector under RLS → hybrid retrieval), with a
// tiny deterministic "concept" embedder in place of the model: words map to
// concepts (fatura/invoice → one dimension), so "meaning" matches are
// predictable. The real model has its own smoke test (embedModel.test.ts).
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.9', userAgent: 'vitest', lang: 'pt' as const };

// the worker's endpoint for this file (a port nothing else uses)
process.env.EMBED_PORT = '3291';
process.env.EMBED_HOST = '127.0.0.1';
process.env.EMBED_URL = 'http://127.0.0.1:3291';
process.env.SEMANTIC_SEARCH = 'on';
process.env.OCR = 'on';
process.env.EMBED_MODEL = 'test/concepts';

const CONCEPTS: Record<string, string> = {
  fatur: 'BILL',
  invoi: 'BILL',
  billi: 'BILL',
  recib: 'BILL',
  clien: 'CLIENT',
  custo: 'CLIENT',
  reuni: 'MEET',
  meeti: 'MEET',
  equip: 'TEAM',
  team: 'TEAM',
};
const fakeVector = (text: string): number[] => {
  const v = new Array<number>(384).fill(0);
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
  for (const w of words) {
    const c = CONCEPTS[w.slice(0, 5)] ?? w.slice(0, 5);
    let h = 0;
    for (const ch of c) h = (h * 31 + ch.charCodeAt(0)) % 384;
    v[h]! += 1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};
const calls = { passages: 0 };
vi.mock('@/worker/search/embedder', () => ({
  modelId: () => 'test/concepts',
  modelLoaded: () => true,
  warmModel: () => {},
  unloadModel: async () => {},
  embed: async (texts: string[], kind: 'query' | 'passage') => {
    if (kind === 'passage') calls.passages += texts.length;
    return texts.map(fakeVector);
  },
}));

async function acceptInvite(who: import('@/server/auth/session').AuthContext, folderId: string) {
  const sh = await import('@/server/share/folders');
  const inv = (await sh.listInvites(who)).find((i) => i.folderId === folderId);
  if (!inv) throw new Error('no invitation');
  await sh.answerInvite(who, inv.id, true);
}

describe.skipIf(!enabled)('semantic search and OCR', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let notes: typeof import('@/server/content/notes');
  let dbm: typeof import('@/db/client');
  let indexer: typeof import('@/worker/search/indexer');
  let ctx: typeof import('@/server/ai/context');
  let client: typeof import('@/server/search/embedClient');
  let status: typeof import('@/server/search/status');
  let tenant: typeof import('@/server/content/tenant');
  let semantic: typeof import('@/server/search/semantic');
  let admin: postgres.Sql;
  let server: http.Server | null = null;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, notes, dbm, indexer, ctx, client, status, tenant, semantic] =
      await Promise.all([
        import('@/server/auth/service'),
        import('@/server/licensing/codes'),
        import('@/server/auth/session'),
        import('@/db/seed/index'),
        import('@/server/content/notes'),
        import('@/db/client'),
        import('@/worker/search/indexer'),
        import('@/server/ai/context'),
        import('@/server/search/embedClient'),
        import('@/server/search/status'),
        import('@/server/content/tenant'),
        import('@/server/search/semantic'),
      ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE search_jobs, embeddings, ocr_texts, public_links, share_members, share_people, shared_folders, drive_files, note_attachments, notes, folders, tasks, artifacts, code_redemptions, recovery_codes, auth_tokens, sessions, admins, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
    );
    await fs.rm(outbox, { recursive: true, force: true });
    const { redis } = await import('@/lib/redis');
    const keys = await redis().keys('kh:*');
    if (keys.length) await redis().del(...keys);
    await seed.seedCatalogue();
    client.resetEmbedClient();
  });

  afterAll(async () => {
    server?.close();
    const { stopOcr } = await import('@/worker/search/ocr');
    await stopOcr();
    await admin?.end();
    await dbm?.sqlClient().end();
    const { redis } = await import('@/lib/redis');
    redis().disconnect();
  });

  async function signedIn(email: string, password = 'Correct-Horse-9') {
    const c = await codesSvc.createCode({ type: 'license', planCode: 'PRO', maxUses: 1 });
    await svc.register({ name: 'Ana Teste', email, password, code: c.code }, meta);
    const safe = email.replace(/[^a-z0-9@.]/gi, '_');
    const files = (await fs.readdir(outbox)).filter((f) => f.includes('-verify-') && f.includes(safe));
    const mail = JSON.parse(await fs.readFile(path.join(outbox, files.at(-1)!), 'utf8')) as { text: string };
    await svc.verifyEmail(/token=([A-Za-z0-9_-]+)/.exec(mail.text)![1]!);
    const a = await svc.login({ email, password, remember: true }, meta);
    if (!('token' in a)) throw new Error('2FA not expected');
    return (await session.resolveSession(a.token))!;
  }
  const doc = (text: string) => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });

  /** Runs the worker's queue now (ignoring the 30 s debounce) until it is empty. */
  async function drain() {
    await admin.unsafe("update search_jobs set due_at = now() - interval '1 second'");
    for (let i = 0; i < 50 && (await indexer.indexTick()) > 0; i++)
      await admin.unsafe("update search_jobs set due_at = now() - interval '1 second'");
  }
  const countAs = async (who: import('@/server/auth/session').AuthContext, share = false) =>
    (share ? tenant.asSharer : tenant.asUser)(who, async (tx) => {
      const [r] = (await tx.execute(sql`select count(*)::int as n from embeddings`)) as unknown as Array<{
        n: number;
      }>;
      return r!.n;
    });

  it('queues changes (debounced), indexes them, skips unchanged chunks, cleans up on purge', async () => {
    const ana = await signedIn('ana@sem.pt');
    const n = await notes.createNote(ana, { title: 'Faturas do cliente' });
    await notes.updateNote(ana, n.id, { content: doc('Lista de faturas em atraso do cliente Atlas.') });
    const [job] =
      await admin`select kind, item_type, owner_id, due_at > now() + interval '20 seconds' as later from search_jobs`;
    expect(job).toMatchObject({ kind: 'embed', item_type: 'note', owner_id: ana.user.id, later: true });

    calls.passages = 0;
    await drain();
    expect(calls.passages).toBe(1);
    expect(await admin`select count(*)::int as n from search_jobs`).toEqual([{ n: 0 }]);
    const [row] = await admin`select owner_id, item_type, chunk_no, model from embeddings`;
    expect(row).toMatchObject({
      owner_id: ana.user.id,
      item_type: 'note',
      chunk_no: 0,
      model: 'test/concepts',
    });

    // a change that doesn't touch the text (favourite) → nothing embedded again (hash)
    await notes.updateNote(ana, n.id, { favorite: true });
    calls.passages = 0;
    await drain();
    expect(calls.passages).toBe(0);

    // a long note: only the changed chunk is embedded again
    const long = Array.from({ length: 150 }, (_, i) => `Linha ${i} sobre o projeto.`).join(' ');
    await notes.updateNote(ana, n.id, { content: doc(long) });
    await drain();
    const chunks = (await admin`select count(*)::int as n from embeddings`)[0]!.n as number;
    expect(chunks).toBeGreaterThan(2);
    await notes.updateNote(ana, n.id, { content: doc(`${long} Mais uma linha no fim.`) });
    calls.passages = 0;
    await drain();
    expect(calls.passages).toBe(1);

    // Trash keeps the vectors (restore is instant); deleting for good removes them
    await notes.trashNote(ana, n.id);
    await drain();
    expect((await admin`select count(*)::int as n from embeddings`)[0]!.n).toBe(chunks);
    await notes.purgeTrash(ana, [{ kind: 'note', id: n.id }]);
    expect(await admin`select count(*)::int as n from embeddings`).toEqual([{ n: 0 }]);
    expect(await admin`select count(*)::int as n from search_jobs`).toEqual([{ n: 0 }]);
  });

  it("RLS: one person never gets another's vectors; shared folders show them only with the share scope", async () => {
    const ana = await signedIn('ana@rls.pt');
    const rui = await signedIn('rui@rls.pt');
    const mine = await notes.createNote(ana, { title: 'Faturas do cliente' });
    await notes.updateNote(ana, mine.id, { content: doc('Faturas em atraso do cliente.') });
    const sh = await import('@/server/share/folders');
    const sf = await sh.createSharedFolder(ana, { kind: 'notes', name: 'Projeto' });
    const shared = await notes.createNote(ana, { title: 'Recibos do cliente', sharedFolderId: sf });
    await notes.updateNote(ana, shared.id, { content: doc('Recibos e faturas do cliente Atlas.') });
    await drain();
    expect(await countAs(ana)).toBe(2);

    // Rui: nothing, even searching with Ana's exact vector
    const q = fakeVector('invoice customer');
    expect(await countAs(rui)).toBe(0);
    expect(await tenant.asUser(rui, (tx) => semantic.vectorItems(tx, q, { maxDist: 2 }))).toEqual([]);
    // nor can he write a vector for her item
    const err = await tenant
      .asUser(rui, (tx) =>
        tx.execute(
          sql`insert into embeddings (tenant_id, owner_id, item_type, item_id, chunk_no, content_hash, model, embedding)
              values (kh_tenant_id(), ${ana.user.id}::uuid, 'note', ${mine.id}::uuid, 5, 'x', 'm', ${client.vecLiteral(q)}::vector)`,
        ),
      )
      .catch((e: unknown) => e);
    expect(String((err as { cause?: unknown })?.cause ?? err)).toMatch(/row-level security/);

    // after joining the shared folder: only the shared note's vectors, and only with the share scope
    await sh.addMember(ana, sf, 'rui@rls.pt', { lang: 'pt' });
    await acceptInvite(rui, sf);
    expect(await countAs(rui)).toBe(0);
    expect(await countAs(rui, true)).toBe(1);
    const list = await notes.listNotes(rui, {
      shared: await sh.reachableFolder(rui, sf),
      search: 'invoice customer',
      vector: q,
    });
    expect(list.map((x) => [x.title, x.semantic])).toEqual([['Recibos do cliente', true]]);
    // his own list (no share scope) gets nothing of Ana's
    expect(await notes.listNotes(rui, { search: 'invoice customer', vector: q })).toEqual([]);
  });

  it('notes list: word matches first, then meaning matches marked semantic', async () => {
    const ana = await signedIn('ana@list.pt');
    const a = await notes.createNote(ana, { title: 'Invoice customer Atlas' });
    const b = await notes.createNote(ana, { title: 'Faturas cliente' });
    const c = await notes.createNote(ana, { title: 'Reunião de equipa' });
    await drain();
    const list = await notes.listNotes(ana, { search: 'invoice', vector: fakeVector('invoice customer') });
    expect(list.map((x) => [x.id, x.semantic ?? false])).toEqual([
      [a.id, false],
      [b.id, true],
    ]);
    expect(list.some((x) => x.id === c.id)).toBe(false);
  });

  it('AI retrieval: hybrid with the worker up, keyword-only (fast, no error) with it down', async () => {
    const ana = await signedIn('ana@ai.pt');
    const n1 = await notes.createNote(ana, { title: 'Faturas do cliente Atlas' });
    await notes.updateNote(ana, n1.id, { content: doc('Recibos e faturas em atraso.') });
    const n2 = await notes.createNote(ana, { title: 'Invoice list' });
    await notes.updateNote(ana, n2.id, { content: doc('Invoice for the customer.') });
    await drain();

    // worker down (nothing listening): keyword search only, quickly
    const t0 = Date.now();
    const down = await ctx.buildContext(ana, 'invoice customer', '2026-10-16');
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(down.sources.map((s) => s.id)).toEqual([n2.id]);

    // worker up: the Portuguese note comes in by meaning, after the exact match
    const { startEmbedServer } = await import('@/worker/search/server');
    server = await startEmbedServer();
    client.resetEmbedClient();
    const up = await ctx.buildContext(ana, 'invoice customer', '2026-10-16');
    expect(up.sources.map((s) => s.id)).toEqual([n2.id, n1.id]);
    expect(up.blocks[1]).toMatch(/Faturas do cliente Atlas/);

    // the endpoint refuses callers without the token
    const res = await fetch('http://127.0.0.1:3291/embed', { method: 'POST', body: '{"text":"x"}' });
    expect(res.status).toBe(401);
    expect(await client.embedQuery('faturas')).toHaveLength(384);
  });

  it('status and Reindexar', async () => {
    const ana = await signedIn('ana@st.pt');
    await notes.createNote(ana, { title: 'Faturas' });
    let st = await status.indexStatus(ana);
    expect(st).toMatchObject({ semantic: true, indexed: 0, pending: 1 });
    await drain();
    st = await status.indexStatus(ana);
    expect(st).toMatchObject({ indexed: 1, pending: 0 });
    expect(await status.reindex(ana)).toBe(1);
    const [job] = await admin`select force, priority from search_jobs`;
    expect(job).toEqual({ force: true, priority: 1 });
    calls.passages = 0;
    await drain();
    expect(calls.passages).toBe(1); // forced: embedded again although unchanged
  });

  it('OCR: an image in a note becomes searchable and part of its vectors', async () => {
    const { createCanvas } = await import('@napi-rs/canvas');
    const cv = createCanvas(900, 160);
    const g = cv.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 900, 160);
    g.fillStyle = '#000';
    g.font = '44px sans-serif';
    g.fillText('Encomenda XPTO 4711 aprovada', 20, 95);
    const png = await cv.encode('png');

    const ana = await signedIn('ana@ocr.pt');
    const n = await notes.createNote(ana, { title: 'Ecrã' });
    const img = await notes.addNoteImage(ana, n.id, new Uint8Array(png));
    await notes.updateNote(ana, n.id, {
      content: { type: 'doc', content: [{ type: 'image', attrs: { src: `/api/v1/files/${img}` } }] },
    });
    expect((await admin`select kind, item_type from search_jobs order by kind`).map((r) => r.kind)).toEqual([
      'embed',
      'ocr',
    ]);
    await drain();
    const [o] = await admin`select status, parent_type, text from ocr_texts`;
    expect(o).toMatchObject({ status: 'done', parent_type: 'note' });
    expect(String(o!.text)).toMatch(/XPTO\s*4711/);
    // keyword search of the Notes list finds the note by the text in its image
    expect((await notes.listNotes(ana, { search: 'xpto' })).map((x) => x.id)).toEqual([n.id]);
    // and the AI assistant's sources too
    const c = await ctx.buildContext(ana, 'encomenda XPTO', '2026-10-16');
    expect(c.sources.map((s) => s.id)).toContain(n.id);
  }, 120_000);

  it('OCR: a file that keeps failing is given up after 3 attempts (no endless retries)', async () => {
    const ana = await signedIn('ana@fail.pt');
    const n = await notes.createNote(ana, { title: 'Sem imagem' });
    // an attachment whose stored object is missing → the download fails every time
    await admin`insert into note_attachments (tenant_id, owner_id, note_id, storage_key, mime, size)
                values (${ana.tenant.id}, ${ana.user.id}, ${n.id}, 'missing/key.png', 'image/png', 10)`;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await drain();
    err.mockRestore();
    expect(await admin`select count(*)::int as n from search_jobs where kind = 'ocr'`).toEqual([{ n: 0 }]);
    const [o] = await admin`select status from ocr_texts`;
    expect(o).toEqual({ status: 'failed' });
    // the backfill doesn't queue it again
    await indexer.backfill();
    expect(await admin`select count(*)::int as n from search_jobs where kind = 'ocr'`).toEqual([{ n: 0 }]);
  });

  it('OCR: too-big files are skipped without downloading them', async () => {
    const ana = await signedIn('ana@big.pt');
    const n = await notes.createNote(ana, { title: 'Grande' });
    await admin`insert into note_attachments (tenant_id, owner_id, note_id, storage_key, mime, size)
                values (${ana.tenant.id}, ${ana.user.id}, ${n.id}, 'missing/big.png', 'image/png', ${200 * 1024 * 1024})`;
    await drain();
    expect(await admin`select status, error from ocr_texts`).toEqual([
      { status: 'skipped', error: 'too big' },
    ]);
  });
});
