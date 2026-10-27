import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { AuthContext } from '@/server/auth/session';

// The header's global search through the real services, as kh_app under RLS:
// prefixes and partial words, accents either way, every word required,
// short words on titles only, ranking, counts, plan modules and isolation.
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.9', userAgent: 'vitest', lang: 'pt' as const };
const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe.skipIf(!enabled)('global search', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let notes: typeof import('@/server/content/notes');
  let tasks: typeof import('@/server/content/tasks');
  let meetings: typeof import('@/server/content/meetings');
  let sap: typeof import('@/server/content/sap');
  let gs: typeof import('@/server/search/global');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;
  const ALL = ['notes', 'tasks', 'meetings', 'systems', 'tcodes'];

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, notes, tasks, meetings, sap, gs, dbm] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/content/notes'),
      import('@/server/content/tasks'),
      import('@/server/content/meetings'),
      import('@/server/content/sap'),
      import('@/server/search/global'),
      import('@/db/client'),
    ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE sap_tcodes, sap_systems, meetings, tasks, item_links, notes, folders, code_redemptions, auth_tokens, sessions, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
    );
    await fs.rm(outbox, { recursive: true, force: true });
    const { redis } = await import('@/lib/redis');
    const keys = await redis().keys('kh:*');
    if (keys.length) await redis().del(...keys);
    await seed.seedCatalogue();
  });

  afterAll(async () => {
    await admin?.end();
    await dbm?.sqlClient().end();
    const { redis } = await import('@/lib/redis');
    redis().disconnect();
  });

  async function signedIn(email: string, password = 'Correct-Horse-9'): Promise<AuthContext> {
    const c = await codesSvc.createCode({ type: 'license', planCode: 'ULTRA', maxUses: 1 });
    await svc.register({ name: 'Ana Teste', email, password, code: c.code }, meta);
    const safe = email.replace(/[^a-z0-9@.]/gi, '_');
    const files = (await fs.readdir(outbox)).filter((f) => f.includes('-verify-') && f.includes(safe));
    const mail = JSON.parse(await fs.readFile(path.join(outbox, files.at(-1)!), 'utf8')) as { text: string };
    await svc.verifyEmail(/token=([A-Za-z0-9_-]+)/.exec(mail.text)![1]!);
    const a = await svc.login({ email, password, remember: true }, meta);
    if (!('token' in a)) throw new Error('2FA not expected');
    return (await session.resolveSession(a.token))!;
  }
  const search = (
    a: AuthContext,
    q: string,
    o: { modules?: string[]; perGroup?: number; type?: string } = {},
  ) => gs.globalSearch(a, q, { modules: o.modules ?? ALL, perGroup: o.perGroup ?? 5, type: o.type });
  const titles = (r: Awaited<ReturnType<typeof search>>, type?: string) =>
    r.groups.filter((g) => !type || g.type === type).flatMap((g) => g.items.map((i) => i.title));

  async function content(a: AuthContext) {
    const n1 = await notes.createNote(a, { title: 'Reunião de kickoff S/4HANA' });
    const n2 = await notes.createNote(a, { title: 'Faturação' });
    await notes.updateNote(a, n2.id, { content: doc('Decidido na reuniao com o cliente: faturas mensais') });
    await notes.createNote(a, { title: 'Arquitetura' });
    await tasks.createTask(a, { title: 'Preparar REUNIÃO de steering' });
    await meetings.createMeeting(a, { title: 'Reunião semanal', heldOn: '2026-10-20' });
    await sap.createSystem(a, { name: 'S/4 Produção', sid: 'S4P', env: 'PRD' });
    return { n1, n2 };
  }

  it('matches prefixes and partial words while typing, accents either way', async () => {
    const a = await signedIn('gs-a@example.pt');
    await content(a);
    for (const q of ['reu', 'reuni', 'reuniao', 'reunião', 'REUNIAO', 'Reuniâo']) {
      const r = await search(a, q);
      expect(titles(r, 'note'), q).toEqual(
        expect.arrayContaining(['Reunião de kickoff S/4HANA', 'Faturação']),
      );
      expect(titles(r, 'task'), q).toEqual(['Preparar REUNIÃO de steering']);
      expect(titles(r, 'meeting')[0], q).toMatch(/^Reunião semanal/);
    }
    // inside a word, and accented text found by the plain word
    expect(titles(await search(a, 'turaca'), 'note')).toEqual(['Faturação']);
    expect(titles(await search(a, 'produção'), 'system')).toEqual(['S/4 Produção · S4P']);
    // codes keep their punctuation
    expect(titles(await search(a, 's/4'), 'note')).toEqual(['Reunião de kickoff S/4HANA']);
    expect((await search(a, 'zzzz')).groups).toEqual([]);
    // the Notes list (same header box) ignores accents too
    const list = await notes.listNotes(a, { search: 'reuniao' });
    expect(list.map((n) => n.title).sort()).toEqual(['Faturação', 'Reunião de kickoff S/4HANA']);
    expect((await notes.listNotes(a, { search: 'FATURACAO' })).map((n) => n.title)).toEqual(['Faturação']);
    expect((await search(a, '  ')).groups).toEqual([]);
  });

  it('every word must match; the text explains matches the title does not', async () => {
    const a = await signedIn('gs-b@example.pt');
    await content(a);
    expect(titles(await search(a, 'reuniao cliente'))).toEqual(['Faturação']);
    const r = await search(a, 'reuniao cli');
    const item = r.groups.find((g) => g.type === 'note')!.items[0]!;
    expect(item.title).toBe('Faturação');
    expect(item.snippet).toContain('reuniao com o cliente');
    // a title match needs no excerpt
    expect((await search(a, 'kickoff')).groups[0]!.items[0]!.snippet).toBe('');
  });

  it('short words (1–2 characters) match the start of title words only', async () => {
    const a = await signedIn('gs-c@example.pt');
    await content(a);
    expect(titles(await search(a, 'r'), 'note')).toEqual(['Reunião de kickoff S/4HANA']);
    expect(titles(await search(a, 're'), 'task')).toEqual(['Preparar REUNIÃO de steering']);
    // "ar" is inside "Preparar"/"Arquitetura" bodies… only the title word start counts
    expect(titles(await search(a, 'ar'), 'note')).toEqual(['Arquitetura']);
  });

  it('ranks the title starting with the query first, then title words, then the text', async () => {
    const a = await signedIn('gs-d@example.pt');
    await notes.createNote(a, { title: 'Notas soltas' });
    const body = await notes.createNote(a, { title: 'Diário' });
    await notes.updateNote(a, body.id, { content: doc('ver o cutover amanhã') });
    await notes.createNote(a, { title: 'Plano de cutover' });
    await notes.createNote(a, { title: 'Cutover' });
    await notes.createNote(a, { title: 'Cutover: checklist' });
    const r = await search(a, 'cutover', { modules: ['notes'] });
    expect(titles(r)).toEqual(['Cutover', 'Cutover: checklist', 'Plano de cutover', 'Diário']);
    expect(r.groups[0]!.count).toBe(4);
    // counts are every match; items are capped
    const capped = await search(a, 'cutover', { modules: ['notes'], perGroup: 2 });
    expect(capped.groups[0]!.items).toHaveLength(2);
    expect(capped.groups[0]!.count).toBe(4);
  });

  it('only modules of the plan, one type on request, never another person’s items', async () => {
    const a = await signedIn('gs-e@example.pt');
    const b = await signedIn('gs-f@example.pt');
    const { n1 } = await content(a);
    await notes.createNote(b, { title: 'Reunião privada do Bruno' });
    const r = await search(a, 'reuniao', { modules: ['tasks'] });
    expect(r.groups.map((g) => g.type)).toEqual(['task']);
    expect(r.groups[0]!.module).toBe('tasks');
    expect((await search(a, 'reuniao', { type: 'note' })).groups.map((g) => g.type)).toEqual(['note']);
    expect(titles(await search(b, 'reuniao'))).toEqual(['Reunião privada do Bruno']);
    expect(titles(await search(a, 'bruno'))).toEqual([]);
    // deleted items are out
    await notes.trashNote(a, n1.id);
    expect(titles(await search(a, 'kickoff'))).toEqual([]);
  });

  it('LIKE and regex characters in the query are plain text', async () => {
    const a = await signedIn('gs-g@example.pt');
    await notes.createNote(a, { title: '100% feito_hoje (v2)' });
    await notes.createNote(a, { title: '100 feitos hoje' });
    expect(titles(await search(a, '100%'))).toEqual(['100% feito_hoje (v2)', '100 feitos hoje']);
    expect(titles(await search(a, 'feito_'))).toEqual(['100% feito_hoje (v2)']);
    expect(titles(await search(a, '(v2'))).toEqual(['100% feito_hoje (v2)']);
    expect(titles(await search(a, '.*'))).toEqual([]);
  });
});
