import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { AuthContext } from '@/server/auth/session';

// Tickets (SAP › Tickets) through the real services, as kh_app under RLS:
// CRUD, one number per owner (any case), automatic dates, the history, the
// owner's type list, shared folders (read vs edit), attachments within the
// person's space, links and the Trash.
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(adminUrl && appUrl);
const outbox = process.env.MAIL_OUTBOX_DIR!;
const meta = { ip: '203.0.113.9', userAgent: 'vitest', lang: 'pt' as const };
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);

describe.skipIf(!enabled)('tickets', () => {
  let svc: typeof import('@/server/auth/service');
  let codesSvc: typeof import('@/server/licensing/codes');
  let session: typeof import('@/server/auth/session');
  let seed: typeof import('@/db/seed/index');
  let tk: typeof import('@/server/content/tickets');
  let notes: typeof import('@/server/content/notes');
  let sh: typeof import('@/server/share/folders');
  let drive: typeof import('@/server/content/drive');
  let home: typeof import('@/server/content/home');
  let dbm: typeof import('@/db/client');
  let admin: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, onnotice: () => {} });
    await migrate(drizzle(admin), { migrationsFolder: './drizzle' });
    await admin.unsafe(
      `ALTER ROLE kh_app LOGIN PASSWORD '${decodeURIComponent(new URL(appUrl!).password).replace(/'/g, "''")}'`,
    );
    [svc, codesSvc, session, seed, tk, notes, sh, drive, home, dbm] = await Promise.all([
      import('@/server/auth/service'),
      import('@/server/licensing/codes'),
      import('@/server/auth/session'),
      import('@/db/seed/index'),
      import('@/server/content/tickets'),
      import('@/server/content/notes'),
      import('@/server/share/folders'),
      import('@/server/content/drive'),
      import('@/server/content/home'),
      import('@/db/client'),
    ]);
  });

  beforeEach(async () => {
    await admin.unsafe(
      'TRUNCATE ticket_attachments, ticket_events, tickets, ticket_types, share_members, share_people, shared_folders, mg_people, mg_teams, mg_clients, drive_files, item_links, notes, folders, code_redemptions, auth_tokens, sessions, user_prefs, users, codes, tenant_modules, tenants, plan_limits, plan_modules, plans, modules RESTART IDENTITY CASCADE',
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

  async function signedIn(email: string, name = 'Ana Teste', password = 'Correct-Horse-9') {
    const c = await codesSvc.createCode({ type: 'license', planCode: 'SAP', maxUses: 1 });
    await svc.register({ name, email, password, code: c.code }, meta);
    const safe = email.replace(/[^a-z0-9@.]/gi, '_');
    const files = (await fs.readdir(outbox)).filter((f) => f.includes('-verify-') && f.includes(safe));
    const mail = JSON.parse(await fs.readFile(path.join(outbox, files.at(-1)!), 'utf8')) as { text: string };
    await svc.verifyEmail(/token=([A-Za-z0-9_-]+)/.exec(mail.text)![1]!);
    const a = await svc.login({ email, password, remember: true }, meta);
    if (!('token' in a)) throw new Error('2FA not expected');
    return (await session.resolveSession(a.token))!;
  }
  const codeOf = async (p: Promise<unknown>) =>
    p.then(
      () => 'ok',
      (e: { code?: string }) => e.code,
    );
  async function acceptInvite(who: AuthContext, folderId: string) {
    const inv = (await sh.listInvites(who)).find((i) => i.folderId === folderId);
    if (!inv) throw new Error('no invitation');
    await sh.answerInvite(who, inv.id, true);
  }
  const upload = async (auth: AuthContext, ticketId: string, name: string, data: Uint8Array) => {
    const s = await tk.startTicketUpload(auth, ticketId, { name, size: data.length, mime: 'text/plain' });
    for (let n = 1; n <= s.parts; n++)
      await tk.uploadTicketPart(auth, s.uploadId, n, data.subarray((n - 1) * s.partSize, n * s.partSize));
    return tk.completeTicketUpload(auth, s.uploadId);
  };

  it('the module comes with the SAP and ULTRA packages', async () => {
    const rows =
      await admin`select p.code from plan_modules pm join plans p on p.id = pm.plan_id where pm.module_id = 'tickets' order by 1`;
    expect(rows.map((r) => r.code)).toEqual(['SAP', 'ULTRA']);
  });

  it('CRUD, unique number per owner, automatic dates and the history', async () => {
    const a = await signedIn('tk-a@example.pt');
    const b = await signedIn('tk-b@example.pt', 'Bruno');
    // the type list starts with the defaults
    const types = await tk.listTypes(a);
    expect(types.map((x) => x.name)).toEqual([
      'Incidente',
      'Pedido de Serviço',
      'Alteração',
      'Problema',
      'Dúvida',
    ]);
    const [cli] =
      await admin`insert into mg_clients (tenant_id, name) values (${a.tenant.id}, 'Atlas SA') returning id`;

    const t = await tk.createTicket(a, {
      number: ' INC0012345 ',
      summary: 'Erro na MIGO ao lançar entrada',
      typeId: types[0]!.id,
      clientId: cli!.id as string,
      clientName: 'ignored',
      responsibleName: 'Rui Silva',
      priority: 'high',
    });
    expect(t).toMatchObject({
      number: 'INC0012345',
      status: 'open',
      clientName: 'Atlas SA',
      clientId: cli!.id,
      responsibleId: null,
      responsibleName: 'Rui Silva',
      resolvedAt: null,
      mine: true,
    });
    expect(Date.now() - new Date(t.openedAt).getTime()).toBeLessThan(60_000);
    // the same number (any case) again: refused for the same owner, fine for another person
    expect(await codeOf(tk.createTicket(a, { number: 'inc0012345', summary: 'x' }))).toBe(
      'ticket_number_taken',
    );
    expect((await tk.createTicket(b, { number: 'INC0012345', summary: 'Outro' })).number).toBe('INC0012345');
    const t2 = await tk.createTicket(a, { number: 'INC0012346', summary: 'Segundo' });
    expect(await codeOf(tk.updateTicket(a, t2.id, { number: 'Inc0012345' }))).toBe('ticket_number_taken');
    // a type of someone else's list is refused; a free client name clears the link
    const bTypes = await tk.listTypes(b);
    expect(await codeOf(tk.updateTicket(a, t2.id, { typeId: bTypes[0]!.id }))).toBe('type_not_found');
    expect((await tk.updateTicket(a, t.id, { clientName: 'Cliente Novo' })).ticket).toMatchObject({
      clientId: null,
      clientName: 'Cliente Novo',
    });

    // status → Resolvido sets the resolution date; reopening clears it; history logs who/from/to
    const r1 = await tk.updateTicket(a, t.id, { status: 'resolved', priority: 'very_high' });
    expect(r1.ticket.resolvedAt).not.toBeNull();
    expect(r1.events.map((e) => [e.kind, e.from, e.to, e.author])).toEqual([
      ['status', 'open', 'resolved', 'Ana Teste'],
      ['priority', 'high', 'very_high', 'Ana Teste'],
    ]);
    const kept = r1.ticket.resolvedAt;
    expect((await tk.updateTicket(a, t.id, { status: 'closed' })).ticket.resolvedAt).toBe(kept);
    expect((await tk.updateTicket(a, t.id, { status: 'progress' })).ticket.resolvedAt).toBeNull();
    const r2 = await tk.updateTicket(a, t.id, { responsibleName: 'Marta' });
    expect(r2.events.map((e) => [e.kind, e.from, e.to])).toEqual([['responsible', 'Rui Silva', 'Marta']]);
    // the resolution date can be set by hand while resolved
    await tk.updateTicket(a, t.id, { status: 'resolved' });
    const at = '2026-10-01T10:00:00.000Z';
    expect((await tk.updateTicket(a, t.id, { resolvedAt: at })).ticket.resolvedAt).toBe(at);
    const c = await tk.addComment(a, t.id, 'Falei com o cliente.');
    const full = await tk.getTicket(a, t.id);
    expect(full.perm).toBe('owner');
    expect(full.events.map((e) => e.kind)).toEqual([
      'created',
      'status',
      'priority',
      'status',
      'status',
      'responsible',
      'status',
      'comment',
    ]);
    await tk.deleteComment(a, c.id);
    expect((await tk.getTicket(a, t.id)).events.some((e) => e.kind === 'comment')).toBe(false);

    // notes as a document: only images stored with the ticket
    await tk.updateTicket(a, t.id, {
      notesDoc: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Passos' }] }],
      },
    });
    const img = await tk.addTicketImage(a, t.id, PNG);
    await tk.updateTicket(a, t.id, {
      notesDoc: { type: 'doc', content: [{ type: 'image', attrs: { src: `/api/v1/tickets/files/${img}` } }] },
    });
    expect(
      await codeOf(
        tk.updateTicket(a, t.id, {
          notesDoc: {
            type: 'doc',
            content: [{ type: 'image', attrs: { src: 'https://evil.example/x.png' } }],
          },
        }),
      ),
    ).toBe('doc_invalid');

    // RLS: another person sees and changes nothing
    expect((await tk.listTickets(b)).tickets.map((x) => x.number)).toEqual(['INC0012345']);
    expect(await codeOf(tk.getTicket(b, t.id))).toBe('not_found');
    expect(await codeOf(tk.updateTicket(b, t.id, { summary: 'x' }))).toBe('not_found');
    expect(await codeOf(tk.addComment(b, t.id, 'x'))).toBe('not_found');
    expect(await codeOf(tk.trashTicket(b, t.id))).toBe('not_found');
    expect(await codeOf(tk.readTicketFile(b, img))).toBe('not_found');

    // Home card and sidebar count: open ones only
    const hd = await home.homeData(a, new Set(['tickets']));
    expect(hd.tickets!.map((x) => x.number)).toEqual(['INC0012346']);
    expect((await notes.contentCounts(a, new Set(['tickets']))).tickets).toBe(1);
  });

  it('types: the owner manages them; the last one stays', async () => {
    const a = await signedIn('ty-a@example.pt');
    const ts = await tk.listTypes(a);
    const nt = await tk.createType(a, 'Projeto');
    expect(await codeOf(tk.createType(a, 'projeto'))).toBe('ticket_type_taken');
    await tk.renameType(a, nt.id, 'Projetos');
    expect(await codeOf(tk.renameType(a, nt.id, 'INCIDENTE'))).toBe('ticket_type_taken');
    const t = await tk.createTicket(a, { number: 'T1', summary: 's', typeId: nt.id });
    await tk.deleteType(a, nt.id);
    expect((await tk.listTickets(a)).tickets[0]!.typeId).toBeNull();
    for (const x of ts.slice(1)) await tk.deleteType(a, x.id);
    expect(await codeOf(tk.deleteType(a, ts[0]!.id))).toBe('ticket_type_last');
    await tk.orderTypes(a, [ts[0]!.id]);
    expect((await tk.getTicket(a, t.id)).types.map((x) => x.name)).toEqual(['Incidente']);
  });

  it('shared folders: viewer reads, editor edits and comments, the owner keeps folder and Trash; owner types apply', async () => {
    const a = await signedIn('sf-a@example.pt', 'Ana');
    const b = await signedIn('sf-b@example.pt', 'Bruno');
    const c = await signedIn('sf-c@example.pt', 'Carla');
    const fo = await (
      await import('@/server/content/kindFolders')
    ).createKindFolder(a, 'tickets', 'Cliente Atlas');
    const types = await tk.listTypes(a);
    const ownType = await tk.createType(a, 'Só da Ana');
    const t = await tk.createTicket(a, {
      number: 'INC1',
      summary: 'Partilhado',
      folderId: fo.id,
      typeId: types[1]!.id,
    });
    const sf = await sh.createSharedFolder(a, { kind: 'tickets', name: 'Cliente Atlas', folderId: fo.id });
    await sh.addMember(a, sf, 'sf-b@example.pt', { lang: 'pt' });
    await acceptInvite(b, sf);

    // viewer: sees the folder's tickets with the owner's types, can't write
    const list = await tk.listTickets(b, sf);
    expect(list.tickets.map((x) => [x.number, x.mine])).toEqual([['INC1', false]]);
    expect(list.types.map((x) => x.name)).toContain('Só da Ana');
    expect((await tk.listTickets(b)).tickets).toEqual([]);
    expect((await tk.getTicket(b, t.id)).perm).toBe('read');
    expect(await codeOf(tk.updateTicket(b, t.id, { status: 'progress' }))).toBe('forbidden');
    expect(await codeOf(tk.addComment(b, t.id, 'olá'))).toBe('forbidden');
    expect(await codeOf(tk.startTicketUpload(b, t.id, { name: 'a.txt', size: 3 }))).toBe('forbidden');
    expect(await codeOf(tk.getTicket(c, t.id))).toBe('not_found');
    expect(await codeOf(tk.listTickets(c, sf))).toBe('not_found');

    // editor: edits fields with the owner's types, comments, attaches; history shows who
    const m = (await sh.listSharedFolders(a)).find((f) => f.id === sf)!.members[0]!;
    await sh.updateMember(a, m.id, { perm: 'edit' });
    expect((await tk.getTicket(b, t.id)).perm).toBe('edit');
    const r = await tk.updateTicket(b, t.id, { status: 'pending_customer', typeId: ownType.id });
    expect(r.ticket).toMatchObject({ status: 'pending_customer', typeId: ownType.id, mine: false });
    expect(r.events[0]).toMatchObject({ kind: 'status', author: 'Bruno', mine: true });
    // b's own types don't apply here
    const bTypes = await tk.listTypes(b);
    expect(await codeOf(tk.updateTicket(b, t.id, { typeId: bTypes[0]!.id }))).toBe('type_not_found');
    // a Management record of another tenant can't be linked: the name is kept as typed
    const [bc] =
      await admin`insert into mg_clients (tenant_id, name) values (${b.tenant.id}, 'Cliente do B') returning id`;
    expect(
      (await tk.updateTicket(b, t.id, { clientId: bc!.id as string, clientName: 'Atlas' })).ticket,
    ).toMatchObject({ clientId: null, clientName: 'Atlas' });
    await tk.addComment(b, t.id, 'Pedi o log ao cliente.');
    const f = await upload(b, t.id, 'log.txt', new TextEncoder().encode('linha'));
    expect(f).toMatchObject({ name: 'log.txt', author: 'Bruno', mine: true });
    const seen = await tk.getTicket(a, t.id);
    expect(seen.events.filter((e) => e.author === 'Bruno').map((e) => e.kind)).toEqual(['status', 'comment']);
    expect(seen.files.map((x) => [x.name, x.mine])).toEqual([['log.txt', false]]);
    // the owner's things stay the owner's
    expect(await codeOf(tk.updateTicket(b, t.id, { folderId: null }))).toBe('forbidden');
    expect(await codeOf(tk.trashTicket(b, t.id))).toBe('not_found');
    expect(await codeOf(tk.createTicket(b, { number: 'X', summary: 'x', sharedFolderId: sf }))).toBe(
      'folder_not_found',
    );
    // the attachment counts in the uploader's space, not the owner's
    expect((await drive.driveLimits(b)).used).toBe(5);
    expect((await drive.driveLimits(a)).used).toBe(0);
  });

  it('attachments: chunks, the space quota, delete, purge with the Trash; links both ways', async () => {
    const a = await signedIn('at-a@example.pt');
    const t = await tk.createTicket(a, { number: 'INC9', summary: 'Anexos' });
    const { UPLOAD_PART } = await import('@/lib/drive');
    const big = new Uint8Array(UPLOAD_PART + 10).map((_, i) => i % 251);
    const f = await upload(a, t.id, '../x/dump.bin', big);
    expect(f).toMatchObject({ name: 'dump.bin', size: big.length });
    const got = await tk.readTicketFile(a, f.id);
    expect(new Uint8Array(await new Response(got.stream).arrayBuffer()).length).toBe(big.length);
    expect((await drive.driveLimits(a)).used).toBe(big.length);
    const usage = await admin.unsafe(`select used from kh_drive_usage(array['${a.user.id}']::uuid[])`);
    expect(Number(usage[0]!.used)).toBe(big.length);
    // over the quota: refused before any byte is stored
    await admin.unsafe(`update users set files_quota_mb = 8 where id = '${a.user.id}'`);
    expect(await codeOf(tk.startTicketUpload(a, t.id, { name: 'y', size: 10 }))).toBe('limit_reached');
    expect(await codeOf(tk.addTicketImage(a, t.id, PNG))).toBe('limit_reached');
    await admin.unsafe(`update users set files_quota_mb = null where id = '${a.user.id}'`);
    const g = await upload(a, t.id, 'b.txt', new TextEncoder().encode('ok'));
    await tk.deleteTicketFile(a, g.id);
    expect((await tk.getTicket(a, t.id)).files.map((x) => x.name)).toEqual(['dump.bin']);

    // links: both sides see them
    const n = await notes.createNote(a, { title: 'Análise INC9' });
    const t2 = await tk.createTicket(a, { number: 'INC10', summary: 'Relacionado' });
    await notes.linkItems(a, { type: 'ticket', id: t.id }, { type: 'note', id: n.id });
    await notes.linkItems(a, { type: 'ticket', id: t.id }, { type: 'ticket', id: t2.id });
    expect((await notes.linksOf(a, { type: 'note', id: n.id })).map((l) => l.title)).toEqual([
      'INC9 · Anexos',
    ]);
    expect((await notes.linksOf(a, { type: 'ticket', id: t.id })).map((l) => l.type).sort()).toEqual([
      'note',
      'ticket',
    ]);
    const cands = await notes.linkCandidates(a, { type: 'note', id: n.id }, 'inc10', ['ticket']);
    expect(cands.map((x) => x.title)).toEqual(['INC10 · Relacionado']);

    // Trash: listed, restored, purged with its files and links
    await tk.trashTicket(a, t.id);
    expect((await tk.listTickets(a)).tickets.map((x) => x.number)).toEqual(['INC10']);
    const tr = await notes.listTrash(a);
    expect(tr.map((x) => [x.kind, x.title])).toEqual([['ticket', 'INC9 · Anexos']]);
    await notes.restoreTrash(a, [{ kind: 'ticket', id: t.id }]);
    expect((await tk.listTickets(a)).tickets).toHaveLength(2);
    await tk.trashTicket(a, t.id);
    await notes.purgeTrash(a, [{ kind: 'ticket', id: t.id }]);
    expect((await admin`select count(*)::int as n from ticket_attachments`)[0]!.n).toBe(0);
    expect((await admin`select count(*)::int as n from ticket_events where ticket_id = ${t.id}`)[0]!.n).toBe(
      0,
    );
    expect(await notes.linksOf(a, { type: 'note', id: n.id })).toEqual([]);
    expect((await drive.driveLimits(a)).used).toBe(0);
    // a live ticket is never purged by a stale Trash view
    await notes.purgeTrash(a, [{ kind: 'ticket', id: t2.id }]);
    expect((await tk.listTickets(a)).tickets).toHaveLength(1);
  });
});
